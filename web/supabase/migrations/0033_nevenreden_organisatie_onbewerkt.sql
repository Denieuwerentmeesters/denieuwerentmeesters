-- ============================================================
-- Subsidieradar — twee nevenredenen erbij: 'organisatie' en 'onbewerkt'
--
-- PROBLEEM. Na 0031 bleef "Mogelijke subsidies" voor Ter Hooge nog steeds een lijst
-- van ruim twintig regelingen op dezelfde basisscore. Twee groepen daarin zijn niet
-- te beoordelen door een landgoed dat geen stichting is:
--
--   (a) fondsen en regelingen die alleen open staan voor een stichting, vereniging of
--       terreinbeherende organisatie (Prins Bernhard Cultuurfonds, Postcode Loterij
--       Groenfonds, faunabeheer). doelgroep_type='organisatie' zei dat al, maar de
--       radar deed er niets mee.
--   (b) rauwe verordeningsteksten uit de CVDR/KOOP-import die nog niet zijn verrijkt:
--       geen categorie_ui, geen doelgroep_type. Daar valt inhoudelijk niets over te
--       zeggen, dus een uitgeschreven kansregel is er misleidend.
--
-- Beide horen niet tussen de kansen die je wél kunt uitschrijven, en beide mogen niet
-- verdwijnen: (a) wordt relevant zodra er een landgoedstichting is, en (b) is een
-- zichtbaar gat in de catalogus — juist die zichtbaarheid stuurt het verrijkingswerk.
--
-- ONTWERP. Dezelfde weg als 0031: geen extra kolom, alleen twee waarden erbij in de
-- bestaande check op subsidie.nevenreden. De matchmotor (bepaalNevenreden) kent de
-- rangorde; 'onbewerkt' staat bewust achteraan, zodat een onverrijkte tekst waarvan we
-- wél weten dat hij consortium-gebonden is nog altijd in 'te_groot' landt.
--
-- Geen data-update nodig: nevenreden wordt bij elke run van zoekKansen herberekend.
-- ============================================================

alter table subsidie
  drop constraint if exists subsidie_nevenreden_check;

alter table subsidie
  add constraint subsidie_nevenreden_check
    check (
      nevenreden is null
      or nevenreden in ('pachter', 'dubbel', 'te_groot', 'collectief', 'organisatie', 'onbewerkt')
    );

comment on column subsidie.nevenreden is
  'Waarom deze kans secundair is. null = primair. pachter = de pachter is de aanvrager, '
  'niet het landgoed. dubbel = lijkt op een subsidie die al loopt. te_groot = vraagt een '
  'consortium of een omvang buiten bereik. collectief = vereist lidmaatschap van een '
  'agrarisch collectief. organisatie = alleen voor een stichting/vereniging/TBO. '
  'onbewerkt = regeling nog niet verrijkt (geen thema, geen doelgroep), dus niet te '
  'beoordelen. Berekend door zoekKansen; ''dubbel'' kan de gebruiker ook zelf zetten.';
