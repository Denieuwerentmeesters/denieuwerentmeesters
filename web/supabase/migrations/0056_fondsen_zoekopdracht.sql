-- ============================================================
-- Fondsenradar fase 3 — HET VRAAGVELD: bewaarde zoekopdrachten
--
-- WAAROM DEZE TABEL BESTAAT
-- Een zoekopdracht kost twee modelaanroepen. Dezelfde vraag over hetzelfde
-- landgoed tegen dezelfde catalogus levert hetzelfde antwoord op — dat twee keer
-- betalen is weggegooid geld, en twee keer wachten is weggegooide tijd. De
-- `vraag_hash` maakt dat afdwingbaar: hij gaat over (vraag + landgoedprofiel +
-- catalogusversie), zodat een gewijzigde rechtsvorm of een nieuw geïmporteerd
-- fonds vanzelf een nieuwe zoekopdracht oplevert en niet stilletjes op een oud
-- antwoord blijft hangen.
--
-- DRIE DINGEN ZITTEN IN DE HASH, EN DAT IS GEEN OVERDAAD
--   * de vraag        — de vrije tekst plus de vijf antwoorden;
--   * het landgoed    — rechtsvorm, gemeente, provincie, hectare, NSW, NNN. Precies
--                       de velden die de poort toetst. Verandert er één, dan is het
--                       antwoord niet meer hetzelfde antwoord;
--   * de catalogus    — een hash over alle fonds-id's plus de bron_hash van hun
--                       matchprofiel. Komt er een fonds bij of wordt een profiel
--                       opnieuw gedestilleerd, dan vervalt het bewaarde antwoord.
--
-- WAT ER NIET IN ZIT: de tijd. Een bewaarde uitkomst veroudert niet vanzelf —
-- alles wat hem kan laten verouderen zit al in de hash. Wel staat `gemaakt_op`
-- erin, zodat een mens kan zien hoe oud een antwoord is.
--
-- DE KOSTEN WORDEN MEEBEWAARD. Zonder die cijfers is de kostenregel van §5 een
-- bewering. `kosten` bevat per aanroep de tokens en de dollars, plus wat dezelfde
-- vraag zonder prompt caching zou hebben gekost.
--
-- Idempotent conform CLAUDE.md. NIET op live toegepast bij het schrijven.
-- ============================================================

create table if not exists fondsen_zoekopdracht (
  id            uuid        primary key default gen_random_uuid(),
  landgoed_id   uuid        not null references landgoed(id) on delete cascade,

  -- sha256 over (vraag + landgoedprofiel + catalogusversie). Zie lib/fondsen/zoek.ts.
  vraag_hash    text        not null,
  -- De catalogusversie apart, zodat na een importronde te zien is welke
  -- bewaarde antwoorden op een oudere catalogus berusten.
  catalogusversie text      not null default '',

  -- De vraag zoals gesteld: vrije tekst plus de vijf antwoorden. Bewaard in
  -- ruwe vorm, want een uitkomst zonder de vraag erbij is niet te beoordelen.
  vraag         jsonb       not null default '{}'::jsonb,
  -- De vrije tekst ook los, zodat er zonder jsonb-gegraaf op te zoeken is.
  plan_tekst    text,

  -- De uitkomst: de getoonde fondsen met slagingskans, matchbaarheid,
  -- onderbouwing, citaat, route en eerste stap. Plus `wat_zou_helpen` als er
  -- niets was — dat laatste is de waardevolste helft van een leeg antwoord.
  uitkomst      jsonb       not null default '{}'::jsonb,

  -- TWEE GETALLEN, APART (§5 van het plan). Ook hier: nooit samenvoegen.
  aantal_getoond integer    not null default 0,
  hoogste_slagingskans integer,
  hoogste_matchbaarheid integer,

  -- Was het antwoord "hiervoor bent u te laat"? Dan is er geen enkele
  -- modelaanroep gedaan en zijn de kosten nul. Apart bijhouden omdat dit het
  -- meest waardevolle antwoord van de hele module is: het voorkomt werk.
  te_laat       boolean     not null default false,

  -- Trechtercijfers van deze zoekopdracht (§9.7): hoeveel erin, hoeveel door de
  -- poort, hoeveel eraf en waarop. Zonder deze cijfers is niet te zien of het
  -- filter te streng staat.
  trechter      jsonb       not null default '{}'::jsonb,

  -- Wat deze vraag heeft gekost, per aanroep, plus wat hij zonder cache zou
  -- hebben gekost. Zie lib/fondsen/kosten.ts.
  kosten        jsonb       not null default '{}'::jsonb,
  kosten_dollars numeric(10,5) not null default 0,
  model         text,
  model_gebruikt boolean    not null default false,

  gemaakt_op    timestamptz not null default now(),
  gemaakt_door  uuid        references auth.users(id) on delete set null
);

-- De sleutel waarop hergebruik draait. Uniek per landgoed: twee landgoederen
-- kunnen dezelfde vraag stellen, maar hun hash verschilt al doordat het
-- landgoed_id erin zit — de constraint maakt dat expliciet en goedkoop op te
-- zoeken.
create unique index if not exists fondsen_zoekopdracht_hash_uniek
  on fondsen_zoekopdracht (landgoed_id, vraag_hash);

create index if not exists fondsen_zoekopdracht_landgoed_idx
  on fondsen_zoekopdracht (landgoed_id, gemaakt_op desc);

comment on table fondsen_zoekopdracht is
  'Bewaarde uitkomsten van het fondsen-vraagveld (fase 3). De vraag_hash over '
  '(vraag + landgoedprofiel + catalogusversie) zorgt dat dezelfde vraag niet twee '
  'keer betaald wordt, en dat een gewijzigd landgoed of een gewijzigde catalogus '
  'vanzelf een nieuwe zoekopdracht oplevert. Kosten worden meebewaard zodat '
  'zichtbaar blijft wat een vraag kost.';

comment on column fondsen_zoekopdracht.te_laat is
  'True als de gebruiker bij vraag 2 aangaf dat het werk al gegund of gestart is. '
  'Dan is er geen lijst getoond maar uitgelegd waarom het te laat is, en is er geen '
  'enkele modelaanroep gedaan (§6, de timing-val).';

-- ------------------------------------------------------------
-- Autorisatie: zelfde patroon als de rest van het platform.
-- Een zoekopdracht hoort bij één landgoed; wie dat landgoed mag zien mag zijn
-- zoekopdrachten zien.
-- ------------------------------------------------------------
alter table fondsen_zoekopdracht enable row level security;

drop policy if exists "fondsen zoekopdracht zien" on fondsen_zoekopdracht;
create policy "fondsen zoekopdracht zien" on fondsen_zoekopdracht for select
  using (is_lid_van(landgoed_id) or is_admin());

drop policy if exists "fondsen zoekopdracht schrijven" on fondsen_zoekopdracht;
create policy "fondsen zoekopdracht schrijven" on fondsen_zoekopdracht for insert
  with check (is_lid_van(landgoed_id) or is_admin());

-- Bijwerken mag: een tweede keer dezelfde vraag stellen na een catalogusupdate
-- schrijft over de bestaande rij heen (upsert op de unieke hash).
drop policy if exists "fondsen zoekopdracht bijwerken" on fondsen_zoekopdracht;
create policy "fondsen zoekopdracht bijwerken" on fondsen_zoekopdracht for update
  using (is_lid_van(landgoed_id) or is_admin())
  with check (is_lid_van(landgoed_id) or is_admin());
