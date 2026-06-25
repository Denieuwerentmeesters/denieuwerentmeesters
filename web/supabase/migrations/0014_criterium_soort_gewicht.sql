-- ============================================================
-- Subsidiemodule — Matchmotor: fijnheid (eis / pré / uitsluiting + gewicht)
-- Bron: buildspec "De matchmotor — breedte én fijnheid".
--
-- regeling_criterium kreeg in 0012 alleen `verplicht` (true/false). De matchmotor
-- gebruikte criteria daardoor enkel als harde poort en haalde de score uit een
-- AI-tekstgelijkenis. Met `soort` + `gewicht` wordt de score BEREKEND:
--   eis         -> niet voldaan: regeling valt af
--   pre         -> voldaan: +gewicht punten; niet voldaan: blijft kandidaat
--   uitsluiting -> voldaan: regeling valt af
-- `soort` wordt de bron van waarheid voor matching; `verplicht` blijft bestaan
-- (UI/verrijking lezen het) en wordt via de backfill gelijkgetrokken.
-- ============================================================

alter table regeling_criterium
  add column if not exists soort text not null default 'eis'
    check (soort in ('eis','pre','uitsluiting'));

alter table regeling_criterium
  add column if not exists gewicht integer not null default 10;

-- Backfill: bestaande rijen hadden alleen `verplicht`.
--   verplicht=true  -> eis   (harde poort, zoals nu)
--   verplicht=false -> pre   (telde voorheen niet mee; nu een pré)
update regeling_criterium set soort = 'pre'  where verplicht = false and soort = 'eis';
update regeling_criterium set soort = 'eis'  where verplicht = true;
