-- ============================================================
-- Landgoed-profiel ("identiteitsoverzicht") — extra velden
--
-- De profielpagina (/landgoed/[id]/profiel) toont een snel overzicht van het
-- landgoed met PER BLOK een eerlijke herkomst. De meeste tegels lezen bestaande
-- data (percelen/gebouwen uit stamobject, gemeente/provincie/nsw_status/
-- eigendomsvorm/rechtsvorm op landgoed). Deze migratie voegt alleen de velden
-- toe die nog ontbreken:
--
--  * NSW-detail: de Natuurschoonwet-rangschikking is NIET openbaar (RVO/
--    Belastingdienst-beschikking). Daarom handmatige eigenaar-invoer i.p.v. een
--    automatische bron. nsw_status bestond al (tekst); hier de details erbij.
--  * monumenten_gecontroleerd_op: herkomst-/verstamp voor de rijksmonumenten-
--    tegel. De monumenten zelf worden als stamobject (categorie='rijksmonument')
--    opgeslagen — opgehaald uit het RCE Rijksmonumentenregister (WMS).
--
-- Alles additief en nullable (add column if not exists), in de stijl van 0015–0017.
-- ============================================================

alter table landgoed add column if not exists nsw_sinds int;
comment on column landgoed.nsw_sinds is
  'Jaartal waarin het landgoed onder de Natuurschoonwet 1928 is gerangschikt. Niet-openbaar; handmatige eigenaar-invoer (RVO/Belastingdienst-beschikking).';

alter table landgoed add column if not exists nsw_openstelling_dagen int;
comment on column landgoed.nsw_openstelling_dagen is
  'Aantal dagen/jaar openstelling onder de NSW-rangschikking. Handmatige eigenaar-invoer.';

alter table landgoed add column if not exists nsw_nummer text;
comment on column landgoed.nsw_nummer is
  'NSW-rangschikkingsnummer/beschikkingskenmerk. Handmatige eigenaar-invoer.';

alter table landgoed add column if not exists monumenten_gecontroleerd_op timestamptz;
comment on column landgoed.monumenten_gecontroleerd_op is
  'Tijdstip waarop rijksmonumenten voor dit landgoed voor het laatst zijn opgehaald uit het RCE Rijksmonumentenregister (WMS). Bron-/herkomstdatum voor de monumenten-tegel.';

-- Rijksmonumenten worden als stamobject opgeslagen (past in het bestaande
-- object-/accordeer-model). Categorie 'rijksmonument' toevoegen aan de check.
-- Lijst gelijk aan 0010 + 'rijksmonument'.
alter table stamobject drop constraint if exists stamobject_categorie_check;
alter table stamobject add constraint stamobject_categorie_check check (categorie in (
  'gebouw','woning','opstal',
  'pachtperceel','natuurbeheertype','onderhoudszone','risicoplek',
  'wandelroute','weg_pad','bomenlaan','kabel_leiding','waterloop',
  'brug','hek','vijver_sloot',
  'tuin','natuur','infrastructuur','water',
  'rijksmonument',
  'overig'
));
