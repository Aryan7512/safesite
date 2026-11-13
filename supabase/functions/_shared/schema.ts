// Output contract (PRD §8): { category, severity, confidence (0-1), summary, language }
// The model output is untrusted: it is validated against the enums, never
// executed, never used to build queries.

export const CATEGORIES = [
  'Spill / Leak',
  'Fire / Ignition',
  'Slip-Trip-Fall',
  'PPE',
  'Equipment Fault',
  'Chemical Exposure',
  'Electrical',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ['Low', 'Medium', 'High'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const LANGUAGES = ['en', 'hi', 'mixed'] as const;

/** Strict JSON schema for Groq structured outputs (all fields required, no extras). */
export const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: [...CATEGORIES] },
    severity: { type: 'string', enum: [...SEVERITIES] },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    language: { type: 'string', enum: [...LANGUAGES] },
  },
  required: ['category', 'severity', 'confidence', 'summary', 'language'],
  additionalProperties: false,
} as const;

export interface Classification {
  category: Category;
  severity: Severity;
  confidence: number;
  summary: string;
  language: (typeof LANGUAGES)[number] | null;
  /** True when anything had to be coerced: sets needs_review. */
  invalid: boolean;
  problems: string[];
}

/** Validate raw model output. Never throws; anything off-contract is coerced and flagged. */
export function validateClassification(raw: unknown): Classification {
  const problems: string[] = [];
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  let category = o.category as Category;
  if (!CATEGORIES.includes(category)) {
    problems.push(`category outside enum: ${String(o.category).slice(0, 40)}`);
    category = 'Other';
  }

  let severity = o.severity as Severity;
  if (!SEVERITIES.includes(severity)) {
    problems.push(`severity outside enum: ${String(o.severity).slice(0, 20)}`);
    severity = 'Medium';
  }

  let confidence = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence);
  if (!Number.isFinite(confidence)) {
    problems.push('confidence not a number');
    confidence = 0;
  }
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100; // "85" → 0.85
  confidence = Math.min(1, Math.max(0, confidence));

  let summary = typeof o.summary === 'string' ? o.summary.replace(/\s+/g, ' ').trim() : '';
  if (!summary) problems.push('empty summary');
  summary = summary.slice(0, 160);

  const language = LANGUAGES.includes(o.language as (typeof LANGUAGES)[number])
    ? (o.language as (typeof LANGUAGES)[number])
    : null;

  return { category, severity, confidence, summary, language, invalid: problems.length > 0, problems };
}
