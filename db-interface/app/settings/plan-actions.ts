'use server';

import { revalidatePath } from 'next/cache';
import {
  createPlan,
  updatePlan,
  togglePlanActive,
  deletePlan,
  LastActivePlanError,
  PlanNotFoundError,
} from '@/lib/subscription-plans';

// ============================================================================
// Server Actions for Subscription Plans
// ============================================================================

interface ActionResult {
  success?: boolean;
  error?: string;
  message?: string;
}

/** Create a new subscription plan */
export async function createPlanAction(formData: FormData): Promise<ActionResult> {
  const name = formData.get('name') as string;
  const durationDays = parseInt(formData.get('duration_days') as string);
  const price = parseInt(formData.get('price') as string);
  const description = (formData.get('description') as string) || null;
  const isFeatured = formData.get('is_featured') === 'true';
  const isFreeTrial = formData.get('is_free_trial') === 'true';
  const sortOrder = parseInt(formData.get('sort_order') as string) || 0;

  if (!name || name.trim().length === 0) {
    return { error: 'Le nom est requis' };
  }
  if (isNaN(durationDays) || durationDays <= 0) {
    return { error: 'La durée doit être un nombre positif' };
  }
  // Free trial plans have price = 0; regular plans must have price > 0
  if (isFreeTrial) {
    // Force price to 0 for free trials
  } else if (isNaN(price) || price <= 0) {
    return { error: 'Le prix doit être un nombre positif' };
  }

  try {
    await createPlan({
      name: name.trim(),
      duration_days: durationDays,
      price: isFreeTrial ? 0 : price,
      description,
      is_featured: isFeatured,
      is_free_trial: isFreeTrial,
      sort_order: sortOrder,
    });

    revalidatePath('/settings');
    revalidatePath('/buy');
    revalidatePath('/api/payments/create-checkout');

    return { success: true, message: isFreeTrial ? 'Offre d\'essai gratuit créée avec succès' : 'Offre créée avec succès' };
  } catch (err: any) {
    console.error('Error creating plan:', err);
    // Handle unique index violation for single active trial
    if (err?.message?.includes('idx_subscription_plans_single_active_trial') || err?.message?.includes('duplicate key')) {
      return { error: 'Une offre d\'essai gratuit active existe déjà. Désactivez-la avant d\'en créer une autre.' };
    }
    return { error: 'Erreur lors de la création de l\'offre' };
  }
}

/** Update an existing subscription plan */
export async function updatePlanAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const durationDays = parseInt(formData.get('duration_days') as string);
  const price = parseInt(formData.get('price') as string);
  const description = (formData.get('description') as string) || null;
  const isFeatured = formData.get('is_featured') === 'true';
  const isFreeTrial = formData.get('is_free_trial') === 'true';
  const sortOrder = parseInt(formData.get('sort_order') as string) || 0;

  if (!id) {
    return { error: 'ID de l\'offre manquant' };
  }
  if (!name || name.trim().length === 0) {
    return { error: 'Le nom est requis' };
  }
  if (isNaN(durationDays) || durationDays <= 0) {
    return { error: 'La durée doit être un nombre positif' };
  }
  // Free trial plans have price = 0; regular plans must have price > 0
  if (isFreeTrial) {
    // Force price to 0 for free trials
  } else if (isNaN(price) || price <= 0) {
    return { error: 'Le prix doit être un nombre positif' };
  }

  try {
    await updatePlan({
      id,
      name: name.trim(),
      duration_days: durationDays,
      price: isFreeTrial ? 0 : price,
      description,
      is_featured: isFeatured,
      is_free_trial: isFreeTrial,
      sort_order: sortOrder,
    });

    revalidatePath('/settings');
    revalidatePath('/buy');
    revalidatePath('/api/payments/create-checkout');

    return { success: true, message: 'Offre mise à jour avec succès' };
  } catch (err: any) {
    console.error('Error updating plan:', err);
    if (err?.message?.includes('idx_subscription_plans_single_active_trial') || err?.message?.includes('duplicate key')) {
      return { error: 'Une offre d\'essai gratuit active existe déjà. Désactivez-la avant d\'en créer une autre.' };
    }
    return { error: 'Erreur lors de la mise à jour de l\'offre' };
  }
}

/** Toggle plan active status */
export async function togglePlanAction(planId: string): Promise<ActionResult> {
  if (!planId) {
    return { error: 'ID de l\'offre manquant' };
  }

  try {
    await togglePlanActive(planId);

    revalidatePath('/settings');
    revalidatePath('/buy');
    revalidatePath('/api/payments/create-checkout');

    return { success: true, message: 'Statut mis à jour' };
  } catch (err) {
    if (err instanceof LastActivePlanError) {
      return { error: 'Impossible de désactiver la dernière offre active' };
    }
    if (err instanceof PlanNotFoundError) {
      return { error: 'Offre introuvable' };
    }
    console.error('Error toggling plan:', err);
    return { error: 'Erreur lors de la mise à jour du statut' };
  }
}

/** Delete a plan */
export async function deletePlanAction(planId: string): Promise<ActionResult> {
  if (!planId) {
    return { error: 'ID de l\'offre manquant' };
  }

  try {
    await deletePlan(planId);

    revalidatePath('/settings');
    revalidatePath('/buy');
    revalidatePath('/api/payments/create-checkout');

    return { success: true, message: 'Offre supprimée' };
  } catch (err) {
    if (err instanceof LastActivePlanError) {
      return { error: 'Impossible de supprimer la dernière offre active' };
    }
    if (err instanceof PlanNotFoundError) {
      return { error: 'Offre introuvable' };
    }
    console.error('Error deleting plan:', err);
    return { error: 'Erreur lors de la suppression de l\'offre' };
  }
}
