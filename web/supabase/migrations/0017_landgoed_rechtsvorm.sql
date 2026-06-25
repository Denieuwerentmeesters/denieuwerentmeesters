-- ============================================================
-- Matchmotor — aanvragerstype / rechtsvorm (golf C, grootste ruisreductie)
--
-- Veel regelingen filteren niet op het onderwerp maar op WIE mag aanvragen
-- (particulier / BV / stichting / maatschap-VOF / collectief / samenwerking).
-- Zonder dit veld matcht de motor regelingen waarvoor het landgoed in de
-- verkeerde rechtsvorm zit -> valse matches. Gebruikt als eis-criterium met
-- veld='rechtsvorm'. Vrije tekst (zoals eigendomsvorm); canonieke waarden in de
-- regeling-criteria afstemmen op deze termen.
--
-- NB: los van het bestaande `eigendomsvorm` — dat gaat over hoe het BEZIT is
-- geregeld, niet over de aanvragende entiteit.
-- ============================================================

alter table landgoed add column if not exists rechtsvorm text;
comment on column landgoed.rechtsvorm is
  'Rechtsvorm van de aanvrager (particulier/bv/stichting/maatschap_vof/collectief/samenwerking/overig). Vrije tekst; gebruikt door de matchmotor als eis-criterium veld=rechtsvorm.';
