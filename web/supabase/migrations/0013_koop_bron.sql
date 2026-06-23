-- ============================================================
-- Subsidiemodule — KOOP/CVDR-bron (v1)
-- Bron: "Subsidieradar — KOOP API-integratie" buildspec.
--
-- KOOP (repository.overheid.nl / zoekservice.overheid.nl, SRU 2.0) ontsluit
-- CVDR (voorraad: geldende regelingen) en officiële publicaties (stroom:
-- nieuwe besluiten/openstellingen) gestandaardiseerd voor alle overheden.
-- Eén integratie dekt alle 12 provincies + gemeenten + waterschappen; alleen
-- de `creator` wisselt.
--
-- Past in de bestaande catalogus: KOOP wordt een CONNECTOR die in `regeling`
-- + `subsidie_snapshot` schrijft (geen aparte tabel). Hier alleen de paar extra
-- catalogusvelden + de bronregistratie.
-- ============================================================

-- 1. Extra catalogusvelden voor KOOP-records.
alter table regeling add column if not exists creator text;            -- dcterms:creator, bv. 'Zeeland'
alter table regeling add column if not exists bestuurslaag text        -- enrichedData/organisatietype
  check (bestuurslaag in ('rijk','provincie','gemeente','waterschap','samenwerkingsorgaan'));
alter table regeling add column if not exists status text              -- afgeleid van openstelling vs. vandaag
  check (status in ('open','gesloten','onbekend'));
create index if not exists regeling_creator_idx on regeling (creator);
create index if not exists regeling_bestuurslaag_idx on regeling (bestuurslaag);

-- 2. Bronnen registreren: twee SRU-connecties (voorraad + stroom).
--    De hand-onderhouden Zeeland-scrape vervalt (KOOP dekt Zeeland mee).
update subsidie_bron set actief = false where sleutel = 'provincie_zeeland';

insert into subsidie_bron (sleutel, naam, type, bestuurslaag, basis_url) values
  ('koop_cvdr', 'KOOP — CVDR (geldende regelingen)', 'api', null,
   'https://zoekservice.overheid.nl/sru/Search'),
  ('koop_officielepublicaties', 'KOOP — officiële publicaties (openstellingen)', 'api', null,
   'https://zoekservice.overheid.nl/sru/Search')
on conflict (sleutel) do nothing;
