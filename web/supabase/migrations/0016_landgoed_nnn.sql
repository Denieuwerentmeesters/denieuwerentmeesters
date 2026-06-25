-- ============================================================
-- Matchmotor — kaartlaag NNN (Natuurnetwerk Nederland, golf B)
--
-- Tweede gebiedsligging-kenmerk. Bepaald uit de PDOK NNN-WMS (INSPIRE
-- geharmoniseerd, layer PS.ProtectedSite) via GetFeatureInfo op de basislocatie.
-- Typisch een PRÉ ("binnen NNN makkelijker/hogere subsidie"), niet per se een eis.
-- null = nog niet gecontroleerd -> matchmotor behandelt het als 'onzeker'.
-- ============================================================

alter table landgoed add column if not exists ligt_in_nnn boolean;
alter table landgoed add column if not exists nnn_gecontroleerd_op timestamptz;
