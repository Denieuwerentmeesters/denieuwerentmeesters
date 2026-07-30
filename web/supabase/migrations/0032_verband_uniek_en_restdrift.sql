-- ============================================================
-- Stamgegevens stap 0 (#opruimen): verband-uniciteit + restdrift
--
-- 1. verband: de unique-constraint uit 0006 dedupliceert niet wanneer rol NULL
--    is (in SQL is NULL nooit gelijk aan NULL) — terwijl koppel-acties en de
--    AI-upsert rol wél leeg kunnen laten. Gevolg: dezelfde koppeling kon
--    meerdere keren ontstaan. Vervang de constraint door een unieke index op
--    coalesce(rol, ''), die ook bij lege rol dedupliceert.
--    Eerst bestaande duplicaten opruimen (oudste rij wint), anders faalt de
--    index-aanmaak op een database waar het lek al heeft toegeslagen.
-- 2. landgoed.bodemgebruik_gecontroleerd_op: gebruikt in code (profiel), maar
--    stond in geen enkele migratie — zelfde soort drift als 0029 dichtte.
--
-- Idempotent en additief; veilig op live én op een verse database.
-- ============================================================

-- 1a. Duplicaten met lege rol opruimen (oudste rij per combinatie blijft).
delete from verband v
using verband ouder
where v.rol is null
  and ouder.rol is null
  and v.bron_type = ouder.bron_type
  and v.bron_id   = ouder.bron_id
  and v.doel_type = ouder.doel_type
  and v.doel_id   = ouder.doel_id
  and ouder.id < v.id;

-- 1b. Constraint vervangen door een null-veilige unieke index.
alter table verband drop constraint if exists verband_bron_type_bron_id_doel_type_doel_id_rol_key;
drop index if exists verband_uniek_idx;
create unique index verband_uniek_idx
  on verband (bron_type, bron_id, doel_type, doel_id, coalesce(rol, ''));

-- 2. Restdrift: kolom bestond alleen live/in code, niet in de migraties.
alter table landgoed add column if not exists bodemgebruik_gecontroleerd_op timestamptz;
