-- Vastleggen wie een uitgave boven het drempelbedrag heeft geaccordeerd.
--
-- Tot nu toe werd het akkoord alleen als notitie in de tijdlijn gezet. Dat is
-- prima als spoor, maar niet als feit: je kunt er niet op filteren, en op het
-- overzicht bovenaan de melding was niet te zien wie had goedgekeurd — juist
-- de vraag die bij geld als eerste gesteld wordt.

alter table werkorder add column if not exists akkoord_door uuid references profiel(id);
alter table werkorder add column if not exists akkoord_op timestamptz;
