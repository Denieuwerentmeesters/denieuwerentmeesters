-- ============================================================
-- Kennisbank-import: ~72 handmatig-onderzochte regelingen
-- Gegenereerd op 2026-07-01 vanuit Kennisbank/Subsidies/*.json
-- Idempotent: ON CONFLICT (bron_id, extern_id) DO NOTHING
-- Criteria: machine-leesbaar waar mapping bekend is, anders alleen omschrijving.
-- ============================================================

DO $$
DECLARE
  _bron_id uuid;
  _regeling_id uuid;
BEGIN

  -- Bron aanmaken of ophalen
  INSERT INTO subsidie_bron (sleutel, naam, type, bestuurslaag, actief)
  VALUES ('kennisbank', 'Kennisbank — handmatig onderzochte regelingen', 'handmatig', 'nationaal', true)
  ON CONFLICT (sleutel) DO NOTHING;

  SELECT id INTO _bron_id FROM subsidie_bron WHERE sleutel = 'kennisbank';

  -- ANLb Kerngebied Open Grasland — Weidevogelbeheer
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'anlb-agrarisch-kerngebied', 'nationaal', 'ANLb Kerngebied Open Grasland — Weidevogelbeheer', 'RVO / provincies via ANLb-collectieven', 'Weidevogelbeheer is het grootste ANLb-pakket in Nederland. Primair in veenweide- en kleigebieden. Het collectief coördineert de aanpak en bewaakt de minimale beheerdrempel per leefgebied (ca. 50% van percelen dient beheerd te worden voor effectiviteit). Gruttogids-methode wordt steeds meer toegepast voor nidificatie-monitoring.',
    'https://www.rvo.nl/onderwerpen/agrarisch-natuur-en-landschapsbeheer', ARRAY['natuur', 'landbouw', 'water'], ARRAY['ANLb', 'weidevogels', 'grutto', 'kievit', 'tureluur', 'uitgesteld-maaien', 'collectief', 'veenweide'], ARRAY['agrariërs', 'veehouders', 'melkveehouders', 'collectieven'], ARRAY['natuur', 'landbouw', 'water'], NULL,
    'Basispakket weidevogelbeheer: ca. €300–600/ha/jaar. Intensief pakket (nestbescherming, plasdras): ca. €800–1.500/ha/jaar', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel ligt in een begrensd weidevogelleefgebied (provinciaal vastgesteld)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via erkend ANLb-collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Uitgesteld maaien (gruttopakket: niet voor 1 juni of later afhankelijk van nest-dichtheid)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Peilbeheer afgestemd op weidevogelseizoen (hoge grondwaterstand in broedseizoen)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Rustperiode op perceel tijdens broedseizoen (geen bewerkingen voor vastgestelde datum)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Jaarlijkse monitoring door collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Overeenkomst voor 6 jaar', 'handmatig', true);
  END IF;
  -- ANLb Akkervogels — Akkerranden, Onkruidrijke Akkers en Voedselvelden
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'anlb-akkervogels', 'nationaal', 'ANLb Akkervogels — Akkerranden, Onkruidrijke Akkers en Voedselvelden', 'RVO / provincies via ANLb-collectieven', 'Akkervogels (veldleeuwerik, patrijs, geelgors, kneu) zijn sterk achteruitgegaan. Aanleg van akkerranden en voedselvelden is bewezen effectief. Primaire leefgebieden zijn de akkerbouwgebieden: Flevoland, Zeeland, kleigebieden Groningen. Combinatie met eco-regeling akkerrand is mogelijk mits geen dubbele vergoeding voor hetzelfde perceel.',
    'https://www.rvo.nl/onderwerpen/agrarisch-natuur-en-landschapsbeheer', ARRAY['natuur', 'landbouw'], ARRAY['ANLb', 'akkervogels', 'akkerranden', 'veldleeuwerik', 'patrijs', 'geelgors', 'onkruidrijke-akker', 'collectief'], ARRAY['akkerbouwers', 'agrariërs', 'collectieven'], ARRAY['natuur', 'landbouw'], NULL,
    'Kruidenrijke akkerrand: ca. €900–1.200/ha/jaar. Onkruidrijke strook: ca. €600–900/ha/jaar. Voedselveld/braak: ca. €800–1.100/ha/jaar', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel ligt in een begrensd akkervogelleefgebied (provinciaal vastgesteld)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via erkend ANLb-collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Akkerrand aanleggen en in stand houden (minimale breedte 3–6m, afhankelijk van pakket)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen gebruik van pesticiden en kunstmest op de rand/strook', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Niet bewerken van de rand buiten de toegestane periode', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Zaadmengsel conform pakketvereisten (inheemse kruiden of graanstoppel)', 'handmatig', true);
  END IF;
  -- ANLb Agrarisch Natuur- en Landschapsbeheer
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'anlb-collectief', 'nationaal', 'ANLb Agrarisch Natuur- en Landschapsbeheer', 'RVO / provincies via ANLb-collectieven', 'Aanvraag loopt via het collectief, niet rechtstreeks bij RVO. Openstellingen worden per collectief bepaald — check lokaal collectief voor exacte deadline. Beheertypen zijn vastgelegd in de Index Natuur en Landschap (BIJ12). Lopende contracten worden vernieuwd of verlengd per 6-jaarsperiode.',
    'https://www.rvo.nl/onderwerpen/agrarisch-natuur-en-landschapsbeheer', ARRAY['natuur', 'landbouw', 'landschap', 'water'], ARRAY['ANLb', 'collectief', 'weidevogels', 'biodiversiteit', 'agrarisch-natuurbeheer', 'tweede-pijler', 'leefgebied'], ARRAY['agrariërs', 'rentmeesters', 'collectieven', 'akkerbouwers', 'veehouders'], ARRAY['natuur', 'landbouw', 'landschap', 'water'], NULL,
    'Vergoeding per beheertype, variërend van ca. €200/ha (droge dooradering) tot ca. €1.500/ha (weidevogelbeheer intensief); vastgelegd in beheertypen-catalogus BIJ12', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag verloopt uitsluitend via een erkend ANLb-collectief', 'rechtsvorm', 'is', 'collectief', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Percelen moeten liggen in een begrensd ANLb-leefgebied (kaart per provincie)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Overeenkomst aangaan met collectief voor minimaal 6 jaar', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheeractiviteiten aantoonbaar uitvoeren conform beheerpakket', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Jaarlijkse rapportage en controle door collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Gecombineerde Opgave indienen als basispremie ook gewenst is', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen dubbele vergoeding voor zelfde perceel via andere regelingen (o.a. eco-regeling)', 'handmatig', true);
  END IF;
  -- ANLb Droge Dooradering — Houtwallen, Heggen en Bomenrijen
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'anlb-droge-dooradering', 'nationaal', 'ANLb Droge Dooradering — Houtwallen, Heggen en Bomenrijen', 'RVO / provincies via ANLb-collectieven', 'Droge dooradering is primair in de zandgebieden (Achterhoek, Salland, Drenthe, Kempen). Houtwallen en heggen zijn karakteristiek voor het oud-cultuurlandschap. Beheervergoeding is relatief laag — aanleg wordt vaak via SKNL of provinciale fondsen gefinancierd. Combinatie met landgoedbeheer veelvoorkomend.',
    'https://www.rvo.nl/onderwerpen/agrarisch-natuur-en-landschapsbeheer', ARRAY['natuur', 'landschap', 'landbouw'], ARRAY['ANLb', 'houtwallen', 'heggen', 'bomenrijen', 'droge-dooradering', 'landschapselementen', 'collectief'], ARRAY['agrariërs', 'landgoedeigenaren', 'rentmeesters', 'collectieven'], ARRAY['natuur', 'landschap', 'landbouw'], NULL,
    'Onderhoud houtwal: ca. €0,50–1,50 per strekkende meter per jaar. Onderhoud bomenrij: ca. €5–15 per boom per jaar. Aanleg: via SKNL of investerings-subsidieregelingen', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Landschapselementen (houtwallen, heggen, bomenrijen, singels) aanwezig op of nabij het perceel', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via erkend ANLb-collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheer conform beheerpakket (snoeicyclus, geen kappen buiten aangewezen periode)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale breedte/lengte per element afhankelijk van beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Element blijft minimaal 6 jaar in beheer', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen gebruik van chemische bestrijdingsmiddelen op of direct naast het element', 'handmatig', true);
  END IF;
  -- ANLb Natte Dooradering — Slootkanten, Oevers en Waterplanten
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'anlb-natte-dooradering', 'nationaal', 'ANLb Natte Dooradering — Slootkanten, Oevers en Waterplanten', 'RVO / provincies via ANLb-collectieven', 'Natte dooradering is primair in klei- en veenweidepolder-gebieden. Draagt bij aan KRW-waterkwaliteitsdoelen. Samenwerking met waterschap is essentieel voor peilbeheer en slootonderhoud-afstemming. Combinatie met weidevogelpakket is gebruikelijk in veenweidegebieden.',
    'https://www.rvo.nl/onderwerpen/agrarisch-natuur-en-landschapsbeheer', ARRAY['natuur', 'water', 'landbouw'], ARRAY['ANLb', 'slootkanten', 'oevers', 'waterplanten', 'natte-dooradering', 'waterkwaliteit', 'KRW', 'collectief'], ARRAY['agrariërs', 'veehouders', 'collectieven', 'waterschappen (partner)'], ARRAY['natuur', 'water', 'landbouw'], NULL,
    'Kruidenrijke slootkant: ca. €200–400/ha/jaar. Oevervegeta­tie: ca. €300–500/ha/jaar. Waterplantenbeheer: ca. €150–300/ha/jaar', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Percelen grenzen aan watergangen of hebben brede (>3m) kruidenrijke slootkanten', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via erkend ANLb-collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheer: aangepast maairegime slootkant (niet voor bepaalde datum, alternerend maaien)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen meststoffen of bestrijdingsmiddelen binnen 1m van watergang', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen beschoeiing of verharding van oever', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Samenwerking met waterschap voor afstemming peilbeheer', 'handmatig', true);
  END IF;
  -- ANLb — Water en Klimaat pakket
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'anlb-water-klimaat', 'nationaal', 'ANLb — Water en Klimaat pakket', 'Agrarische collectieven (via RVO.nl)', 'Onderdeel van bredere ANLb-systematiek. Aanvraag ALTIJD via erkend collectief, nooit individueel.',
    'https://www.bij12.nl/onderwerp/agrarisch-natuur-en-landschapsbeheer/', ARRAY['water', 'klimaat', 'agrarisch natuur'], ARRAY['ANLb', 'water', 'klimaat', 'veenweide', 'peilverhoging', 'collectief'], ARRAY['melkveehouders', 'akkerbouwers in veenweidegebied'], ARRAY['water', 'klimaat', 'agrarisch natuur'], NULL,
    '€200–600/ha/jaar afhankelijk van pakket en peilverhoging', 'handmatig', true
    , '2026-01-01'
    , '2026-03-01'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel in veenweidegebied of waterbergingsgebied', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Lid van ANLb-collectief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Deelname via collectief aanvraag', 'handmatig', true);
  END IF;
  -- Subsidie Biologische Omschakeling
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'subsidie-biologische-omschakeling', 'nationaal', 'Subsidie Biologische Omschakeling', 'RVO.nl', 'Budget is beperkt; openstellingen snel vol. Combineerbaar met eco-regeling en ANLb.',
    'https://www.rvo.nl/subsidies-financiering/biologische-landbouw', ARRAY['landbouw', 'biologisch'], ARRAY['biologisch', 'omschakeling', 'Skal', 'duurzaam', 'landbouw'], ARRAY['akkerbouwers', 'melkveehouders', 'tuinders'], ARRAY['landbouw', 'biologisch'], NULL,
    '€250–600/ha/jaar gedurende omschakelperiode', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Gangbaar bedrijf dat omschakelt naar biologisch', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aansluiting bij biologische certificering (Skal)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 5 ha', 'hectare_min', '>=', '5.0', 'eis', 10, 'handmatig', true);
  END IF;
  -- Boerenlandvogels Noord-Holland (ANLb-variant)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'boerenlandvogels-nh', 'provinciaal', 'Boerenlandvogels Noord-Holland (ANLb-variant)', 'Provincie Noord-Holland / ANLb-collectieven Noord-Holland', 'Noord-Holland heeft rijke weidevogelgebieden in de droogmakerijen en veenweidepolder (bijv. Eilandspolder, Wormer- en Jisperveld). Provincie NH stelt aanvullend budget beschikbaar bovenop het reguliere ANLb. Akkervogels in de Wieringermeer en Haarlemmermeer. Aanvraag verloopt via het collectief.',
    'https://www.noord-holland.nl/onderwerpen/natuur-en-landschap/boerenlandvogels', ARRAY['natuur', 'landbouw'], ARRAY['boerenlandvogels', 'Noord-Holland', 'ANLb', 'weidevogels', 'akkervogels', 'collectief', 'plasdras'], ARRAY['agrariërs', 'melkveehouders', 'collectieven'], ARRAY['natuur', 'landbouw'], NULL,
    'ANLb-basisvergoeding + aanvulling provincie: weidevogelbeheer ca. €400–900/ha/jaar totaal; akkervogels ca. €700–1.100/ha/jaar', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Percelen liggen in aangewezen Boerenlandvogelgebieden Noord-Holland', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via Noord-Hollands ANLb-collectief (bijv. WFNH, ANWB-collectief)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Uitgesteld maaien, plasdras en nestbescherming zijn kernmaatregelen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Provinciale aanvulling vereist deelname aan monitoring (broedvogeltellingen)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Overeenkomst 6 jaar, jaarlijkse uitbetalingen', 'handmatig', true);
  END IF;
  -- DAW — Deltaplan Agrarisch Waterbeheer
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'daw-agrarisch-waterbeheer', 'nationaal', 'DAW — Deltaplan Agrarisch Waterbeheer', 'Waterschappen (21 regionale waterschappen)', 'Aanvraag loopt via het eigen regionale waterschap. Elk waterschap heeft eigen openstellingen en budgetten.',
    'https://www.deltaprogramma.nl/deltaplan-agrarisch-waterbeheer', ARRAY['water', 'landbouw'], ARRAY['DAW', 'waterschap', 'waterbeheer', 'landbouw', 'klimaat', 'drainage'], ARRAY['melkveehouders', 'akkerbouwers', 'agrarisch adviseurs'], ARRAY['water', 'landbouw'], NULL,
    '40-60% van investeringskosten, max €60.000 per project', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Landbouwbedrijf actief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel in beheersgebied waterschap', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare wateropgave', 'handmatig', true);
  END IF;
  -- Deltaplan Biodiversiteitsherstel
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'deltaplan-biodiversiteit', 'nationaal', 'Deltaplan Biodiversiteitsherstel', 'Deltaplan Biodiversiteitsherstel (coalitie van partijen) / private cofinanciering', 'Het Deltaplan Biodiversiteitsherstel is een brede coalitie van boeren, natuur-organisaties, bedrijven en overheden. Het heeft geen eigen subsidieloket maar helpt partijen cofinanciering te vinden en projecten te verbinden. Relevant als netwerk- en matchmakingplatform voor biodiversiteitsprojecten. Meest effectief in combinatie met ANLb, SNL of provinciale fondsen.',
    'https://www.deltaplanbiodiversiteitsherstel.nl', ARRAY['natuur', 'landbouw', 'landschap'], ARRAY['biodiversiteit', 'deltaplan', 'samenwerking', 'private-financiering', 'bloemrijke-percelen', 'insecten'], ARRAY['agrariërs', 'terreinbeheerders', 'landgoedeigenaren', 'bedrijven', 'gemeenten'], ARRAY['natuur', 'landbouw', 'landschap'], NULL,
    'Afhankelijk van project en cofinancieringspartners. Bijdragen van €10.000–500.000 per project. Deltaplan heeft geen eigen subsidiepot maar fungeert als coördinatiemechanisme', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project draagt aantoonbaar bij aan biodiversiteitsherstel', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Samenwerking van meerdere partijen (boer + natuur + bedrijfsleven)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Meetbare biodiversiteitsdoelen in projectplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Cofinanciering van private partijen aanwezig', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Voortkomend uit of aansluitend bij één van de Delta-thema''s (landbouw, water, stedelijk, etc.)', 'handmatig', true);
  END IF;
  -- Subsidie Erfbeplanting Landelijk Gebied
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'erfbeplanting-landelijk-gebied', 'provinciaal', 'Subsidie Erfbeplanting Landelijk Gebied', 'Provincie of Landschapsbeheer Nederland', 'Sterk regionaal georganiseerd via provinciale Landschapsbeheer-organisaties. Check lokaal loket.',
    'https://www.landschapsbeheer.nl/subsidies', ARRAY['landschap', 'groen', 'bebouwing'], ARRAY['erfbeplanting', 'streekeigen', 'landschap', 'groen', 'erf', 'aanleg'], ARRAY['agrariërs', 'landgoedeigenaren'], ARRAY['landschap', 'groen', 'bebouwing'], NULL,
    '50-100% van aanlegkosten, max €5.000', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Agrarisch erf of landgoederf', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beplanting met streekeigen soorten', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale omvang', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Onderhoudsverplichting 10 jaar', 'handmatig', true);
  END IF;
  -- Fiscale Groenregeling — Groene Lening via Erkende Bank
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'fim-fiscale-groenregeling', 'nationaal', 'Fiscale Groenregeling — Groene Lening via Erkende Bank', 'Belastingdienst / erkende groenfondsen (ASN Bank, Triodos, Rabobank, ING Groenbank)', 'De fiscale groenregeling werkt via een lagere rente op groene leningen, gefinancierd door belastingvoordeel voor de spaarder. Stap 1: Groenverklaring aanvragen bij RVO. Stap 2: Lening afsluiten bij erkende groenbank (ASN, Triodos, Rabobank Groenfonds, etc.). Geschikt voor: NSW-landgoed investeringen, duurzame agrarische stallen, biologische omschakeling. Combineerbaar met SKNL en MIA/VAMIL.',
    'https://www.rvo.nl/onderwerpen/groenprojecten', ARRAY['natuur', 'energie', 'landbouw', 'gebouwen'], ARRAY['groenregeling', 'groene-lening', 'fiscaal', 'groenverklaring', 'rentekorting', 'duurzame-financiering'], ARRAY['particulieren', 'agrariërs', 'landgoedeigenaren', 'terreinbeheerders', 'projectontwikkelaars natuur'], ARRAY['natuur', 'energie', 'landbouw', 'gebouwen'], NULL,
    'Rentevoordeel: ca. 0,7 procentpunt lager dan reguliere lening. Heffingskorting voor de spaarder/investeerder: €0,70 per €1.000 belegd (vrijstelling vermogensrendementsheffing). Effectief voordeel lener: ca. 0,5–1% per jaar', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project is aangemerkt als groen project door RVO (Groenverklaring vereist)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project valt in een van de categorieën: natuur, biologische landbouw, duurzame energie, duurzaam bouwen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Groenverklaring aanvragen bij RVO (vóór aanvang project)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Lening afsluiten bij erkende groenbank', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project in Nederland', 'handmatig', true);
  END IF;
  -- GLB Basispremie (Gecombineerde Opgave)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'glb-basispremie', 'nationaal', 'GLB Basispremie (Gecombineerde Opgave)', 'RVO', 'Jaarlijkse aanvraag via Gecombineerde Opgave (GO), uiterlijk 15 mei. Te laat indienen leidt tot korting (1% per werkdag). Betalingsrechten zijn overdraagbaar en verpachtbaar. Afbouw betalingsrechten loopt door in huidige GLB-periode 2023–2027.',
    'https://www.rvo.nl/onderwerpen/gecombineerde-opgave', ARRAY['landbouw', 'natuur'], ARRAY['GLB', 'basispremie', 'betalingsrechten', 'gecombineerde-opgave', 'eerste-pijler', 'jaarlijks'], ARRAY['agrariërs', 'akkerbouwers', 'veehouders', 'gemengde bedrijven'], ARRAY['landbouw', 'natuur'], NULL,
    '€180–250 per ha, afhankelijk van regio en grondsoort; betalingsrechten worden jaarlijks vastgesteld', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 1 ha landbouwareaal in gebruik', 'hectare_min', '>=', '1.0', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Percelen zijn landbouwgrond (akker, grasland, blijvend grasland, tuinbouw)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Conditionaliteitseisen: GLMC-normen (goed landbouw- en milieucondities) naleven', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Jaarlijkse Gecombineerde Opgave (GO) indienen via mijn.rvo.nl', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Actieve landbouwer zijn (geen papieren bedrijven)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Basisbetalingsregeling of Basispremie gekoppeld aan percelen', 'handmatig', true);
  END IF;
  -- Eco-regeling (GLB)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'glb-eco-regeling', 'nationaal', 'Eco-regeling (GLB)', 'RVO', 'Drie niveaus: brons, zilver en goud. Hogere niveaus vereisen meer eco-activiteiten of zwaardere maatregelen (bijv. bufferstroken, vanggewassen, behoud landschapselementen). Puntensysteem bepaalt niveau. Budget wordt gedeeld door deelnemers — definitieve vergoeding wordt na afloop aanvraagjaar vastgesteld. Nieuw in GLB 2023–2027.',
    'https://www.rvo.nl/onderwerpen/eco-regeling', ARRAY['landbouw', 'natuur', 'water'], ARRAY['GLB', 'eco-regeling', 'biodiversiteit', 'brons', 'zilver', 'goud', 'eco-activiteiten', 'eerste-pijler'], ARRAY['agrariërs', 'akkerbouwers', 'veehouders', 'gemengde bedrijven'], ARRAY['landbouw', 'natuur', 'water'], NULL,
    'Brons: ~€60/ha | Zilver: ~€120/ha | Goud: ~€200/ha (indicatief, afhankelijk van beschikbaar budget en deelname)', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Deelname via Gecombineerde Opgave (GO)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 1 ha landbouwareaal in gebruik', 'hectare_min', '>=', '1.0', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eco-activiteiten kiezen uit de officiële catalogus (eco-activiteiten lijst RVO)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Voldoende punten behalen voor gewenst niveau (brons/zilver/goud)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eco-activiteiten aantoonbaar uitvoeren gedurende het aanvraagjaar', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Conditionaliteitseisen GLB naleven', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Combineerbaar met ANLb maar geen dubbele vergoeding voor zelfde maatregel', 'handmatig', true);
  END IF;
  -- GLB — Aanvullende Inkomenstoeslag Jonge Landbouwers
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'glb-jonge-landbouwers', 'nationaal', 'GLB — Aanvullende Inkomenstoeslag Jonge Landbouwers', 'RVO.nl', 'Aanvraag via Gecombineerde Opgave tegelijk met basispremie. Combineerbaar met eco-regeling.',
    'https://www.rvo.nl/subsidies-financiering/glb/jonge-landbouwers', ARRAY['agrarisch', 'GLB'], ARRAY['GLB', 'jonge landbouwers', 'toeslag', 'basispremie', 'starter'], ARRAY['agrariërs jonger dan 40 jaar', 'starters'], ARRAY['agrarisch', 'GLB'], NULL,
    '€130–200/ha/jaar extra bovenop basispremie (max 90 ha)', 'handmatig', true
    , '2026-03-01'
    , '2026-05-15'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Leeftijd <40 jaar op 1 januari aanvraagjaar', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Actief landbouwer', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Gecombineerde Opgave indienen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eerste vestiging als bedrijfshoofd <5 jaar geleden', 'handmatig', true);
  END IF;
  -- Subsidie Biodiversiteitsmaatregelen (provinciaal, wisselend)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'invest-biodiversiteit', 'provinciaal', 'Subsidie Biodiversiteitsmaatregelen (provinciaal, wisselend)', 'Provincies (wisselend per provincie)', 'Sterk wisselend per provincie en jaar. Sommige provincies combineren dit met hun groenfonds of landschapsfonds. Maatregelen kunnen omvatten: aanleg poelen, bloemrijke akkerranden, faunapassages, bosranden, kleine landschapselementen. Check altijd provinciaal subsidieloket.',
    'https://www.bij12.nl/onderwerp/natuursubsidies/', ARRAY['natuur', 'landbouw', 'landschap'], ARRAY['biodiversiteit', 'inrichting', 'NNN', 'provinciaal', 'bloemrijke-randen', 'poel', 'faunapassage'], ARRAY['agrariërs', 'terreinbeheerders', 'landgoedeigenaren', 'rentmeesters', 'gemeenten'], ARRAY['natuur', 'landbouw', 'landschap'], NULL,
    '40–75% van de aanleg- en inrichtingskosten; wisselend per provincie en maatregel. Typisch €500–5.000 per maatregel', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Maatregel draagt aantoonbaar bij aan biodiversiteitsherstel', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel of project ligt in of nabij een prioriteitsgebied (NNN, Natura 2000-bufferzone)', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheerplan of projectplan indienen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale beheerperiode na aanleg (doorgaans 5 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Openstellingsperiode en eisen per provincie raadplegen', 'handmatig', true);
  END IF;
  -- Subsidie Duurzame Stallen en Emissiereductie Veestapel
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'invest-duurzame-stal', 'nationaal', 'Subsidie Duurzame Stallen en Emissiereductie Veestapel', 'RVO / provincies (wisselend per regeling)', 'Meerdere regelingen vallen onder deze categorie: Subsidie Duurzame Stallen (SDS), Wsw (Wet subsidies stikstof-emissiereductie). Openstellingen wisselen sterk per jaar. Combinatie met MIA/VAMIL is doorgaans mogelijk. Raadpleeg RVO voor actuele openstellingen.',
    'https://www.rvo.nl/onderwerpen/duurzame-landbouw', ARRAY['landbouw', 'energie'], ARRAY['duurzame-stallen', 'emissiereductie', 'ammoniak', 'methaan', 'luchtwasser', 'stikstof', 'veehouderij'], ARRAY['veehouders', 'melkveehouders', 'pluimveehouders', 'varkenshouders'], ARRAY['landbouw', 'energie'], NULL,
    '30–50% van de subsidiabele investeringskosten; maximaal €500.000 per bedrijf per openstellingsronde', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investering leidt tot aantoonbare emissiereductie (ammoniak, fijnstof, methaan)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Techniek staat op de Maatlat Duurzame Veehouderij of erkende emissielijst', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bedrijf heeft geldige milieuvergunning', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen bedrijfsstopper of saneerder (uitsluitingscriterium in sommige regelingen)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investeringsplan met kostenraming indienen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen dubbele subsidiëring (MIA/VAMIL wel combineerbaar, maar geen andere investeringssubsidie)', 'handmatig', true);
  END IF;
  -- Erfbeplantingssubsidie (gemeente/waterschap, wisselend)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'invest-erfbeplanting', 'gemeentelijk', 'Erfbeplantingssubsidie (gemeente/waterschap, wisselend)', 'Gemeenten / waterschappen / provinciale landschappen', 'Sterk lokaal georganiseerd. Veel gemeenten werken samen met Landschapsbeheer (provinciaal) voor uitgifte en begeleiding. Soms wordt plantmateriaal gratis of tegen sterk gereduceerde prijs beschikbaar gesteld. Controleer bij gemeente, waterschap of provinciaal landschapsbeheer.',
    'https://www.landschapsbeheer.nl', ARRAY['landschap', 'natuur'], ARRAY['erfbeplanting', 'streekeigen-beplanting', 'landschapselementen', 'bomen', 'hagen', 'erftransformatie'], ARRAY['agrariërs', 'landgoedeigenaren', 'rentmeesters', 'particulieren in landelijk gebied'], ARRAY['landschap', 'natuur'], NULL,
    '50–75% van de aanlegkosten plantmateriaal; of vergoeding in natura (gratis plantmateriaal). Typisch €500–5.000 per erftransformatie', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Agrarisch erf in het landelijk gebied', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beplanting met streekeigen soorten (soortenlijst per regio)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag voor aanplant in het najaar/winter (plantseizoen)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beplanting in stand houden voor minimaal 10 jaar', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen beplanting op percelen met conflicterend gebruik (bijv. teeltvrije zone)', 'handmatig', true);
  END IF;
  -- Subsidie Aanleg Houtwallen en Heggen (provincies en gemeenten)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'invest-houtwallen', 'provinciaal', 'Subsidie Aanleg Houtwallen en Heggen (provincies en gemeenten)', 'Provincies / gemeenten / Landschapsbeheer', 'Subsidies voor aanleg van houtwallen en heggen zijn sterk afhankelijk van lokaal landschapsbeleid. Sommige provincies (bijv. Gelderland, Overijssel, Drenthe) hebben actieve programma''s. ANLb-beheervergoeding voor het onderhoud is aparte aanvraag via collectief. Combinatie aanlegsubsidie + ANLb-beheervergoeding is de gebruikelijke aanpak.',
    'https://www.landschapsbeheer.nl', ARRAY['landschap', 'natuur', 'landbouw'], ARRAY['houtwallen', 'heggen', 'landschapselementen', 'aanleg', 'droge-dooradering', 'kleine-landschapselementen'], ARRAY['agrariërs', 'landgoedeigenaren', 'rentmeesters', 'terreinbeheerders'], ARRAY['landschap', 'natuur', 'landbouw'], NULL,
    'Aanleg houtwal: €5–15 per strekkende meter. Aanleg heg: €3–8 per strekkende meter. Totaalsubsidie: 50–80% van aanlegkosten', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Locatie ligt in een landschapsstructuurzone of nabij een weidevogelgebied', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanleg met streekeigen soorten conform soortenlijst', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale lengte: doorgaans 25 meter', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheerovereenkomst aangaan voor minimaal 6 jaar', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen aanleg op percelen met conflicterend gebruik', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Goedkeuring van gemeente of provincie vereist (afhankelijk van lokale regeling)', 'handmatig', true);
  END IF;
  -- Klimaatadaptatie Waterberging (waterschappen en gemeenten)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'invest-waterberging', 'gemeentelijk', 'Klimaatadaptatie Waterberging (waterschappen en gemeenten)', 'Waterschappen / gemeenten / provincies', 'Waterschapssubsidies voor waterberging zijn sterk afhankelijk van het lokale waterbeheerprogramma. Na de overstromingen van 2021 is het budget voor klimaatadaptatie sterk vergroot. Maatregelen: retentiebekkens, peilverhoging, waterbergingspolders, infiltratie-voorzieningen. Altijd contact opnemen met het lokale waterschap.',
    'https://www.deltacommissaris.nl/klimaatadaptatie', ARRAY['water', 'natuur', 'landbouw'], ARRAY['waterberging', 'klimaatadaptatie', 'peilverhoging', 'wateroverlast', 'droogte', 'waterschap', 'deltafonds'], ARRAY['agrariërs', 'gemeenten', 'waterschappen', 'terreinbeheerders', 'landgoedeigenaren'], ARRAY['water', 'natuur', 'landbouw'], NULL,
    '40–80% van de investeringskosten; waterschap-vergoedingen: ca. €500–2.000/ha voor peilverhoging of berging. Gemeentelijk: wisselend per regeling', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project leidt tot aantoonbare vergroting waterbergingscapaciteit', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Ligging in waterbergings- of klimaatadaptatiegebied conform waterbeheerprogramma', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Samenwerking met waterschap vereist', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Inrichtingsplan goedgekeurd door waterschap', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheer en onderhoud waterberging geborgd voor minimaal 10 jaar', 'handmatig', true);
  END IF;
  -- KRW-maatregelen Subsidiëring via Waterbeheerplannen
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'kader-richtlijn-water', 'nationaal', 'KRW-maatregelen Subsidiëring via Waterbeheerplannen', 'Provincies / waterschappen / Rijkswaterstaat', 'De Kaderrichtlijn Water (KRW) verplicht Nederland tot goede waterkwaliteit in 2027 (deadline verlengbaar tot 2033). Maatregelen worden gefinancierd via waterbeheerplannen van waterschappen en provincies. Voor agrariërs relevant: bufferstroken, droge randvoorwaarden, fosfaatuitspoeling reduceren. Zie ook ANLb natte dooradering en sbv-overijssel.',
    'https://www.helpdesk-water.nl/krw', ARRAY['water', 'natuur', 'landbouw'], ARRAY['KRW', 'waterkwaliteit', 'fosfaat', 'stikstof', 'ecologie', 'waterlichaam', 'oevers'], ARRAY['agrariërs', 'terreinbeheerders', 'gemeenten', 'waterschappen'], ARRAY['water', 'natuur', 'landbouw'], NULL,
    'Sterk wisselend per maatregel en waterschap: oeverbuffers €500–2.000/ha; fosfaatfilters €10.000–100.000 per installatie; herstelprojecten €50.000–5 miljoen', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Maatregel staat in het KRW-maatregelenprogramma van het betreffende waterlichaam', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bijdrage aan verbetering ecologische of chemische waterkwaliteit', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via het bevoegde waterschap of provincie', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Monitoring van waterkwaliteitseffecten vereist', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'KRW-doelen 2027 als referentie', 'handmatig', true);
  END IF;
  -- Subsidie Kleine Landschapselementen (KLE)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'kle-kleine-landschapselementen', 'provinciaal', 'Subsidie Kleine Landschapselementen (KLE)', 'Provincie (per provincie verschilt uitvoerder)', 'Niet alle provincies hebben een aparte KLE-regeling; sommige vallen onder SNL landschap. Check provinciaal loket.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/kleine-landschapselementen/', ARRAY['landschap', 'natuur', 'agrarisch'], ARRAY['KLE', 'landschapselementen', 'heg', 'poel', 'houtkant', 'landschap', 'beheer'], ARRAY['agrariërs', 'landgoedeigenaren', 'rentmeesters'], ARRAY['landschap', 'natuur', 'agrarisch'], NULL,
    '€100–600/element/jaar (beheer) of 70-100% van aanlegkosten (aanleg)', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Element gelegen op landbouwgrond of particulier terrein', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale afmeting afhankelijk van type (heg, poel, houtkant, knotboom, etc.)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Provincie moet KLE-regeling open hebben', 'handmatig', true);
  END IF;
  -- Klimaatbufferprogramma — Grote Waterbuffering en Ecologisch Herstel
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'klimaatbuffers', 'nationaal', 'Klimaatbufferprogramma — Grote Waterbuffering en Ecologisch Herstel', 'Rijkswaterstaat / Deltaprogramma / provincies / terreinbeheerders', 'Klimaatbuffers zijn grootschalige gebiedsinrichtingen die tegelijk bijdragen aan waterberging en natuur. Voorbeelden: uiterwaardenherstel Rijntakken, veenweide-peilverhoging West-NL, kustmoeras-herstel. Te groot voor individuele aanvraag — initiatief via gebiedsproces of provincie. Nationaal Klimaatadaptatieprogramma 2026–2030 is relevant kader.',
    'https://www.rijksoverheid.nl/onderwerpen/klimaatverandering/klimaatadaptatie', ARRAY['water', 'natuur', 'landschap'], ARRAY['klimaatbuffer', 'waterberging', 'deltaprogramma', 'grootschalig', 'ecologisch-herstel', 'uiterwaarden', 'natte-natuur'], ARRAY['terreinbeheerders', 'provincies', 'waterschappen', 'gemeenten', 'samenwerkingsverbanden'], ARRAY['water', 'natuur', 'landschap'], NULL,
    'Grote projecten: €1 miljoen–50 miljoen. Bijdrage Rijkswaterstaat/LNV: 50–80% van kosten', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project leidt tot substantiële vergroting waterbuffercapaciteit', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Gecombineerde doelen: waterberging + biodiversiteitsherstel + klimaatadaptatie', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Groot samenwerkingsverband (waterschap + provincie + terreinbeheerder)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Projectplan met langetermijn-monitoring', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Vrijwillig grondverwerving of grondruil', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aansluiting bij Deltaprogramma of NNN-realisatie', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
  END IF;
  -- LEADER / CLLD — Plattelandsontwikkeling
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'leader-clld-platteland', 'nationaal', 'LEADER / CLLD — Plattelandsontwikkeling', 'Lokale Actie Groepen (LAG''s) — 30 regio''s in Nederland', 'Aanvraag via de lokale LAG van het gebied. Sterk locatiegebonden — check welke LAG actief is in het perceel.',
    'https://www.rvo.nl/subsidies-financiering/leader', ARRAY['platteland', 'recreatie', 'natuur', 'agrarisch'], ARRAY['LEADER', 'CLLD', 'platteland', 'gebiedsontwikkeling', 'EU', 'innovatie'], ARRAY['agrariërs', 'landgoedeigenaren', 'lokale ondernemers', 'gebiedscoöperaties'], ARRAY['platteland', 'recreatie', 'natuur', 'agrarisch'], NULL,
    '40-80% van projectkosten, max €200.000 per project', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project draagt bij aan lokale ontwikkelstrategie van de LAG', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 2 partijen betrokken', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Niet-commercieel of publiek belang', 'handmatig', true);
  END IF;
  -- Landbouwstructuurversterkingsfonds (LVF)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'lsv-landbouw', 'nationaal', 'Landbouwstructuurversterkingsfonds (LVF)', 'RVO', 'Het LVF is een paraplufonds voor diverse investeringsmaatregelen in de landbouwtransitie. Specifieke openstellingen wisselen per jaar en zijn onderdeel van het bredere NPLG-beleid. Raadpleeg RVO voor actuele openstellingen en subsidiabele categorieën.',
    'https://www.rvo.nl/onderwerpen/landbouw', ARRAY['landbouw', 'natuur', 'water', 'energie'], ARRAY['LVF', 'landbouwstructuur', 'duurzame-landbouw', 'kringlooplandbouw', 'investering'], ARRAY['agrariërs', 'veehouders', 'akkerbouwers', 'collectieven', 'samenwerkingsverbanden'], ARRAY['landbouw', 'natuur', 'water', 'energie'], NULL,
    '35–50% van subsidiabele kosten; voor samenwerking of innovatie soms hoger. Minimale projectomvang €50.000', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investeringen gericht op duurzame landbouw (emissiereductie, kringlooplandbouw, biodiversiteit)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bedrijfsplan of samenwerkingsovereenkomst vereist', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 2 jaar agrarisch actief', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen dubbele financiering met SDE++, MIA/VAMIL of POP3 voor zelfde investering', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via mijn.rvo.nl tijdens openstellingsperiode', 'handmatig', true);
  END IF;
  -- MIA/VAMIL — Milieu-investeringsaftrek Natuur en Landschap
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'mia-vamil-natuur', 'nationaal', 'MIA/VAMIL — Milieu-investeringsaftrek Natuur en Landschap', 'RVO.nl + Belastingdienst', 'Geen directe subsidie maar fiscaal voordeel. Stapelbaar met andere subsidies. Relevant voor drainagesystemen, precisielandbouw, agroforestry.',
    'https://www.rvo.nl/subsidies-financiering/mia-vamil', ARRAY['fiscaal', 'natuur', 'investering'], ARRAY['MIA', 'VAMIL', 'fiscaal', 'investering', 'duurzaam', 'natuur', 'belastingvoordeel'], ARRAY['agrarisch ondernemers', 'landgoedeigenaren'], ARRAY['fiscaal', 'natuur', 'investering'], NULL,
    '45% MIA-aftrek + 75% VAMIL-afschrijving op kwalificerende investeringen', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investering op Milieulijst RVO', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Ondernemer IB- of VPB-plichtig', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Tijdige melding bij RVO', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale investering €2.500', 'handmatig', true);
  END IF;
  -- MIA/VAMIL Milieu-investeringsaftrek en Willekeurige Afschrijving Milieu-investeringen
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'mia-vamil', 'nationaal', 'MIA/VAMIL Milieu-investeringsaftrek en Willekeurige Afschrijving Milieu-investeringen', 'RVO / Belastingdienst', 'MIA en VAMIL zijn fiscale voordelen, geen directe subsidie. Melding bij RVO is verplicht — zonder melding vervalt het recht. De Milieulijst wordt jaarlijks per 1 januari gepubliceerd; investeringen in duurzame stallen, luchtwassers, precisiebemesting en energieopslag zijn veelvoorkomende agrarische categorieën.',
    'https://www.rvo.nl/onderwerpen/mia-en-vamil', ARRAY['energie', 'landbouw', 'natuur', 'water'], ARRAY['MIA', 'VAMIL', 'fiscaal', 'milieu-investering', 'aftrek', 'duurzame-stallen', 'emissiereductie'], ARRAY['agrariërs', 'bedrijven', 'veehouders', 'akkerbouwers', 'landgoedeigenaren'], ARRAY['energie', 'landbouw', 'natuur', 'water'], NULL,
    'MIA: 45% aftrek van investeringsbedrag op winst (effectief belastingvoordeel ~10–14% van investering). VAMIL: 75% willekeurige afschrijving (liquiditeitsvoordeel). Gecombineerd effectief voordeel ca. 14–19% van investeringsbedrag', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investering staat op de Milieulijst (jaarlijks gepubliceerd door RVO)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Melding binnen 3 maanden na aangaan van de investeringsverplichting via eAmbtI/mijn.rvo.nl', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Ondernemer betaalt vennootschapsbelasting of inkomstenbelasting (IB-ondernemer of BV)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investering in Nederland', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen andere investeringsaftrek voor hetzelfde bedrijfsmiddel (bijv. geen KIA combineren met MIA voor zelfde object)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Drempel: investering ≥ €2.500 per bedrijfsmiddel', 'handmatig', true);
  END IF;
  -- Nationaal Groenfonds — Groene lening
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'nationaal-groenfonds-lening', 'nationaal', 'Nationaal Groenfonds — Groene lening', 'Nationaal Groenfonds', 'Geen subsidie maar gunstige lening. Relevant voor grote investeringen in natuur en landgoed. Vaak gecombineerd met NSW en SNL.',
    'https://www.nationaalgroenfonds.nl', ARRAY['natuur', 'landschap', 'financiering'], ARRAY['groenfonds', 'lening', 'financiering', 'natuur', 'landgoed', 'rente'], ARRAY['landgoedeigenaren', 'terreinbeheerders', 'natuurorganisaties'], ARRAY['natuur', 'landschap', 'financiering'], NULL,
    'Rentekorting van 1-3% onder markttarief; leningen van €500.000–50 miljoen', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project met duidelijk maatschappelijk groenbelang', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langlopende pacht', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Businessplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale leenbedrag €500.000', 'handmatig', true);
  END IF;
  -- NPLG Gebiedsplanuitvoering (per provincie)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'nplg-gebiedsplan', 'nationaal', 'NPLG Gebiedsplanuitvoering (per provincie)', 'Provincies (uitvoering) / Ministerie LNV (kader)', 'NPLG is het overkoepelende nationale programma maar uitvoering is provinciaal. Elk van de 12 provincies heeft een gebiedsplan met eigen prioriteiten, maatregelen en budgetten. Voor agrariërs zijn de vrijwillige bedrijfsbeëindiging (uitkoop), omschakeling naar extensieve landbouw en functieverandering de meest relevante routes. Raadpleeg provinciaal loket voor actuele openstellingen.',
    'https://www.rijksoverheid.nl/nplg', ARRAY['natuur', 'landbouw', 'water'], ARRAY['NPLG', 'gebiedsplan', 'stikstof', 'grondaankoop', 'omschakeling', 'bedrijfsbeëindiging', 'provinciaal'], ARRAY['agrariërs', 'terreinbeheerders', 'landgoedeigenaren', 'gemeenten', 'waterschappen'], ARRAY['natuur', 'landbouw', 'water'], NULL,
    'Grondaankoop: tot marktwaarde. Inrichting: 70–100% van subsidiabele kosten. Vrijwillige bedrijfsbeëindiging: marktconforme vergoeding + opheffings-vergoeding. Omschakelingssubsidie: €500–5.000/ha', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel of bedrijf ligt in een NPLG-prioriteitsgebied (stikstof, water, klimaat)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Deelname is vrijwillig voor individuele eigenaren', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via provinciaal loket (niet landelijk)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Plan past binnen provinciaal gebiedsplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Monitoring- en rapportageverplichtingen', 'handmatig', true);
  END IF;
  -- NPLG — Nationaal Programma Landelijk Gebied (gebiedsgericht)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'nplg-gebiedstransitie', 'nationaal', 'NPLG — Nationaal Programma Landelijk Gebied (gebiedsgericht)', 'Provincie (namens Rijk)', 'Complexe regeling in ontwikkeling. Raadpleeg provinciaal gebiedscoördinator. Hoge bedragen mogelijk bij grondaankoop of beëindiging.',
    'https://www.rijksoverheid.nl/onderwerpen/natuur-en-biodiversiteit/nationaal-programma-landelijk-gebied', ARRAY['stikstof', 'natuur', 'water', 'klimaat'], ARRAY['NPLG', 'stikstof', 'natuur', 'gebiedsgericht', 'transitie', 'extensivering'], ARRAY['agrariërs in stikstofgevoelige gebieden', 'rentmeesters', 'terreinbeheerders'], ARRAY['stikstof', 'natuur', 'water', 'klimaat'], NULL,
    'Sterk variabel: €500–5000/ha voor extensivering; opkoopregelingen marktwaarde+', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel in of nabij stikstofgevoelig Natura 2000-gebied', 'ligt_in_natura2000', 'is', 'ja', 'pre', 15, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Deelname aan gebiedsproces', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bereidheid tot bedrijfsaanpassing', 'handmatig', true);
  END IF;
  -- NPLG Transitiefonds Landelijk Gebied
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'nplg-transitiefonds', 'nationaal', 'NPLG Transitiefonds Landelijk Gebied', 'Ministerie LNV / provincies', 'Het Transitiefonds is het grootste landelijke financieringsprogramma voor het landelijk gebied ooit. Budget loopt via provinciale gebiedsplannen. Grondaankopen voor natuur, extensivering of functieverandering zijn de grootste kostenpost. Individuele agrariërs kunnen via provinciaal loket meedoen aan vrijwillige bedrijfsbeëindiging of omschakeling.',
    'https://www.rijksoverheid.nl/onderwerpen/natuur-en-biodiversiteit/nationaal-programma-landelijk-gebied', ARRAY['natuur', 'landbouw', 'water'], ARRAY['NPLG', 'transitiefonds', 'stikstof', 'grondaankoop', 'waterkwaliteit', 'klimaat', 'gebiedsplan'], ARRAY['agrariërs', 'terreinbeheerders', 'landgoedeigenaren', 'gemeenten', 'waterschappen', 'provincies'], ARRAY['natuur', 'landbouw', 'water'], NULL,
    'Wisselend per maatregel en provincie; grondaankoop tot marktwaarde; inrichting 70–100% van kosten', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bijdrage aan doelen NPLG: stikstofreductie, waterkwaliteit, klimaatadaptatie, biodiversiteit', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via provinciaal gebiedsplan (niet rechtstreeks bij LNV)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project past binnen provinciaal uitvoeringsprogramma', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Grondaankoop: vrijwillig, tegen marktwaarde', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Inrichtingsmaatregelen: conform provinciaal plan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Monitoring en rapportage vereist', 'handmatig', true);
  END IF;
  -- NSW — Natuurschoonwet Landgoed
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'nsw-landgoed-fiscaal', 'nationaal', 'NSW — Natuurschoonwet Landgoed', 'RVO.nl + Belastingdienst', 'Geen subsidie maar fiscale vrijstelling. Zeer waardevol voor landgoedeigenaren. Combineerbaar met SNL.',
    'https://www.rvo.nl/subsidies-financiering/nsw', ARRAY['natuur', 'landschap', 'fiscaal'], ARRAY['NSW', 'landgoed', 'fiscaal', 'erfbelasting', 'natuur', 'particulier'], ARRAY['landgoedeigenaren', 'rentmeesters'], ARRAY['natuur', 'landschap', 'fiscaal'], NULL,
    'Vrijstelling erfbelasting + overdrachtsbelasting; lagere WOZ-waarde', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 5 ha aaneengesloten', 'hectare_min', '>=', '5.0', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimaal 30% bos of natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Opengesteld voor publiek (minstens 50% van het jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Inschrijving als NSW-landgoed bij RVO', 'nsw_status', 'is', 'actief', 'eis', 10, 'handmatig', true);
  END IF;
  -- Gelderlands Landschapsfonds / PAS-maatregelen Gelderland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'pas-fonds-gelderland', 'provinciaal', 'Gelderlands Landschapsfonds / PAS-maatregelen Gelderland', 'Provincie Gelderland', 'Het Gelderlands Landschapsfonds ondersteunt diverse landschapsinitiatieven in Gelderland. PAS-maatregelen zijn specifiek gericht op stikstofproblematiek rondom Natura 2000-gebieden (Veluwe, Rijntakken). Gelderland heeft het grootste NNN-areaal van Nederland. Raadpleeg provincie Gelderland voor actuele openstellingen.',
    'https://www.gelderland.nl/subsidies/natuur-en-landschap', ARRAY['natuur', 'landschap', 'water'], ARRAY['Gelderland', 'landschapsfonds', 'PAS', 'stikstof', 'Natura2000', 'Veluwe', 'Achterhoek', 'landschap'], ARRAY['terreinbeheerders', 'landgoedeigenaren', 'rentmeesters', 'agrariërs', 'gemeenten'], ARRAY['natuur', 'landschap', 'water'], NULL,
    '50–100% van de subsidiabele projectkosten; afhankelijk van doelstelling en locatie. Projecten doorgaans €10.000–500.000', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project draagt bij aan behoud of verbetering van het Gelders landschap', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Locatie in Gelderland, bij voorkeur in of nabij NNN of Natura 2000', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Projectplan met begroting en uitvoeringsschema indienen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Cofinanciering van minimaal 20% vereist', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Samenwerking met gemeente of waterschap aanbevolen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'PAS-maatregelen: specifiek gericht op stikstofreductie nabij Natura 2000', 'ligt_in_natura2000', 'is', 'ja', 'pre', 15, 'handmatig', true);
  END IF;
  -- LEADER — Lokale Plattelandsontwikkeling via LAG-groepen
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'plattelandsontwikkeling-leader', 'nationaal', 'LEADER — Lokale Plattelandsontwikkeling via LAG-groepen', 'Lokale Actie Groepen (LAG) / provincies / RVO', 'LEADER werkt via ca. 20 LAG-groepen verspreid over Nederland, elk met een eigen werkgebied en prioriteiten. Aanvraag altijd via het lokale LAG-kantoor. Thema''s per LAG wisselen sterk: toerisme, agrarische verbreding, zorglandbouw, krimp/leefbaarheid, circulaire economie. Raadpleeg www.leadernetwerk.nl voor een overzicht van alle LAG-gebieden.',
    'https://www.rvo.nl/onderwerpen/pop3/leader', ARRAY['landbouw', 'natuur', 'landschap'], ARRAY['LEADER', 'LAG', 'plattelandsontwikkeling', 'lokaal', 'innovatie', 'gemeenschap', 'toerisme', 'zorg'], ARRAY['agrariërs', 'ondernemers landelijk gebied', 'gemeenten', 'dorpsorganisaties', 'toerisme', 'zorg'], ARRAY['landbouw', 'natuur', 'landschap'], NULL,
    '50–80% van subsidiabele projectkosten. Projecten doorgaans €20.000–200.000. Maximaal per project verschilt per LAG-gebied', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project draagt bij aan lokale plattelandsontwikkelingsstrategie (LOS) van het LAG-gebied', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Uitvoerder is gevestigd in het LEADER-gebied', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Samenwerking tussen meerdere partijen aanbevolen (maar niet altijd verplicht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project is innovatief voor de regio of versterkt de lokale economie', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag bij het lokale LAG-kantoor (niet bij RVO of provincie)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Co-financiering aantonen', 'handmatig', true);
  END IF;
  -- POP3 Agrarische Structuurverbetering (Plattelands Ontwikkelings Programma 3)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'pop3-agrarische-structuur', 'nationaal', 'POP3 Agrarische Structuurverbetering (Plattelands Ontwikkelings Programma 3)', 'RVO / provincies', 'POP3 loopt grotendeels af. Nieuwe programmaperiode (POP4 of NSP Tweede Pijler / NPLG) wordt verwacht vanaf 2027. Controleer RVO voor lopende openstellingen binnen POP3-resttermijnen. Sommige provincies hebben eigen openstellingen nog lopend via transitiegeld.',
    'https://www.rvo.nl/onderwerpen/pop3', ARRAY['landbouw', 'natuur', 'water', 'energie'], ARRAY['POP3', 'plattelandsontwikkeling', 'investeringssubsidie', 'duurzame-stallen', 'structuurverbetering', 'tweede-pijler'], ARRAY['agrariërs', 'veehouders', 'akkerbouwers', 'collectieven'], ARRAY['landbouw', 'natuur', 'water', 'energie'], NULL,
    '40–50% van goedgekeurde investeringskosten; voor jonge boeren soms 60%. Minimale projectkosten doorgaans €25.000', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investering draagt bij aan verduurzaming of structuurverbetering van het agrarisch bedrijf', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investeringen in duurzame stallen, emissiereductie, waterbeheer of precisielandbouw', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bedrijf heeft een toekomstperspectief (bedrijfsplan vereist)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen dubbele financiering met andere EU-subsidies', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Provinciale openstelling afwachten (wisselend per provincie en maatregel)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanbestedingsregels volgen voor opdrachten boven €50.000', 'handmatig', true);
  END IF;
  -- Postcode Loterij Groen Fonds
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'postcode-loterij-groenfonds', 'nationaal', 'Postcode Loterij Groen Fonds', 'Postcodeloterij / Natuur & Milieu (uitvoering)', 'Het Groen Fonds financiert grote, impactvolle natuur- en biodiversiteitsprojecten. Minimumbedrag €50.000. Geschikt voor: landschapherstel op grote schaal, verbindingszones tussen Natura 2000-gebieden, grootschalige bosaanleg. Aanvraagprocedure duurt doorgaans 6–12 maanden. Ontvang eerst een letter of intent voor grote aanvragen.',
    'https://www.postcodeloterij.nl/groenfonds', ARRAY['natuur', 'landschap', 'water', 'energie'], ARRAY['postcodeloterij', 'groenfonds', 'groot-project', 'biodiversiteit', 'natuur', 'nationaal'], ARRAY['terreinbeheerders', 'landgoedeigenaren', 'natuurorganisaties', 'stichtingen'], ARRAY['natuur', 'landschap', 'water', 'energie'], NULL,
    'Grote projecten: €50.000–2.000.000. Gemiddelde subsidie ca. €200.000–500.000 per project', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Groot natuur- of biodiversiteitsproject van nationaal belang', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Rechtspersoon als aanvrager (stichting, vereniging — geen overheid)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare impact op biodiversiteit of klimaat', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Co-financiering aanwezig (minimaal 25%)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Uitvoeringsplan met meetbare doelen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project is overdraagbaar en duurzaam geborgd', 'handmatig', true);
  END IF;
  -- Prins Bernhard Cultuurfonds Natuur
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'prins-bernhard-cultuurfonds', 'nationaal', 'Prins Bernhard Cultuurfonds Natuur', 'Prins Bernhard Cultuurfonds', 'Gericht op kleinere natuur- en landschapsprojecten met een maatschappelijke component. Geschikt voor: natuureducatie, herstel historische tuinen/parken op landgoederen, aanleg kleine natuur door vrijwilligersgroepen. Aanvraag sluit doorgaans 1 oktober voor het volgende jaar. Raadpleeg website voor actuele prioriteiten.',
    'https://www.cultuurfonds.nl/natuur', ARRAY['natuur', 'landschap'], ARRAY['cultuurfonds', 'natuur', 'landschap', 'educatie', 'vrijwilligers', 'maatschappelijk', 'klein-project'], ARRAY['terreinbeheerders', 'landgoedeigenaren', 'natuurorganisaties', 'vrijwilligersorganisaties', 'gemeenten'], ARRAY['natuur', 'landschap'], NULL,
    'Subsidies doorgaans €5.000–25.000 per project. Grotere projecten tot €100.000 mogelijk bij uitzonderlijk belang', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project heeft maatschappelijke of educatieve waarde voor natuur of landschap', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen commercieel doel', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Stichting of vereniging als aanvrager (geen privépersonen of overheden)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Co-financiering aantoonbaar aanwezig', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project is uitvoerbaar binnen de looptijd', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via online portaal cultuurfonds', 'handmatig', true);
  END IF;
  -- Productieve investeringen groen-blauw en dierenwelzijn
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'productieve-investeringen-groen-blauw', 'provinciaal', 'Productieve investeringen groen-blauw en dierenwelzijn', 'RVO.nl namens provincies Noord-Holland, Zuid-Holland, Utrecht en Zeeland', 'Openstellingsperiode 2025-2026 gesloten (deadline februari 2026). Volgende ronde verwacht najaar 2026. Relevant voor melkveehouders die willen investeren in dierenwelzijn (stal, uitloop, weidegang) of groene infrastructuur. Beschikbaar in slechts 4 provincies.',
    'https://www.rvo.nl/subsidies-financiering/productieve-investeringen-groen-blauw-en-dierenwelzijn', ARRAY['landbouw', 'dierenwelzijn', 'groen-blauw', 'melkvee', 'verduurzaming'], ARRAY['dierenwelzijn', 'groen-blauw', 'investeringen', 'melkvee', 'veehouderij', 'verduurzaming', 'jonge boeren', 'Noord-Holland', 'Zuid-Holland', 'Utrecht', 'Zeeland'], ARRAY['melkveehouders', 'agrariërs', 'veehouders', 'akkerbouwers'], ARRAY['landbouw', 'dierenwelzijn', 'groen-blauw', 'melkvee', 'verduurzaming'], NULL,
    '40-80% van investeringskosten; €10.000–€100.000 per aanvraag (jonge boeren: 55-80%)', 'handmatig', true
    , '2025-12-03'
    , '2026-02-26'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Actief landbouwbedrijf in Noord-Holland, Zuid-Holland, Utrecht of Zeeland', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investering gericht op verduurzaming, dierenwelzijn of groene/blauwe infrastructuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale investering €10.000 (Zeeland: €15.000)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Jonge boeren (<40 jaar) ontvangen hogere vergoeding en mogen vaker aanvragen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'In Zeeland: alleen individuele agrariërs (geen coöperaties)', 'handmatig', true);
  END IF;
  -- Rabo Carbon Bank — Koolstofcredits voor Agrariërs
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'rabobank-rabo-carbon-bank', 'nationaal', 'Rabo Carbon Bank — Koolstofcredits voor Agrariërs', 'Rabobank / Rabo Carbon Bank', 'De Rabo Carbon Bank is een marktgebaseerd instrument, geen overheidssubsidie. Vergoeding is afhankelijk van koolstofmarktprijs en geverifieerde opslag. Veelbelovende maatregelen: peilverhoging veenweide (CO2-uitstoot vermindering), bosaanleg, vanggewassen, composttoediening. Combineerbaar met ANLb en SNL mits geen dubbele vergoeding voor zelfde oppervlak.',
    'https://www.rabobank.nl/carbon-bank', ARRAY['landbouw', 'natuur', 'energie'], ARRAY['carbon-credits', 'CO2-opslag', 'koolstof', 'regeneratieve-landbouw', 'veenweide', 'bosaanleg', 'Rabobank'], ARRAY['agrariërs', 'veehouders', 'akkerbouwers', 'terreinbeheerders', 'landgoedeigenaren'], ARRAY['landbouw', 'natuur', 'energie'], NULL,
    '€20–60 per ton CO2-equivalent opgeslagen. Typisch agrarisch bedrijf: 50–200 ton CO2/jaar; vergoeding €1.000–10.000/jaar', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Agrarisch bedrijf of terreinbeheerder in Nederland', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Maatregelen die CO2 opslaan of uitstoot reduceren: regeneratieve landbouw, bosaanleg, veenoxidatiereductie', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Additioneel: maatregel zou zonder carbonvergoeding niet worden genomen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Meting en verificatie via erkende methodologie (bijv. ISO 14064, Gold Standard)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Contract voor minimale looptijd', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen dubbele creditering voor zelfde maatregel', 'handmatig', true);
  END IF;
  -- Subsidie Bosaanleg en Bosbeheer (RVO)
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'rvo-bos-hout', 'nationaal', 'Subsidie Bosaanleg en Bosbeheer (RVO)', 'RVO / provincies', 'Nederland heeft de ambitie om 37.000 ha nieuw bos aan te leggen tot 2030. Subsidie voor bosaanleg is onderdeel van het Bossenstrategie-beleid. Aanvraag loopt via provinciale openstellingen (wisselend). Na aanleg komen percelen ook in aanmerking voor SNL-bosbeheer. Let op: bij bosaanleg op landbouwgrond vervalt betalingsrecht GLB.',
    'https://www.rvo.nl/onderwerpen/bos-en-houtopstanden', ARRAY['natuur', 'landschap'], ARRAY['bosaanleg', 'bosbeheer', 'hout', 'CO2-opslag', 'biodiversiteit', 'inheemse-soorten', 'klimaatbos'], ARRAY['landgoedeigenaren', 'rentmeesters', 'terreinbeheerders', 'gemeenten', 'agrariërs'], ARRAY['natuur', 'landschap'], NULL,
    'Bosaanleg: €1.000–3.000 per ha (afhankelijk van regio en boomsoortenmix). Bosbeheer (extra maatregelen): ca. €200–800/ha/jaar aanvullend op SNL', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanleg van nieuw bos op voormalige landbouwgrond of andere niet-boslocaties', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte 0,5 ha aaneengesloten', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Gebruik van inheemse boomsoorten (minimaal 80% van aanplant)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheerplan opstellen voor de gehele looptijd', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bos blijft minimaal 12 jaar in stand', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen aanleg op percelen met hoge landbouwwaarde (kleigrond type 1) — tenzij strategisch', 'handmatig', true);
  END IF;
  -- Subsidie Verbetering Waterkwaliteit Overijssel
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sbv-overijssel', 'provinciaal', 'Subsidie Verbetering Waterkwaliteit Overijssel', 'Provincie Overijssel / Waterschap Drents Overijsselse Delta / Waterschap Vechtstromen', 'Gericht op KRW-doelen voor Overijsselse beken en het IJsselmeer-systeem. Maatregelen: oeverbuffers, fosfaatverwijdering, hermeandering beken, aanleg natte bufferzones. Combinatie met ANLb natte dooradering veelvoorkomend. Raadpleeg provincie Overijssel en lokale waterschappen voor actuele openstellingen.',
    'https://www.overijssel.nl/subsidies/natuur-water', ARRAY['water', 'natuur', 'landbouw'], ARRAY['waterkwaliteit', 'KRW', 'Overijssel', 'beekdalen', 'oeverbeheer', 'nutriënten', 'fosfaat'], ARRAY['agrariërs', 'terreinbeheerders', 'gemeenten', 'waterschappen'], ARRAY['water', 'natuur', 'landbouw'], NULL,
    '50–80% van de subsidiabele kosten. Typische projectomvang: €10.000–200.000', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Project draagt bij aan KRW-waterkwaliteitsdoelen in Overijssel', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Locatie in of nabij een KRW-waterlichaam in Overijssel', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Projectplan met milieuparagraaf indienen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Samenwerking met waterschap vereist', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheer en monitoring voor minimaal 6 jaar', 'handmatig', true);
  END IF;
  -- SDE++ Stimulering Duurzame Energieproductie en Klimaattransitie
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sde-plus-plus', 'nationaal', 'SDE++ Stimulering Duurzame Energieproductie en Klimaattransitie', 'RVO', 'Meerdere openstellingsronden per jaar (voorjaar en najaar). Aanvragen worden in fasen behandeld: goedkoopste categorieën eerst. Zon PV op agrarisch dak is veelgevraagde categorie. Let op: SDE++ is een productiestimulans, geen investeringssubsidie. Combinatie met postcoderoos / saldering niet mogelijk voor zelfde kWh.',
    'https://www.rvo.nl/onderwerpen/sde', ARRAY['energie', 'landbouw'], ARRAY['SDE++', 'zonnepanelen', 'wind', 'biomassa', 'duurzame-energie', 'onrendabele-top', 'energie-opwek'], ARRAY['agrariërs', 'bedrijven', 'energiecoöperaties', 'landgoedeigenaren', 'projectontwikkelaars'], ARRAY['energie', 'landbouw'], NULL,
    'Subsidie op onrendabele top: verschil tussen basisbedrag (kostprijs duurzame energie) en correctiebedrag (marktprijs). Voor zon-PV: ca. €0,04–0,09 per kWh (afhankelijk van categorie en ronde)', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Installatie levert duurzame energie (zon, wind, biomassa, geothermie, waterstof, warmte)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Nettaansluiting aanwezig of aangevraagd', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Vergunningen aanwezig of aantoonbaar aangevraagd', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Realisatietermijn: 3–4 jaar na beschikking', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale projectomvang: doorgaans >15 kWp (zon PV categorie 3+)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen andere exploitatiesubsidie voor dezelfde kWh', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via mijn.rvo.nl — categorie en technologie kiezen', 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Drenthe
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-drenthe', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Drenthe', 'BIJ12 namens Provincie Drenthe', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'drenthe'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Drenthe',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Drenthe', 'provincie', 'is', 'Drenthe', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Flevoland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-flevoland', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Flevoland', 'BIJ12 namens Provincie Flevoland', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'flevoland'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Flevoland',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Flevoland', 'provincie', 'is', 'Flevoland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Fryslân
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-friesland', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Fryslân', 'BIJ12 namens Provincie Fryslân', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'friesland'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Fryslân',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Fryslân', 'provincie', 'is', 'Fryslân', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Gelderland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-gelderland', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Gelderland', 'BIJ12 namens Provincie Gelderland', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'gelderland'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Gelderland',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Gelderland', 'provincie', 'is', 'Gelderland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Groningen
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-groningen', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Groningen', 'BIJ12 namens Provincie Groningen', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'groningen'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Groningen',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Groningen', 'provincie', 'is', 'Groningen', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-kwaliteitsimpuls', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap', 'BIJ12 / provincies', 'Openstellingsperiode varieert per provincie. Sommige provincies stellen jaarlijks open, andere tweejaarlijks. Raadpleeg provinciale subsidieportalen voor exacte openstellingen. SKNL bestaat uit twee onderdelen: Functieverandering (landbouw→natuur) en Kwaliteitsverbetering (bestaande natuur opwaarderen). Beide zijn aan SNL gekoppeld.',
    'https://www.bij12.nl/onderwerp/natuursubsidies/sknl/', ARRAY['natuur', 'landschap', 'water'], ARRAY['SKNL', 'functieverandering', 'natuur', 'NNN', 'Natura2000', 'inrichting', 'kwaliteitsverbetering'], ARRAY['terreinbeheerders', 'landgoedeigenaren', 'rentmeesters', 'agrariërs', 'natuurorganisaties'], ARRAY['natuur', 'landschap', 'water'], NULL,
    '70% van de goedgekeurde investeringskosten; voor functieverandering landbouw→natuur tevens inrichtingssubsidie', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet (deels) begrensd zijn in het Natuur Netwerk Nederland (NNN) of Natura 2000', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Functieverandering landbouw naar natuur OF kwaliteitsverbetering bestaand beheerde natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'SNL-beheerovereenkomst vereist als vervolg op inrichtingssubsidie', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Investeringsplan indienen met kostenraming (erkend adviesbureau aanbevolen)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale investeringsdrempel: doorgaans €10.000', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen dubbele subsidiëring met andere investeringsregelingen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Grondeigenaar of langdurig pachter (>6 jaar resterende looptijd)', 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Limburg
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-limburg', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Limburg', 'BIJ12 namens Provincie Limburg', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'limburg'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Limburg',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Limburg', 'provincie', 'is', 'Limburg', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Noord-Brabant
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-noord-brabant', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Noord-Brabant', 'BIJ12 namens Provincie Noord-Brabant', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'noord-brabant'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Noord-Brabant',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Noord-Brabant', 'provincie', 'is', 'Noord-Brabant', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Noord-Holland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-noord-holland', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Noord-Holland', 'BIJ12 namens Provincie Noord-Holland', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'noord-holland'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Noord-Holland',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Noord-Holland', 'provincie', 'is', 'Noord-Holland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Overijssel
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-overijssel', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Overijssel', 'BIJ12 namens Provincie Overijssel', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'overijssel'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Overijssel',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Overijssel', 'provincie', 'is', 'Overijssel', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Utrecht
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-utrecht', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Utrecht', 'BIJ12 namens Provincie Utrecht', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'utrecht'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Utrecht',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Utrecht', 'provincie', 'is', 'Utrecht', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Zeeland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-zeeland', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Zeeland', 'BIJ12 namens Provincie Zeeland', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'zeeland'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Zeeland',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Zeeland', 'provincie', 'is', 'Zeeland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Zuid-Holland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'sknl-zuid-holland', 'provinciaal', 'SKNL Subsidie Kwaliteitsimpuls Natuur en Landschap Zuid-Holland', 'BIJ12 namens Provincie Zuid-Holland', 'Openstellingsmoment per provincie verschilt sterk. Check provinciaal subsidieloket. Combineerbaar met SNL na omvorming.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-kwaliteitsimpuls-natuur-en-landschap/', ARRAY['natuur', 'landschap'], ARRAY['SKNL', 'kwaliteitsimpuls', 'natuur', 'investeringssubsidie', 'functieverandering', 'zuid-holland'], ARRAY['rentmeesters', 'landgoedeigenaren', 'terreinbeheerders'], ARRAY['natuur', 'landschap'], 'Zuid-Holland',
    '70% van de investeringskosten voor omvorming naar natuur', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel gelegen in NNN of provinciale ecologische structuur', 'ligt_in_nnn', 'is', 'ja', 'eis', 10, 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of erfpacht vereist (geen reguliere pacht)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aantoonbare investeringen in omvorming naar natuur', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel begrensd voor functieverandering in Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Zuid-Holland', 'provincie', 'is', 'Zuid-Holland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Drenthe
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-drenthe', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Drenthe', 'BIJ12 namens Provincie Drenthe', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Drenthe kent kenmerkende heidevelden, esdorpen met essen, hoogveenrestanten en beekdalen die prioriteit hebben in het Natuurbeheerplan.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-drenthe/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'drenthe'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Drenthe',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Drenthe', 'provincie', 'is', 'Drenthe', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Flevoland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-flevoland', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Flevoland', 'BIJ12 namens Provincie Flevoland', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Flevoland is een jonge provincie (polder) met bijzondere natuur: Oostvaardersplassen (Natura 2000), Marker Wadden en akkervogelgebieden. Klein SNL-areaal vergeleken met andere provincies.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-flevoland/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'flevoland'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Flevoland',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Flevoland', 'provincie', 'is', 'Flevoland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Fryslân
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-friesland', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Fryslân', 'BIJ12 namens Provincie Fryslân', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Friesland heeft de grootste weidevogelaantallen van Nederland; combinatie SNL + ANLb-collectief veelvoorkomend.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-friesland/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'friesland'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Fryslân',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Fryslân', 'provincie', 'is', 'Fryslân', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Gelderland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-gelderland', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Gelderland', 'BIJ12 namens Provincie Gelderland', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Gelderland is de provincie met het grootste SNL-areaal in Nederland. Belangrijke gebieden: Veluwe (bos/heide), rivierengebied (uiterwaarden), Achterhoek (landgoederen, houtwallen).',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-gelderland/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'gelderland'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Gelderland',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Gelderland', 'provincie', 'is', 'Gelderland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Groningen
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-groningen', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Groningen', 'BIJ12 namens Provincie Groningen', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Groningen kent unieke kustgebieden (kwelders, Waddenzee), weidevogelgebieden in het kleigebied en laagveenrestanten in het westelijk deel.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-groningen/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'groningen'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Groningen',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Groningen', 'provincie', 'is', 'Groningen', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Limburg
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-limburg', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Limburg', 'BIJ12 namens Provincie Limburg', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Limburg heeft unieke landschapstypen: hellinggraslanden in Zuid-Limburg (mergelland), beekdalen en loofbossen. Kalkgraslanden zijn zeldzaam en prioritair.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-limburg/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'limburg'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Limburg',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Limburg', 'provincie', 'is', 'Limburg', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Noord-Brabant
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-noord-brabant', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Noord-Brabant', 'BIJ12 namens Provincie Noord-Brabant', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Noord-Brabant heeft hoge stikstofproblematiek; herstelbeheer in droge heide en beekdalen heeft prioriteit. De Kempen en Peelgebied zijn kerngebieden.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-noord-brabant/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'noord-brabant'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Noord-Brabant',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Noord-Brabant', 'provincie', 'is', 'Noord-Brabant', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Noord-Holland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-noord-holland', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Noord-Holland', 'BIJ12 namens Provincie Noord-Holland', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Noord-Holland kent specifieke leefgebieden voor weidevogels (veenweide), duinen en laagveenmoerassen.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-noord-holland/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'noord-holland'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Noord-Holland',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Noord-Holland', 'provincie', 'is', 'Noord-Holland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Overijssel
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-overijssel', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Overijssel', 'BIJ12 namens Provincie Overijssel', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Overijssel kent typische Saksische landschappen: essen, houtwallen, beekdalen en landgoederen (Salland, Twente).',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-overijssel/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'overijssel'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Overijssel',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Overijssel', 'provincie', 'is', 'Overijssel', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Utrecht
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-utrecht', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Utrecht', 'BIJ12 namens Provincie Utrecht', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Utrecht kent diverse landschapstypen: Utrechtse Heuvelrug (bos/heide), veenweidepolder (weidevogels), rivierengebied en plassengebied.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-utrecht/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'utrecht'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Utrecht',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Utrecht', 'provincie', 'is', 'Utrecht', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Zeeland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-zeeland', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Zeeland', 'BIJ12 namens Provincie Zeeland', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Zeeland heeft uniek kustlandschap: schorren, zilte graslanden, duinen en kreekgebieden. Akkervogelbeheer op Zeeuwse klei is relevant.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-zeeland/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'zeeland'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Zeeland',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Zeeland', 'provincie', 'is', 'Zeeland', 'eis', 10, 'handmatig', true);
  END IF;
  -- SNL Natuur- en Landschapsbeheer Zuid-Holland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
    , openstelling_van
    , openstelling_tot
  ) VALUES (
    _bron_id, 'snl-zuid-holland', 'provinciaal', 'SNL Natuur- en Landschapsbeheer Zuid-Holland', 'BIJ12 namens Provincie Zuid-Holland', 'Openstellingsperiode varieert per provincie. Raadpleeg BIJ12 voor actuele tarieven en openstellingen. Zuid-Holland kent specifieke aandacht voor veenweidebeheer, rietbeheer in laagveenmoerassen en rivierkleigebieden; het Groene Hart is een prioriteitsgebied.',
    'https://www.bij12.nl/onderwerp/natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer/subsidie-natuur-en-landschapsbeheer-zuid-holland/', ARRAY['natuur', 'landschap'], ARRAY['SNL', 'natuur', 'beheer', 'provincaal', 'zuid-holland'], ARRAY['rentmeesters', 'terreinbeheerders', 'landgoedeigenaren', 'particuliere natuurbeheerders'], ARRAY['natuur', 'landschap'], 'Zuid-Holland',
    '84% van de standaardkostprijs per beheertype (€200–1800/ha/jaar)', 'handmatig', true
    , '2026-11-15'
    , '2026-12-31'
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel moet begrensd zijn in het Provinciale Natuurbeheerplan', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Certificaat natuurbeheer vereist (ANb)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Minimale oppervlakte: 0,1 ha per beheertype', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of langdurige pacht (≥6 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, veld, operator, waarde, soort, gewicht, herkomst, geaccordeerd) VALUES (_regeling_id, 'Regeling is specifiek voor provincie Zuid-Holland', 'provincie', 'is', 'Zuid-Holland', 'eis', 10, 'handmatig', true);
  END IF;
  -- Subsidie Faunabeheer — Tegemoetkoming Wildschade en Faunabeheer
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'subsidie-jacht-wildbeheer', 'provinciaal', 'Subsidie Faunabeheer — Tegemoetkoming Wildschade en Faunabeheer', 'Provincies / Faunabeheereenheid (FBE)', 'Tegemoetkoming wildschade wordt geregeld via BIJ12 (uitvoeringsorganisatie van de provincies). Schade door beschermde soorten (kolganzen, grauwe ganzen, reeën) komt voor vergoeding in aanmerking. Schade door niet-beschermde soorten valt buiten de regeling. Provincies stellen jaarlijks de ganzenpolders vast waar ganzenbeheer is toegestaan.',
    'https://www.bij12.nl/onderwerp/faunaschade/', ARRAY['landbouw', 'natuur'], ARRAY['faunabeheer', 'wildschade', 'ganzen', 'reeën', 'everzwijn', 'BIJ12', 'tegemoetkoming'], ARRAY['agrariërs', 'rentmeesters', 'grondeigenaren', 'jachthouders', 'terreinbeheerders'], ARRAY['landbouw', 'natuur'], NULL,
    'Tegemoetkoming wildschade: 65–100% van de taxatiewaarde van de schade. Faunabeheerkosten: vergoeding per uur of per actie afhankelijk van provincie', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Schade veroorzaakt door beschermde diersoorten (ganzen, reeën, everzwijnen, bevers, etc.)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Schade gemeld bij BIJ12/provincie binnen gestelde termijn (doorgaans 48 uur)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Preventieve maatregelen aantoonbaar getroffen of onmogelijk gebleken', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Taxatie door erkend taxateur of BIJ12', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via BIJ12 of provinciaal loket', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Faunabeheerplan aanwezig (voor structurele schadebestrijding)', 'handmatig', true);
  END IF;
  -- SVNL Subsidieverlening Natuur en Landschap Friesland
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'svnl-friesland', 'provinciaal', 'SVNL Subsidieverlening Natuur en Landschap Friesland', 'Provincie Fryslân / BIJ12', 'SVNL Friesland is een aanvulling op de reguliere SNL voor specifiek Fries weidevogelbeheer. Friesland zet in op resultaatbeloning: hogere vergoeding bij bewezen nestsucces. Het Friese weidevogelgebied is van nationaal belang (grutto is nationaalvogel). Aanvraag via BIJ12 gelijktijdig met SNL-aanvraag.',
    'https://www.fryslan.frl/subsidies/natuur-en-landschap', ARRAY['natuur', 'landschap', 'water'], ARRAY['SVNL', 'Friesland', 'Fryslân', 'weidevogels', 'grutto', 'kemphaan', 'aanvullend-beheer'], ARRAY['terreinbeheerders', 'landgoedeigenaren', 'agrariërs', 'rentmeesters', 'collectieven'], ARRAY['natuur', 'landschap', 'water'], NULL,
    'Aanvullend op SNL: doorgaans 10–15% extra vergoeding voor Friese specifieke beheertypen en weidevogelbeheer intensief. Totaalvergoeding 84–100% van standaardkostprijs', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheerpercelen vallen reeds onder SNL Friesland', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvullend beheer voor specifieke Friese prioriteitssoorten (grutto, kemphaan)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag via BIJ12-portaal, gecombineerd met SNL-aanvraag', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheerplan met soortgerichte maatregelen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Resultaatmonitoring vereist (nestsucces weidevogels)', 'handmatig', true);
  END IF;
  -- VAB — Vrijkomende Agrarische Bebouwing herbestemming
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'vab-vrijkomende-agrarische-bebouwing', 'gemeentelijk', 'VAB — Vrijkomende Agrarische Bebouwing herbestemming', 'Gemeente + provincie (Rood voor Rood regelingen)', 'Sterk afhankelijk van gemeentelijk beleid. Sommige provincies hebben overkoepelend beleid (bijv. Rood voor Rood in Overijssel/Gelderland).',
    'https://www.rvo.nl/onderwerpen/agrarische-bebouwing/vrijkomende-agrarische-bebouwing', ARRAY['gebouwen', 'herbestemming', 'ruimtelijke ordening'], ARRAY['VAB', 'herbestemming', 'sloop', 'wonen', 'platteland', 'gemeente'], ARRAY['agrarisch ondernemers', 'rentmeesters', 'landgoedeigenaren'], ARRAY['gebouwen', 'herbestemming', 'ruimtelijke ordening'], NULL,
    'Afhankelijk van regeling: €10.000–100.000 of bouwrecht in ruil voor sloopmeters', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Vrijkomende of leegstaande agrarische bebouwing', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Gemeente met VAB/Rood-voor-Rood beleid', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Sloopverplichting van overtollige bebouwing', 'handmatig', true);
  END IF;
  -- Veenweidenprogramma — Peilverhoging en Extensivering Veengebieden
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'veenweiden-programma', 'nationaal', 'Veenweidenprogramma — Peilverhoging en Extensivering Veengebieden', 'Provincies (Noord-Holland, Zuid-Holland, Utrecht, Friesland, Groningen) / waterschappen', 'Het Veenweidenprogramma richt zich op vermindering van bodemdaling en CO2-uitstoot in veengebieden door peilverhoging. Dit is tevens gunstig voor weidevogels en waterkwaliteit. Vergoeding voor eigenaren/gebruikers die productieverlies lijden. Grote urgentie in West-Nederland vanwege bodemdaling en klimaatdoelen.',
    'https://www.veenweide.nl', ARRAY['landbouw', 'water', 'natuur'], ARRAY['veenweide', 'peilverhoging', 'CO2-reductie', 'weidevogels', 'bodemdaling', 'extensivering'], ARRAY['agrariërs', 'melkveehouders', 'veehouders', 'rentmeesters', 'terreinbeheerders'], ARRAY['landbouw', 'water', 'natuur'], NULL,
    'Peilverhoging: vergoeding gebruikswaardevermindering €500–2.000/ha/jaar. Extensivering: aanvullend €200–500/ha. Functieverandering: SKNL + grondverwerving via NPLG', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Perceel ligt in een veenweidegebied (aangewezen in Veenweidenprogramma per provincie)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Bereidheid tot peilverhoging (minimaal 20–40 cm)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Extensivering veehouderij als gevolg van hogere peilen', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Langdurige of permanente overeenkomst (>20 jaar)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen conflicterende drainage of bemaling op het perceel', 'handmatig', true);
  END IF;
  -- Waterschapssubsidies Oeverbeheer, Waterberging en Biodiversiteit
  INSERT INTO regeling (
    bron_id, extern_id, scope, naam, organisatie, samenvatting,
    bron_url, themas, trefwoorden, doelgroepen, sectoren, provincie,
    budget_indicatie, herkomst, geaccordeerd
  ) VALUES (
    _bron_id, 'waterschap-subsidies', 'gemeentelijk', 'Waterschapssubsidies Oeverbeheer, Waterberging en Biodiversiteit', 'Waterschappen (21 waterschappen in Nederland)', 'Elk van de 21 waterschappen heeft eigen subsidie- en vergoedingsprogramma''s. Belangrijke waterschappen voor landelijk gebied: Waterschap Drents Overijsselse Delta, Waterschap Rijn en IJssel (Achterhoek/Gelderse Vallei), Waterschap AGV (Noord-Holland), Waterschap Hollandse Delta. Altijd direct contact opnemen met het lokale waterschap voor actuele regelingen.',
    'https://www.uvw.nl', ARRAY['water', 'natuur', 'landbouw'], ARRAY['waterschap', 'oever', 'waterberging', 'biodiversiteit', 'sloot', 'KRW', 'waterkwaliteit'], ARRAY['agrariërs', 'terreinbeheerders', 'landgoedeigenaren', 'gemeenten', 'particulieren'], ARRAY['water', 'natuur', 'landbouw'], NULL,
    'Sterk wisselend per waterschap: beheervergoeding oevers ca. €0,50–2/m per jaar; investeringssubsidie oeverbeschoeiing verwijderen: €10–30/m. Totaalsubsidies project: €1.000–100.000', 'handmatig', true
  ) ON CONFLICT (bron_id, extern_id) DO NOTHING
  RETURNING id INTO _regeling_id;

  IF _regeling_id IS NOT NULL THEN
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Eigendom of beheer van percelen grenzend aan watergang beheerd door waterschap', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Maatregel past in het waterbeheerprogramma van het betreffende waterschap', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Geen harde beschoeiing meer na subsidie (vergroening oever)', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Beheerovereenkomst voor minimale periode', 'handmatig', true);
    INSERT INTO regeling_criterium (regeling_id, omschrijving, herkomst, geaccordeerd) VALUES (_regeling_id, 'Aanvraag bij het lokaal bevoegd waterschap', 'handmatig', true);
  END IF;

END $$;
