-- Bredere, herkenbare categorieën zodat minder onder 'overig' valt:
-- tuin (alles rond tuinen), natuur (parkbos e.d.), infrastructuur (bruggen,
-- paden, parkeerplaatsen, hekken), water (vijvers/sloten/waterlopen).
alter table stamobject drop constraint if exists stamobject_categorie_check;
alter table stamobject add constraint stamobject_categorie_check check (categorie in (
  'gebouw','woning','opstal',
  'pachtperceel','natuurbeheertype','onderhoudszone','risicoplek',
  'wandelroute','weg_pad','bomenlaan','kabel_leiding','waterloop',
  'brug','hek','vijver_sloot',
  'tuin','natuur','infrastructuur','water',
  'overig'
));
