-- 0034 — Vergaderingen/opnames: deelnemers en agendapunt-voorstellen.
--
-- Twee nieuwe kindtabellen van `gesprek`:
--  * gesprek_deelnemer          — wie er bij het gesprek was (contact uit `relatie` of vrije naam)
--  * gesprek_agendapunt_voorstel — voorgestelde agendapunten / volgende vergadering; na
--                                  bevestiging wordt hieruit een `agenda_item` aangemaakt.
--
-- Idempotent: create/add/drop ... if exists, zodat herdraaien altijd veilig is.

-- ------------------------------------------------------------
-- 1. Tabellen
-- ------------------------------------------------------------

-- Deelnemer aan een gesprek. Ofwel gekoppeld aan een bestaand contact (relatie_id),
-- ofwel een handmatig ingetypte naam. `naam` is altijd gevuld zodat de UI niet hoeft te joinen.
create table if not exists gesprek_deelnemer (
  id            uuid        primary key default gen_random_uuid(),
  gesprek_id    uuid        not null references gesprek(id) on delete cascade,
  relatie_id    uuid        references relatie(id) on delete set null,
  naam          text        not null,
  aangemaakt_op timestamptz default now()
);

-- Voorgesteld agendapunt (handmatig of door de AI uit het transcript gehaald).
-- Pas na bevestiging ontstaat er een echt agenda_item; agenda_item_id legt die link vast.
create table if not exists gesprek_agendapunt_voorstel (
  id             uuid        primary key default gen_random_uuid(),
  gesprek_id     uuid        not null references gesprek(id) on delete cascade,
  titel          text        not null,
  datum          date,
  tijd           time,
  locatie        text,
  omschrijving   text,
  bron_citaat    text,
  herkomst       text        not null default 'ai' check (herkomst in ('ai','handmatig')),
  status         text        not null default 'voorgesteld'
                   check (status in ('voorgesteld','bevestigd','afgewezen')),
  agenda_item_id uuid,
  aangemaakt_op  timestamptz default now()
);

create index if not exists gesprek_deelnemer_gesprek_idx
  on gesprek_deelnemer (gesprek_id);
create index if not exists gesprek_agendapunt_voorstel_gesprek_idx
  on gesprek_agendapunt_voorstel (gesprek_id);

-- Eén contact hoort maar één keer bij hetzelfde gesprek te staan.
-- Bewust géén partiële index: `on conflict (gesprek_id, relatie_id)` kan een partiële index
-- niet afleiden. Handmatig ingetypte namen (relatie_id null) botsen hier niet op, omdat
-- Postgres NULL-waarden in een unieke index als onderling verschillend behandelt.
create unique index if not exists gesprek_deelnemer_uniek_relatie
  on gesprek_deelnemer (gesprek_id, relatie_id);

-- ------------------------------------------------------------
-- 2. RLS — rechten volgen het bovenliggende gesprek (zoals gesprek_transcript etc.)
-- ------------------------------------------------------------

alter table gesprek_deelnemer            enable row level security;
alter table gesprek_agendapunt_voorstel  enable row level security;

drop policy if exists "gesprek deelnemer zien"    on gesprek_deelnemer;
drop policy if exists "gesprek deelnemer beheren" on gesprek_deelnemer;
create policy "gesprek deelnemer zien" on gesprek_deelnemer for select
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_deelnemer.gesprek_id
      and (is_lid_van(g.landgoed_id) or is_admin())
  ));
create policy "gesprek deelnemer beheren" on gesprek_deelnemer for all
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_deelnemer.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ))
  with check (exists (
    select 1 from gesprek g
    where g.id = gesprek_deelnemer.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ));

drop policy if exists "gesprek agendapunt zien"    on gesprek_agendapunt_voorstel;
drop policy if exists "gesprek agendapunt beheren" on gesprek_agendapunt_voorstel;
create policy "gesprek agendapunt zien" on gesprek_agendapunt_voorstel for select
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_agendapunt_voorstel.gesprek_id
      and (is_lid_van(g.landgoed_id) or is_admin())
  ));
create policy "gesprek agendapunt beheren" on gesprek_agendapunt_voorstel for all
  using (exists (
    select 1 from gesprek g
    where g.id = gesprek_agendapunt_voorstel.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ))
  with check (exists (
    select 1 from gesprek g
    where g.id = gesprek_agendapunt_voorstel.gesprek_id
      and (rol_op(g.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  ));

-- ------------------------------------------------------------
-- 3. Herkomst van een agenda_item vastleggen (voor "komt uit vergadering X")
-- ------------------------------------------------------------

alter table agenda_item add column if not exists gesprek_id uuid references gesprek(id) on delete set null;
create index if not exists agenda_item_gesprek_idx on agenda_item (gesprek_id);
