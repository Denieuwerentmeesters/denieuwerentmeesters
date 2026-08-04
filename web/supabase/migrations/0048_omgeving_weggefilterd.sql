-- ============================================================
-- Weggefilterde berichten bewaren, zodat het filter te ijken is
--
-- Tot nu gooide de ingest alles weg wat de poort niet haalde. Dat houdt het
-- scherm schoon maar maakt de module blind voor zijn eigen grootste risico:
-- een filter dat te streng staat, waarbij niemand merkt wát er gemist wordt.
-- Vandaag bleek twee keer hoe stil zo'n fout is.
--
-- Voortaan wordt alles bewaard wat door het documenttype-filter komt, met de
-- reden waarom het niet is doorgelaten. Zichtbaar achter "toon wat is
-- weggefilterd", niet in de gewone lijst.
--
-- Puur additief en idempotent.
-- ============================================================

set local search_path = public, extensions;

-- 'weggefilterd' als extra status naast nieuw/gezien/gearchiveerd/omgezet.
alter table omgevingsbericht drop constraint if exists omgevingsbericht_status_check;
alter table omgevingsbericht add constraint omgevingsbericht_status_check
  check (status in ('nieuw', 'gezien', 'gearchiveerd', 'omgezet', 'weggefilterd'));

alter table omgevingsbericht add column if not exists weggefilterd_reden text;

comment on column omgevingsbericht.weggefilterd_reden is
  'Waarom dit bericht niet is doorgelaten: te_ver, niet_te_plaatsen of '
  'geen_locatie. Alleen gevuld bij status = weggefilterd. Bestaat zodat een '
  'te streng filter opvalt voordat er iets belangrijks gemist wordt.';

alter table omgevingsbericht drop constraint if exists omgevingsbericht_weggefilterd_reden_check;
alter table omgevingsbericht add constraint omgevingsbericht_weggefilterd_reden_check
  check (weggefilterd_reden is null
         or weggefilterd_reden in ('te_ver', 'niet_te_plaatsen', 'geen_locatie'));

-- De gewone lijst vraagt altijd om status <> 'weggefilterd'; die scheiding
-- moet snel blijven nu er per ronde honderden rijen bij komen.
create index if not exists omgevingsbericht_status_idx
  on omgevingsbericht (landgoed_id, status);

-- ------------------------------------------------------------
-- Zoekgebied per bron
--
-- Gemeenten publiceren over adressen binnen hun eigen grens, dus daar kan op
-- gemeentenaam gefilterd worden bij het geocoderen. Een provincie of
-- waterschap publiceert over een veel groter gebied; daar werkt dat filter
-- niet en moet op provincienaam gezocht worden. Zonder dit onderscheid werden
-- provincie en waterschap helemaal overgeslagen.
-- ------------------------------------------------------------
alter table omgevingsbron add column if not exists zoekveld text;
alter table omgevingsbron add column if not exists zoekgebied text;

alter table omgevingsbron drop constraint if exists omgevingsbron_zoekveld_check;
alter table omgevingsbron add constraint omgevingsbron_zoekveld_check
  check (zoekveld is null or zoekveld in ('gemeentenaam', 'provincienaam'));

comment on column omgevingsbron.zoekgebied is
  'Waarbinnen een adres uit deze bron gezocht mag worden: de gemeentenaam bij '
  'een gemeente, de provincienaam bij een provincie of waterschap. Zonder deze '
  'begrenzing plaatst de Locatieserver onzin ergens in Nederland.';

-- Bestaande afgeleide bronnen bijwerken: gemeenten zoeken op zichzelf.
update omgevingsbron
   set zoekveld = 'gemeentenaam', zoekgebied = naam
 where bestuurslaag in ('gemeente', 'buurgemeente')
   and zoekgebied is null;
