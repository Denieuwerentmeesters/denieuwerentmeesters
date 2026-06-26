-- Voeg 'contact' toe als geldig type in inbound_extractie
alter table inbound_extractie
  drop constraint if exists inbound_extractie_type_check;

alter table inbound_extractie
  add constraint inbound_extractie_type_check
  check (type in ('taak','agendapunt','documentintake','informatie','contact'));
