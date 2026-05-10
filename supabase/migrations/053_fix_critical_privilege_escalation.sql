-- ============================================================================
-- CRITICAL SECURITY FIX: Privilege Escalation via UPDATE RLS Policy
-- ============================================================================
-- INCIDENT: On May 9, 2026, an attacker created 5 "recon" accounts and
-- exploited a missing WITH_CHECK constraint on the users UPDATE policy to
-- self-escalate to admin role with lifetime subscriptions.
--
-- ROOT CAUSE: The live UPDATE policy had no WITH_CHECK, allowing any
-- authenticated user to change their own role, is_paid, subscription_expires_at.
--
-- FIX: Two-layer defense:
--   1. RLS WITH_CHECK locks sensitive columns for self-updates
--   2. Database trigger blocks role escalation as defense-in-depth
-- ============================================================================

-- Step 1: Drop the vulnerable policy
DROP POLICY IF EXISTS "Users can update own profile or be admin" ON public.users;

-- Step 2: Create safe self-update policy (users can only update non-sensitive fields)
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND is_paid = (SELECT is_paid FROM public.users WHERE id = auth.uid())
    AND is_reviewer = (SELECT is_reviewer FROM public.users WHERE id = auth.uid())
    AND is_test = (SELECT is_test FROM public.users WHERE id = auth.uid())
    AND subscription_expires_at IS NOT DISTINCT FROM (SELECT subscription_expires_at FROM public.users WHERE id = auth.uid())
  );

-- Step 3: Create admin update policy (admins can update anything)
CREATE POLICY "Admins can update users"
  ON public.users FOR UPDATE
  USING (is_admin_or_higher());

-- Step 4: Defense-in-depth trigger — block non-service-role from changing sensitive fields
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role (supabaseAdmin) bypasses this check (auth.uid() is NULL)
  IF auth.uid() IS NOT NULL THEN
    -- If user is changing their OWN record
    IF NEW.id = auth.uid() THEN
      -- Block changes to sensitive fields unless user is admin/owner
      IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role IN ('owner', 'admin')
      ) THEN
        -- Force sensitive fields to remain unchanged
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          RAISE EXCEPTION 'Permission denied: cannot change own role';
        END IF;
        IF NEW.is_paid IS DISTINCT FROM OLD.is_paid THEN
          RAISE EXCEPTION 'Permission denied: cannot change own payment status';
        END IF;
        IF NEW.is_reviewer IS DISTINCT FROM OLD.is_reviewer THEN
          RAISE EXCEPTION 'Permission denied: cannot change own reviewer status';
        END IF;
        IF NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
          RAISE EXCEPTION 'Permission denied: cannot change own subscription';
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.users;

-- Create the trigger
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();
