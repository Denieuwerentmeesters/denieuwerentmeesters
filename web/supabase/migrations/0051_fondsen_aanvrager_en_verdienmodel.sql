-- ============================================================
-- Fondsenradar — wie kan aanvragen, en wat levert het het landgoed op?
-- Bron: tabblad `Sheet1` van Fondsenoverzicht_Landgoederen.xlsx (37 fondsen,
-- kolommen "Type aanvrager" en "Verdienmodel voor landgoed").
--
-- WAAROM DIT EEN APART VELD IS EN GEEN CRITERIUM.
-- Fondsen als RCOAK, Kansfonds, FNO en Jeugdfonds Sport & Cultuur geven nooit
-- aan een landgoed. Ze geven aan een zorg- of jeugdorganisatie, die vervolgens
-- iets op het landgoed doet en de eigenaar uit háár begroting een
-- locatievergoeding betaalt. Zo'n bron is dus niet "geen match" — er valt wel
-- degelijk geld te verdienen — maar het HANDELINGSPERSPECTIEF is een ander:
-- niet "schrijf een aanvraag", maar "zoek een partner die dit kan aanvragen".
-- Toont de poort (fase 2) dat verschil niet, dan stuurt de radar de gebruiker
-- op een aanvraag af die het fonds nooit in behandeling neemt.
--
-- Idempotent conform CLAUDE.md. Niet op live toegepast bij het schrijven.
-- ============================================================

alter table regeling
  add column if not exists aanvrager_type text not null default 'onbekend'
    check (aanvrager_type in (
      'landgoedeigenaar','derde_partij','beide','nvt','onbekend'
    ));

comment on column regeling.aanvrager_type is
  'Wie bij deze bron de aanvrager kan zijn. landgoedeigenaar = het landgoed '
  'zelf. derde_partij = alleen een derde (zorg-, jeugd- of welzijnsorganisatie) '
  'die op het landgoed actief wordt; de actie is dan "zoek een partner", niet '
  '"vraag aan". beide = allebei mogelijk. nvt = donatie-instrument of anderszins '
  'niet aanvraagbaar. onbekend = de bron zegt er niets over — de 205 fondsen van '
  'tabblad Fondsenoverzicht staan hier bewust op ''onbekend'' in plaats van op '
  'een gok.';

alter table regeling
  add column if not exists verdienmodel text not null default 'onbekend'
    check (verdienmodel in (
      'directe_subsidie','locatievergoeding','indirecte_bezoekersinkomsten',
      'pacht_huur','geen','nvt','onbekend'
    ));

comment on column regeling.verdienmodel is
  'Hoe het geld bij het landgoed terechtkomt. directe_subsidie = rechtstreeks '
  'aan het landgoed. locatievergoeding = via de projectbegroting van een derde '
  'die het fonds aanschrijft. indirecte_bezoekersinkomsten = geen geldstroom uit '
  'het fonds, wel meer bezoek. pacht_huur = structurele huurrelatie (bronwaarde '
  '"Pacht/huur"; bewust niet onder locatievergoeding geschoven, dat is een post '
  'op andermans projectbegroting en iets anders). geen = alleen maatschappelijke '
  'waarde. nvt = donatie-instrument. onbekend = niet vastgesteld.';

create index if not exists regeling_aanvrager_type_idx
  on regeling (soort_bron, aanvrager_type);

-- Herkomst-administratie: uit welke onderzoeksronde (tabblad) een fonds komt.
-- De twee tabbladen hebben nul overlap en een verschillende verificatiegraad;
-- dat mag niet wegvallen zodra ze in één tabel staan.
alter table regeling add column if not exists bron_tabblad text;

comment on column regeling.bron_tabblad is
  'Het tabblad van Fondsenoverzicht_Landgoederen.xlsx waar deze rij vandaan '
  'komt (Fondsenoverzicht = 205 fondsen, 12 kolommen; Sheet1 = 37 fondsen, '
  '14 kolommen, inclusief aanvrager_type en verdienmodel). Leeg voor bronnen '
  'die niet uit dat bestand komen.';
