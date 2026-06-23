-- ============================================================
-- Subsidiemodule — Data- & bronnenfundering (v1)
-- Bron: Subsidiemodule - Plan.md + plan deep-popping-hopper.md
--
-- Kernbeslissing: koppel de CATALOGUS (regeling, nationaal/provinciaal,
-- bron-gevoed, draagt de drie §7-lagen één keer) los van de per-landgoed
-- INSTANTIE (subsidie, ledengebonden, 'lopend' of 'kans').
--
-- RLS-patroon (gespiegeld van subsidie/document):
--   catalogus + bron/run/snapshot  -> wereld-lezen, admin-schrijven
--   subsidie (bestaand)            -> ledengebonden (policies dekken nieuwe kolommen al)
--
-- Veilig idempotent waar mogelijk; voer eenmalig uit (supabase db push).
-- ============================================================

-- ------------------------------------------------------------
-- 1. BRONREGISTER + idempotente import + nieuw-detectie
-- ------------------------------------------------------------

-- Eén rij per externe bron (RVO open-data, een provincie, ...).
create table subsidie_bron (
  id uuid primary key default gen_random_uuid(),
  sleutel text not null unique,          -- 'rvo_opendata','provincie_zeeland',...
  naam text not null,
  type text not null check (type in ('api','scrape','handmatig')),
  bestuurslaag text check (bestuurslaag in ('nationaal','provinciaal','gemeentelijk')),
  basis_url text,
  actief boolean not null default true,
  laatst_gedraaid timestamptz,
  aangemaakt_op timestamptz default now()
);

-- Eén rij per import-run (audit + tellingen). Analoog aan extractie_run.
create table subsidie_import_run (
  id uuid primary key default gen_random_uuid(),
  bron_id uuid not null references subsidie_bron(id) on delete cascade,
  gestart_op timestamptz default now(),
  voltooid_op timestamptz,
  status text not null default 'bezig' check (status in ('bezig','klaar','fout')),
  aantal_gezien int not null default 0,
  aantal_nieuw int not null default 0,
  aantal_gewijzigd int not null default 0,
  aantal_verlopen int not null default 0,   -- in catalogus maar niet meer in feed
  fout text
);
create index on subsidie_import_run (bron_id, gestart_op desc);

-- Ruwe snapshot per (bron, extern_id) — de diff-basis voor nieuw-detectie.
-- payload = exacte payload zoals opgehaald; payload_hash detecteert wijziging.
create table subsidie_snapshot (
  id uuid primary key default gen_random_uuid(),
  bron_id uuid not null references subsidie_bron(id) on delete cascade,
  extern_id text not null,               -- RVO 'id', CVDR-id, of url-hash bij scrape
  payload jsonb not null,
  payload_hash text not null,
  voor_het_eerst_gezien timestamptz default now(),
  laatst_gezien timestamptz default now(),
  unique (bron_id, extern_id)
);
create index on subsidie_snapshot (bron_id, laatst_gezien);

-- ------------------------------------------------------------
-- 2. CATALOGUS: regeling (nationaal/provinciaal) — draagt §7-lagen
-- ------------------------------------------------------------
create table regeling (
  id uuid primary key default gen_random_uuid(),
  bron_id uuid references subsidie_bron(id) on delete set null,
  extern_id text,                        -- id binnen de bron; idempotency-sleutel
  scope text not null default 'nationaal'
    check (scope in ('nationaal','provinciaal','gemeentelijk')),
  naam text not null,
  organisatie text,
  categorie text not null default 'subsidie'
    check (categorie in ('subsidie','carbon','groenblauw','regeling')),  -- spiegelt subsidie.categorie
  samenvatting text,
  bron_url text,
  -- matching-velden (gevuld door connector + verrijking)
  themas text[],
  trefwoorden text[],
  doelgroepen text[],
  sectoren text[],
  provincie text,                        -- null = landelijk
  gemeenten text[],
  -- badges / sortering
  is_nieuw boolean not null default false,
  is_tijdelijk boolean not null default false,
  openstelling_van date,
  openstelling_tot date,                 -- de DEADLINE-laag; vaak null uit feeds
  budget_indicatie text,
  budget_resterend text,
  -- verrijking-status (AI stelt voor -> mens accordeert), zoals stamobject
  herkomst text not null default 'import' check (herkomst in ('import','ai','handmatig')),
  geaccordeerd boolean not null default false,   -- pas matchbaar als KANS na accordering
  verrijkt_op timestamptz,
  aangemaakt_op timestamptz default now(),
  bijgewerkt_op timestamptz default now(),
  unique (bron_id, extern_id)
);
create index on regeling (scope, geaccordeerd);
create index on regeling (is_nieuw, is_tijdelijk, openstelling_tot);
create index on regeling (provincie);

-- §7-laag 1: criteria (waaraan voldoen om te (blijven) kwalificeren)
create table regeling_criterium (
  id uuid primary key default gen_random_uuid(),
  regeling_id uuid not null references regeling(id) on delete cascade,
  omschrijving text not null,
  -- machine-leesbare hard-gate waar mogelijk (anders alleen tekst):
  veld text,            -- 'nsw_status','provincie','hectare_min','natuurbeheertype',...
  operator text,        -- 'is','bevat','>=','in'
  waarde text,
  verplicht boolean not null default true,
  herkomst text not null default 'ai' check (herkomst in ('ai','handmatig')),
  geaccordeerd boolean not null default false
);
create index on regeling_criterium (regeling_id);

-- §7-laag 2: beheersmaatregelen/activiteiten (wat fysiek te doen)
create table regeling_maatregel (
  id uuid primary key default gen_random_uuid(),
  regeling_id uuid not null references regeling(id) on delete cascade,
  omschrijving text not null,
  natuurbeheertype text,   -- koppelhaak naar stamobject(categorie='natuurbeheertype')
  eenheid text,            -- 'per ha','per stuk'
  herkomst text not null default 'ai' check (herkomst in ('ai','handmatig')),
  geaccordeerd boolean not null default false
);
create index on regeling_maatregel (regeling_id);

-- §7-laag 3: documentatie -> to-do (vereist bewijs; wordt per landgoed een taak)
create table regeling_bewijs (
  id uuid primary key default gen_random_uuid(),
  regeling_id uuid not null references regeling(id) on delete cascade,
  omschrijving text not null,     -- 'beheerverslag','foto-rapportage','factuur aannemer'
  document_type text,
  herkomst text not null default 'ai' check (herkomst in ('ai','handmatig')),
  geaccordeerd boolean not null default false
);
create index on regeling_bewijs (regeling_id);

-- ------------------------------------------------------------
-- 3. INSTANTIE: subsidie uitbreiden (geen nieuwe tabel)
-- ------------------------------------------------------------
alter table subsidie add column regeling_id uuid references regeling(id) on delete set null;
alter table subsidie add column soort text not null default 'lopend'
  check (soort in ('lopend','kans'));
-- LOPEND-statuslijn; elke stap is ook een taak (gekoppeld via verband).
alter table subsidie add column werkstap text
  check (werkstap in ('toegekend','maatregelen_lopen','bewijs_verzameld','verantwoord','afgerond'));
-- KANS-onderdrukking: markeer expliciet "al in gebruik".
alter table subsidie add column al_in_gebruik boolean not null default false;
create index on subsidie (landgoed_id, soort);
create index on subsidie (regeling_id);
-- Idempotente matches: één kans/lopend-rij per (landgoed, regeling).
-- Niet-partieel zodat ON CONFLICT (landgoed_id, regeling_id) deze index als
-- arbiter kan gebruiken. NULL regeling_id telt als distinct in Postgres, dus
-- legacy/handmatige rijen zonder regeling blijven onbeperkt toegestaan.
create unique index subsidie_landgoed_regeling_uniek
  on subsidie (landgoed_id, regeling_id);

-- ------------------------------------------------------------
-- 4. Row Level Security — spiegelt bestaande patronen
-- ------------------------------------------------------------
alter table subsidie_bron        enable row level security;
alter table subsidie_import_run  enable row level security;
alter table subsidie_snapshot    enable row level security;
alter table regeling             enable row level security;
alter table regeling_criterium   enable row level security;
alter table regeling_maatregel   enable row level security;
alter table regeling_bewijs      enable row level security;

-- Catalogus + bron/run/snapshot: WERELD-LEZEN, ADMIN-SCHRIJVEN.
-- (Ingestie draait als service-role en omzeilt RLS; admin-policy dekt de UI.)
create policy "regeling zien" on regeling for select using (true);
create policy "regeling beheren" on regeling for all
  using (is_admin()) with check (is_admin());

create policy "criterium zien" on regeling_criterium for select using (true);
create policy "criterium beheren" on regeling_criterium for all
  using (is_admin()) with check (is_admin());

create policy "maatregel zien" on regeling_maatregel for select using (true);
create policy "maatregel beheren" on regeling_maatregel for all
  using (is_admin()) with check (is_admin());

create policy "bewijs zien" on regeling_bewijs for select using (true);
create policy "bewijs beheren" on regeling_bewijs for all
  using (is_admin()) with check (is_admin());

create policy "subsidie_bron zien" on subsidie_bron for select using (true);
create policy "subsidie_bron beheren" on subsidie_bron for all
  using (is_admin()) with check (is_admin());

create policy "import_run zien" on subsidie_import_run for select using (true);
create policy "import_run beheren" on subsidie_import_run for all
  using (is_admin()) with check (is_admin());

create policy "snapshot zien" on subsidie_snapshot for select
  using (is_admin());
create policy "snapshot beheren" on subsidie_snapshot for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 5. Bronnen vast registreren (idempotent) — RVO landelijk + Zeeland
-- ------------------------------------------------------------
insert into subsidie_bron (sleutel, naam, type, bestuurslaag, basis_url) values
  ('rvo_opendata', 'RVO open data', 'api', 'nationaal',
   'https://www.rvo.nl/api/v1/opendata/subsidies'),
  ('provincie_zeeland', 'Provincie Zeeland', 'scrape', 'provinciaal',
   'https://www.zeeland.nl/subsidie-aanvragen')
on conflict (sleutel) do nothing;
