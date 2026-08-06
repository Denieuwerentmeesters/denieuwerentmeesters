-- Objecten plaatsen: wegen en paden erbij (wens Steven, 6 aug).
--
-- 'weg_pad' bestond al (weg of laan); 'voetpad' en 'fietspad' zijn nieuw —
-- op een landgoed zijn dat verschillende dingen om bij te houden (ander
-- onderhoud, andere openstelling).
--
-- Zelfde patroon als 0010/0018/0060: constraint opnieuw opbouwen met de
-- volledige lijst. Idempotent door drop-if-exists vóór de add.

alter table stamobject drop constraint if exists stamobject_categorie_check;
alter table stamobject add constraint stamobject_categorie_check check (categorie in (
  'gebouw','woning','opstal',
  'pachtperceel','natuurbeheertype','onderhoudszone','risicoplek',
  'wandelroute','weg_pad','bomenlaan','kabel_leiding','waterloop',
  'brug','hek','vijver_sloot',
  'boom','voorziening',
  'voetpad','fietspad',
  'tuin','natuur','infrastructuur','water',
  'rijksmonument',
  'overig'
));
