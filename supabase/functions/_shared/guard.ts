// Keyword guard (PRD §8 Controls). Runs AFTER the model, and also when the
// model fails. A match raises severity to at least High and the matched term
// is stored as the reason. Plain code, no AI: deterministic and explainable.
//
// Known limit, by design: it does not understand negation ("no leak" still
// matches). That errs on the side of safety; a supervisor can lower it.

export interface GuardTerm {
  /** Shown to the supervisor as the reason, e.g. "gas". */
  label: string;
  /** Spellings to match as whole words (case-insensitive). */
  forms: string[];
}

export const GUARD_TERMS: GuardTerm[] = [
  { label: 'fire', forms: ['fire', 'fires', 'flame', 'flames', 'aag', 'आग', 'लपट', 'लपटें'] },
  { label: 'smoke', forms: ['smoke', 'smoking', 'fumes', 'dhuan', 'dhuaan', 'dhua','धुआं', 'धुआँ', 'धुंआ', 'धुँआ'] },
  { label: 'gas', forms: ['gas', 'gases', 'गैस'] },
  { label: 'leak', forms: ['leak', 'leaks', 'leaking', 'leakage', 'rishaav', 'risav', 'risaav', 'रिसाव', 'लीक', 'लीकेज'] },
  { label: 'explosion', forms: ['explosion', 'explode', 'exploded', 'blast', 'visphot', 'dhamaka', 'विस्फोट', 'धमाका'] },
  { label: 'injury', forms: ['injury', 'injuries', 'injured', 'bleeding', 'chot', 'ghayal', 'चोट', 'चोटें', 'घायल', 'खून'] },
  { label: 'unconscious', forms: ['unconscious', 'fainted', 'collapsed', 'behosh', 'बेहोश'] },
  { label: 'burn', forms: ['burn', 'burns', 'burnt', 'burned', 'jhulas', 'झुलसा', 'झुलस'] },
];

const LETTER = '[\\p{L}\\p{M}\\p{N}]';

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PATTERNS = GUARD_TERMS.map((term) => ({
  label: term.label,
  re: new RegExp(`(?<!${LETTER})(?:${term.forms.map(escape).join('|')})(?!${LETTER})`, 'iu'),
}));

export interface GuardResult {
  hit: boolean;
  /** Comma-separated labels, e.g. "gas, leak". */
  reason: string | null;
  matches: string[];
}

// Safety-equipment names that contain a trigger word but are not a hazard by
// themselves ("fire extinguisher is empty" is Medium, not a fire).
const BENIGN = /\bfire[\s-]?(extinguishers?|exits?|drills?|hydrants?|blankets?|doors?|points?)\b|\bgas[\s-]?(detectors?|test(?:ing|ed)?|cylinders?|bottles?)\b|फायर एक्सटिंग्विशर/giu;

export function keywordGuard(text: string): GuardResult {
  const norm = (text ?? '').normalize('NFC').replace(BENIGN, ' ');
  const matches = PATTERNS.filter((p) => p.re.test(norm)).map((p) => p.label);
  return { hit: matches.length > 0, reason: matches.length ? matches.join(', ') : null, matches };
}

const RANK = { Low: 1, Medium: 2, High: 3 } as const;
export type Sev = keyof typeof RANK;

/** Final severity: the model's suggestion, raised to High when the guard hits. */
export function applyGuard(modelSeverity: Sev | null, guard: GuardResult): Sev | null {
  if (!guard.hit) return modelSeverity;
  if (modelSeverity && RANK[modelSeverity] >= RANK.High) return modelSeverity;
  return 'High';
}
