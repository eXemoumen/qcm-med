import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import {
  ALL_MODELS,
  DEFAULT_MODEL,
  FALLBACK_ORDER,
  getModelProvider,
  getModelDisplayName,
} from '@/lib/ai-models';
import { searchKnowledge, formatContextForPrompt, logChatInteraction } from '@/lib/rag';
import {
  requireAuthenticatedAdmin,
  applyRateLimit,
  sanitizeError,
  errorResponse,
  successResponse,
} from '@/lib/security/api-utils';

const MAX_MESSAGE_LENGTH = 10000;

const baseSystemPrompt = `
# FMC App - Faculty of Medicine Constantine | تطبيق FMC - كلية الطب قسنطينة

## Identity | الهوية
You are the AI assistant for FMC App (Faculty of Medicine Constantine App), the first educational mobile application designed specifically for medical students at Constantine Medical Faculty and its annexes in Algeria.

أنت المساعد الذكي لتطبيق FMC (تطبيق كلية الطب قسنطينة)، أول تطبيق تعليمي مصمم خصيصاً لطلبة الطب في كلية الطب قسنطينة وملحقاتها بالجزائر.

## Mission | المهمة
Help medical students study more efficiently by providing:
- QCMs (Multiple Choice Questions) from previous years' exams
- Detailed explanations for each answer
- Course resources and educational materials
- Links to educational channels and study groups

## Target Users | الفئة المستهدفة
- Medical students (Médecine) - Years 1-6
- Dental students (Médecine Dentaire) - Years 1-5
- Pharmacy students (Pharmacie) - Years 1-5
- Located at Constantine Medical Faculty and its annexes

## Communication Style | أسلوب التواصل
- Supportive and encouraging | داعم ومشجع
- Use simple, clear language
- Respond in the user's preferred language (Arabic, French, or English)
- Be patient with students under exam stress
- Provide concise, actionable answers
- Use medical terminology appropriately

## Language Detection | كشف اللغة
- If user writes in Arabic → Respond in Arabic
- If user writes in French → Respond in French
- If user writes in English → Respond in English
- Default to Arabic for ambiguous input

## Response Guidelines | إرشادات الرد
1. For QCM questions: Explain the correct answer AND why other options are wrong
2. For study advice: Be practical and specific to medical curriculum
3. For technical issues: Guide step-by-step with patience
4. Always encourage and motivate students
5. **IMPORTANT**: If Retrieved Knowledge is provided below, use it to give accurate answers

## Limitations | الحدود
- Do not provide medical advice for real patients
- Do not guarantee exam results
- Redirect clinical questions to professors/doctors
- Focus on educational support only

## Remember | تذكر
- Save time, study smart | وفر الوقت، ادرس بذكاء
- First app of its kind in Constantine
- Built by students, for students
- بالتوفيق في امتحاناتك! 📚
`;

// Try Gemini model
async function tryGeminiModel(
  modelId: string,
  message: string,
  systemPrompt: string,
  timeoutMs: number
): Promise<{ success: boolean; text?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY not configured' };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'مفهوم! أنا جاهز لمساعدة طلبة كلية الطب قسنطينة. 📚' }] },
      ],
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await chat.sendMessage(message, { signal: controller.signal });
      const response = result.response;
      return { success: true, text: response.text() };
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || (error.message && /abort|canceled|cancelled/i.test(error.message))) {
      return { success: false, error: 'timeout' };
    }
    const errorMessage = error.message || '';
    const isRateLimited =
      errorMessage.includes('429') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate') ||
      errorMessage.includes('Resource has been exhausted');

    return { success: false, error: isRateLimited ? 'rate_limited' : errorMessage };
  }
}

// Try OpenRouter model
async function tryOpenRouterModel(
  modelId: string,
  message: string,
  systemPrompt: string,
  timeoutMs: number
): Promise<{ success: boolean; text?: string; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY not configured' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005',
          'X-Title': 'FMC App - Medical Education',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const isRateLimited = response.status === 429 || 
        errorData.error?.message?.includes('rate') ||
        errorData.error?.message?.includes('quota');
      
      return { 
        success: false, 
        error: isRateLimited ? 'rate_limited' : (errorData.error?.message || `HTTP ${response.status}`)
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      return { success: false, error: 'No response content' };
    }

    return { success: true, text };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'timeout' };
    }
    return { success: false, error: error.message || 'OpenRouter request failed' };
  }
}

// Per-model attempt timeout (30 seconds)
const MODEL_TIMEOUT_MS = 30_000;

// Try a model based on its provider, with a timeout deadline.
// Wraps in Promise.race to enforce timeout even if the SDK ignores AbortSignal.
async function tryModel(
  modelId: string,
  message: string,
  systemPrompt: string,
  deadline: number
): Promise<{ success: boolean; text?: string; error?: string }> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return { success: false, error: 'timeout' };
  }

  const provider = getModelProvider(modelId);
  const timeoutMs = Math.min(remaining, MODEL_TIMEOUT_MS);

  const modelCall = provider === 'gemini'
    ? tryGeminiModel(modelId, message, systemPrompt, timeoutMs)
    : tryOpenRouterModel(modelId, message, systemPrompt, timeoutMs);

  let timerId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
    timerId = setTimeout(() => resolve({ success: false, error: 'timeout' }), timeoutMs);
  });

  try {
    return await Promise.race([modelCall, timeoutPromise]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

// Total request deadline (90 seconds)
const REQUEST_DEADLINE_MS = 90_000;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const deadline = startTime + REQUEST_DEADLINE_MS;

  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    // Parse request body with explicit error handling
    let body: any;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, rateLimitResult.headers);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Invalid JSON body', 400, rateLimitResult.headers);
    }

    const { message, model: requestedModel, autoFallback = true, enableRAG = true } = body;

    if (!message || typeof message !== 'string') {
      return errorResponse('Message is required', 400, rateLimitResult.headers);
    }

    // Validate message length
    if (message.length > MAX_MESSAGE_LENGTH) {
      return errorResponse(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`, 400, rateLimitResult.headers);
    }

    const selectedModel = requestedModel || DEFAULT_MODEL;

    // RAG: Search for relevant knowledge
    let contextResults: any[] = [];
    let systemPrompt = baseSystemPrompt;

    if (enableRAG) {
      try {
        contextResults = await searchKnowledge(message, { threshold: 0.5, limit: 3 });
        if (contextResults.length > 0) {
          const contextText = formatContextForPrompt(contextResults);
          systemPrompt = baseSystemPrompt + contextText;
        }
      } catch (ragError) {
        console.warn('RAG search failed, continuing without context:', ragError);
      }
    }

    // Try the requested model first
    let result = await tryModel(selectedModel, message, systemPrompt, deadline);
    let usedModel = selectedModel;

    // If failed and auto-fallback is enabled, try other models
    if (!result.success && autoFallback) {
      for (const fallbackModel of FALLBACK_ORDER) {
        if (fallbackModel === selectedModel) continue;

        // Check deadline before each attempt
        if (Date.now() >= deadline) {
          result = { success: false, error: 'timeout' };
          break;
        }

        result = await tryModel(fallbackModel, message, systemPrompt, deadline);
        usedModel = fallbackModel;

        if (result.success) {
          break;
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const fallbackUsed = usedModel !== selectedModel;

    if (!result.success) {
      let errorMessage: string;
      let errorStatus: number;

      if (result.error === 'rate_limited') {
        errorMessage = 'All models are currently rate limited. Please try again in a few minutes.';
        errorStatus = 429;
      } else if (result.error === 'timeout') {
        errorMessage = 'Request timed out. Please try again.';
        errorStatus = 504;
      } else {
        errorMessage = 'Failed to generate response';
        errorStatus = 500;
      }

      return errorResponse(errorMessage, errorStatus, rateLimitResult.headers);
    }

    // Log the interaction (async, don't wait)
    logChatInteraction({
      model: usedModel,
      model_name: getModelDisplayName(usedModel),
      message,
      response: result.text || '',
      context_used: contextResults,
      fallback_used: fallbackUsed,
      response_time_ms: responseTime,
    }).catch(err => console.warn('Failed to log chat:', err));

    return successResponse({
      reply: result.text,
      model: usedModel,
      modelName: getModelDisplayName(usedModel),
      provider: getModelProvider(usedModel),
      fallbackUsed,
      ragUsed: contextResults.length > 0,
      contextCount: contextResults.length,
    }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}

// GET endpoint to list available models
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req);
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    return successResponse({
      models: ALL_MODELS,
      default: DEFAULT_MODEL,
      fallbackOrder: FALLBACK_ORDER,
      providers: {
        gemini: { configured: !!process.env.GEMINI_API_KEY },
        openrouter: { configured: !!process.env.OPENROUTER_API_KEY },
      },
      features: {
        rag: true,
        logging: true,
      }
    }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
