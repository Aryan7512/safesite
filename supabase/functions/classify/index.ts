// Edge Function: classify (PRD §8 pipeline steps 3–6)
//
// User call  : POST { report_id }        → classify a report the caller can see,
//                                          store via apply_classification().
// Secret call: POST { dry_run: true, transcript, area } → classify only, no DB
//                                          write (used by scripts/eval-classify.ts).
//
// Flow: LLM (strict JSON schema) → validate against enums → keyword guard →
// apply_classification() which runs the duplicate + repeat SQL rules.
// Any failure still stores a result: Unclassified + needs_review (manual triage).

import { withSupabase } from 'npm:@supabase/server@1';
import { applyGuard, keywordGuard } from '../_shared/guard.ts';
import { chatJson, MODELS } from '../_shared/groq.ts';
import { SYSTEM_PROMPT, userPrompt } from '../_shared/prompt.ts';
import { CLASSIFICATION_SCHEMA, validateClassification } from '../_shared/schema.ts';

async function classifyText(areaName: string, transcript: string) {
  const guard = keywordGuard(transcript);
  const errors: string[] = [];

  for (const model of [MODELS.classify, MODELS.classifyFallback]) {
    try {
      const raw = await chatJson(model, SYSTEM_PROMPT, userPrompt(areaName, transcript), CLASSIFICATION_SCHEMA);
      const v = validateClassification(raw);
      // The model reports high confidence almost always, so confidence alone is a
      // weak control. Very short descriptions are also sent for human review.
      if (transcript.trim().split(/\s+/).length < 4) {
        v.invalid = true;
        v.problems.push('description too short to classify reliably');
      }
      return {
        status: 'done' as const,
        model,
        category: v.category,
        raw_severity: v.severity,
        severity: applyGuard(v.severity, guard),
        confidence: v.confidence,
        summary: v.summary,
        language: v.language,
        invalid: v.invalid,
        problems: v.problems,
        guard_reason: guard.reason,
        error: errors.join(' | ') || null,
      };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Both models failed or timed out: Unclassified, manual triage. The guard
  // still applies because it is plain code.
  return {
    status: 'failed' as const,
    model: null,
    category: null,
    raw_severity: null,
    severity: applyGuard(null, guard),
    confidence: null,
    summary: null,
    language: null,
    invalid: true,
    problems: [],
    guard_reason: guard.reason,
    error: errors.join(' | ').slice(0, 300),
  };
}

export default {
  fetch: withSupabase({ auth: ['user', 'secret'] }, async (req, ctx) => {
    const started = Date.now();
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'bad request' }, { status: 400 });
    }

    if (body.dry_run) {
      if (ctx.authMode !== 'secret') return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
      const result = await classifyText(String(body.area ?? 'Unknown'), String(body.transcript ?? ''));
      return Response.json({ ok: true, result, ms: Date.now() - started });
    }

    const reportId = Number(body.report_id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return Response.json({ ok: false, error: 'report_id required' }, { status: 400 });
    }

    // Visibility check through RLS: the caller must be allowed to see the report.
    const reader = ctx.authMode === 'secret' ? ctx.supabaseAdmin : ctx.supabase;
    const { data: report, error } = await reader
      .from('reports')
      .select('id, transcript, area_id')
      .eq('id', reportId)
      .maybeSingle();
    if (error || !report) return Response.json({ ok: false, error: 'not found' }, { status: 404 });

    const { data: area } = await ctx.supabaseAdmin.from('areas').select('name').eq('id', report.area_id).single();

    const result = report.transcript.trim()
      ? await classifyText(area?.name ?? 'Unknown', report.transcript)
      : { status: 'failed' as const, severity: null, guard_reason: null, error: 'no description to classify' };

    const { data: applied, error: applyError } = await ctx.supabaseAdmin.rpc('apply_classification', {
      p_report: reportId,
      p_ai: result,
    });
    if (applyError) {
      console.error('apply_classification failed', applyError.message);
      return Response.json({ ok: false, error: 'could not store result' }, { status: 500 });
    }

    return Response.json({ ok: true, result, applied, ms: Date.now() - started });
  }),
};
