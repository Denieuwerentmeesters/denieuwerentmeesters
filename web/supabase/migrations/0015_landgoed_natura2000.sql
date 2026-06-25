-- ============================================================
-- Matchmotor — kaartlaag Natura 2000 (golf B)
--
-- Eerste gebiedsligging-kenmerk dat de matchmotor voedt. Wordt bepaald uit de
-- PDOK Natura 2000-WMS (GetFeatureInfo op de basislocatie) en op het landgoed
-- bewaard, zodat criteria met veld='ligt_in_natura2000' (eis of pré) kunnen
-- rekenen. null = nog niet gecontroleerd -> matchmotor behandelt het als
-- 'onzeker' (laat een eis niet afvallen, geeft een pré geen punten).
-- ============================================================

alter table landgoed add column if not exists ligt_in_natura2000 boolean;
alter table landgoed add column if not exists natura2000_gebied text;            -- naam N2K-gebied (transparantie)
alter table landgoed add column if not exists natura2000_gecontroleerd_op timestamptz;
