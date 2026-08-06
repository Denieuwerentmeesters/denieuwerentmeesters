-- Beheerobjecten prikken (Hugo 2.3, issue #124): twee categorieën erbij.
--
-- 'boom' — het klassieke landgoed-puntobject (monumentale bomen); bij Hugo
-- het eerste voorbeeld van een GroenObject.
-- 'voorziening' — technische voorziening (pomp, gemaal, installatie);
-- Hugo's entiteit TechnischeVoorziening.
--
-- Zelfde patroon als 0010/0018: constraint opnieuw opbouwen met de
-- volledige lijst. Idempotent door drop-if-exists vóór de add.

alter table stamobject drop constraint if exists stamobject_categorie_check;
alter table stamobject add constraint stamobject_categorie_check check (categorie in (
  'gebouw','woning','opstal',
  'pachtperceel','natuurbeheertype','onderhoudszone','risicoplek',
  'wandelroute','weg_pad','bomenlaan','kabel_leiding','waterloop',
  'brug','hek','vijver_sloot',
  'boom','voorziening',
  'tuin','natuur','infrastructuur','water',
  'rijksmonument',
  'overig'
));
