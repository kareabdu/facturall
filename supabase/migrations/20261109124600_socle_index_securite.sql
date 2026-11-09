-- =============================================================================
-- FacturAll — Corrections après les conseils (advisors) Supabase
-- =============================================================================

-- Index couvrant les clés étrangères (suppression en cascade, jointures)
create index if not exists entreprises_created_by_idx on public.entreprises (created_by);
create index if not exists invitations_invite_par_idx on public.invitations (invite_par);

-- Remplace l'index boutique_id seul par des index couvrant les clés composites
drop index if exists public.membres_boutiques_boutique_idx;
create index if not exists membres_boutiques_boutique_entreprise_idx
  on public.membres_boutiques (boutique_id, entreprise_id);
create index if not exists membres_boutiques_membre_entreprise_idx
  on public.membres_boutiques (membre_id, entreprise_id);

-- Fonction utilitaire créée par Supabase avec le projet : elle n'a pas à être
-- appelable par l'API (elle sert de trigger d'événement, qui n'exige pas ce droit).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- Note : creer_entreprise, inviter_membre et accepter_invitations restent
-- SECURITY DEFINER et appelables par les utilisateurs connectés, volontairement :
-- elles vérifient elles-mêmes auth.uid() et le rôle de l'appelant.
