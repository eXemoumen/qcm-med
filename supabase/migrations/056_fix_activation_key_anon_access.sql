-- ============================================================
-- Migration 056: Fix registration flow — grant anon access
-- Date: 2026-05-11
-- Bug: Migration 054 revoked EXECUTE from PUBLIC on all user-facing
--      functions and only granted to 'authenticated'. But the entire
--      registration flow runs BEFORE email confirmation, so the
--      Supabase client uses the 'anon' role for:
--        1. validate_activation_key  (Step 0: pre-check)
--        2. create_user_profile      (Step 2: after auth.signUp)
--        3. activate_subscription    (Step 3: activate key)
--        4. rollback_failed_registration (error cleanup)
--      All four failed with "permission denied", surfacing as:
--        "Impossible de vérifier le code. Veuillez réessayer."
--        "permission denied for function create_user_profile"
-- Fix: Grant EXECUTE to 'anon' for registration-path functions.
--      All are SECURITY DEFINER with locked search_path (from 054),
--      so they run as postgres regardless — anon only enables invocation.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.validate_activation_key(text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile(uuid, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.rollback_failed_registration(uuid) TO anon;
