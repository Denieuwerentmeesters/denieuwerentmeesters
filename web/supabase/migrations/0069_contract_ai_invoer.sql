-- Contracten-keten plak 4: AI-invoer uit een contractdocument (issue #152).
--
-- Een geüpload pachtcontract wordt door de AI gelezen en als concept-dossier
-- voorgesteld. Huisregel: AI-uitvoer is altijd een voorstel — het dossier
-- draagt daarom zijn herkomst, en de prijsregel uit het document gaat de
-- bestaande voorstel-flow van plak 2 in.
--
-- Idempotent: kolom via if-not-exists, constraints via drop-and-add.

alter table contract add column if not exists herkomst text not null default 'handmatig';
alter table contract drop constraint if exists contract_herkomst_check;
alter table contract add constraint contract_herkomst_check
  check (herkomst in ('handmatig','ai'));

-- Prijsafspraken kunnen nu ook uit een document komen.
alter table contract_prijsafspraak drop constraint if exists contract_prijsafspraak_herkomst_check;
alter table contract_prijsafspraak add constraint contract_prijsafspraak_herkomst_check
  check (herkomst in ('handmatig','indexatie','ai'));
