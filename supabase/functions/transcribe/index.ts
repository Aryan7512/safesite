// Edge Function: transcribe (PRD §8 pipeline step 2)
// POST { path } — path of a voice clip the caller uploaded to report-media.
// Returns { ok, text, language, model } or { ok: false, error }; on failure the
// app lets the worker type instead. Never blocks saving a report.

import { withSupabase } from 'npm:@supabase/server@1';
import { transcribe } from '../_shared/groq.ts';

const MAX_BYTES = 10 * 1024 * 1024;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const started = Date.now();
    const uid = ctx.userClaims?.id;
    let path = '';
    try {
      ({ path } = await req.json());
    } catch {
      return Response.json({ ok: false, error: 'bad request' }, { status: 400 });
    }

    // Callers may only transcribe their own uploads.
    if (!uid || typeof path !== 'string' || !path.startsWith(`${uid}/`) || path.includes('..')) {
      return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const { data: blob, error } = await ctx.supabaseAdmin.storage.from('report-media').download(path);
    if (error || !blob) {
      return Response.json({ ok: false, error: 'audio not found' }, { status: 404 });
    }
    if (blob.size > MAX_BYTES) {
      return Response.json({ ok: false, error: 'clip too long' }, { status: 413 });
    }

    try {
      const filename = path.split('/').pop() ?? 'voice.m4a';
      const out = await transcribe(blob, filename);
      return Response.json({ ok: true, ...out, ms: Date.now() - started });
    } catch (e) {
      console.error('transcribe failed', String(e));
      return Response.json({ ok: false, error: e instanceof Error ? e.message : 'failed', ms: Date.now() - started });
    }
  }),
};
