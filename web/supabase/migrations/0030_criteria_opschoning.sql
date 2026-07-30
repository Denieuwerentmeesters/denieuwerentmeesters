-- ============================================================
-- Subsidiemodule — criteria-opschoning
-- Bron: "Nieuwe modules/Voorstel_Criteria_Opschoning.md"
--
-- PROBLEEM. Van de 179 rijen in regeling_criterium hebben 105 geen `veld`/`operator`.
-- toetsCriterium() geeft daarop "onzeker"; een onzekere EIS laat een regeling niet
-- afvallen maar verdwijnt in de "controleer handmatig"-zin. Gevolg: 103 harde eisen
-- worden stil genegeerd. Tegelijk zijn er maar 12 `pre`-criteria (alleen ligt_in_nnn
-- en ligt_in_natura2000), dus vrijwel elke regeling scoort exact de basis 50 en krijgt
-- het label "Mogelijk".
--
-- DIAGNOSE. Die 105 zijn vier verschillende dingen. Alleen groep A hoort in
-- regeling_criterium thuis:
--   A. toetsbaar landgoedkenmerk       -> wordt een echt `veld` (VOLGENDE migratie)
--   B. procedurestap / plicht ná toekenning -> blijft staan, maar met `fase`
--   C. eigenschap van het PLAN, niet van het landgoed -> regeling.plan_triggers
--   D. tautologie of verwijzing naar een lijst die wij niet hebben -> verwijderen
--
-- DEZE MIGRATIE doet B, C en D plus het benodigde schema. Groep A (circa 40 rijen,
-- waarvan 14 op één nieuw veld `perceel_in_natuurbeheerplan`) volgt apart, omdat
-- daar nieuwe landgoedkolommen en invoer-UI bij horen.
--
-- Elke data-regel hieronder noemt de omschrijving als commentaar, zodat de
-- classificatie per rij te controleren is bij de review.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema
-- ------------------------------------------------------------

-- `fase` bepaalt of een criterium meetelt in de match. Alleen 'vooraf' is een
-- toelatingsvraag; de rest is procedure en zegt niets over of je in aanmerking komt.
alter table regeling_criterium
  add column if not exists fase text not null default 'vooraf'
    check (fase in ('vooraf', 'bij_aanvraag', 'na_toekenning'));

comment on column regeling_criterium.fase is
  'vooraf = toelatingsvraag, telt mee in de matchscore. bij_aanvraag = moet je regelen '
  'tijdens de aanvraag. na_toekenning = verplichting na toekenning (kandidaat voor de '
  'verplichtingen-engine). Alleen ''vooraf'' wordt door matching.ts gelezen.';

-- Leesbare reden voor de "Voldoet niet: [reden]"-chip uit de radar-weergavespec (§2.3).
-- Op het criterium en niet op de regeling: de gebruiker wil weten WELKE eis hem
-- uitsluit, niet dat er iets is.
alter table regeling_criterium
  add column if not exists uitsluiting_reden text;

-- Bestemming voor groep C: welke voornemens deze regeling activeren. Vrije tekst,
-- geen enum -- de match op voornemens wordt semantisch, niet op exacte string.
alter table regeling
  add column if not exists plan_triggers text[] not null default '{}';

comment on column regeling.plan_triggers is
  'Beschrijvingen van voornemens die deze regeling activeren ("aanleg nieuw bos op '
  'voormalige landbouwgrond"). Voer voor "Bij uw plannen"; bedoeld voor semantische '
  'match tegen een vastgelegd voornemen, niet voor exacte vergelijking.';

-- ------------------------------------------------------------
-- 2. Groep C -> regeling.plan_triggers
--    Eerst kopiëren, dan het criterium verwijderen. Dit zijn eigenschappen van het
--    voornemen ("streekeigen soorten", "minimaal 25 meter"), geen eigenschappen van
--    het landgoed -- als eis maken ze de regeling onterecht kansloos of onzeker.
-- ------------------------------------------------------------

update regeling r
set plan_triggers = (
  select array_agg(distinct c.omschrijving)
  from regeling_criterium c
  where c.regeling_id = r.id
    and c.id in (
      'fdf9ef20-1dde-460a-a0e8-8d628d6b07ee', -- Cofinanciering van private partijen aanwezig
      '6385304f-b8a3-425d-83a8-bbf3ad2068b0', -- Samenwerking van meerdere partijen (boer + natuur + bedrijfsleven)
      '04801133-0774-4994-bcdf-78dbc3d0cfc0', -- Beplanting met streekeigen soorten (erfbeplanting gemeente/waterschap)
      '02435dfb-ab70-4910-9568-b5d4d9cce901', -- Project leidt tot vergroting waterbergingscapaciteit
      'bbefa5b1-213b-47e4-bb06-78b0c9f8574b', -- Groot samenwerkingsverband (waterschap + provincie + terreinbeheerder)
      'b18f60b2-46fe-4a73-a4cb-2d94ed4d2038', -- Minimaal 2 partijen betrokken (LEADER)
      'b23b61ba-c86b-44e3-9994-c1c282aede62', -- Investering staat op de Milieulijst (MIA/VAMIL agrarisch)
      '17d0b81d-30da-4217-b65a-3b87aab04eaf', -- Investering staat op de Milieulijst (MIA/VAMIL natuur en landschap)
      'b1052c81-9d19-4c8a-a8b2-97708baf9e89', -- Minimale projectomvang EUR 1 miljoen (Groenfonds)
      'c1d92ea0-2981-40b9-8288-2a2a9c812425', -- Cofinanciering van minimaal 50% vereist (Cultuurfonds)
      '9a071a36-17d4-485f-9bd8-4882b7195c7a', -- Aanleg nieuw bos op voormalige landbouwgrond
      'ea875ede-1205-4116-8d5b-14c06882637b', -- Gebruik van inheemse boomsoorten (minimaal 80%)
      'a0c0fe12-038e-4746-8ba2-f12ffcbc0279', -- Aansluiting op het elektriciteitsnet of levering als warmte/gas
      '97b1656a-3e93-4953-83f8-6911f1ff8e05', -- Aanleg met streekeigen soorten (houtwallen en heggen)
      '524c2f31-70e7-43e3-8a5f-a99e8eb7ffde', -- Minimale lengte: doorgaans 25 meter
      '2864ba4c-4d0d-41e4-afd3-d9201765b50f', -- Project versterkt of herstelt habitat voor kwetsbare Zeeuwse doelsoorten
      '8516d8f0-2897-4530-9442-e3480b576241', -- Investering leidt tot aantoonbare emissiereductie
      '040a35c0-40d7-40cb-bd6e-bf6ad1514ff2', -- Techniek staat op de Maatlat Duurzame Veehouderij
      '87ca35d6-28a3-481a-a975-27ed7bf2b112', -- Beplanting met streekeigen soorten (erfbeplanting landelijk gebied)
      '10617910-b793-46be-8280-2450373fd4d6', -- Agrarische grond wordt omgezet naar natuur (functieverandering)
      '97607046-4591-42bb-b623-65c5bfdf35a1', -- Minimale aanvraag EUR 10.000 (bos en houtige landschapselementen buiten NNN)
      'bb91da8d-6202-4f01-80b5-3fea4f9aadc7'  -- Vrijwillig werk in natuur of landschap (SVNL Fryslan)
    )
)
where exists (
  select 1 from regeling_criterium c
  where c.regeling_id = r.id
    and c.id in (
      'fdf9ef20-1dde-460a-a0e8-8d628d6b07ee','6385304f-b8a3-425d-83a8-bbf3ad2068b0',
      '04801133-0774-4994-bcdf-78dbc3d0cfc0','02435dfb-ab70-4910-9568-b5d4d9cce901',
      'bbefa5b1-213b-47e4-bb06-78b0c9f8574b','b18f60b2-46fe-4a73-a4cb-2d94ed4d2038',
      'b23b61ba-c86b-44e3-9994-c1c282aede62','17d0b81d-30da-4217-b65a-3b87aab04eaf',
      'b1052c81-9d19-4c8a-a8b2-97708baf9e89','c1d92ea0-2981-40b9-8288-2a2a9c812425',
      '9a071a36-17d4-485f-9bd8-4882b7195c7a','ea875ede-1205-4116-8d5b-14c06882637b',
      'a0c0fe12-038e-4746-8ba2-f12ffcbc0279','97b1656a-3e93-4953-83f8-6911f1ff8e05',
      '524c2f31-70e7-43e3-8a5f-a99e8eb7ffde','2864ba4c-4d0d-41e4-afd3-d9201765b50f',
      '8516d8f0-2897-4530-9442-e3480b576241','040a35c0-40d7-40cb-bd6e-bf6ad1514ff2',
      '87ca35d6-28a3-481a-a975-27ed7bf2b112','10617910-b793-46be-8280-2450373fd4d6',
      '97607046-4591-42bb-b623-65c5bfdf35a1','bb91da8d-6202-4f01-80b5-3fea4f9aadc7'
    )
);

delete from regeling_criterium where id in (
  'fdf9ef20-1dde-460a-a0e8-8d628d6b07ee','6385304f-b8a3-425d-83a8-bbf3ad2068b0',
  '04801133-0774-4994-bcdf-78dbc3d0cfc0','02435dfb-ab70-4910-9568-b5d4d9cce901',
  'bbefa5b1-213b-47e4-bb06-78b0c9f8574b','b18f60b2-46fe-4a73-a4cb-2d94ed4d2038',
  'b23b61ba-c86b-44e3-9994-c1c282aede62','17d0b81d-30da-4217-b65a-3b87aab04eaf',
  'b1052c81-9d19-4c8a-a8b2-97708baf9e89','c1d92ea0-2981-40b9-8288-2a2a9c812425',
  '9a071a36-17d4-485f-9bd8-4882b7195c7a','ea875ede-1205-4116-8d5b-14c06882637b',
  'a0c0fe12-038e-4746-8ba2-f12ffcbc0279','97b1656a-3e93-4953-83f8-6911f1ff8e05',
  '524c2f31-70e7-43e3-8a5f-a99e8eb7ffde','2864ba4c-4d0d-41e4-afd3-d9201765b50f',
  '8516d8f0-2897-4530-9442-e3480b576241','040a35c0-40d7-40cb-bd6e-bf6ad1514ff2',
  '87ca35d6-28a3-481a-a975-27ed7bf2b112','10617910-b793-46be-8280-2450373fd4d6',
  '97607046-4591-42bb-b623-65c5bfdf35a1','bb91da8d-6202-4f01-80b5-3fea4f9aadc7'
);

-- ------------------------------------------------------------
-- 3. Groep B -> fase, blijft als kennis bewaard maar telt niet mee in de match
-- ------------------------------------------------------------

-- 3a. Regelen tijdens de aanvraag.
update regeling_criterium set fase = 'bij_aanvraag' where id in (
  '5e9d9971-4c83-4e29-b35d-337fcdf2f380', -- Eco-activiteiten kiezen uit de officiele catalogus (RVO)
  '3c84b2da-1161-4bf0-8fe3-5cc0c84a55da', -- Project heeft Groenverklaring van RVO
  'a9ae838c-4992-40e0-9347-0e018a7cdc7a', -- Deelname aan provinciaal gebiedsproces (NPLG gebiedstransitie)
  '5630f92c-3de4-4197-9d5a-5991b3ca89b2', -- Deelname aan provinciaal gebiedsproces (NPLG transitiefonds)
  '00c66603-211b-4881-9ebd-40ca4d483acc', -- Deelname aan openstellingsronde van het programma (POP3)
  'c233d7cb-8c29-489b-85d8-079907f26916', -- Aanvraag via RVO tijdens openstellingsronde (SDE++)
  '737ea599-c7e3-4c25-b58d-b32b970eb2d3', -- Positieve aanbeveling van de werkgroep soortbeleid Zeeland
  '993473e4-1a0b-4805-966e-6d9e7af71fb6', -- Beheerplan of projectplan indienen
  '3b590fae-0064-4246-86e0-3b45292aa589', -- Faunabeheerplan goedgekeurd door provincie
  'e6f0f6fb-9ff7-4cca-87cf-f0e9f37d7ef7', -- Bestemmingsplanwijziging of omgevingsvergunning vereist (VAB)
  'd2c75b84-f8a4-4c29-ab6a-f9bf9dee3582', -- Deelname aan provinciaal veenweidenprogramma
  '9a1f3cfb-04ac-4db0-b311-53d259e0f5eb'  -- Aanvraag bij het lokaal bevoegd waterschap
);

-- 3b. Verplichting ná toekenning. Kandidaten voor de verplichtingen-engine:
--     'Onderhoudsverplichting 10 jaar' is letterlijk een verplichting met
--     kleeft_aan='perceel', geen toelatingsvraag.
update regeling_criterium set fase = 'na_toekenning' where id in (
  'c6845150-d1af-4f74-b314-2d952dd7c9c8', -- Lening afsluiten bij erkende groenbank
  '501c7100-170d-4076-bfaf-b7ea8b9f333a', -- Aanmelding bij RVO binnen 3 maanden na investering (MIA agrarisch)
  'd4158075-2ecc-4136-9607-d5aae6d39bfb', -- Aanmelding bij RVO binnen 3 maanden na investering (MIA natuur)
  'dc0d816e-a611-4fee-bc19-564c3b9a50b3', -- Beheerovereenkomst met Rabo Carbon Bank voor minimale periode
  '0f3eed95-565c-402c-9e18-2de0932e26d6'  -- Onderhoudsverplichting 10 jaar (erfbeplanting landelijk gebied)
);

-- ------------------------------------------------------------
-- 4. Groep D -> verwijderen
--    Tautologieën (herhalen de naam van de regeling) en verwijzingen naar externe
--    lijsten die wij niet hebben. Nooit toetsbaar, en als "controleer handmatig"
--    kosten ze de gebruiker aandacht zonder iets te zeggen.
-- ------------------------------------------------------------

delete from regeling_criterium where id in (
  'b62e6e42-a9d2-4c36-9f76-56ba1bd4ad5b', -- Project draagt aantoonbaar bij aan biodiversiteitsherstel
  '425c07a7-f796-4038-85e6-6155be96417d', -- Bijdrage aan verbetering ecologische of chemische waterkwaliteit
  'c7ee064a-ba0b-4017-bdb2-58961849a004', -- Maatregel staat in het KRW-maatregelenprogramma van het waterlichaam
  '40b52b1a-f995-45e1-a3bc-bc14d1737bd4', -- Investeringen gericht op duurzame landbouw (LVF)
  '41fb6ad3-e71c-427f-8130-9278cfb55f1b', -- Project draagt bij aan lokale ontwikkelstrategie van de LAG
  'de077d99-3060-4f25-9d71-4d1c36910786', -- Project heeft aantoonbare groene impact (Groenfonds)
  'ece12a54-63a8-4026-bc4d-a00b545fabe1', -- Project heeft aantoonbare bijdrage aan natuur of biodiversiteitsherstel
  'f484f09b-7e3b-4f22-aaef-f167225a127c', -- Organisatie actief in natuur, milieu of dierenwelzijn
  '0528321a-fa17-49c8-8317-7af046d2eafa', -- Investering gericht op agrarische structuurverbetering
  'fb2ebb77-b50e-44f1-aad6-a37ef551ad27', -- Project draagt bij aan plattelandsontwikkeling in het aangewezen gebied
  'f6524624-67c3-4e6e-a887-b7d844765565', -- Aantoonbare koolstofvastlegging in bodem, bos of natuur
  'e81ed4a9-73e1-41ca-8821-e1e71f1e55e9', -- Duurzame energieopwekking op Nederlandse bodem
  'b3fd8083-218c-4341-b24b-4621263e0599', -- Maatregel staat vermeld in Programma natuur fase 2 (bijlage G)
  'd9979d1b-61bc-4800-a278-9381a9970329', -- Investering draagt bij aan groen-blauwe dooradering
  'ee9aacc6-a0ce-4c12-8547-fdfe544fd1bd', -- Maatregel draagt bij aan waterberging of waterkwaliteit
  -- En de buiten-NNN-dubbeling: bij "Bos en Houtige Landschapselementen buiten NNN
  -- Zeeland" staat het pre-criterium `ligt_in_nnn is nee` al correct. Deze rij is
  -- dezelfde regel nog eens, als veld-loze UITSLUITING die beschrijft wat juist
  -- vereist is -- verkeerde soort, doet niets, vervuilt de handmatig-lijst.
  '25673f92-5c40-4a83-8fd2-aaca006ac250'  -- Locatie BUITEN het Natuurnetwerk Zeeland (NNN)
);

-- ------------------------------------------------------------
-- 5. Wat er ná deze migratie nog staat (groep A) is bewust nog niet aangeraakt:
--    circa 40 veld-loze eisen die een echt landgoedkenmerk toetsen. Die worden
--    pas eerlijk zodra de kolommen bestaan waar ze op kunnen toetsen -- met als
--    grootste hefboom `perceel_in_natuurbeheerplan` (12x SNL + 2x SKNL = 14
--    regelingen op één veld). Tot die tijd blijven ze 'vooraf' + veld-loos, en
--    matching.ts meldt ze expliciet als niet-getoetst in plaats van ze te laten
--    doorglippen.
-- ------------------------------------------------------------
