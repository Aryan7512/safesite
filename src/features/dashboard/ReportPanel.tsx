// Report detail used by Inbox, Actions and deep links: what was reported,
// what the AI suggested vs what a human decided, the SLA, the legal next
// actions, and the full audit trail.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isBreached } from '@/domain/metrics';
import { plantClock, plantDate } from '@/domain/shift';
import { ago, countdownText, formatDuration } from '@/domain/sla';
import { reportLabel, type AuditRow, type Item } from '@/domain/types';
import { classify, api } from '@/lib/api';
import { useAreas, useAudit, useItems, useNow, useSettings, useSignedUrl, useUserName } from '@/lib/queries';
import { SEVERITY_GLYPH, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, Flag, ordinal, SeverityBadge, StatusChip } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Card, Divider, Row } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { Photo } from '@/features/worker/chrome';
import { AssignDialog, CloseDialog, ReclassifyDialog, useAct } from './dialogs';
import { useDash } from './store';

const when = (iso: string) => `${plantDate(new Date(iso))} ${plantClock(new Date(iso))}`;

export function ReportPanel({ item }: { item: Item }) {
  const { p } = useTheme();
  const { report: r, action: a } = item;
  const now = useNow(1000);
  const settings = useSettings();
  const userName = useUserName();
  const { data: areas } = useAreas();
  const { items } = useItems();
  const open = useDash((s) => s.open);
  const { run, busy } = useAct();
  const [dialog, setDialog] = useState<null | 'reclassify' | 'assign' | 'close'>(null);
  const area = areas?.find((x) => x.id === r.area_id);
  const parent = r.is_duplicate_of ? items.find((i) => i.report.id === r.is_duplicate_of) : null;
  const cd = countdownText(a, now);
  const breached = isBreached(item, now);
  const merged = a.merged_into != null;
  const overridden = r.triaged_at && r.ai_status === 'done' && (r.ai_category !== r.category || r.ai_severity !== r.severity);

  return (
    <View style={{ gap: space.lg }}>
      {/* Header */}
      <View style={{ gap: space.sm }}>
        <Row between wrap>
          <Row gap={space.sm}>
            <T v="monoLg">{reportLabel(r.report_no)}</T>
            <StatusChip status={a.status} merged={merged} />
          </Row>
          <T v="small" color="dim">
            {when(r.created_at)} · Shift {r.shift} · {ago(r.created_at, now)}
          </T>
        </Row>
        <Row gap={space.sm} wrap>
          <SeverityBadge severity={r.severity} size="lg" />
          <CategoryLabel category={r.category} v="h3" />
          <T v="h3" color="dim">
            · {area?.name}
          </T>
        </Row>
        {r.title ? (
          <T v="h1" accessibilityRole="header">
            {r.title}
          </T>
        ) : null}
        {r.summary ? <T v="bodyLg" color="dim">{r.summary}</T> : null}
        <Row gap={space.sm} wrap>
          {r.needs_review && !merged ? <Flag icon="eye-check-outline" label="Needs review" tone="warn" /> : null}
          {r.guard_reason ? <Flag icon="shield-alert-outline" label={`Keyword guard: ${r.guard_reason}`} tone="danger" /> : null}
          {r.is_repeat ? <Flag icon="repeat" label={`${ordinal(r.repeat_count)} in ${settings.repeat_window_d} days`} tone="warn" /> : null}
          {r.duplicate_status === 'suggested' && parent ? (
            <Flag icon="content-duplicate" label={`Possible duplicate of ${reportLabel(parent.report.report_no)}`} tone="accent" />
          ) : null}
          {merged && parent ? <Flag icon="link-variant" label={`Merged into ${reportLabel(parent.report.report_no)}`} tone="neutral" /> : null}
          {a.escalated_level > 0 ? <Flag icon="arrow-up-bold-circle-outline" label="Escalated to EHS Lead" tone="escalated" /> : null}
          {a.reminded_at ? <Flag icon="bell-outline" label="Reminder sent to EHS Lead" /> : null}
          {r.input_mode === 'text' ? <Flag icon="keyboard-outline" label="Typed" /> : null}
        </Row>
      </View>

      {/* Action / SLA */}
      <Card accent={breached ? p.high : a.escalated_level ? p.escalated : undefined}>
        <Row between wrap gap={space.md}>
          <View style={{ gap: 2 }}>
            <T v="label" color="dim">
              Owner
            </T>
            <T v="h3">{userName(a.owner_id)}</T>
          </View>
          <View style={{ gap: 2 }}>
            <T v="label" color="dim">
              Due
            </T>
            <T v="h3">{when(a.due_at)}</T>
          </View>
          <View style={{ gap: 2, alignItems: 'flex-end' }}>
            <T v="label" color="dim">
              SLA
            </T>
            <T v="monoLg" color={a.status === 'Closed' ? 'clear' : cd.overdue ? 'high' : a.escalated_level ? 'escalated' : 'text'}>
              {a.status === 'Closed' && a.closed_at ? `Closed in ${formatDuration(new Date(a.closed_at).getTime() - new Date(r.created_at).getTime())}` : cd.text}
            </T>
          </View>
        </Row>
        {!merged ? (
          <Row gap={space.sm} wrap>
            {a.status !== 'Closed' ? (
              <>
                {r.needs_review && r.category ? (
                  <Button label="Accept AI result" size="sm" icon="check" variant="secondary" loading={busy === 'acc'} onPress={() => run('acc', () => api.accept(r.id), 'Accepted')} />
                ) : null}
                <Button label="Reclassify" size="sm" icon="tag-edit-outline" variant="secondary" onPress={() => setDialog('reclassify')} />
                {a.status === 'New' ? (
                  <Button label="Assign" size="sm" icon="account-arrow-right-outline" disabled={!r.category} onPress={() => setDialog('assign')} />
                ) : (
                  <Button label="Reassign" size="sm" icon="account-switch-outline" variant="secondary" onPress={() => setDialog('assign')} />
                )}
                {a.status === 'Assigned' ? (
                  <Button label="Start work" size="sm" icon="progress-wrench" loading={busy === 'st'} onPress={() => run('st', () => api.start(r.id), 'In progress')} />
                ) : null}
                {a.status === 'In Progress' ? <Button label="Close with note" size="sm" icon="check-decagram" onPress={() => setDialog('close')} /> : null}
                {r.duplicate_status === 'suggested' ? (
                  <>
                    <Button label="Merge duplicate" size="sm" icon="call-merge" variant="secondary" loading={busy === 'mg'} onPress={() => run('mg', () => api.merge(r.id), 'Merged — it will close with the original')} />
                    <Button label="Not a duplicate" size="sm" icon="close" variant="quiet" loading={busy === 'ds'} onPress={() => run('ds', () => api.dismiss(r.id), 'Duplicate dismissed')} />
                  </>
                ) : null}
              </>
            ) : null}
          </Row>
        ) : parent ? (
          <Button label={`Open ${reportLabel(parent.report.report_no)}`} size="sm" variant="secondary" icon="open-in-new" onPress={() => open(parent.report.id)} />
        ) : null}
        {!r.category && a.status !== 'Closed' ? (
          <T v="small" color="medium">
            Unclassified — set category and severity (Reclassify) before assigning.
          </T>
        ) : null}
      </Card>

      {a.status === 'Closed' ? (
        <Card accent={p.clear}>
          <Row gap={space.sm}>
            <Icon name="check-decagram" color={p.clear} />
            <T v="h3">Resolution</T>
          </Row>
          <T v="body">{a.resolution_note}</T>
          {a.fix_photo_url ? <Photo path={a.fix_photo_url} size={160} /> : null}
        </Card>
      ) : null}

      {r.recommended_action && a.status !== 'Closed' ? (
        <Card accent={p.accent}>
          <Row gap={space.sm}>
            <Icon name="lightbulb-on-outline" color={p.accent} />
            <T v="h3">Suggested next step</T>
          </Row>
          <T v="bodyLg">{r.recommended_action}</T>
          <T v="small" color="faint">
            Written by AI from the report. You decide what to do.
          </T>
        </Card>
      ) : null}

      {r.vision_summary ? (
        <Card accent={r.vision_severity ? undefined : p.borderStrong}>
          <Row between>
            <Row gap={space.sm}>
              <Icon name="image-search-outline" color={p.textDim} />
              <T v="h3">What the photo shows</T>
            </Row>
            {r.vision_severity ? (
              <Row gap={6}>
                <SeverityBadge severity={r.vision_severity} />
                <T v="small" color="dim">
                  by the photo alone
                </T>
              </Row>
            ) : (
              <T v="small" color="faint">
                No hazard seen
              </T>
            )}
          </Row>
          <T v="body">{r.vision_summary}</T>
          <T v="small" color="faint">
            Image analysis by {r.vision_model ?? 'a vision model'}. The final severity is the higher of the photo and the description.
          </T>
        </Card>
      ) : null}

      {/* AI card */}
      <AiCard item={item} overridden={!!overridden} onRetry={() => run('ai', () => classify(r.id), 'Classification requested')} retrying={busy === 'ai'} />

      {/* What was reported */}
      <Card>
        <T v="label" color="dim">
          Report
        </T>
        <T v="bodyLg">{r.transcript || '—'}</T>
        {r.transcript_en && r.transcript_en.trim().toLowerCase() !== (r.transcript ?? '').trim().toLowerCase() ? (
          <View style={{ gap: 2 }}>
            <T v="small" color="faint">
              In English (machine translation)
            </T>
            <T v="body" color="dim">
              {r.transcript_en}
            </T>
          </View>
        ) : null}
        {r.audio_url ? <AudioClip path={r.audio_url} /> : null}
        {r.photo_urls.length ? (
          <Row gap={space.sm} wrap>
            {r.photo_urls.map((ph) => (
              <Photo key={ph} path={ph} size={168} />
            ))}
          </Row>
        ) : null}
        <Row gap={space.lg} wrap>
          <T v="small" color="dim">
            Reporter: {userName(r.user_id)}
          </T>
          {r.lat != null ? (
            <T v="small" color="dim">
              GPS {r.lat.toFixed(4)}, {r.lng?.toFixed(4)}
            </T>
          ) : null}
          {r.capture_seconds ? (
            <T v="small" color="dim">
              Reported in {r.capture_seconds}s
            </T>
          ) : null}
        </Row>
      </Card>

      <AuditTrail reportId={r.id} />

      <ReclassifyDialog item={dialog === 'reclassify' ? item : null} onClose={() => setDialog(null)} />
      <AssignDialog item={dialog === 'assign' ? item : null} onClose={() => setDialog(null)} />
      <CloseDialog item={dialog === 'close' ? item : null} onClose={() => setDialog(null)} />
    </View>
  );
}

function AiCard({ item, overridden, onRetry, retrying }: { item: Item; overridden: boolean; onRetry: () => void; retrying: boolean }) {
  const { p } = useTheme();
  const settings = useSettings();
  const r = item.report;
  const conf = r.ai_confidence;
  const thr = settings.confidence_threshold;
  return (
    <Card>
      <Row between>
        <Row gap={space.sm}>
          <Icon name="robot-outline" color={p.textDim} />
          <T v="label" color="dim">
            AI suggestion
          </T>
        </Row>
        <T v="micro" color="faint">
          {r.ai_model ?? ''}
        </T>
      </Row>
      {r.ai_status === 'pending' ? (
        <View style={{ gap: space.sm }}>
          <T v="body" color="dim">
            Processing… if no result arrives within 2 minutes this becomes Unclassified for manual triage.
          </T>
          <Button label="Run AI now" size="sm" variant="secondary" icon="refresh" loading={retrying} onPress={onRetry} />
        </View>
      ) : r.ai_status === 'failed' ? (
        <View style={{ gap: space.sm }}>
          <T v="body">Classification failed or timed out — saved as Unclassified for manual triage.</T>
          {r.ai_error ? (
            <T v="micro" color="faint" numberOfLines={2}>
              {r.ai_error}
            </T>
          ) : null}
          <Button label="Retry AI" size="sm" variant="secondary" icon="refresh" loading={retrying} onPress={onRetry} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Row gap={space.lg} wrap>
            <Compare label="Category" ai={r.ai_category ?? '—'} human={r.category ?? '—'} changed={overridden && r.ai_category !== r.category} />
            <Compare
              label="Severity"
              ai={r.ai_severity ? `${SEVERITY_GLYPH[r.ai_severity]} ${r.ai_severity}` : '—'}
              human={r.severity ? `${SEVERITY_GLYPH[r.severity]} ${r.severity}` : '—'}
              changed={r.ai_severity !== r.severity}
              why={r.guard_reason && r.ai_severity !== 'High' && r.severity === 'High' && !r.triaged_at ? 'raised by keyword guard' : overridden ? 'human override' : undefined}
            />
          </Row>
          {conf != null ? (
            <View style={{ gap: 4 }}>
              <Row between>
                <T v="small" color="dim">
                  Model-reported confidence
                </T>
                <T v="mono" color={conf < thr ? 'medium' : 'text'}>
                  {Math.round(conf * 100)}%
                </T>
              </Row>
              <View style={[styles.confTrack, { backgroundColor: p.sunken }]}>
                <View style={{ width: `${conf * 100}%`, height: '100%', backgroundColor: conf < thr ? p.medium : p.accent, borderRadius: 4 }} />
                <View style={[styles.thr, { left: `${thr * 100}%`, backgroundColor: p.text }]} />
              </View>
              <T v="micro" color="faint">
                Below {Math.round(thr * 100)}% the report is flagged for review.
              </T>
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

function Compare({ label, ai, human, changed, why }: { label: string; ai: string; human: string; changed: boolean; why?: string }) {
  const { p } = useTheme();
  return (
    <View style={{ gap: 4, minWidth: 180 }}>
      <T v="label" color="dim">
        {label}
      </T>
      {changed ? (
        <Row gap={space.sm} wrap>
          <T v="body" color="dim" style={{ textDecorationLine: 'line-through' }}>
            AI: {ai}
          </T>
          <Icon name="arrow-right" size={16} color={p.textDim} />
          <T v="body" weight="bold">
            {human}
          </T>
        </Row>
      ) : (
        <T v="body" weight="semibold">
          {human}
        </T>
      )}
      {why ? (
        <T v="micro" color="medium">
          {why}
        </T>
      ) : null}
    </View>
  );
}

function AudioClip({ path }: { path: string }) {
  const url = useSignedUrl(path);
  if (!url.data) return null;
  return <AudioPlayerButton uri={url.data} />;
}

function AudioPlayerButton({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const st = useAudioPlayerStatus(player);
  return (
    <Button
      label={st.playing ? 'Stop voice clip' : `Play voice clip${st.duration ? ` (${Math.round(st.duration)}s)` : ''}`}
      icon={st.playing ? 'stop' : 'play'}
      size="sm"
      variant="secondary"
      onPress={() => {
        if (st.playing) player.pause();
        else {
          player.seekTo(0);
          player.play();
        }
      }}
    />
  );
}

const AUDIT_LABEL: Record<string, string> = {
  created: 'Reported',
  ai_classified: 'AI classified',
  ai_failed: 'AI failed — manual triage',
  duplicate_suggested: 'Possible duplicate flagged',
  repeat_flagged: 'Repeat hazard flagged',
  accepted: 'AI result accepted',
  reclassified: 'Reclassified (human override)',
  assigned: 'Assigned',
  status_changed: 'Status changed',
  escalated: 'Escalated',
  reminder_sent: 'Reminder sent to EHS Lead (Low: no escalation)',
  sla_breached: 'SLA breached',
  closed: 'Closed',
  merged: 'Merged as duplicate',
  duplicate_merged_in: 'Duplicate merged in',
  duplicate_dismissed: 'Duplicate dismissed',
  synced_from_parent: 'Followed parent report',
};

function describe(row: AuditRow, userName: (id: string | null) => string): string {
  const o = (row.old_value ?? {}) as Record<string, unknown>;
  const n = (row.new_value ?? {}) as Record<string, unknown>;
  switch (row.action_type) {
    case 'ai_classified':
      return `${n.ai_category ?? '—'} · AI ${n.ai_severity ?? '—'}${n.severity && n.severity !== n.ai_severity ? ` → ${n.severity} (guard)` : ''}${n.ai_confidence != null ? ` · ${Math.round(Number(n.ai_confidence) * 100)}%` : ''}`;
    case 'reclassified':
      return `${o.category ?? '—'} / ${o.severity ?? '—'} → ${n.category} / ${n.severity}${o.ai_severity ? ` · AI said ${o.ai_category} / ${o.ai_severity}` : ''}${n.reason ? ` · “${n.reason}”` : ''}`;
    case 'assigned':
      return `${o.status} → ${n.status} · owner ${userName(n.owner_id as string)}`;
    case 'status_changed':
      return `${o.status} → ${n.status}`;
    case 'escalated':
      return `to ${n.to} · ${n.reason}`;
    case 'closed':
      return String(n.resolution_note ?? '');
    case 'repeat_flagged':
      return `${ordinal(Number(n.repeat_count))} in 7 days`;
    case 'duplicate_suggested':
      return `of ${n.of_report_no}`;
    case 'sla_breached':
      return `due ${n.due_at ? when(String(n.due_at)) : ''}`;
    default:
      return '';
  }
}

function AuditTrail({ reportId }: { reportId: number }) {
  const { data } = useAudit(reportId);
  const userName = useUserName();
  return (
    <Card>
      <Row between>
        <T v="label" color="dim">
          Audit trail
        </T>
        <T v="micro" color="faint">
          insert-only
        </T>
      </Row>
      {(data ?? []).map((row, i) => (
        <View key={row.id} style={{ gap: 2 }}>
          {i > 0 ? <Divider /> : null}
          <Row between align="flex-start" style={{ paddingTop: i > 0 ? space.sm : 0 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="small" weight="semibold" color={row.action_type === 'escalated' ? 'escalated' : row.action_type === 'sla_breached' ? 'high' : 'text'}>
                {AUDIT_LABEL[row.action_type] ?? row.action_type}
              </T>
              {describe(row, userName) ? (
                <T v="small" color="dim">
                  {describe(row, userName)}
                </T>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T v="mono" color="dim">
                {when(row.ts)}
              </T>
              <T v="micro" color="faint">
                {row.actor_id ? userName(row.actor_id) : 'System rule'}
              </T>
            </View>
          </Row>
        </View>
      ))}
      {!data?.length ? (
        <T v="small" color="faint">
          Loading…
        </T>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  confTrack: { height: 8, borderRadius: 4, overflow: 'visible', position: 'relative' },
  thr: { position: 'absolute', top: -3, width: 2, height: 14 },
});

