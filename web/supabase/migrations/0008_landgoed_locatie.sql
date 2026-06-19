-- Basislocatie van het landgoed (uit de kaart, PDOK reverse).
-- gemeente/provincie bestonden al; adres/postcode/plaats/lat/lon erbij.
alter table landgoed add column if not exists adres text;
alter table landgoed add column if not exists postcode text;
alter table landgoed add column if not exists plaats text;
alter table landgoed add column if not exists lat double precision;
alter table landgoed add column if not exists lon double precision;
