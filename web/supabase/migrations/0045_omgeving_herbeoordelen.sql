-- ============================================================
-- Opgehaalde berichten opnieuw laten beoordelen
--
-- De eerste ophaalronde liep met een geocoder-drempel die correcte adressen
-- afwees (score 12,6 voor een perfect adres, drempel stond op 13) en met een
-- vangnetregel die elk onplaatsbaar bericht met een termijn bewaarde. Gevolg:
-- 46 van de 49 bewaarde berichten waren gewone vergunningen kilometers
-- verderop, getoond zonder afstandstoets omdat die nooit gelukt was.
--
-- Beide oorzaken zijn opgelost, maar de berichten zelf blijven staan: de
-- ingest dedupliceert op externe_id, dus een nieuwe ronde slaat ze over en
-- de foute beoordeling blijft eeuwig staan.
--
-- Daarom hier eenmalig weggooien wat de machine heeft aangemaakt, zodat de
-- volgende ronde alles opnieuw beoordeelt met de gecorrigeerde regels.
--
-- LET OP wat er NIET weggaat:
--   - berichten zonder bron_id = met de hand toegevoegd door een gebruiker
--   - berichten die al zijn omgezet naar een taak of agendapunt
-- Die twee zijn menselijk werk en mogen nooit door een migratie verdwijnen.
-- ============================================================

set local search_path = public, extensions;

delete from omgevingsbericht
 where bron_id is not null
   and status <> 'omgezet'
   and taak_id is null
   and agenda_item_id is null;

-- De trechtercijfers van die ronde kloppen niet meer met wat er in de tabel
-- staat; een lege lei voorkomt dat iemand ze later als meting gebruikt.
delete from omgeving_run;
