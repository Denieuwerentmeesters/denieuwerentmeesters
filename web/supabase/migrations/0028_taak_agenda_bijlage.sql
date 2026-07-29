-- Bijlage + toegewezen_aan_naam voor taak en agenda_item
alter table taak
  add column if not exists bijlage_pad  text,
  add column if not exists bijlage_naam text,
  add column if not exists toegewezen_aan_naam text;

alter table agenda_item
  add column if not exists bijlage_pad  text,
  add column if not exists bijlage_naam text,
  add column if not exists toegewezen_aan_naam text;
