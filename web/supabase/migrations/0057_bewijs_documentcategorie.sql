-- ============================================================
-- Fondsenradar — de brug tussen "wat moet er aangeleverd worden" en
-- "wat ligt er al in het archief"
--
-- PROBLEEM. `regeling_bewijs` weet sinds 0050 wélk stuk gevraagd wordt
-- (`vereiste_type`), in welke `fase`, of het `verplicht` is en of wij het zelf
-- kunnen opstellen. Wat het níét weet is waar dat stuk in het archief van een
-- landgoed zou moeten liggen. Zonder die brug kan de detailpagina van een fonds
-- wel de vereistenlijst tonen, maar niet de enige zin die er werkelijk toe doet:
-- "6 van de 9 vereiste stukken heeft u al." Dat is precies het onderscheid
-- tussen herbruikbaar en per-aanvraag waar §4 van het plan om draait — na één
-- aanvraag ligt de halve stapel klaar voor de volgende.
--
-- ONTWERP. Eén tekstkolom met dezelfde waardenlijst als `document.categorie`
-- (0036), zodat de koppeling een simpele gelijkheid is en geen vertaaltabel die
-- stil kan verouderen. Bewust GEEN foreign key naar een categorieëntabel: die
-- bestaat niet, de lijst is een check-constraint in 0036 en de bron van waarheid
-- is app/(app)/landgoed/[id]/documenten/categorieen.ts.
--
-- NULL = niet vastgesteld, en dat is uitdrukkelijk iets anders dan
-- 'nog_in_te_delen'. Bij NULL valt de leeslaag terug op de afleiding uit
-- `vereiste_type` (lib/fondsen/dossier.ts, CATEGORIE_PER_VEREISTE). Die afleiding
-- is bewust in code en niet in data: hij is een vuistregel, en een vuistregel
-- die als vastgesteld gegeven in de database staat is niet meer van een
-- bronvaststelling te onderscheiden.
--
-- Idempotent conform CLAUDE.md. NIET op live toegepast bij het schrijven.
-- ============================================================

alter table regeling_bewijs add column if not exists document_categorie text;

alter table regeling_bewijs drop constraint if exists regeling_bewijs_document_categorie_check;
alter table regeling_bewijs add constraint regeling_bewijs_document_categorie_check
  check (document_categorie is null or document_categorie in (
    'eigendom_rechten',
    'governance',
    'contracten_verhuur',
    'leveranciers',
    'beheerplannen',
    'subsidies',
    'vergunningen',
    'keuringen',
    'onderzoeken',
    'verzekeringen',
    'personeel',
    'vergaderingen',
    'historisch',
    'nog_in_te_delen'
  ));

comment on column regeling_bewijs.document_categorie is
  'In welke categorie van de documentenmodule (0036) dit vereiste stuk thuishoort. '
  'Zelfde waardenlijst als document.categorie, zodat "heeft de gebruiker dit al?" '
  'een gelijkheid is en geen vertaling. NULL = niet vastgesteld; de leeslaag valt '
  'dan terug op de afleiding uit vereiste_type in lib/fondsen/dossier.ts. Dat is '
  'een vuistregel en hoort daarom in code te staan, niet als feit in de database.';

create index if not exists regeling_bewijs_document_categorie_idx
  on regeling_bewijs (document_categorie);
