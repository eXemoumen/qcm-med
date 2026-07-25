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
