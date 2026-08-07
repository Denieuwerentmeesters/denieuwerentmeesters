-- Werkorders / Meldingen & klussen — fase 1, stap 1: datamodel + interne flow.
-- Bron: "Claude plan en tech stack/Werkorders_Plan_v1_0.md" hfst 3-4.
-- Werkorder = taak-plus: zelfde toewijzingsmodel als taak (veiligeToewijzing),
-- maar aparte tabel omdat het eindbeeld (object, kosten, foto's, AI-voorstel)
-- taak zou vervuilen voor alle andere gebruikers van die generieke tabel.

create table if not exists werkorder (
  id                  uuid primary key default gen_random_uuid(),
  landgoed_id         uuid not null references landgoed(id) on delete cascade,

  -- kern, analoog aan taak
  titel               text not null,
  omschrijving        text,
  prioriteit          text,
  deadline            date,
  toegewezen_aan      uuid references profiel(id),
  toegewezen_aan_naam text,               -- contact zonder profiel (veiligeToewijzing)

  -- classificatie (licht, geen vaste taxonomie in fase 1)
  soort               text,              -- correctief|preventief|inspectie_opvolging|incident|klacht|mjop_maatregel|projectactie
  categorie           text,

  -- status (bronplan hfst 3: 6 hoofdstatussen + geannuleerd)
  status              text not null default 'gemeld'
                       check (status in ('gemeld','beoordelen','toegewezen','in_uitvoering','wacht_op','klaar','geannuleerd')),
  wacht_reden         text,              -- alleen relevant bij status='wacht_op'

  -- koppelingen
  stamobject_id       uuid references stamobject(id) on delete set null,
  melder_relatie_id   uuid references relatie(id) on delete set null,   -- interne melder met contactrecord
  melder_naam         text,              -- externe melder zonder account (meldlink, fase 1 stap 3)
  melder_email        text,
  melder_contact_id   uuid references relatie(id) on delete set null,   -- externe uitvoerder-contact (magic link, fase 1 stap 4)

  -- kosten (licht: twee velden, geen boekhoudkundige keten in fase 1)
  kosten_verwacht     numeric,
  kosten_werkelijk    numeric,

  -- foto's vóór/na: storage-paden, patroon "{landgoed_id}/werkorders/{id}/..."
  fotos_voor          text[] not null default '{}',
  fotos_na            text[] not null default '{}',

  -- AI-routeringsvoorstel (voorstel->akkoord, nooit direct toegewezen — fase 1 stap 2)
  ai_voorstel         jsonb,
  ai_voorstel_status  text default null check (ai_voorstel_status is null or ai_voorstel_status in ('voorgesteld','geaccordeerd','afgewezen')),

  aangemaakt_op       timestamptz not null default now(),
  aangemaakt_door     uuid references profiel(id),   -- null bij melding zonder account
  bijgewerkt_op       timestamptz not null default now()
);

create index if not exists werkorder_landgoed_idx      on werkorder (landgoed_id);
create index if not exists werkorder_status_idx         on werkorder (landgoed_id, status);
create index if not exists werkorder_stamobject_idx     on werkorder (stamobject_id);

alter table werkorder enable row level security;

drop policy if exists "werkorder zien" on werkorder;
create policy "werkorder zien" on werkorder for select
  using (is_lid_van(landgoed_id) or is_admin());

drop policy if exists "werkorder beheren" on werkorder;
create policy "werkorder beheren" on werkorder for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- drempelbedrag per landgoed (hfst 8), default 500 — voorlopig alleen door
-- eigenaar in te stellen; RLS voor "werkorder beheren" dekt dat al af omdat
-- landgoed-update elders al op eigenaar/rentmeester is geregeld.
alter table landgoed add column if not exists werkorder_drempelbedrag numeric not null default 500;
