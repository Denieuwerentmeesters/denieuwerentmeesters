-- ============================================================
-- Gebruikseenheden (Hugo 2.2, issue #114)
--
-- Eén gebouw kan meerdere zelfstandig bruikbare of verhuurbare delen
-- hebben: een boerderij met twee wooneenheden, een schuur met
-- opslagboxen. Hugo's spec (Gegevenswoordenboek v1.1, entiteit
-- GebruiksEenheid): "zelfstandige fysieke of functionele
-- gebruikseenheid binnen één gebouw" — en de plek waar huurcontracten
-- (module 6.1) straks aan haken. Contractuele rechten blijven buiten
-- deze tabel ("blijven in Module 6").
--
-- Gebouwdeel, bouwlaag en ruimte zijn bij Hugo optioneel en volgen
-- pas als de praktijk erom vraagt (zelfde besluit als de
-- gebouw-decompositie, besluitenlogboek 03-08).
-- ============================================================

create table if not exists gebruikseenheid (
  id                     uuid        primary key default gen_random_uuid(),
  landgoed_id            uuid        not null references landgoed(id) on delete cascade,
  -- het gebouw (stamobject met categorie gebouw/woning/opstal)
  stamobject_id          uuid        not null references stamobject(id) on delete cascade,
  naam                   text        not null,
  -- typen uit Hugo's waardenlijst GebruiksEenheidtype (22_13)
  type                   text        not null default 'woning'
                           check (type in ('woning','appartement','kantoor','opslag',
                                           'bedrijfsruimte','recreatieverblijf','overig')),
  -- praktische toestand — leegstand is het signaal dat telt voor verhuur
  status                 text        not null default 'in_gebruik'
                           check (status in ('in_gebruik','leegstand','in_renovatie')),
  adres                  text,
  oppervlakte_m2         numeric,
  -- optionele externe referentie (Hugo: BAGVerblijfsobjectID)
  bag_verblijfsobject_id text,
  omschrijving           text,
  aangemaakt_op          timestamptz not null default now()
);

create index if not exists gebruikseenheid_landgoed_idx on gebruikseenheid (landgoed_id);
create index if not exists gebruikseenheid_gebouw_idx   on gebruikseenheid (stamobject_id);

-- RLS: zelfde model als kadastraal_perceel (0037) — leden lezen,
-- eigenaar/rentmeester schrijven.
alter table gebruikseenheid enable row level security;

drop policy if exists "gebruikseenheid zien"    on gebruikseenheid;
drop policy if exists "gebruikseenheid beheren" on gebruikseenheid;
create policy "gebruikseenheid zien" on gebruikseenheid for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "gebruikseenheid beheren" on gebruikseenheid for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
