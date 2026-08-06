-- ============================================================
-- Contracten-keten plak 2: prijsafspraken met historie (issue #146)
--
-- Hugo 6.1/6.2 (v0.2): de prijs is een deelregistratie met
-- geldigheidsperioden — "een oude huurprijs blijft als afgesloten
-- prijsperiode bewaard". Indexatie maakt een vóórstel dat de gebruiker
-- accordeert (zelfde principe als AI-uitvoer: nooit direct een feit).
--
-- contract.bedrag blijft bestaan als spiegel van de actuele
-- geaccordeerde prijs, zodat register, dossierkop en perceelpagina
-- zonder joins blijven kloppen; de app houdt de spiegel bij.
-- ============================================================

create table if not exists contract_prijsafspraak (
  id            uuid        primary key default gen_random_uuid(),
  landgoed_id   uuid        not null references landgoed(id) on delete cascade,
  contract_id   uuid        not null references contract(id) on delete cascade,
  bedrag        numeric     not null,
  geldig_van    date        not null,
  geldig_tot    date,
  status        text        not null default 'geaccordeerd'
                  check (status in ('voorstel','geaccordeerd','afgewezen')),
  herkomst      text        not null default 'handmatig'
                  check (herkomst in ('handmatig','indexatie')),
  toelichting   text,
  aangemaakt_op timestamptz not null default now()
);

create index if not exists contract_prijsafspraak_landgoed_idx on contract_prijsafspraak (landgoed_id);
create index if not exists contract_prijsafspraak_contract_idx on contract_prijsafspraak (contract_id);

alter table contract_prijsafspraak enable row level security;

drop policy if exists "prijsafspraak zien"    on contract_prijsafspraak;
drop policy if exists "prijsafspraak beheren" on contract_prijsafspraak;
create policy "prijsafspraak zien" on contract_prijsafspraak for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "prijsafspraak beheren" on contract_prijsafspraak for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

-- Backfill: contracten die al een bedrag hebben krijgen één openstaande
-- prijsregel, geldig vanaf de ingangsdatum (of vandaag als die ontbreekt).
-- Idempotent via not exists.
insert into contract_prijsafspraak (landgoed_id, contract_id, bedrag, geldig_van, toelichting)
select c.landgoed_id, c.id, c.bedrag, coalesce(c.ingangsdatum, current_date),
       'overgenomen uit het bestaande bedrag-veld'
from contract c
where c.bedrag is not null
  and not exists (
    select 1 from contract_prijsafspraak p where p.contract_id = c.id
  );
