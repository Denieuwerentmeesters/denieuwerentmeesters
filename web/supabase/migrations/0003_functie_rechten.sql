-- ============================================================
-- Fase 0: rechten op SECURITY DEFINER-functies aanscherpen
-- (n.a.v. Supabase security-advisor 0028/0029)
--
-- - anon (niet-ingelogd) mag NIETS van deze functies aanroepen.
-- - authenticated houdt EXECUTE op de RLS-helpers (is_admin/
--   is_lid_van/rol_op): RLS-policies evalueren als de ingelogde
--   rol en moeten ze kunnen aanroepen. Ze lekken niets — ze
--   geven alleen info over de aanroeper zelf (auth.uid()).
-- - landgoed_aanmaken blijft authenticated-aanroepbaar (de app
--   roept hem via rpc aan).
-- - handle_nieuwe_gebruiker is een trigger; niemand roept hem
--   direct aan. EXECUTE volledig intrekken.
--
-- Verdere hardening (later): helpers naar een niet-geëxposeerd
-- `private` schema verplaatsen, dan vervalt ook advisor 0029.
-- ============================================================

revoke execute on function public.is_admin()            from anon, public;
revoke execute on function public.is_lid_van(uuid)       from anon, public;
revoke execute on function public.rol_op(uuid)           from anon, public;
revoke execute on function public.landgoed_aanmaken(text) from anon, public;
revoke execute on function public.handle_nieuwe_gebruiker() from anon, authenticated, public;

grant execute on function public.is_admin()            to authenticated;
grant execute on function public.is_lid_van(uuid)       to authenticated;
grant execute on function public.rol_op(uuid)           to authenticated;
grant execute on function public.landgoed_aanmaken(text) to authenticated;
