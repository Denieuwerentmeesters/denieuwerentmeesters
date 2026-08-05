-- ============================================================
-- Fondsenradar — het MATCHPROFIEL per fonds (laag 3, §5 van het plan)
--
-- WAAROM DIT BESTAAT
-- `regeling_beleidstekst` (0052) bevat 238 integrale beleidsteksten, gemiddeld
-- 9.000 tekens. Die integraal in een matchprompt stoppen is te duur en te traag:
-- elke zoekopdracht zou de hele bibliotheek meeslepen. Een embedding zou dat
-- oplossen maar is niet leesbaar — je kunt dan niet zien waaróp gematcht is, en
-- dit platform draait op uitlegbaarheid (een mens keurt het AI-voorstel goed).
--
-- Vandaar een gedestilleerd, leesbaar profiel van 300-500 woorden: eenmalige
-- kosten per fonds, daarna is elke zoekopdracht goedkoop én navolgbaar. Het
-- profiel is een DESTILLAAT, geen interpretatie — alleen wat de bron zegt.
--
-- WAAROM EEN EIGEN TABEL EN GEEN KOLOM OP regeling_beleidstekst
--   * een profiel wordt gemaakt uit MEERDERE bronnen tegelijk (alle
--     beleidsteksten van een fonds + de gestructureerde verrijking op
--     `regeling`), dus het hangt aan de regeling, niet aan één brondocument;
--   * het heeft een eigen accorderingsstatus en een eigen model/versie-
--     administratie, los van de brontekst eronder;
--   * de embedding die hier later overheen komt hoort aan het profiel te hangen,
--     niet aan de ruwe tekst.
--
-- Idempotent conform CLAUDE.md. NIET op live toegepast bij het schrijven.
-- ============================================================

create table if not exists regeling_matchprofiel (
  id uuid primary key default gen_random_uuid(),
  regeling_id uuid not null references regeling(id) on delete cascade,

  -- Het destillaat zelf: 300-500 woorden gewoon Nederlands, geschreven om op te
  -- matchen. Zes vaste onderdelen (doel / wel / niet / wie+route / waar+bedrag /
  -- haakjes) — zie lib/fondsen/matchprofiel.ts voor de prompt die dit afdwingt.
  profiel text not null,
  woorden integer not null default 0,

  -- HASH VAN DE BRON. Verandert er niets aan het beleidsplan én niets aan de
  -- gestructureerde verrijking, dan hoeft het profiel niet opnieuw gemaakt te
  -- worden. Dat scheelt bij een volledige ronde vrijwel alle kosten.
  -- Bewust een hash over de VOLLEDIGE bronsamenstelling (alle beleidsteksten +
  -- de velden die in de prompt gaan), niet alleen over één beleidstekst: een
  -- gewijzigde uitsluiting moet net zo goed een nieuwe ronde uitlokken.
  bron_hash text not null,
  -- De hash van alleen de beleidstekst(en), zodat te zien is of een wijziging
  -- uit het brondocument kwam of uit de verrijking eromheen.
  beleidstekst_hash text,
  -- Hoeveel tekens brontekst er in de prompt zijn gegaan (na eventuele
  -- inkorting). Maakt achteraf te controleren of een profiel op een halve bron
  -- berust.
  bron_tekens integer not null default 0,

  model text,
  herkomst text not null default 'ai_voorstel'
    check (herkomst in ('handmatig','ai_voorstel','geverifieerd_bron','import')),
  -- Het profiel is een VOORSTEL. Pas na menselijke accordering telt het als
  -- vastgesteld; de generatie overschrijft een geaccordeerd profiel nooit.
  geaccordeerd boolean not null default false,
  geaccordeerd_op timestamptz,

  aangemaakt_op timestamptz default now(),
  bijgewerkt_op timestamptz default now(),
  -- Eén profiel per regeling. Meerdere varianten naast elkaar zouden de vraag
  -- oproepen welke de matcher gebruikt; dat is geen vraag die je wilt hebben.
  unique (regeling_id)
);

create index if not exists regeling_matchprofiel_regeling_idx
  on regeling_matchprofiel (regeling_id);
create index if not exists regeling_matchprofiel_hash_idx
  on regeling_matchprofiel (bron_hash);
-- De matcher haalt straks alleen geaccordeerde profielen op.
create index if not exists regeling_matchprofiel_geaccordeerd_idx
  on regeling_matchprofiel (geaccordeerd);

comment on table regeling_matchprofiel is
  'Gedestilleerd matchprofiel per fonds (300-500 woorden), gemaakt uit de '
  'integrale beleidstekst(en) in regeling_beleidstekst plus de gestructureerde '
  'verrijking op regeling. Dit is het materiaal waarop de semantische laag '
  '(laag 3, §5 van het implementatieplan) draait. Bewust leesbaar in plaats van '
  'een embedding: een gebruiker moet kunnen zien waaróp gematcht is.';

comment on column regeling_matchprofiel.profiel is
  'Het destillaat, geen interpretatie. Alleen wat de bron noemt; staat er niets '
  'over bedragen, dan staat dat er zo in. Uitsluitingen mogen nooit wegvallen — '
  'die zijn voor matching even belangrijk als wat een fonds wél doet, en zijn '
  'precies wat een samenvatting doorgaans als eerste verliest. Vastgelegde '
  'tegenstrijdigheden (bv. site zegt max EUR 15.000, beleidsplan EUR 10.000) '
  'blijven als tegenstrijdigheid staan en worden niet gladgestreken.';

comment on column regeling_matchprofiel.bron_hash is
  'sha256 over de volledige bronsamenstelling (beleidsteksten + de verrijkings-'
  'velden die in de prompt gaan). Ongewijzigde hash = geen nieuwe modelaanroep. '
  'Dit is wat een volledige ronde goedkoop houdt.';

comment on column regeling_matchprofiel.geaccordeerd is
  'false = voorstel. De generatiestap raakt een geaccordeerd profiel nooit aan, '
  'ook niet als de bron wijzigt; dan komt de wijziging via de rapportage boven.';

-- ------------------------------------------------------------
-- RLS — catalogus-patroon (0012 + 0047 + 0052: lezen alleen ingelogd)
-- ------------------------------------------------------------
alter table regeling_matchprofiel enable row level security;

drop policy if exists "matchprofiel zien" on regeling_matchprofiel;
create policy "matchprofiel zien" on regeling_matchprofiel
  for select to authenticated using (true);

drop policy if exists "matchprofiel beheren" on regeling_matchprofiel;
create policy "matchprofiel beheren" on regeling_matchprofiel for all
  using (is_admin()) with check (is_admin());
