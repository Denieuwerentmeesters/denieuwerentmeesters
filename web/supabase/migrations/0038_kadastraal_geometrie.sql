-- ============================================================
-- Kadastrale weergave: geometrie in de registratie zelf
--
-- De vorm van een kadastraal perceel zat alleen in de kenmerken-json van het
-- beheerperceel — en die kan maar één vorm dragen, dus bij een tweede
-- gekoppeld perceel ging de eerste vorm verloren. Voortaan bewaart de
-- registratie zelf de vorm (GeoJSON in EPSG:3857, zelfde conventie als
-- kenmerken.geom_3857), zodat de kaart álle vormen van een beheerperceel
-- kan tekenen.
--
-- Idempotent en additief.
-- ============================================================

alter table kadastraal_perceel add column if not exists geom_3857 jsonb;

-- Backfill uit de bestaande json-aantekeningen — alleen waar de aantekening
-- ondubbelzinnig bij dít perceel hoort (de identiteitssleutels komen overeen;
-- bij meerdere gekoppelde percelen droeg de json alleen het laatst gekoppelde).
update kadastraal_perceel k
set geom_3857 = s.kenmerken->'geom_3857'
from beheerperceel_kadastraal bk
join stamobject s on s.id = bk.stamobject_id
where bk.kadastraal_perceel_id = k.id
  and k.geom_3857 is null
  and s.kenmerken ? 'geom_3857'
  and s.kenmerken->>'kadastrale_gemeente' = k.kadastrale_gemeente
  and s.kenmerken->>'sectie' = k.sectie
  and s.kenmerken->>'perceelnummer' = k.perceelnummer;
