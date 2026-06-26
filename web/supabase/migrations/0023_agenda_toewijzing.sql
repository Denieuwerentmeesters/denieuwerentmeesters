-- ============================================================
-- Agenda-item: toegewezen_aan toevoegen
-- ============================================================

alter table agenda_item
  add column if not exists toegewezen_aan uuid references profiel(id) on delete set null,
  add column if not exists omschrijving   text;
