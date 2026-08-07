-- ============================================================
-- Contacten uit AI-invoer (wens Steven, vervolg op issue #152)
-- Partijen uit een contract-pdf die nog niet als contact bestaan,
-- worden voortaan direct aangemaakt — maar gemarkeerd als AI-voorstel
-- dat de gebruiker bij Contacten bevestigt (huisregel: AI-uitvoer is
-- altijd een voorstel).
-- ============================================================

alter table relatie
  add column if not exists herkomst     text    not null default 'handmatig',
  add column if not exists geaccordeerd boolean not null default true;

alter table relatie drop constraint if exists relatie_herkomst_check;
alter table relatie add constraint relatie_herkomst_check
  check (herkomst in ('handmatig','ai'));
