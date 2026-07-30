-- ============================================================
-- Subsidieradar — nevenredenen: secundaire kansen apart houden, niet weggooien
--
-- PROBLEEM. Ter Hooge kreeg 46 kansen, waarvan 42 op exact de basisscore 50. Bij
-- doorlezen valt een groot deel in vier groepen die inhoudelijk niet dood zijn, maar
-- wél secundair: (a) regelingen voor een landbouwbedrijf, waar de PACHTER de
-- aanvrager is en niet het landgoed; (b) regelingen die dubbelen met een subsidie die
-- al loopt; (c) regelingen die een consortium of miljoenenproject vragen; (d) ANLb en
-- verwanten, die lidmaatschap van een agrarisch collectief eisen.
--
-- Ze verwijderen zou kennis weggooien (een pachter kan er morgen wél iets mee, en een
-- collectief kan je oprichten). Ze tussen de echte kansen laten staan maakt de lijst
-- onleesbaar. Daarom: een reden voor degradatie, plus de mogelijkheid om een rij
-- weg te klikken zonder hem te verliezen.
--
-- ONTWERP. `subsidie.nevenreden` is null voor een primaire kans en anders de reden
-- waarom hij secundair is; de matchmotor berekent hem. `verborgen_op` is de
-- handmatige "weg ermee" van de gebruiker -- omkeerbaar, want de rij blijft staan.
-- De twee nieuwe kolommen op `regeling` zijn de bron voor twee van de vier redenen;
-- de andere twee komen uit `doelgroep_type` (bestond al) en uit naamvergelijking.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema
-- ------------------------------------------------------------

-- Uit de radar-weergavespec §3. 'laag' is tevens de kandidaat-vlag voor de strook
-- "laaghangend fruit" (weinig moeite, geen noemenswaardige eigen investering);
-- 'hoog' is wat hieronder de reden 'te_groot' oplevert.
alter table regeling
  add column if not exists instap_drempel text
    check (instap_drempel in ('laag', 'middel', 'hoog'));

comment on column regeling.instap_drempel is
  'laag = geen plan van betekenis en geen/kleine eigen bijdrage (kandidaat laaghangend '
  'fruit). hoog = vraagt een consortium, een groot project of een minimale omvang die '
  'een individueel landgoed niet haalt; levert nevenreden=''te_groot''.';

-- Aparte vlag en geen criterium, juist omdat we deze regelingen ZICHTBAAR willen
-- houden. Als harde eis zouden ze volledig afvallen; nu worden ze gedegradeerd met
-- reden, en blijven ze vindbaar voor wie alsnog toetreedt tot een collectief.
alter table regeling
  add column if not exists vereist_collectief boolean not null default false;

comment on column regeling.vereist_collectief is
  'Aanvraag loopt verplicht via een erkend agrarisch collectief (ANLb en verwanten). '
  'Levert nevenreden=''collectief'' zolang het landgoed zelf geen collectief is.';

-- Null = primaire kans. Gevuld = zichtbaar maar secundair, met deze reden.
alter table subsidie
  add column if not exists nevenreden text
    check (nevenreden in ('pachter', 'dubbel', 'te_groot', 'collectief'));

comment on column subsidie.nevenreden is
  'Waarom deze kans secundair is. null = primair. pachter = de pachter is de aanvrager, '
  'niet het landgoed. dubbel = lijkt op een subsidie die al loopt. te_groot = vraagt een '
  'consortium of een omvang buiten bereik. collectief = vereist lidmaatschap van een '
  'agrarisch collectief. Berekend door zoekKansen; ''dubbel'' kan de gebruiker ook zelf zetten.';

-- Handmatig weggeklikt. De rij blijft bestaan (omkeerbaar); de pagina filtert erop.
alter table subsidie
  add column if not exists verborgen_op timestamptz;
alter table subsidie
  add column if not exists verborgen_door uuid references profiel(id) on delete set null;

comment on column subsidie.verborgen_op is
  'Door de gebruiker weggeklikt. Niet verwijderd: terugzetten moet kunnen, en de '
  'matchmotor mag een weggeklikte kans niet ongevraagd weer opvoeren.';

-- Snel de zichtbare kansen ophalen zonder de verborgen rijen aan te raken.
create index if not exists subsidie_zichtbare_kansen_idx
  on subsidie (landgoed_id, soort, nevenreden)
  where verborgen_op is null;

-- ------------------------------------------------------------
-- 2. vereist_collectief — ANLb en verwanten
--    Deze regelingen lopen verplicht via een erkend agrarisch collectief. De
--    bijbehorende criteria ("Lid van ANLb-collectief", "Aanvraag via erkend
--    ANLb-collectief") zijn veld-loos en horen bij groep A uit migratie 0030; als
--    harde eis zouden ze deze regelingen onzichtbaar maken, en dat is niet wat we
--    willen -- een landgoed kan alsnog toetreden tot een collectief.
-- ------------------------------------------------------------

update regeling set vereist_collectief = true where id in (
  'fd5a4cfe-aaaf-4dd3-8df1-fd2a698a900a', -- ANLb — Agrarisch natuur- en landschapsbeheer
  '1e8358fd-2025-4b14-81e4-c2d6249c53c9', -- ANLb — Water en Klimaat pakket
  'cbdf2cea-fae5-488f-99a7-4d909542ebc3', -- ANLb Agrarisch Natuur- en Landschapsbeheer
  '161b754f-bf25-4904-a858-35b956a6ae3d', -- ANLb Akkervogels — Akkerranden, Onkruidrijke Akkers en Voedselvelden
  '073d1786-819d-4121-9684-ac9f5be420e0', -- ANLb Droge Dooradering — Houtwallen, Heggen en Bomenrijen
  '7e88d780-b4cc-4084-93e1-910eb1fb1977', -- ANLb Kerngebied Open Grasland — Weidevogelbeheer
  'b2b7b8a5-d1d5-4ba2-8408-d2e7bdca69fd', -- ANLb Natte Dooradering — Slootkanten, Oevers en Waterplanten
  'd23b4443-236a-4c8b-b5af-ddf43032cc3f'  -- Boerenlandvogels Noord-Holland (ANLb-variant)
);

-- ------------------------------------------------------------
-- 3. instap_drempel = 'hoog' — consortium of grote projectomvang
--    Grond: de criteria die in 0030 naar plan_triggers verhuisden ("groot
--    samenwerkingsverband (waterschap + provincie + terreinbeheerder)", "minimale
--    projectomvang EUR 1 miljoen", "minimaal 2 partijen betrokken"), plus regelingen
--    die alleen voor terreinbeherende organisaties of een provinciaal gebiedsproces
--    open staan. Een individueel landgoed komt hier niet zelfstandig binnen.
-- ------------------------------------------------------------

update regeling set instap_drempel = 'hoog' where id in (
  '7a074d13-c307-406a-8a97-e69da26e1b03', -- Deltaplan Biodiversiteitsherstel (coalitie + private cofinanciering)
  '8979b7e2-4682-40f5-b82d-211047456c9b', -- Klimaatbufferprogramma (waterschap + provincie + terreinbeheerder)
  'f6c53a22-b1c9-4d50-a05d-36f8adbc4e03', -- KRW-maatregelen via waterbeheerplannen
  '26c2b6b0-22a4-4f10-b57d-a830e6498112', -- LEADER / CLLD — Plattelandsontwikkeling (min. 2 partijen)
  '6ff11438-f216-4844-bfbd-ac40679d059b', -- Nationaal Groenfonds (min. projectomvang EUR 1 mln)
  '42d07611-65a9-4ee8-b8a0-dfd0ef5cd568', -- NPLG — Gebiedsplan Ondersteuning
  'bb27a598-5f1f-4395-bc67-bd6fb5d24a47', -- NPLG — Gebiedstransitie Landbouw
  'b8d5c289-bdb0-48dd-b4a6-bee025ec2197', -- NPLG — Transitiefonds Landelijk Gebied
  'e03c3079-0f5e-4d83-a5a8-00ea31a45b8f', -- POP3 — Plattelandsontwikkeling (LEADER)
  'cd592a59-8dee-41b8-9fa4-12103004d6c4', -- Subsidie Programma Natuur Fase 2 Zeeland (alleen TBO's e.d.)
  -- De LEADER-openstellingsbesluiten uit de CVDR-import: alle vijf consortium-gebonden.
  'fc7ad7b1-04cb-4936-801f-a6d208f4b197', -- GLB/NSP Samenwerking plattelandsontwikkeling LEADER Zeeland 2023-2027
  'dcbb46c7-1984-4657-9caa-d7a8a3ced8fd', -- Openstelling Uitvoering LEADER-projecten Midden/Noord-Zeeland en Zeeuws-Vlaanderen
  '9bebce95-14d3-439c-862f-038745c8602a', -- Openstellingsbesluit Uitvoering LEADER-projecten (idem, ander besluit)
  'd8fd2050-051f-4e50-8083-4853e61c2652', -- Openstellingsbesluit Regeling uitvoering van LEADER projecten
  '89c284b4-870a-4a44-84af-40ecff9c64fa'  -- Openstelling Uitvoering LEADER-projecten lokale groepen
);

-- ------------------------------------------------------------
-- 4. Niet in deze migratie
--    'laag' (laaghangend fruit) is bewust nog niet gevuld: dat vraagt per regeling
--    een inhoudelijk oordeel over moeite en eigen bijdrage, en die strook komt pas
--    met de Verkennen-pagina. Zolang de kolom leeg is gedraagt de radar zich exact
--    als nu, en gaat er niets stuk.
-- ------------------------------------------------------------
