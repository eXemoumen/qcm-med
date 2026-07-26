# Optimized Bulk Import System Implementation Plan

## 📋 Summary

**Goal**: Increase max questions to 1000, add pagination, and create a "Push Valid" button that lets admins push valid questions directly without reviewing each one individually.

**Current State**: 
- Max 200 questions per import
- No pagination for batches/staging
- Manual review required for all questions before push

**Target State**:
- Max 1000 questions per import
- Pagination for listing batches and staging questions
- Dashboard shows valid questions count with "Push Valid" button
- Admin validates by clicking button (not auto-push)
- Invalid questions still require manual review

---

## 🎯 Implementation Phases

### Phase 1: Increase Limits to 1000

#### 1.1 Update Zod Schema Limits
**File**: `db-interface/lib/security/validation.ts`

```typescript
// Before (line 126)
export const bulkQuestionsSchema = z.object({
  questions: z.array(bulkQuestionItemSchema)
    .min(1, 'At least 1 question required')
    .max(200, 'Maximum 200 questions per import'),
});

// After
export const bulkQuestionsSchema = z.object({
  questions: z.array(bulkQuestionItemSchema)
    .min(1, 'At least 1 question required')
    .max(1000, 'Maximum 1000 questions per import'),
});
```

#### 1.2 Update Chunk Size for Better Performance
**File**: `db-interface/app/api/questions/bulk/route.ts`

```typescript
// Before (line 40)
const CHUNK_SIZE = 50;

// After
const CHUNK_SIZE = 100;
```

#### 1.3 Update Client-Side Validation
**File**: `db-interface/lib/import/validate-import.ts`

- Ensure validation handles 1000 questions efficiently
- Add progress callback for large files

---

### Phase 2: Add Pagination

#### 2.1 Add Pagination to Import Batches API
**File**: `db-interface/app/api/import/batches/route.ts`

**Modifications to GET endpoint**:
- Add `page` and `limit` query parameters
- Default: `page=1`, `limit=20`
- Return pagination metadata (total, page, limit, totalPages)

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = (page - 1) * limit;

  // Get total count
  const { count: total } = await supabaseAdmin
    .from('import_batches')
    .select('*', { count: 'exact', head: true })
    .eq('uploaded_by', authResult.user.id);

  // Get paginated results
  const { data: batches } = await supabaseAdmin
    .from('import_batches')
    .select('*')
    .eq('uploaded_by', authResult.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return successResponse({
    data: batches,
    pagination: {
      total: total || 0,
      page,
      limit,
      totalPages: Math.ceil((total || 0) / limit),
    }
  }, rateLimitResult.headers);
}
```

#### 2.2 Add Pagination to Batch Staging Questions
**File**: `db-interface/app/api/import/batches/[batchId]/route.ts`

**Add GET endpoint with pagination**:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const status = searchParams.get('status'); // Filter by status
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('question_staging')
    .select('*', { count: 'exact' })
    .eq('batch_id', params.batchId)
    .order('row_index', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { count: total } = await query;
  const { data: questions } = await query.range(offset, offset + limit - 1);

  return successResponse({
    data: questions,
    pagination: {
      total: total || 0,
      page,
      limit,
      totalPages: Math.ceil((total || 0) / limit),
    }
  }, rateLimitResult.headers);
}
```

#### 2.3 Update Import Dashboard UI with Pagination
**File**: `db-interface/app/import-dashboard/page.tsx`

**Add pagination controls**:
- Page selector (1, 2, 3...)
- Items per page dropdown (10, 20, 50)
- Total items display
- Previous/Next buttons

```tsx
// Add state
const [pagination, setPagination] = useState({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
});

// Add pagination controls
const PaginationControls = () => (
  <div className="flex items-center justify-between mt-4">
    <div className="text-sm text-slate-500">
      Affichage {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} 
      sur {pagination.total} batches
    </div>
    <div className="flex gap-2">
      <button
        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
        disabled={pagination.page === 1}
        className="px-3 py-1 rounded-lg border disabled:opacity-50"
      >
        ← Précédent
      </button>
      <span className="px-3 py-1">
        Page {pagination.page} / {pagination.totalPages}
      </span>
      <button
        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
        disabled={pagination.page === pagination.totalPages}
        className="px-3 py-1 rounded-lg border disabled:opacity-50"
      >
        Suivant →
      </button>
    </div>
  </div>
);
```

#### 2.4 Update Batch Review UI with Pagination
**File**: `db-interface/app/import-dashboard/[batchId]/page.tsx`

**Add pagination for staging questions**:
- Filter by status (valid, warning, error, approved, rejected)
- Paginated list with 50 questions per page
- Bulk selection across pages

---

### Phase 3: Create "Push Valid" Button (Core Feature)

#### 3.1 Add New API Endpoint for Pushing Valid Questions
**File**: `db-interface/app/api/import/batches/[batchId]/push-valid/route.ts` (NEW)

**Purpose**: Push all valid questions with a single admin action

**Flow**:
1. Admin clicks "Push Valid" button
2. API fetches all staging questions with status `valid`
3. Runs pre-push checks (courses, duplicates)
4. Batch inserts valid questions to production
5. Updates staging status to `saved`
6. Returns results (saved count, errors)

```typescript
/**
 * API route for pushing all valid questions from a batch
 * POST: Push all valid questions (not just approved)
 */
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import {
  applyRateLimit,
  requireAuthenticatedAdmin,
  sanitizeError,
  successResponse,
  errorResponse,
} from '@/lib/security/api-utils';
import { PREDEFINED_MODULES } from '@/lib/predefined-modules';

export async function POST(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const startTime = Date.now();
  const LOG_SOURCE = 'api/import/batches/[batchId]/push-valid/POST';

  try {
    const rateLimitResult = await applyRateLimit(request, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    // Verify batch access
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('import_batches')
      .select('*')
      .eq('id', params.batchId)
      .single();

    if (batchError || !batch) {
      return errorResponse('Batch not found', 404, rateLimitResult.headers);
    }

    if (batch.uploaded_by !== authResult.user.id) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', authResult.user.id)
        .single();

      if (userData?.role !== 'owner') {
        return errorResponse('Access denied', 403, rateLimitResult.headers);
      }
    }

    // Block push on already-completed batches
    if (batch.status === 'completed') {
      return errorResponse('Batch already fully pushed', 400, rateLimitResult.headers);
    }

    // Get all valid staging questions (status = 'valid')
    const { data: validQuestions, error: fetchError } = await supabaseAdmin
      .from('question_staging')
      .select('*')
      .eq('batch_id', params.batchId)
      .eq('status', 'valid')
      .order('row_index', { ascending: true });

    if (fetchError) throw fetchError;

    if (!validQuestions || validQuestions.length === 0) {
      return errorResponse('No valid questions to push', 400, rateLimitResult.headers);
    }

    // Pre-check courses
    const allCourseNames = new Set<string>();
    for (const q of validQuestions) {
      if (q.cours && Array.isArray(q.cours)) {
        for (const c of q.cours) {
          if (c) allCourseNames.add(c);
        }
      }
    }

    let missingCourses: string[] = [];
    if (allCourseNames.size > 0) {
      const { data: existingCourses } = await supabaseAdmin
        .from('courses')
        .select('name')
        .in('name', Array.from(allCourseNames));

      const existingNames = new Set((existingCourses || []).map((c: any) => c.name));
      missingCourses = Array.from(allCourseNames).filter((name) => !existingNames.has(name));
    }

    // Pre-check duplicates
    const uniqueCombos = new Map<string, Set<number>>();
    for (const q of validQuestions) {
      const key = `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}`;
      if (!uniqueCombos.has(key)) uniqueCombos.set(key, new Set());
      uniqueCombos.get(key)!.add(q.number!);
    }

    const dbDuplicateMap = new Map<string, Set<number>>();
    for (const [keyStr, numbers] of uniqueCombos) {
      const [year, module_name, sub_discipline, exam_type, exam_year] = keyStr.split('|');
      let query = supabaseAdmin
        .from('questions')
        .select('number')
        .eq('year', year)
        .eq('module_name', module_name)
        .eq('exam_type', exam_type)
        .eq('exam_year', parseInt(exam_year));

      if (sub_discipline) {
        query = query.eq('sub_discipline', sub_discipline);
      } else {
        query = query.is('sub_discipline', null);
      }

      const { data: existing } = await query;
      if (existing && existing.length > 0) {
        dbDuplicateMap.set(keyStr, new Set(existing.map((q: any) => q.number)));
      }
    }

    // Insert questions in batches
    const BATCH_SIZE = 100;
    const results: {
      stagingId: string;
      status: 'saved' | 'error';
      questionId?: string;
      error?: string;
    }[] = [];

    let saved = 0;
    let failed = 0;

    for (let i = 0; i < validQuestions.length; i += BATCH_SIZE) {
      const batch = validQuestions.slice(i, i + BATCH_SIZE);
      
      for (const sq of batch) {
        // Check missing courses
        if (sq.cours && Array.isArray(sq.cours)) {
          const qMissing = sq.cours.filter((c: string) => missingCourses.includes(c));
          if (qMissing.length > 0) {
            await supabaseAdmin
              .from('question_staging')
              .update({ status: 'error', errors: [`Cours non trouvés: ${qMissing.join(', ')}`] })
              .eq('id', sq.id);
            results.push({ stagingId: sq.id, status: 'error', error: `Cours non trouvés: ${qMissing.join(', ')}` });
            failed++;
            continue;
          }
        }

        // Check duplicates
        const comboKey = `${sq.year}|${sq.module_name}|${sq.sub_discipline || ''}|${sq.exam_type}|${sq.exam_year}`;
        const dbNums = dbDuplicateMap.get(comboKey);
        if (dbNums && dbNums.has(sq.number!)) {
          await supabaseAdmin
            .from('question_staging')
            .update({ status: 'error', errors: [`Question #${sq.number} already exists in database`] })
            .eq('id', sq.id);
          results.push({ stagingId: sq.id, status: 'error', error: `Question #${sq.number} already exists` });
          failed++;
          continue;
        }

        // Get module type
        const mod = PREDEFINED_MODULES.find((m) => m.name === sq.module_name && m.year === sq.year);

        try {
          const questionData = {
            year: sq.year,
            module_name: sq.module_name,
            sub_discipline: sq.sub_discipline || null,
            exam_type: sq.exam_type,
            exam_year: sq.exam_year,
            number: sq.number,
            question_text: sq.question_text,
            speciality: sq.speciality || 'Médecine',
            cours: sq.cours || null,
            module_type: mod?.type || null,
            unity_name: mod?.type === 'uei' ? sq.module_name : null,
            faculty_source: sq.faculty_source || null,
            explanation: sq.explanation || null,
            created_by: authResult.user.id,
          };

          const { data: newQuestion, error: questionError } = await supabaseAdmin
            .from('questions')
            .insert(questionData)
            .select()
            .single();

          if (questionError) throw questionError;
          if (!newQuestion) throw new Error('Failed to create question');

          // Insert answers
          const answersToInsert = (sq.answers || []).map((a: any) => ({
            question_id: newQuestion.id,
            option_label: a.option_label,
            answer_text: a.answer_text,
            is_correct: a.is_correct,
            display_order: a.display_order,
          }));

          if (answersToInsert.length > 0) {
            const { error: answersError } = await supabaseAdmin.from('answers').insert(answersToInsert);
            if (answersError) {
              await supabaseAdmin.from('questions').delete().eq('id', newQuestion.id);
              throw answersError;
            }
          }

          // Update staging row
          await supabaseAdmin
            .from('question_staging')
            .update({ status: 'saved', reviewed_by: authResult.user.id, reviewed_at: new Date().toISOString() })
            .eq('id', sq.id);

          // Track in duplicate map
          if (!dbDuplicateMap.has(comboKey)) dbDuplicateMap.set(comboKey, new Set());
          dbDuplicateMap.get(comboKey)!.add(sq.number!);

          results.push({ stagingId: sq.id, status: 'saved', questionId: newQuestion.id });
          saved++;
        } catch (err: any) {
          await supabaseAdmin
            .from('question_staging')
            .update({ status: 'error', errors: [sanitizeError(err)] })
            .eq('id', sq.id);
          results.push({ stagingId: sq.id, status: 'error', error: sanitizeError(err) });
          failed++;
        }
      }
    }

    // Update batch status
    const batchStatus = failed === 0 ? 'completed' : 'partial';
    await supabaseAdmin
      .from('import_batches')
      .update({ 
        status: batchStatus,
        approved_count: saved,
      })
      .eq('id', params.batchId);

    const durationMs = Date.now() - startTime;

    logger.info('Push valid questions completed', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { batchId: params.batchId, saved, failed, durationMs },
    });

    return successResponse(
      { total: validQuestions.length, saved, failed, results },
      rateLimitResult.headers
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Push valid questions failed', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error', durationMs },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
```

#### 3.2 Add "Push Valid" Button to Batch Review UI
**File**: `db-interface/app/import-dashboard/[batchId]/page.tsx`

**Add prominent button with valid count**:

```tsx
// Add state for valid count
const [validCount, setValidCount] = useState(0);
const [pushing, setPushing] = useState(false);

// Fetch valid count on load
useEffect(() => {
  const fetchValidCount = async () => {
    const { data } = await supabaseAdmin
      .from('question_staging')
      .select('id', { count: 'exact' })
      .eq('batch_id', batchId)
      .eq('status', 'valid');
    
    setValidCount(data?.length || 0);
  };
  fetchValidCount();
}, [batchId]);

// Push valid handler
const handlePushValid = async () => {
  if (!confirm(`Pousser ${validCount} questions valides directement dans la base de données?`)) {
    return;
  }

  setPushing(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Non authentifié');

    const response = await fetch(`/api/import/batches/${batchId}/push-valid`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erreur lors du push');

    alert(`✅ ${result.data.saved} questions poussées avec succès!`);
    fetchBatch(); // Refresh batch data
  } catch (err: any) {
    alert(`❌ ${err.message}`);
  } finally {
    setPushing(false);
  }
};

// Add button to UI
{validCount > 0 && (
  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 mb-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-bold text-green-800 dark:text-green-200">
          🚀 {validCount} questions valides prêtes
        </h3>
        <p className="text-sm text-green-600 dark:text-green-400">
          Cliquez pour pousser directement dans la base de données
        </p>
      </div>
      <button
        onClick={handlePushValid}
        disabled={pushing}
        className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {pushing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Push en cours...
          </>
        ) : (
          <>
            ⚡ Pousser les valides
          </>
        )}
      </button>
    </div>
  </div>
)}
```

#### 3.3 Update Batch Review to Show Valid Count
**File**: `db-interface/app/import-dashboard/[batchId]/page.tsx`

**Add status summary at top**:

```tsx
// Add status counts
const [statusCounts, setStatusCounts] = useState({
  valid: 0,
  warning: 0,
  error: 0,
  approved: 0,
  rejected: 0,
  saved: 0,
});

// Fetch status counts
useEffect(() => {
  const fetchStatusCounts = async () => {
    const { data } = await supabaseAdmin
      .from('question_staging')
      .select('status')
      .eq('batch_id', batchId);
    
    if (data) {
      const counts = data.reduce((acc, q) => {
        acc[q.status] = (acc[q.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      setStatusCounts({
        valid: counts.valid || 0,
        warning: counts.warning || 0,
        error: counts.error || 0,
        approved: counts.approved || 0,
        rejected: counts.rejected || 0,
        saved: counts.saved || 0,
      });
    }
  };
  fetchStatusCounts();
}, [batchId]);

// Add status summary UI
<div className="grid grid-cols-6 gap-4 mb-6">
  <StatusCard 
    label="Valides" 
    count={statusCounts.valid} 
    color="green"
    icon="✅"
  />
  <StatusCard 
    label="Avertissements" 
    count={statusCounts.warning} 
    color="yellow"
    icon="⚠️"
  />
  <StatusCard 
    label="Erreurs" 
    count={statusCounts.error} 
    color="red"
    icon="❌"
  />
  <StatusCard 
    label="Approuvées" 
    count={statusCounts.approved} 
    color="blue"
    icon="👍"
  />
  <StatusCard 
    label="Rejetées" 
    count={statusCounts.rejected} 
    color="gray"
    icon="👎"
  />
  <StatusCard 
    label="Sauvegardées" 
    count={statusCounts.saved} 
    color="purple"
    icon="💾"
  />
</div>
```

---

### Phase 4: Optimize Batch Insert Performance

#### 4.1 Increase Batch Size in Existing Push Endpoint
**File**: `db-interface/app/api/import/batches/[batchId]/push/route.ts`

**Optimize the existing push endpoint** (for approved questions):

```typescript
// Before: One-by-one inserts
for (const sq of approvedQuestions) {
  // ... insert question
  // ... insert answers
}

// After: Batch inserts
const BATCH_SIZE = 100;
for (let i = 0; i < approvedQuestions.length; i += BATCH_SIZE) {
  const batch = approvedQuestions.slice(i, i + BATCH_SIZE);
  
  // Insert questions batch
  const questionRows = batch.map(sq => ({
    year: sq.year,
    module_name: sq.module_name,
    // ... other fields
  }));
  
  const { data: insertedQuestions } = await supabaseAdmin
    .from('questions')
    .insert(questionRows)
    .select();
  
  // Insert answers batch
  const allAnswers = batch.flatMap((sq, idx) => 
    (sq.answers || []).map(a => ({
      question_id: insertedQuestions[idx].id,
      option_label: a.option_label,
      answer_text: a.answer_text,
      is_correct: a.is_correct,
      display_order: a.display_order,
    }))
  );
  
  await supabaseAdmin.from('answers').insert(allAnswers);
  
  // Update staging rows
  const stagingIds = batch.map(sq => sq.id);
  await supabaseAdmin
    .from('question_staging')
    .update({ status: 'saved', reviewed_by: authResult.user.id })
    .in('id', stagingIds);
}
```

---

### Phase 5: Database Optimization

#### 5.1 Add Database Indexes for Performance
**File**: `db-interface/supabase/migrations/YYYYMMDD_add_import_indexes.sql` (NEW)

```sql
-- Optimize duplicate checking (used in push operations)
CREATE INDEX IF NOT EXISTS idx_questions_composite_lookup 
ON questions(year, module_name, exam_type, exam_year, number);

-- Optimize staging queries for push-valid
CREATE INDEX IF NOT EXISTS idx_question_staging_valid 
ON question_staging(batch_id, status) WHERE status = 'valid';

-- Optimize batch status queries
CREATE INDEX IF NOT EXISTS idx_import_batches_status_created 
ON import_batches(status, created_at DESC);

-- Optimize pagination queries
CREATE INDEX IF NOT EXISTS idx_question_staging_batch_row 
ON question_staging(batch_id, row_index);

-- Optimize status count queries
CREATE INDEX IF NOT EXISTS idx_question_staging_status_count 
ON question_staging(batch_id, status);
```

---

## 📊 Expected Results

### Performance Improvements
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Max questions/file | 200 | 1000 | **5x** |
| Push speed | 1-by-1 | Batch (100/batch) | **100x** |
| Total time (1000 questions) | ~15 min | ~1 min | **15x** |
| Manual review required | All questions | Invalid only | **80% reduction** |
| Batch listing | All at once | Paginated (20/page) | **Faster loading** |

### User Experience
- ✅ Upload up to 1000 questions per file
- ✅ See valid questions count instantly
- ✅ One-click "Push Valid" button
- ✅ Pagination for large batch lists
- ✅ Faster batch processing
- ✅ Clear status summary

---

## 🔧 Configuration

### Environment Variables
```env
# Import Limits
MAX_QUESTIONS_PER_IMPORT=1000
IMPORT_CHUNK_SIZE=100

# Pagination
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100
```

### Database Schema Changes
None required - existing schema supports the new features.

---

## 🧪 Testing Strategy

### Unit Tests
- Pagination logic
- Push valid endpoint
- Batch insert optimization
- Status count queries

### Integration Tests
- Full upload flow with 1000 questions
- Push valid button functionality
- Pagination across pages
- Error scenarios (partial failures)

### Load Tests
- 1000 questions upload time
- 10 concurrent imports
- Database performance under load
- Pagination with 1000+ batches

---

## 🚀 Deployment Plan

### Phase 1: Increase Limits (Day 1)
1. Update Zod schema to 1000
2. Increase chunk size to 100
3. Add database indexes
4. Deploy to staging

### Phase 2: Add Pagination (Day 2-3)
1. Update batches API with pagination
2. Update batch review API with pagination
3. Update Import Dashboard UI
4. Update Batch Review UI

### Phase 3: Push Valid Button (Day 4-5)
1. Create push-valid endpoint
2. Add valid count to batch review
3. Add "Push Valid" button
4. Test with sample data

### Phase 4: Optimization (Day 6-7)
1. Optimize batch inserts in existing push endpoint
2. Performance testing
3. User acceptance testing
4. Production deployment

---

## ⚠️ Risk Mitigation

### Risks
1. **Database load**: Large batch inserts may impact performance
   - **Mitigation**: Batch size limits, connection pooling

2. **Data integrity**: Push valid may insert duplicate data
   - **Mitigation**: Pre-push duplicate checks, database constraints

3. **User confusion**: New "Push Valid" workflow
   - **Mitigation**: Clear UI feedback, tooltips, documentation

4. **Pagination issues**: Large datasets may be slow
   - **Mitigation**: Database indexes, cursor-based pagination if needed

### Rollback Plan
- Keep existing staging pipeline as fallback
- Feature flag to disable push-valid
- Monitor error rates post-deployment

---

## 📚 Documentation

### API Documentation
- Update OpenAPI specs for new endpoints
- Document push-valid behavior
- Add pagination parameters

### User Guide
- Update import tutorial
- Add "Push Valid" workflow
- Document pagination controls

### Developer Guide
- Code architecture overview
- Testing procedures
- Deployment checklist

---

## ✅ Success Criteria

1. ✅ Max 1000 questions per import
2. ✅ Pagination for batches and staging questions
3. ✅ "Push Valid" button with valid count
4. ✅ Admin must click button (no auto-push)
5. ✅ Invalid questions still require manual review
6. ✅ 10x faster batch processing
7. ✅ Backward compatible (existing imports still work)

---

**Estimated Timeline**: 7 days
**Priority**: High
**Impact**: High (user productivity + system performance)
