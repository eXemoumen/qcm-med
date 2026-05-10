-- ============================================================
-- Migration 054: Fix Supabase Security Advisor Warnings
-- Date: 2026-05-10
-- Fixes:
--   1. function_search_path_mutable (all SECURITY DEFINER functions)
--   2. public_bucket_allows_listing (question-images)
--   3. anon_security_definer_function_executable (revoke anon EXECUTE)
--   4. authenticated_security_definer_function_executable (admin/trigger functions)
-- NOTE: auth_leaked_password_protection must be enabled via Supabase Dashboard
--       → Authentication → Settings → Enable "Leaked Password Protection"
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: Fix mutable search_path on ALL SECURITY DEFINER functions
-- Prevents search_path hijacking attacks
-- ============================================================

-- Role-checking helpers (used in RLS policies)
ALTER FUNCTION public.is_owner() SET search_path = public;
ALTER FUNCTION public.is_admin_or_higher() SET search_path = public;
ALTER FUNCTION public.is_manager_or_higher() SET search_path = public;
ALTER FUNCTION public.is_paid_user() SET search_path = public;

-- Trigger functions
ALTER FUNCTION public.prevent_role_escalation() SET search_path = public;
ALTER FUNCTION public.enforce_max_devices() SET search_path = public;
ALTER FUNCTION public.cascade_course_rename() SET search_path = public;
ALTER FUNCTION public.update_session_on_message() SET search_path = public;

-- User-facing functions
ALTER FUNCTION public.create_user_profile(uuid, text, text, text, text, text, text) SET search_path = public;
ALTER FUNCTION public.activate_subscription(uuid, text, boolean) SET search_path = public;
ALTER FUNCTION public.validate_activation_key(text) SET search_path = public;
ALTER FUNCTION public.has_active_subscription(uuid) SET search_path = public;
ALTER FUNCTION public.rollback_failed_registration(uuid) SET search_path = public;

-- Payment functions
ALTER FUNCTION public.process_successful_payment(text, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.create_payment_record(
  text, text, text, text, integer, text, integer, text, text, text, jsonb
) SET search_path = public;

-- Admin functions
ALTER FUNCTION public.delete_plan_safe(uuid) SET search_path = public;
ALTER FUNCTION public.toggle_plan_active(uuid) SET search_path = public;
ALTER FUNCTION public.get_admin_contribution_details(
  uuid, timestamp without time zone, timestamp without time zone
) SET search_path = public;
ALTER FUNCTION public.get_admin_contributions_by_period(
  timestamp without time zone, timestamp without time zone
) SET search_path = public;
ALTER FUNCTION public.get_admin_payable_stats() SET search_path = public;

-- Content-browsing functions
ALTER FUNCTION public.get_all_cours_counts() SET search_path = public;
ALTER FUNCTION public.get_all_module_question_counts() SET search_path = public;
ALTER FUNCTION public.get_cours_with_counts(text) SET search_path = public;
ALTER FUNCTION public.get_exam_types_with_counts(text, year_level) SET search_path = public;
ALTER FUNCTION public.get_module_details(uuid) SET search_path = public;
ALTER FUNCTION public.get_modules_with_question_counts(year_level) SET search_path = public;

-- RAG/AI function (needs extensions schema for vector type)
ALTER FUNCTION public.search_knowledge_base(
  vector, double precision, integer, text
) SET search_path = public, extensions;


-- ============================================================
-- PART 2: TRIGGER FUNCTIONS — Revoke EXECUTE from everyone
-- These are invoked by triggers (runs as table owner), never via RPC
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_max_devices() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cascade_course_rename() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_session_on_message() FROM PUBLIC;


-- ============================================================
-- PART 3: ADMIN-ONLY FUNCTIONS — Revoke from PUBLIC
-- Called only from db-interface via SERVICE_ROLE_KEY (bypasses perms)
-- ============================================================

-- 🔴 CRITICAL: process_successful_payment callable by anon = free subscriptions!
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_plan_safe(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_plan_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_contribution_details(
  uuid, timestamp without time zone, timestamp without time zone
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_contributions_by_period(
  timestamp without time zone, timestamp without time zone
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_payable_stats() FROM PUBLIC;


-- ============================================================
-- PART 4: USER/CONTENT FUNCTIONS — Revoke from anon, keep authenticated
-- App requires login; anon should never call these
-- ============================================================

-- Revoke from PUBLIC (removes it from anon and everyone else)
REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_higher() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_higher() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_paid_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_user_profile(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_activation_key(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollback_failed_registration(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_payment_record(
  text, text, text, text, integer, text, integer, text, text, text, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_cours_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_module_question_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cours_with_counts(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_exam_types_with_counts(text, year_level) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_module_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_modules_with_question_counts(year_level) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_knowledge_base(
  vector, double precision, integer, text
) FROM PUBLIC;

-- Explicitly grant to authenticated so logged-in users can use them
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_higher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_higher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_paid_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_activation_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_failed_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_record(
  text, text, text, text, integer, text, integer, text, text, text, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_cours_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_module_question_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cours_with_counts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_types_with_counts(text, year_level) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_module_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_modules_with_question_counts(year_level) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_base(
  vector, double precision, integer, text
) TO authenticated;


-- ============================================================
-- PART 5: Fix public bucket listing on question-images
-- Public URL access still works; this only blocks file enumeration
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'question-images';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Authenticated users can access question images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'question-images');

COMMIT;
