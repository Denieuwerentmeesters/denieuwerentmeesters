-- landgoed kon alleen door admin geUPDATE worden (policy 'landgoed beheren' = is_admin()).
-- Daardoor sloeg de basislocatie van een eigenaar stil niet op. Eigenaar/rentmeester
-- mogen hun eigen landgoed bijwerken.
create policy "landgoed bijwerken" on landgoed for update
  using (rol_op(id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(id) in ('eigenaar','rentmeester') or is_admin());
