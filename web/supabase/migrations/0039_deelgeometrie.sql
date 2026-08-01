-- Deelgeometrie op de koppeling beheerperceel <-> kadastraal perceel.
--
-- Bij deelgebruik (één kadastraal perceel bij meerdere beheerpercelen, dekking
-- 'gedeeltelijk') kan een getekende splitslijn vastleggen wélk deel bij welk
-- beheerperceel hoort: de deelvorm zelf plus de naar rato verdeelde officiële
-- kadastrale oppervlakte. Kolommen leeg = geen splitsing getekend (het hele
-- perceel telt dan bij elke koppeling als indicatief).
-- Sluit aan op Hugo's model: AreaaldeelKadastraalPerceel is daar expliciet een
-- geometrische koppeling (Document 6, §2.1).

alter table beheerperceel_kadastraal
  add column if not exists deel_geom_3857 jsonb;

alter table beheerperceel_kadastraal
  add column if not exists deel_oppervlakte_m2 numeric;
