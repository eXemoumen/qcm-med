// ============================================================================
// QCM Calc — Supabase CRUD API Functions
// ============================================================================

import { supabase } from '@/lib/supabase';
import type {
  QcmExam,
  QcmExamFormData,
  QcmExamFilters,
  CorrectAnswersMap,
} from '@/types/qcm-calc';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Convert form answers (numeric keys) to JSONB format (string keys) */
function formAnswersToJsonb(
  answers: Record<number, string[] | string[][]>
): CorrectAnswersMap {
  const result: CorrectAnswersMap = {};
  for (const [key, value] of Object.entries(answers)) {
    result[String(key)] = value;
  }
  return result;
}

// --------------------------------------------------------------------------
// READ
// --------------------------------------------------------------------------

/** Fetch all QCM exams with optional filters */
export async function getQcmExams(filters?: QcmExamFilters) {
  try {
    let query = supabase
      .from('qcm_exams')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.speciality) {
      query = query.eq('speciality', filters.speciality);
    }
    if (filters?.grade) {
      query = query.eq('grade', filters.grade);
    }
    if (filters?.year) {
      query = query.eq('year', filters.year);
    }
    if (filters?.subject) {
      query = query.eq('subject', filters.subject);
    }
    if (filters?.sub_discipline) {
      query = query.eq('sub_discipline', filters.sub_discipline);
    }
    if (filters?.session) {
      query = query.eq('session', filters.session);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true as const,
      data: (data || []) as QcmExam[],
    };
  } catch (error: any) {
    console.error('Error fetching QCM exams:', error);
    return {
      success: false as const,
      error: error.message || 'Échec du chargement des examens',
      data: [] as QcmExam[],
    };
  }
}

/** Fetch a single QCM exam by ID */
export async function getQcmExamById(id: string) {
  try {
    const { data, error } = await supabase
      .from('qcm_exams')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      success: true as const,
      data: data as QcmExam,
    };
  } catch (error: any) {
    console.error('Error fetching QCM exam:', error);
    return {
      success: false as const,
      error: error.message || 'Échec du chargement de l\'examen',
    };
  }
}

/** Fetch unique filter values for dropdowns */
export async function getQcmExamFilterValues() {
  try {
    const { data, error } = await supabase
      .from('qcm_exams')
      .select('speciality, grade, year, subject, session, sub_discipline');

    if (error) throw error;

    const items = data || [];
    return {
      success: true as const,
      data: {
        specialities: [...new Set(items.map((d) => d.speciality).filter(Boolean))],
        grades: [...new Set(items.map((d) => d.grade).filter(Boolean))],
        years: [...new Set(items.map((d) => d.year).filter(Boolean))],
        subjects: [...new Set(items.map((d) => d.subject).filter(Boolean))],
        sessions: [...new Set(items.map((d) => d.session).filter(Boolean))],
        sub_disciplines: [...new Set(items.map((d) => d.sub_discipline).filter(Boolean))],
      },
    };
  } catch (error: any) {
    console.error('Error fetching filter values:', error);
    return {
      success: false as const,
      error: error.message,
      data: {
        specialities: [],
        grades: [],
        years: [],
        subjects: [],
        sessions: [],
        sub_disciplines: [],
      },
    };
  }
}

// --------------------------------------------------------------------------
// CREATE
// --------------------------------------------------------------------------

/** Create a new QCM exam */
export async function createQcmExam(formData: QcmExamFormData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Non authentifié');

    const { data, error } = await supabase
      .from('qcm_exams')
      .insert({
        name: formData.name.trim(),
        description: formData.description.trim(),
        speciality: formData.speciality,
        grade: formData.grade,
        year: formData.year.trim(),
        subject: formData.subject.trim(),
        sub_discipline: formData.sub_discipline?.trim() || null,
        num_questions: formData.num_questions,
        test_type: formData.test_type,
        correct_answers: formAnswersToJsonb(formData.correct_answers),
        session: formData.session,
        rotation: formData.rotation?.trim() || null,
        exam_type: formData.exam_type,
        created_by: session.user.id,
        sections: formData.sections || [],
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true as const,
      data: data as QcmExam,
    };
  } catch (error: any) {
    console.error('Error creating QCM exam:', error);
    return {
      success: false as const,
      error: error.message || 'Échec de la création de l\'examen',
    };
  }
}

// --------------------------------------------------------------------------
// UPDATE
// --------------------------------------------------------------------------

/** Update an existing QCM exam */
export async function updateQcmExam(id: string, formData: QcmExamFormData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Non authentifié');

    // Verify ownership and permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const isPrivileged = userProfile && ['admin', 'owner', 'manager'].includes(userProfile.role);

    const { data: existingExam, error: fetchError } = await supabase
      .from('qcm_exams')
      .select('created_by')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error('Examen introuvable');
    
    if (!isPrivileged && existingExam.created_by !== session.user.id) {
      throw new Error('Non autorisé à modifier cet examen');
    }

    const { data, error } = await supabase
      .from('qcm_exams')
      .update({
        name: formData.name.trim(),
        description: formData.description.trim(),
        speciality: formData.speciality,
        grade: formData.grade,
        year: formData.year.trim(),
        subject: formData.subject.trim(),
        sub_discipline: formData.sub_discipline?.trim() || null,
        num_questions: formData.num_questions,
        test_type: formData.test_type,
        correct_answers: formAnswersToJsonb(formData.correct_answers),
        session: formData.session,
        rotation: formData.rotation?.trim() || null,
        exam_type: formData.exam_type,
        sections: formData.sections || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true as const,
      data: data as QcmExam,
    };
  } catch (error: any) {
    console.error('Error updating QCM exam:', error);
    return {
      success: false as const,
      error: error.message || 'Échec de la mise à jour de l\'examen',
    };
  }
}

// --------------------------------------------------------------------------
// DELETE
// --------------------------------------------------------------------------

/** Delete a QCM exam */
export async function deleteQcmExam(id: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Non authentifié');

    // Verify ownership and permissions
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const isPrivileged = userProfile && ['admin', 'owner', 'manager'].includes(userProfile.role);

    const { data: existingExam, error: fetchError } = await supabase
      .from('qcm_exams')
      .select('created_by')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error('Examen introuvable');
    
    if (!isPrivileged && existingExam.created_by !== session.user.id) {
      throw new Error('Non autorisé à supprimer cet examen');
    }

    const { error } = await supabase
      .from('qcm_exams')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true as const };
  } catch (error: any) {
    console.error('Error deleting QCM exam:', error);
    return {
      success: false as const,
      error: error.message || 'Échec de la suppression de l\'examen',
    };
  }
}
