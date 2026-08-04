-- Autorisatie-aanscherpingen (issue #9, reviewrapport §2d–2f).
--
-- 1) Catalogus-tabellen: de select-policies stonden op `using (true)` zonder
--    rolbeperking — daarmee kon in principe ook een anonieme sessie de
--    catalogus lezen. Nu expliciet alleen voor ingelogde gebruikers
--    (zelfde patroon als prompt_sjabloon in 0029). Inhoud ongewijzigd.

drop policy if exists "documenttype zien" on document_type;
create policy "documenttype zien" on document_type
  for select to authenticated using (true);

drop policy if exists "regeling zien" on regeling;
create policy "regeling zien" on regeling
  for select to authenticated using (true);

drop policy if exists "criterium zien" on regeling_criterium;
create policy "criterium zien" on regeling_criterium
  for select to authenticated using (true);

drop policy if exists "maatregel zien" on regeling_maatregel;
create policy "maatregel zien" on regeling_maatregel
  for select to authenticated using (true);

drop policy if exists "bewijs zien" on regeling_bewijs;
create policy "bewijs zien" on regeling_bewijs
  for select to authenticated using (true);

drop policy if exists "subsidie_bron zien" on subsidie_bron;
create policy "subsidie_bron zien" on subsidie_bron
  for select to authenticated using (true);

drop policy if exists "import_run zien" on subsidie_import_run;
create policy "import_run zien" on subsidie_import_run
  for select to authenticated using (true);

drop policy if exists "extractie_opzet lezen" on extractie_opzet;
create policy "extractie_opzet lezen" on extractie_opzet
  for select to authenticated using (true);

-- 2) intake_run: aanmaken/bijwerken stond open voor élk lid (dus ook rol
--    'kijker'). Gelijkgetrokken met de rest van de app: schrijven is voor
--    eigenaar/rentmeester; kijkers houden leesrecht.

drop policy if exists "intake_run aanmaken" on intake_run;
create policy "intake_run aanmaken" on intake_run
  for insert
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

drop policy if exists "intake_run bijwerken" on intake_run;
create policy "intake_run bijwerken" on intake_run
  for update
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
