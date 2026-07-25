import type { CreateQuestionData } from '@/lib/api/questions';

export type ImportRowStatus =
  | 'pending'
  | 'valid'
  | 'warning'
  | 'error'
  | 'approved'
  | 'rejected'
  | 'saved'
  | 'save_error';

export interface ImportedQuestion {
  rowIndex: number;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  data: CreateQuestionData;
  rawData?: Record<string, unknown>;
}

export interface ImportResult {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
  questions: ImportedQuestion[];
}

export interface BulkSaveRequest {
  questions: CreateQuestionData[];
}

export interface BulkSaveResult {
  total: number;
  saved: number;
  failed: number;
  skipped: number;
  missingCourses?: string[];
  results: {
    index: number;
    status: 'saved' | 'error' | 'skipped';
    questionId?: string;
    error?: string;
  }[];
}

// ── Staging Pipeline Types ──

export interface ImportBatch {
  id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  status: 'pending' | 'processing' | 'completed' | 'partial';
  total_rows: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  approved_count: number;
  rejected_count: number;
  created_at: string;
  updated_at: string;
  // Joined
  uploader_email?: string;
}

export interface StagingQuestion {
  id: string;
  batch_id: string;
  row_index: number;
  year: string | null;
  module_name: string | null;
  sub_discipline: string | null;
  exam_type: string | null;
  exam_year: number | null;
  number: number | null;
  question_text: string | null;
  speciality: string | null;
  cours: string[] | null;
  faculty_source: string | null;
  explanation: string | null;
  answers: {
    option_label: string;
    answer_text: string;
    is_correct: boolean;
    display_order: number;
  }[];
  status: 'pending' | 'valid' | 'warning' | 'error' | 'approved' | 'rejected' | 'saved';
  errors: string[];
  warnings: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface BatchReviewResult {
  total: number;
  saved: number;
  failed: number;
  results: {
    stagingId: string;
    status: 'saved' | 'error';
    questionId?: string;
    error?: string;
  }[];
}
