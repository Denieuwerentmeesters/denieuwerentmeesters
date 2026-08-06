-- ============================================================
-- Fondsenradar — idempotentie voor de vereisten-destillatie
-- (lib/fondsen/vereisten.ts)
--
-- PROBLEEM. `regeling_matchprofiel` is één rij per fonds en kan zijn eigen
-- bron_hash dragen (0053). `regeling_bewijs` is meerdere rijen per fonds —
-- er is geen enkele rij om een hash op te hangen zonder een kunstgreep. De
-- hash hoort daarom bij het FONDS, niet bij een losse bewijsrij: op `regeling`.
--
-- ONTWERP, zelfde lijn als bronHash/beleidstekstHash in matchprofiel.ts:
--   * bewijs_bron_hash = hash over de gecombineerde beleidstekst(en) van dit
--     fonds + promptversie + model + schoonmaakversie (vereistenHash in
--     lib/fondsen/vereisten.ts). Ongewijzigd -> geen nieuwe modelaanroep.
--   * bewijs_bijgewerkt_op = wanneer de laatste destillatie voor dit fonds
--     daadwerkelijk (opnieuw) heeft geschreven.
-- Beide NULL = nog nooit gedestilleerd voor dit fonds.
--
-- Idempotent conform CLAUDE.md. NIET op live toegepast bij het schrijven.
-- ============================================================

alter table regeling add column if not exists bewijs_bron_hash text;
alter table regeling add column if not exists bewijs_bijgewerkt_op timestamptz;

comment on column regeling.bewijs_bron_hash is
  'Hash over de beleidstekst(en) van dit fonds plus promptversie, model en '
  'schoonmaakversie, gezet door lib/fondsen/vereisten.ts (vereistenHash). '
  'Ongewijzigd t.o.v. de vorige run = geen nieuwe modelaanroep voor de '
  'documentvereisten-destillatie (regeling_bewijs). NULL = nog niet '
  'gedestilleerd.';
comment on column regeling.bewijs_bijgewerkt_op is
  'Wanneer lib/fondsen/vereisten.ts voor het laatst daadwerkelijk nieuwe '
  'regeling_bewijs-rijen voor dit fonds heeft weggeschreven.';
