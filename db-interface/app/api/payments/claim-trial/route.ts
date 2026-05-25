/**
 * Claim Free Trial API
 * 
 * Generates an activation code for a free trial plan without going
 * through the Chargily payment gateway.
 * 
 * SECURITY:
 * - Rate limited per email and IP
 * - Validates plan exists and is a free trial
 * - Prevents duplicate claims (one trial per email)
 * - Blocks users who already have a registered account
 * - Uses cryptographically secure random for activation codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  generateSecureActivationCode,
  isRateLimited,
  getSecurityHeaders,
  RATE_LIMITS,
} from '@/lib/security/payment-security';
import { getActiveFreeTrialPlan } from '@/lib/subscription-plans';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Rate limit constants for free trials (stricter than paid checkout)
const TRIAL_RATE_LIMITS = {
  PER_EMAIL: { maxRequests: 5, windowMs: 60 * 60 * 1000 },    // 5/hour per email
  PER_IP: { maxRequests: 30, windowMs: 60 * 60 * 1000 },       // 30/hour per IP
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerEmail, customerName, customerPhone, planId, userId } = body;

    // ========================================================================
    // 1. Validate inputs
    // ========================================================================
    if (!customerEmail || typeof customerEmail !== 'string') {
      return NextResponse.json(
        { error: 'Email est requis' },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    const email = customerEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Format d\'email invalide' },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    // ========================================================================
    // 2. Rate limiting
    // ========================================================================
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (isRateLimited(`trial-email:${email}`, TRIAL_RATE_LIMITS.PER_EMAIL.maxRequests, TRIAL_RATE_LIMITS.PER_EMAIL.windowMs)) {
      return NextResponse.json(
        { error: 'Trop de demandes. Veuillez réessayer plus tard.' },
        { status: 429, headers: getSecurityHeaders() }
      );
    }

    if (isRateLimited(`trial-ip:${ip}`, TRIAL_RATE_LIMITS.PER_IP.maxRequests, TRIAL_RATE_LIMITS.PER_IP.windowMs)) {
      return NextResponse.json(
        { error: 'Trop de demandes depuis cette adresse. Veuillez réessayer plus tard.' },
        { status: 429, headers: getSecurityHeaders() }
      );
    }

    // ========================================================================
    // 3. Verify the plan exists and is a free trial
    // ========================================================================
    const trialPlan = await getActiveFreeTrialPlan();

    if (!trialPlan) {
      return NextResponse.json(
        { error: 'Aucune offre d\'essai gratuit n\'est disponible actuellement.' },
        { status: 404, headers: getSecurityHeaders() }
      );
    }

    // If planId was provided, verify it matches the active trial plan
    if (planId && planId !== trialPlan.id) {
      return NextResponse.json(
        { error: 'Offre d\'essai invalide.' },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    // ========================================================================
    // 4. Abuse check #1: Has this email already claimed a free trial?
    // ========================================================================
    const { data: existingTrial } = await supabaseAdmin
      .from('online_payments')
      .select('id')
      .eq('customer_email', email)
      .eq('status', 'paid')
      .not('metadata', 'is', null)
      .limit(10);

    // Check if any of the returned payments have is_free_trial in metadata
    if (existingTrial && existingTrial.length > 0) {
      // Need to re-query with metadata filter (Supabase doesn't support JSONB contains in .eq easily)
      const { data: trialPayments } = await supabaseAdmin
        .from('online_payments')
        .select('id, metadata')
        .eq('customer_email', email)
        .eq('status', 'paid');

      const hasExistingTrial = trialPayments?.some(
        (p: any) => p.metadata?.is_free_trial === 'true' || p.metadata?.is_free_trial === true
      );

      if (hasExistingTrial) {
        return NextResponse.json(
          { error: 'Vous avez déjà utilisé votre essai gratuit avec cet email.' },
          { status: 409, headers: getSecurityHeaders() }
        );
      }
    }

    // ========================================================================
    // 5. Abuse check #2: Does this email already have a registered account?
    // ========================================================================
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Un compte existe déjà avec cet email. Connectez-vous et achetez un abonnement.' },
        { status: 409, headers: getSecurityHeaders() }
      );
    }

    // ========================================================================
    // 6. Server-side userId verification (if logged in)
    // ========================================================================
    let verifiedUserId: string | null = null;
    if (userId) {
      const { data: userRecord } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .eq('id', userId)
        .single();

      if (userRecord && userRecord.email.toLowerCase() === email) {
        verifiedUserId = userRecord.id;
      }
      // Note: if userId is provided but email doesn't match, we still proceed
      // but without auto-activation (just like paid checkout)
    }

    // ========================================================================
    // 7. Generate activation code
    // ========================================================================
    const keyCode = generateSecureActivationCode();
    const syntheticCheckoutId = `trial-${crypto.randomUUID()}`;
    const durationDays = trialPlan.duration_days;

    const maskedEmail = email.replace(/^(.{3}).*(@.*)$/, '$1***$2');
    console.log(`[Claim Trial] Processing trial for ${maskedEmail}. Duration: ${durationDays} days.`);

    // ========================================================================
    // 8. Fetch GIVEAWAY sales point
    // ========================================================================
    const { data: giveawaySP } = await supabaseAdmin
      .from('sales_points')
      .select('id')
      .eq('code', 'GIFT')
      .single();

    if (!giveawaySP) {
      console.error('[Claim Trial] GIVEAWAY sales_point not found');
      return NextResponse.json(
        { error: 'Erreur de configuration. Veuillez contacter le support.' },
        { status: 500, headers: getSecurityHeaders() }
      );
    }

    // ========================================================================
    // 9. Create activation key
    // ========================================================================
    const { data: newKey, error: keyError } = await supabaseAdmin
      .from('activation_keys')
      .insert({
        key_code: keyCode,
        duration_days: durationDays,
        payment_source: 'online',
        sales_point_id: giveawaySP.id,
        notes: `Free trial - ${trialPlan.name}`,
        price_paid: 0,
        is_used: verifiedUserId ? true : false,
        used_by: verifiedUserId || null,
        used_at: verifiedUserId ? new Date().toISOString() : null,
        expires_at: verifiedUserId
          ? (() => {
              const d = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
              d.setHours(23, 59, 59, 999);
              return d.toISOString();
            })()
          : null,
      })
      .select('id')
      .single();

    if (keyError) {
      console.error('[Claim Trial] Error creating activation key:', keyError);
      return NextResponse.json(
        { error: 'Erreur lors de la génération du code. Veuillez réessayer.' },
        { status: 500, headers: getSecurityHeaders() }
      );
    }

    // ========================================================================
    // 10. Create online_payments record
    // ========================================================================
    const { error: paymentError } = await supabaseAdmin
      .from('online_payments')
      .insert({
        checkout_id: syntheticCheckoutId,
        customer_email: email,
        customer_name: customerName?.trim() || null,
        customer_phone: customerPhone?.trim() || null,
        amount: 0,
        currency: 'dzd',
        status: 'paid',
        duration_days: durationDays,
        activation_key_id: newKey.id,
        user_id: verifiedUserId,
        paid_at: new Date().toISOString(),
        metadata: {
          is_free_trial: 'true',
          plan_id: trialPlan.id,
          plan_name: trialPlan.name,
        },
      });

    if (paymentError) {
      console.error('[Claim Trial] Error creating payment record:', paymentError);
      // Cleanup: delete the activation key we just created
      await supabaseAdmin.from('activation_keys').delete().eq('id', newKey.id);
      return NextResponse.json(
        { error: 'Erreur lors de l\'enregistrement. Veuillez réessayer.' },
        { status: 500, headers: getSecurityHeaders() }
      );
    }

    // Link activation key to payment record
    const { data: linkedPayment } = await supabaseAdmin
      .from('online_payments')
      .select('id')
      .eq('checkout_id', syntheticCheckoutId)
      .single();

    if (linkedPayment) {
      await supabaseAdmin
        .from('activation_keys')
        .update({ payment_id: linkedPayment.id })
        .eq('id', newKey.id);
    }

    // ========================================================================
    // 11. Auto-activation (if logged-in user)
    // ========================================================================
    if (verifiedUserId) {
      console.log(`[Claim Trial] Auto-activating user: ${verifiedUserId}`);
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      expiresAt.setHours(23, 59, 59, 999);

      const { error: userUpdateError } = await supabaseAdmin
        .from('users')
        .update({
          is_paid: true,
          subscription_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', verifiedUserId);

      if (userUpdateError) {
        console.error('[Claim Trial] Auto-activation failed:', userUpdateError);
        // Rollback activation key
        await supabaseAdmin
          .from('activation_keys')
          .update({
            is_used: false,
            used_by: null,
            used_at: null,
            expires_at: null,
          })
          .eq('id', newKey.id);
      } else {
        console.log(`[Claim Trial] Successfully activated user: ${verifiedUserId}`);
      }
    }

    // ========================================================================
    // 12. Return success
    // ========================================================================
    console.log(`[Claim Trial] Trial code generated for ${maskedEmail}: ${keyCode.substring(0, 4)}***`);

    return NextResponse.json({
      success: true,
      activationCode: keyCode,
      checkoutId: syntheticCheckoutId,
      customerEmail: email,
      duration: durationDays,
      planName: trialPlan.name,
    }, { headers: getSecurityHeaders() });

  } catch (error) {
    console.error('[Claim Trial] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Une erreur inattendue s\'est produite. Veuillez réessayer.' },
      { status: 500, headers: getSecurityHeaders() }
    );
  }
}
