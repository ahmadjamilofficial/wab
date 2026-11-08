-- First-login provisioning uses ON CONFLICT (user_id) when creating a profile.
-- The profiles table previously only had a primary key on id, so PostgreSQL
-- rejected that conflict target for every brand-new account.
--
-- A user has exactly one active workspace profile in Wab's current data model.
-- Fail safely if legacy duplicate rows exist rather than silently deleting or
-- reassigning any organisation membership.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add profiles.user_id uniqueness: duplicate profiles exist. Review duplicate rows in public.profiles before applying this migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key
  ON public.profiles (user_id);
