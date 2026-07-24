-- Migration: Fix Critical RLS Policies
-- This migration fixes overly permissive RLS policies that allowed
-- any user to modify activation_keys and online_payments.

-- ============================================================================
-- 1. Fix activation_keys UPDATE policy
-- Problem: USING (TRUE) allowed ANY user to modify ANY activation key
-- Solution: Restrict to admin/owner only
-- ============================================================================

-- Drop ALL historical activation_keys UPDATE policies (including the live one from migration 020)
DROP POLICY IF EXISTS "Update activation keys" ON public.activation_keys;
DROP POLICY IF EXISTS "Allow key updates for activation" ON public.activation_keys;
DROP POLICY IF EXISTS "Allow activation key updates" ON public.activation_keys;

-- Create a restrictive policy that only allows admin/owner to update
CREATE POLICY "Admin activation key updates"
  ON public.activation_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT FROM public.users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT FROM public.users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 2. Fix online_payments UPDATE policy
-- Problem: USING (TRUE) allowed ANY user to modify ANY payment record
-- Solution: Restrict to admin/owner only (service role bypasses RLS anyway)
-- ============================================================================

-- Drop ALL historical online_payments UPDATE policies (including the live one from migration 029)
DROP POLICY IF EXISTS "Admins update payments" ON public.online_payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.online_payments;
DROP POLICY IF EXISTS "System can update payments" ON public.online_payments;

-- Create a restrictive policy that only allows admin/owner to update
CREATE POLICY "Admin payment updates"
  ON public.online_payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT FROM public.users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT FROM public.users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 3. Verify policies are correctly applied
-- ============================================================================

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'RLS policies fixed: activation_keys and online_payments UPDATE restricted to admin/owner';
END $$;
