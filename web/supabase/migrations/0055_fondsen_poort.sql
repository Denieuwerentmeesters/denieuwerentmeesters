-- ============================================================
-- Fondsenradar fase 2 — DE POORT: trechtercijfers + regiovertaling
--
-- Twee dingen die de poort (lib/fondsen/poort.ts) nodig heeft en die 0050-0052
-- nog niet leverden:
--
--   1. TRECHTERCIJFERS per toetsronde (§9.7). Zonder die cijfers is niet te
--      zien of het filter te streng staat. Zelfde patroon als `omgeving_run`:
--      hoeveel gingen erin, hoeveel kwamen door elke poort, hoeveel bleven er
--      over. Dezelfde beperking geldt ook: dit meet alleen wat de catalogus
--      bevat — wat er nooit in kwam telt nergens mee, en daarvoor is een blinde
--      steekproef nodig.
--
--   2. Een LANDELIJK-vlag op `regio_alias`, plus een eerste vulling. 79 fondsen
--      hebben hun werkgebied als vrije tekst ("Kennemerland", "de Achterhoek",
--      "Landelijk (kantoor Den Haag)"). Zolang zo'n naam hier niet vertaald is,
--      is de geografische toets ONBEKEND en uitdrukkelijk niet "voldoet niet".
--
-- Idempotent conform CLAUDE.md. NIET op live toegepast bij het schrijven.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Trechtercijfers per toetsronde
-- ------------------------------------------------------------
create table if not exists fondsen_poort_run (
  id                uuid        primary key default gen_random_uuid(),
  landgoed_id       uuid        not null references landgoed(id) on delete cascade,
  gestart_op        timestamptz not null default now(),
  geeindigd_op      timestamptz,

  -- De vraag waartegen getoetst is. Projectstatus en kostensoort zijn
  -- parameters van de VRAAG en niet van het fonds (§6, §9.2); zonder ze vast
  -- te leggen is een run later niet te reproduceren of te vergelijken.
  projectstatus     text        check (projectstatus is null or projectstatus in
                                  ('idee','in_voorbereiding','gegund','gestart','afgerond')),
  kostensoort       text,
  bedrag            numeric(14,2),

  aantal_bekeken    integer     not null default 0,
  aantal_doorgelaten integer    not null default 0,
  aantal_afgevallen integer     not null default 0,
  aantal_onbekend   integer     not null default 0,
  aantal_met_actie  integer     not null default 0,

  -- Per poort {door, af, onbekend} en per poort hoe vaak hij de HOOFDreden van
  -- afvallen was. Bewust jsonb en geen kolom per poort: het aantal poorten
  -- groeit nog (openstelling, cooldown), en dan hoort er geen migratie per
  -- poort te volgen.
  per_poort         jsonb       not null default '{}'::jsonb,
  hoofdreden        jsonb       not null default '{}'::jsonb,

  fout              text
);

create index if not exists fondsen_poort_run_landgoed_idx
  on fondsen_poort_run (landgoed_id, gestart_op desc);

comment on table fondsen_poort_run is
  'Trechtercijfers per toetsronde van de fondsenpoort (§9.7): bekeken -> per '
  'poort door/af/onbekend -> overgebleven. De enige manier om te zien of het '
  'filter te streng staat. Meet gescheiden van de subsidiestroom, want de '
  'datakwaliteit verschilt structureel en een gemiddeld cijfer verbergt precies '
  'wat je wilt weten. Let op: wat nooit in de catalogus kwam telt hier nergens '
  'mee — daarvoor is een blinde steekproef nodig.';

comment on column fondsen_poort_run.aantal_onbekend is
  'Fondsen die op minstens één poort ONBEKEND scoorden en op geen enkele zijn '
  'afgevallen. Dit is geen restpost maar de werkvoorraad van de verrijking: een '
  'hoog getal hier betekent dat er kennis ontbreekt, niet dat er geen kansen zijn.';

comment on column fondsen_poort_run.aantal_met_actie is
  'Fondsen met een ander handelingsperspectief dan aanvragen ("leg contact met '
  'het Zeeuwse Landschap", "zoek een partner"). Die vallen NIET af — ze vragen '
  'iets anders van de gebruiker.';

alter table fondsen_poort_run enable row level security;

drop policy if exists "fondsen poort run zien" on fondsen_poort_run;
create policy "fondsen poort run zien" on fondsen_poort_run for select
  using (is_lid_van(landgoed_id) or is_admin());

drop policy if exists "fondsen poort run schrijven" on fondsen_poort_run;
create policy "fondsen poort run schrijven" on fondsen_poort_run for insert
  with check (is_lid_van(landgoed_id) or is_admin());

-- ------------------------------------------------------------
-- 2. regio_alias: een landelijk-vlag
-- ------------------------------------------------------------
-- Een flink deel van de vrije tekst in geo_waarden is in de kern landelijk met
-- een regionale VOORKEUR erachter ("Landelijk (kantoor Den Haag)", "Landelijk
-- (voorkeur ondervertegenwoordigde regio's)"). Zonder deze vlag zou zo'n fonds
-- eeuwig op 'onbekend' blijven staan terwijl de bron duidelijk is.
alter table regio_alias add column if not exists landelijk boolean not null default false;

comment on column regio_alias.landelijk is
  'De alias beschrijft géén begrenzing maar een landelijk werkgebied met '
  'hooguit een regionale voorkeur. Zo''n fonds gaat door de geografische poort.';

-- ------------------------------------------------------------
-- 3. Eerste vulling — alleen wat we ZEKER weten
-- ------------------------------------------------------------
-- geaccordeerd = false: dit zijn voorstellen, geen vaststellingen. De poort
-- gebruikt een niet-geaccordeerde alias uitsluitend om DOOR te laten of om
-- 'onbekend' te blijven, nooit om een fonds te laten afvallen. Een vertaling
-- die nog geen mens heeft gezien is geen grond om een kans weg te strepen.
--
-- De alias is de LETTERLIJKE regionaam, niet de hele vrije tekst: de poort
-- knipt geo_waarden zelf in brokjes (splitsWerkgebied) en zoekt elk brokje hier
-- op. Gokken staat niet in deze lijst — een regio waarvan de gemeenten niet
-- vaststaan hoort hier gewoon niet in, en levert dan 'onbekend' op.
insert into regio_alias (alias, provincie, gemeenten, landelijk, bron, herkomst, geaccordeerd)
values
  ('Kennemerland', 'Noord-Holland',
   array['Haarlem','Bloemendaal','Heemstede','Velsen','Beverwijk','Heemskerk','Zandvoort'],
   false, 'Gemeentelijke indeling Zuid-Kennemerland/IJmond', 'handmatig', false),
  ('Zaanstreek', 'Noord-Holland', array['Zaanstad','Oostzaan','Wormerland'],
   false, 'Gemeentelijke indeling Zaanstreek', 'handmatig', false),
  ('Achterhoek', 'Gelderland',
   array['Aalten','Berkelland','Bronckhorst','Doetinchem','Montferland','Oost Gelre','Oude IJsselstreek','Winterswijk'],
   false, 'Regio Achterhoek (8 gemeenten)', 'handmatig', false),
  ('Krimpenerwaard', 'Zuid-Holland', array['Krimpenerwaard','Krimpen aan den IJssel'],
   false, 'Gemeentelijke indeling Krimpenerwaard', 'handmatig', false),
  ('Midden-Delfland', 'Zuid-Holland', array['Midden-Delfland','Delft','Schiedam','Vlaardingen','Maassluis'],
   false, 'Gebiedsindeling Midden-Delfland', 'handmatig', false),
  ('Schouwen-Duiveland', 'Zeeland', array['Schouwen-Duiveland'],
   false, 'Gemeente Schouwen-Duiveland', 'handmatig', false),
  ('Haaglanden', 'Zuid-Holland',
   array['Den Haag','Delft','Rijswijk','Leidschendam-Voorburg','Wassenaar','Westland','Pijnacker-Nootdorp','Zoetermeer'],
   false, 'Stadsgewest Haaglanden', 'handmatig', false),
  ('Groot-Rijnmond', 'Zuid-Holland',
   array['Rotterdam','Schiedam','Vlaardingen','Maassluis','Capelle aan den IJssel','Krimpen aan den IJssel','Barendrecht','Ridderkerk','Albrandswaard','Lansingerland','Nissewaard','Voorne aan Zee','Hellevoetsluis'],
   false, 'COROP-gebied Groot-Rijnmond', 'handmatig', false),
  ('Noord-Nederland', null, array[]::text[], false,
   'Groningen, Friesland en Drenthe — provincies staan los in geo_waarden', 'handmatig', false),
  ('Lopikerwaard', 'Utrecht', array['Lopik','IJsselstein','Montfoort','Oudewater','Woerden'],
   false, 'Gebiedsindeling Lopikerwaard', 'handmatig', false),
  ('Landelijk', null, array[]::text[], true,
   'Vrije tekst die met "Landelijk" begint: geen begrenzing maar een voorkeur', 'handmatig', false)
on conflict (alias) do nothing;
