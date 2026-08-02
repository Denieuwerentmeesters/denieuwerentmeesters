-- Gebiedsligging per kadastraal perceel.
--
-- De knop "Controleer gebiedsligging" keek tot nu alleen naar het basispunt
-- van het landgoed. Nu we perceelgeometrieën hebben (0038) kan de check per
-- perceel: ligt dít perceel (gemeten op zijn middelpunt) in Natura 2000 of
-- het NNN? Dat maakt de subsidie-matching preciezer — een landgoed waarvan
-- alleen de rand in een gebied ligt, werd eerder gemist.

alter table kadastraal_perceel
  add column if not exists ligt_in_natura2000 boolean;

alter table kadastraal_perceel
  add column if not exists natura2000_gebied text;

alter table kadastraal_perceel
  add column if not exists ligt_in_nnn boolean;

alter table kadastraal_perceel
  add column if not exists gebiedsligging_gecontroleerd_op timestamptz;
