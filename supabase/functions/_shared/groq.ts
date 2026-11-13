// Groq (free hosted inference for open-weight models). The API key lives only
// in Edge Function secrets (PRD §8). Model IDs are env vars so they can be
// swapped, or pointed at a self-hosted OpenAI-compatible server via GROQ_BASE_URL.

const BASE = Deno.env.get('GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1';
const KEY = () => {
  const k = Deno.env.get('GROQ_API_KEY');
  if (!k) throw new Error('GROQ_API_KEY is not set');
  return k;
};

export const MODELS = {
  stt: Deno.env.get('STT_MODEL') ?? 'whisper-large-v3',
  classify: Deno.env.get('CLASSIFY_MODEL') ?? 'openai/gpt-oss-120b',
  classifyFallback: Deno.env.get('CLASSIFY_FALLBACK_MODEL') ?? 'openai/gpt-oss-20b',
};

export class TimeoutError extends Error {}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) throw new TimeoutError(`timed out after ${ms} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Vocabulary hint: Devanagari safety terms nudge Whisper towards Devanagari
// output (instead of Urdu script) and towards plant vocabulary.
const STT_PROMPT =
  'Plant X safety report. टैंक, पाइप, वाल्व, रिसाव, गैस लीक, आग, धुआं निकल रहा है, चोट, बेहोश, हेलमेट, दस्ताने, पंप, मोटर, केमिकल, फर्श, फिसलन. ' +
  'Tank farm, reactor, distillation, loading bay, forklift, boiler, ETP, workshop, flange, gasket, leak, spill, smoke, PPE, harness.';

export interface Transcript {
  text: string;
  language: 'en' | 'hi' | 'mixed' | null;
  model: string;
}

const ARABIC = /[؀-ۿ]/;
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

export function detectLanguage(text: string, reported?: string | null): Transcript['language'] {
  const dev = DEVANAGARI.test(text);
  const lat = LATIN_WORD.test(text);
  if (dev && lat) return 'mixed';
  if (dev) return 'hi';
  const r = (reported ?? '').toLowerCase();
  if (r === 'hindi' || r === 'hi') return 'hi';
  if (lat) return 'en';
  return null;
}

async function callWhisper(audio: Blob, filename: string, language?: string, signal?: AbortSignal) {
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', MODELS.stt);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('prompt', STT_PROMPT);
  if (language) form.append('language', language);
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY()}` },
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`whisper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { text: string; language?: string };
}

export async function transcribe(audio: Blob, filename: string, timeoutMs = 20_000): Promise<Transcript> {
  return withTimeout(timeoutMs, async (signal) => {
    // Auto-detect first (Hindi or English, PRD §8 step 2) …
    let out = await callWhisper(audio, filename, undefined, signal);
    // … but Whisper sometimes writes Hindi speech in Urdu script. Retry as Hindi.
    if (ARABIC.test(out.text) || (out.language ?? '').toLowerCase().startsWith('ur')) {
      out = await callWhisper(audio, filename, 'hi', signal);
    }
    const text = (out.text ?? '').trim();
    return { text, language: detectLanguage(text, out.language), model: MODELS.stt };
  });
}

export async function chatJson(
  model: string,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  timeoutMs = 8_000,
): Promise<unknown> {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 600,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'hazard_classification', strict: true, schema },
        },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error(`${model}: empty response`);
    return JSON.parse(content);
  });
}
