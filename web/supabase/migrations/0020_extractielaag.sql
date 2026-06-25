-- ============================================================
-- Extractielaag — generieke AI-extractie (v1, contact_uit_mail)
-- ============================================================

-- ── extractie_opzet ──
-- Vaste extractie-configuraties per brontype.
create table extractie_opzet (
  id          uuid    primary key default gen_random_uuid(),
  brontype    text    not null unique,
  omschrijving text   not null,
  velden      jsonb   not null default '[]',
  koppel_doel text[]  not null default '{}',
  actief      boolean not null default true
);

-- ── intake_run ──
-- Elke uitgevoerde extractie: inspecteerbaarheid + concept-staging.
-- (Naam intake_run om conflict met bestaande stamgegevens-extractie_run te vermijden.)
create table intake_run (
  id              uuid        primary key default gen_random_uuid(),
  landgoed_id     uuid        not null references landgoed(id) on delete cascade,
  opzet_id        uuid        not null references extractie_opzet(id),
  brontype        text        not null,
  bron_ref        text,
  vrije_instructie text,
  concept         jsonb,
  status          text        not null default 'concept'
                  check (status in ('concept','bevestigd','afgewezen')),
  bevestigd_door  uuid        references profiel(id),
  bevestigd_op    timestamptz,
  resultaat_ref   text,
  aangemaakt_op   timestamptz not null default now()
);

-- ── RLS ──
alter table extractie_opzet enable row level security;
alter table intake_run      enable row level security;

create policy "extractie_opzet lezen"
  on extractie_opzet for select
  using (true);

create policy "intake_run zien"
  on intake_run for select
  using (is_lid_van(landgoed_id) or is_admin());

create policy "intake_run aanmaken"
  on intake_run for insert
  with check (is_lid_van(landgoed_id) or is_admin());

create policy "intake_run bijwerken"
  on intake_run for update
  using (is_lid_van(landgoed_id) or is_admin())
  with check (is_lid_van(landgoed_id) or is_admin());

-- ── Seed: opzet voor contact_uit_mail ──
insert into extractie_opzet (brontype, omschrijving, koppel_doel, velden) values (
  'contact_uit_mail',
  'Concept-contact uit een doorgestuurde mail',
  array['contact'],
  '[
    {"key":"naam",            "label":"Naam",               "verplicht":true,  "type":"text",     "toelichting":"naam van de afzender/genoemde persoon"},
    {"key":"organisatie",     "label":"Organisatie",        "verplicht":false, "type":"text",     "toelichting":"bedrijf/firma indien genoemd"},
    {"key":"email",           "label":"E-mail",             "verplicht":false, "type":"email",    "toelichting":"alleen als expliciet in de mail"},
    {"key":"telefoon",        "label":"Telefoon",           "verplicht":false, "type":"telefoon", "toelichting":"alleen als expliciet in de mail"},
    {"key":"rol_voorstel",    "label":"Voorgestelde rol",   "verplicht":false, "type":"enum",     "toelichting":"kies uit bestaande rol_types; gok niet als onduidelijk"},
    {"key":"status_voorstel", "label":"Status",             "verplicht":false, "type":"enum",     "toelichting":"actief/latent/archief — sollicitant of aanbieder = latent"},
    {"key":"omschrijving",    "label":"Korte omschrijving", "verplicht":false, "type":"text",     "toelichting":"1 zin samenvatting waarom dit contact relevant is"},
    {"key":"bron_notitie",    "label":"Herkomst",           "verplicht":false, "type":"text",     "toelichting":"bv. doorgestuurd via mail, sollicitatie groenbeheer"}
  ]'::jsonb
);
