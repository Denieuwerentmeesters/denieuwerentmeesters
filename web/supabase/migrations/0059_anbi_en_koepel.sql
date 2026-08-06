-- ============================================================
-- ANBI-status per landgoed + koepelorganisatie per fonds
--
-- WAAROM is_anbi EEN EIGEN KOLOM OP landgoed
-- De meeste landgoederen zijn géén ANBI. Een fonds dat ANBI eist wordt
-- getoetst als generiek criterium (regeling_criterium, veld='is_anbi'),
-- precies zoals rechtsvorm nu al werkt (zie toetsRechtsvorm in
-- lib/fondsen/poort.ts) — geen aparte kolom op regeling nodig.
-- Default false: bij twijfel is "geen ANBI" de veilige aanname.
--
-- WAAROM beheerd_door OP regeling
-- Koepelstichtingen (Ars Donandi) beheren tientallen naamfondsen; je dient in
-- bij het naamfonds, niet bij de koepel. Vrije tekst, analoog aan de
-- bestaande organisatie-kolom, zodat de bestaande AI-verrijking
-- (lib/subsidie/verrijking.ts) het kan vullen en de fondsenradar het per
-- naamfonds kan tonen.
-- ============================================================

alter table landgoed add column if not exists is_anbi boolean not null default false;
alter table regeling add column if not exists beheerd_door text;
