-- ============================================================
-- Inbound e-mailpijplijn (v1)
-- landgoed_inbox · inbound_email · inbound_bijlage · inbound_extractie
-- ============================================================

-- ── 1. landgoed_inbox — koppelt e-mailadres (local_part) aan landgoed ──
create table landgoed_inbox (
  id            uuid        primary key default gen_random_uuid(),
  local_part    text        not null unique,  -- deel vóór de @, bijv. 'terhooge'
  landgoed_id   uuid        not null references landgoed(id) on delete cascade,
  actief        boolean     not null default true,
  aangemaakt_op timestamptz not null default now()
);

-- ── 2. inbound_email — ruwe binnenkomst (bron van waarheid) ──
create table inbound_email (
  id                uuid        primary key default gen_random_uuid(),
  landgoed_id       uuid        not null references landgoed(id) on delete cascade,
  van_adres         text        not null,
  van_naam          text,
  onderwerp         text        not null default '',
  body_text         text        not null default '',
  body_html         text,
  ontvangen_op      timestamptz not null default now(),
  message_id        text        not null unique,  -- dedup-sleutel (RFC Message-ID)
  doorgestuurd_door text,
  ruwe_headers      jsonb       not null default '{}'::jsonb,
  verwerkt_status   text        not null default 'ontvangen'
                                check (verwerkt_status in ('ontvangen','geanalyseerd','fout')),
  aangemaakt_op     timestamptz not null default now()
);

-- ── 3. inbound_bijlage — bijlagen (gaan naar Storage bucket inbound-bijlagen) ──
create table inbound_bijlage (
  id               uuid        primary key default gen_random_uuid(),
  inbound_email_id uuid        not null references inbound_email(id) on delete cascade,
  bestandsnaam     text        not null,
  mime_type        text        not null,
  grootte_bytes    int         not null default 0,
  opslag_pad       text        not null,  -- {landgoed_id}/{inbound_email_id}/{bestandsnaam}
  aangemaakt_op    timestamptz not null default now()
);

-- ── 4. inbound_extractie — AI-voorstellen (kern; niets hier is feit tot mens bevestigt) ──
create table inbound_extractie (
  id                  uuid        primary key default gen_random_uuid(),
  inbound_email_id    uuid        not null references inbound_email(id) on delete cascade,
  landgoed_id         uuid        not null references landgoed(id) on delete cascade,
  type                text        not null
                                  check (type in ('taak','agendapunt','documentintake','informatie')),
  titel               text        not null,
  samenvatting        text        not null default '',
  voorgestelde_velden jsonb       not null default '{}'::jsonb,
  bron_citaat         text        not null default '',
  zekerheid           text        not null default 'midden'
                                  check (zekerheid in ('hoog','midden','laag')),
  status              text        not null default 'concept'
                                  check (status in ('concept','bevestigd','gewijzigd','verworpen')),
  gekoppeld_object_id uuid,
  beoordeeld_door     text,
  beoordeeld_op       timestamptz,
  aangemaakt_op       timestamptz not null default now()
);

-- ── 5. RLS ──
alter table landgoed_inbox    enable row level security;
alter table inbound_email     enable row level security;
alter table inbound_bijlage   enable row level security;
alter table inbound_extractie enable row level security;

-- landgoed_inbox: leesbaar voor leden, beheerbaar door eigenaar/rentmeester/admin
create policy "landgoed_inbox lezen"
  on landgoed_inbox for select
  using (is_lid_van(landgoed_id) or is_admin());

create policy "landgoed_inbox beheren"
  on landgoed_inbox for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- inbound_email: leesbaar voor leden, aanmaken via service-role (API route), beheer eigenaar+
create policy "inbound_email lezen"
  on inbound_email for select
  using (is_lid_van(landgoed_id) or is_admin());

create policy "inbound_email beheren"
  on inbound_email for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- inbound_bijlage: via inbound_email landgoed_id bepalen
create policy "inbound_bijlage lezen"
  on inbound_bijlage for select
  using (
    exists (
      select 1 from inbound_email e
      where e.id = inbound_bijlage.inbound_email_id
        and (is_lid_van(e.landgoed_id) or is_admin())
    )
  );

create policy "inbound_bijlage beheren"
  on inbound_bijlage for all
  using (
    exists (
      select 1 from inbound_email e
      where e.id = inbound_bijlage.inbound_email_id
        and (rol_op(e.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
    )
  )
  with check (
    exists (
      select 1 from inbound_email e
      where e.id = inbound_bijlage.inbound_email_id
        and (rol_op(e.landgoed_id) in ('eigenaar','rentmeester') or is_admin())
    )
  );

-- inbound_extractie: leesbaar voor leden, beoordeelbaar door eigenaar/rentmeester
create policy "inbound_extractie lezen"
  on inbound_extractie for select
  using (is_lid_van(landgoed_id) or is_admin());

create policy "inbound_extractie beheren"
  on inbound_extractie for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- ── 6. Storage bucket (private) ──
insert into storage.buckets (id, name, public)
values ('inbound-bijlagen', 'inbound-bijlagen', false)
on conflict (id) do nothing;

-- Leden mogen bijlagen van hun eigen landgoed lezen; aanmaken via service-role.
create policy "inbound-bijlagen lezen"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'inbound-bijlagen'
    and (
      is_admin()
      or is_lid_van((string_to_array(name, '/'))[1]::uuid)
    )
  );
