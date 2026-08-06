-- ============================================================
-- Fondsenradar — landingsplek voor de verrijkingsslag
-- Bron: kennisbank/Fondsen/verrijking/WERKWIJZE.md (twee bestanden per fonds:
-- <slug>.md met de integrale beleidstekst, <slug>.json met de structuur).
--
-- Twee dingen die 0050/0051 nog niet hadden:
--   1. de landgoed-ROUTE (kan het landgoed zelf aanvragen, of alleen via een
--      partner?) — met de onderbouwing ernaast, want zonder citaat is het een
--      mening en geen vaststelling;
--   2. een plek voor de integrale BELEIDSTEKST, het ruwe materiaal waarop de
--      semantische laag straks embeddings bouwt.
--
-- Idempotent conform CLAUDE.md. NIET op live toegepast bij het schrijven.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Landgoed-relevantie: route, onderbouwing, partnertype
-- ------------------------------------------------------------
alter table regeling
  add column if not exists landgoed_route text not null default 'onbekend'
    check (landgoed_route in ('zelf','via_partner','niet_relevant','onbekend'));

comment on column regeling.landgoed_route is
  'Langs welke weg dit geld bij een landgoed kan komen (verrijkingsslag). '
  'zelf = het landgoed (of zijn eigen stichting/BV) kan zelf aanvragen. '
  'via_partner = alleen een derde organisatie kan aanvragen; het landgoed komt '
  'als post op HAAR begroting — de actie is "zoek een partner", niet "vraag '
  'aan". niet_relevant = er bestaat geen enkele denkbare route; de rij blijft '
  'staan maar hoort nooit in de fondsenstroom te verschijnen (filteren, niet '
  'verwijderen — wat weggegooid is ziet niemand meer terug). onbekend = niet '
  'vastgesteld, en dat is uitdrukkelijk iets anders dan niet_relevant.';

alter table regeling add column if not exists landgoed_route_reden text;
comment on column regeling.landgoed_route_reden is
  'Waarom deze route, bij voorkeur met een letterlijk citaat uit het beleid. '
  'Zonder onderbouwing is de route niet navolgbaar en dus niet bruikbaar; de '
  'leeslaag (lib/fondsen/verrijking.ts) weigert een route zonder onderbouwing.';

alter table regeling add column if not exists landgoed_partnertype text;
comment on column regeling.landgoed_partnertype is
  'Bij landgoed_route = via_partner: wat voor organisatie de aanvrager moet '
  'zijn (zorg-, welzijns-, landschaps-, erfgoed- of festivalstichting). Dit is '
  'het handelingsperspectief; zonder dit veld weet de gebruiker wel dat hij een '
  'partner nodig heeft maar niet wat voor een.';

-- De fondsenstroom filtert hierop; niet_relevant is de enige uitgesloten stand.
create index if not exists regeling_landgoed_route_idx
  on regeling (soort_bron, landgoed_route);

-- ------------------------------------------------------------
-- 2. De beleidstekst zelf
-- ------------------------------------------------------------
-- WAAROM EEN EIGEN TABEL EN GEEN KOLOM OP `regeling`:
--   * de teksten zijn groot (in de pilot 5 kB - 165 kB per fonds); als kolom
--     zou elke `select *` op de catalogus die ballast meeslepen;
--   * er zijn er MEER DAN EEN per fonds (website + beleidsplan + jaarverslag),
--     elk met een eigen url, ophaaldatum en hash;
--   * de semantische laag knipt deze tekst straks in stukken met een embedding
--     per stuk. Dat wordt een kindtabel (regeling_beleidstekst_chunk met een
--     vector-kolom) die aan `id` hangt. Met een kolom op `regeling` zou dat
--     kind aan de verkeerde ouder hangen en zou hercontrole ("is de tekst
--     gewijzigd?") niet per document te doen zijn.
-- tekst_hash maakt precies dat mogelijk: verandert de hash niet, dan hoeven de
-- embeddings niet opnieuw.
create table if not exists regeling_beleidstekst (
  id uuid primary key default gen_random_uuid(),
  regeling_id uuid not null references regeling(id) on delete cascade,
  -- Het verrijkingsbestand waar deze tekst uit komt (<slug>.md). Eén per fonds
  -- nu; de sleutel laat ruimte voor meerdere documenten per regeling later.
  bron_sleutel text not null,
  bron_url text,
  tekst text not null,
  tekst_hash text not null,
  tekens integer not null default 0,
  opgehaald_op date,
  herkomst text not null default 'geverifieerd_bron'
    check (herkomst in ('handmatig','ai_voorstel','geverifieerd_bron','import')),
  geaccordeerd boolean not null default false,
  aangemaakt_op timestamptz default now(),
  bijgewerkt_op timestamptz default now(),
  unique (regeling_id, bron_sleutel)
);

create index if not exists regeling_beleidstekst_regeling_idx
  on regeling_beleidstekst (regeling_id);
create index if not exists regeling_beleidstekst_hash_idx
  on regeling_beleidstekst (tekst_hash);

comment on table regeling_beleidstekst is
  'De integrale, onbewerkte beleidstekst per bron (<slug>.md uit '
  'kennisbank/Fondsen/verrijking/). Niet samengevat: dit is het ruwe materiaal '
  'voor de semantische match tussen een landgoedplan en wat een fonds wil '
  'bereiken. Chunking + embeddings komen in een kindtabel hierop.';
comment on column regeling_beleidstekst.tekst_hash is
  'sha256 van de tekst. Ongewijzigde hash = geen nieuwe embeddings nodig en '
  'geen nieuwe leesronde.';

-- ------------------------------------------------------------
-- 3. RLS — catalogus-patroon (0012 + 0047: lezen alleen ingelogd)
-- ------------------------------------------------------------
alter table regeling_beleidstekst enable row level security;

drop policy if exists "beleidstekst zien" on regeling_beleidstekst;
create policy "beleidstekst zien" on regeling_beleidstekst
  for select to authenticated using (true);

drop policy if exists "beleidstekst beheren" on regeling_beleidstekst;
create policy "beleidstekst beheren" on regeling_beleidstekst for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 4. Bronlezing: herkomst-waarden gelijktrekken
-- ------------------------------------------------------------
-- 0050 liet 'import' hier niet toe; de verrijkingsingestie schrijft
-- 'geverifieerd_bron' (de bron is echt gelezen), dus dat volstaat. Wel de
-- kolom `gelezen_op` documenteren, want die is de versheid van de lezing zelf.
comment on column regeling_bronlezing.gelezen_op is
  'Datum waarop het stuk daadwerkelijk is gelezen (de ophaaldatum bovenaan het '
  '<slug>.md-bestand). Samen met regeling.hercontrole_termijn de basis voor '
  '"deze lezing is verouderd".';
