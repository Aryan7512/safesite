// Edge Function: classify (PRD §8 pipeline steps 3–6)
//
// User call  : POST { report_id }        → classify a report the caller can see,
//                                          store via apply_classification().
// Secret call: POST { dry_run: true, transcript, area } → classify only, no DB
//                                          write (used by scripts/eval-classify.ts).
//
// Flow: photo → vision model (what the picture shows, how severe) ∥ text → LLM
// (strict JSON schema) → validate → keyword guard → combine → apply_classification(),
// which runs the duplicate + repeat SQL rules. Any failure still stores a result:
// Unclassified + needs_review (manual triage).

import { withSupabase } from 'npm:@supabase/server@1';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { applyGuard, keywordGuard, type Sev } from '../_shared/guard.ts';
import { chatJson, MODELS, visionJson } from '../_shared/groq.ts';
import { SYSTEM_PROMPT, userPrompt, VISION_SYSTEM, visionUser } from '../_shared/prompt.ts';
import { CLASSIFICATION_SCHEMA, validateClassification, validateVision, type VisionFinding } from '../_shared/schema.ts';

const RANK: Record<Sev, number> = { Low: 1, Medium: 2, High: 3 };
const maxSev = (a: Sev | null, b: Sev | null): Sev | null => (!a ? b : !b ? a : RANK[a] >= RANK[b] ? a : b);

async function analysePhoto(imageDataUrl: string | null, areaName: string, transcript: string) {
  if (!imageDataUrl) return { finding: null as VisionFinding | null, error: null as string | null };
  try {
    const raw = await visionJson(VISION_SYSTEM, visionUser(areaName, transcript), imageDataUrl);
    return { finding: validateVision(raw), error: null };
  } catch (e) {
    return { finding: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function classifyText(areaName: string, transcript: string) {
  const errors: string[] = [];
  for (const model of [MODELS.classify, MODELS.classifyFallback]) {
    try {
      const raw = await chatJson(model, SYSTEM_PROMPT, userPrompt(areaName, transcript), CLASSIFICATION_SCHEMA);
      return { v: validateClassification(raw), model, errors };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { v: null, model: null, errors };
}

/** First clause of a description, cut at a word boundary. */
function shortTitle(s: string): string {
  const first = s.split(/[.;:]/)[0].replace(/^(A|An|The)\s+/i, '').trim();
  const up = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  if (first.length <= 60) return up(first);
  const cut = first.slice(0, 60);
  return up(cut.slice(0, cut.lastIndexOf(' ')).replace(/[,\s]+$/, '')) + '…';
}

export async function classifyReport(areaName: string, transcript: string, imageDataUrl: string | null) {
  const text = transcript.trim();
  const guard = keywordGuard(text);
  const [photo, txt] = await Promise.all([
    analysePhoto(imageDataUrl, areaName, text),
    text ? classifyText(areaName, text) : Promise.resolve({ v: null, model: null, errors: ['no description'] }),
  ]);
  const vision = photo.finding;
  const visionSev = vision?.hazard_visible ? vision.severity : null;
  const vision_fields = {
    vision_summary: vision?.description ?? null,
    vision_severity: visionSev,
    vision_model: vision ? MODELS.vision : null,
  };

  if (txt.v) {
    const v = txt.v;
    // Final severity: the higher of what was said and what the photo shows, then the keyword guard.
    const combined = maxSev(v.severity, visionSev);
    return {
      status: 'done' as const,
      model: txt.model,
      category: v.category,
      raw_severity: v.severity,
      severity: applyGuard(combined, guard),
      confidence: v.confidence,
      title: v.title,
      summary: v.summary,
      recommended_action: v.recommended_action,
      transcript_en: v.transcript_en,
      language: v.language,
      invalid: v.invalid || text.split(/\s+/).length < 4,
      problems: v.problems,
      guard_reason: guard.reason,
      ...vision_fields,
      error: [...txt.errors, photo.error].filter(Boolean).join(' | ') || null,
    };
  }

  // Photo-only report (no usable text): the photo can still classify it.
  if (vision?.hazard_visible && vision.category) {
    return {
      status: 'done' as const,
      model: MODELS.vision,
      category: vision.category,
      raw_severity: visionSev,
      severity: applyGuard(visionSev, guard),
      confidence: 0.5, // photo alone: always reviewed by a person
      title: shortTitle(vision.description),
      summary: vision.description,
      recommended_action: vision.recommended_action || null,
      transcript_en: null,
      language: null,
      invalid: true,
      problems: ['classified from the photo only'],
      guard_reason: guard.reason,
      ...vision_fields,
      error: txt.errors.join(' | ') || null,
    };
  }

  // Nothing usable: Unclassified, manual triage. The guard still applies (plain code).
  return {
    status: 'failed' as const,
    model: null,
    category: null,
    raw_severity: null,
    severity: applyGuard(visionSev, guard),
    confidence: null,
    summary: vision?.description ?? null,
    language: null,
    invalid: true,
    problems: [],
    guard_reason: guard.reason,
    ...vision_fields,
    error: [...txt.errors, photo.error].filter(Boolean).join(' | ').slice(0, 300),
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
      const image = typeof body.image === 'string' ? body.image : null;
      const result = await classifyReport(String(body.area ?? 'Unknown'), String(body.transcript ?? ''), image);
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
      .select('id, transcript, area_id, photo_urls')
      .eq('id', reportId)
      .maybeSingle();
    if (error || !report) return Response.json({ ok: false, error: 'not found' }, { status: 404 });

    const { data: area } = await ctx.supabaseAdmin.from('areas').select('name').eq('id', report.area_id).single();

    // First photo → data URL for the vision model (photos are compressed to ~200 KB on the phone).
    let image: string | null = null;
    const firstPhoto = (report.photo_urls ?? [])[0];
    if (firstPhoto) {
      const { data: blob } = await ctx.supabaseAdmin.storage.from('report-media').download(firstPhoto);
      if (blob && blob.size < 4_000_000) {
        image = `data:${blob.type || 'image/jpeg'};base64,${encodeBase64(new Uint8Array(await blob.arrayBuffer()))}`;
      }
    }

    const result = await classifyReport(area?.name ?? 'Unknown', report.transcript ?? '', image);

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
