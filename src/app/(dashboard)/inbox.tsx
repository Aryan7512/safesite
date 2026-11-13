// Inbox (PRD §5.2): new reports filtered by shift, area, severity and flags.
// Row actions: accept, reclassify, assign (owner + SLA due date), merge duplicate.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ago } from '@/domain/sla';
import { reportLabel, SEVERITIES, type Item, type Severity } from '@/domain/types';
import { AssignDialog, ReclassifyDialog, useAct } from '@/features/dashboard/dialogs';
import { useDash, WIDE } from '@/features/dashboard/store';
import { api } from '@/lib/api';
import { useAreas, useItems, useNow, useSettings } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, Flag, ordinal, SeverityBadge, StatusChip } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Empty, Row } from '@/ui/Layout';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/Text';

type Scope = 'new' | 'open' | 'all';
type FlagFilter = 'any' | 'review' | 'duplicate' | 'repeat' | 'guard';

export default function Inbox() {
  const { p } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { items } = useItems();
  const { data: areas } = useAreas();
  const now = useNow(30_000);
  const { shift, setShift } = useDash();
  const [scope, setScope] = useState<Scope>('new');
  const [area, setArea] = useState<number | 'all'>('all');
  const [sev, setSev] = useState<Severity | 'all' | 'none'>('all');
  const [flag, setFlag] = useState<FlagFilter>('any');
  const [reclass, setReclass] = useState<Item | null>(null);
  const [assign, setAssign] = useState<Item | null>(null);

  const rows = useMemo(() => {
    return items
      .filter((i) => {
        const r = i.report;
        const a = i.action;
        if (scope === 'new' && (a.status !== 'New' || a.merged_into != null)) return false;
        if (scope === 'open' && a.status === 'Closed') return false;
        if (shift !== 'All' && r.shift !== shift) return false;
        if (area !== 'all' && r.area_id !== area) return false;
        if (sev === 'none' && r.severity) return false;
        if (sev !== 'all' && sev !== 'none' && r.severity !== sev) return false;
        if (flag === 'review' && !r.needs_review) return false;
        if (flag === 'duplicate' && r.duplicate_status !== 'suggested') return false;
        if (flag === 'repeat' && !r.is_repeat) return false;
        if (flag === 'guard' && !r.guard_reason) return false;
        return true;
      })
      .sort((a, b) => {
        // High first, then newest
        const rank = (i: Item) => (i.report.severity === 'High' ? 0 : i.report.needs_review ? 1 : 2);
        return rank(a) - rank(b) || new Date(b.report.created_at).getTime() - new Date(a.report.created_at).getTime();
      });
  }, [items, scope, shift, area, sev, flag]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.filters, { borderBottomColor: p.border }]}>
        <Row wrap gap={space.md}>
          <Segmented<Scope>
            label="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'new', label: `New · ${items.filter((i) => i.action.status === 'New' && i.action.merged_into == null).length}` },
              { value: 'open', label: 'All open' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Segmented
            label="Shift"
            value={shift}
            onChange={setShift}
            options={[
              { value: 'All', label: 'All shifts' },
              { value: 'A', label: 'A' },
              { value: 'B', label: 'B' },
              { value: 'C', label: 'C' },
            ]}
          />
          <Segmented<Severity | 'all' | 'none'>
            label="Severity"
            value={sev}
            onChange={setSev}
            options={[
              { value: 'all', label: 'Any severity' },
              ...SEVERITIES.map((s) => ({ value: s, label: s })),
              { value: 'none', label: 'Unclassified' },
            ]}
          />
          <Segmented<FlagFilter>
            label="Flag"
            value={flag}
            onChange={setFlag}
            options={[
              { value: 'any', label: 'Any flag' },
              { value: 'review', label: 'Needs review' },
              { value: 'duplicate', label: 'Duplicate' },
              { value: 'repeat', label: 'Repeat' },
              { value: 'guard', label: 'Guard' },
            ]}
          />
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          <AreaChip label="All areas" on={area === 'all'} onPress={() => setArea('all')} />
          {(areas ?? []).map((a) => (
            <AreaChip key={a.id} label={a.name} on={area === a.id} onPress={() => setArea(a.id)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxxl }}>
        {rows.length === 0 ? <Empty title="Inbox clear" body="No reports match these filters." /> : null}
        {rows.map((i) => (
          <InboxRow
            key={i.report.id}
            item={i}
            wide={wide}
            now={now}
            areaName={areas?.find((a) => a.id === i.report.area_id)?.name ?? ''}
            onReclassify={() => setReclass(i)}
            onAssign={() => setAssign(i)}
          />
        ))}
      </ScrollView>

      <ReclassifyDialog item={reclass} onClose={() => setReclass(null)} />
      <AssignDialog item={assign} onClose={() => setAssign(null)} />
    </View>
  );
}

function AreaChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { p } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? p.accent : p.sunken, borderColor: on ? p.accent : p.border }]}
    >
      <T v="small" weight="semibold" color={on ? p.accentText : p.textDim}>
        {label}
      </T>
    </Pressable>
  );
}

function InboxRow({
  item,
  wide,
  now,
  areaName,
  onReclassify,
  onAssign,
}: {
  item: Item;
  wide: boolean;
  now: Date;
  areaName: string;
  onReclassify: () => void;
  onAssign: () => void;
}) {
  const { p } = useTheme();
  const open = useDash((s) => s.open);
  const settings = useSettings();
  const { items } = useItems();
  const { run, busy } = useAct();
  const { report: r, action: a } = item;
  const parent = r.is_duplicate_of ? items.find((x) => x.report.id === r.is_duplicate_of) : null;
  const sevColor = r.severity === 'High' ? p.high : r.severity === 'Medium' ? p.medium : r.severity === 'Low' ? p.low : p.borderStrong;
  const fresh = now.getTime() - new Date(r.created_at).getTime() < 5 * 60_000;

  const flags = (
    <Row gap={6} wrap>
      {r.ai_status === 'pending' ? <Flag icon="progress-clock" label="Processing…" /> : null}
      {r.ai_status === 'failed' ? <Flag icon="robot-off-outline" label="AI failed · manual triage" tone="warn" /> : null}
      {r.needs_review && r.ai_status !== 'failed' && a.merged_into == null ? (
        <Flag icon="eye-check-outline" label="Needs review" tone="warn" />
      ) : null}
      {r.guard_reason ? <Flag icon="shield-alert-outline" label={`Guard: ${r.guard_reason}`} tone="danger" /> : null}
      {r.is_repeat ? <Flag icon="repeat" label={`${ordinal(r.repeat_count)} in ${settings.repeat_window_d} days`} tone="warn" /> : null}
      {r.duplicate_status === 'suggested' && parent ? (
        <Flag icon="content-duplicate" label={`Possible duplicate of ${reportLabel(parent.report.report_no)}`} tone="accent" />
      ) : null}
      {a.escalated_level ? <Flag icon="arrow-up-bold-circle-outline" label="Escalated" tone="escalated" /> : null}
    </Row>
  );

  const actions = (
    <Row gap={6} wrap>
      {a.status === 'New' && a.merged_into == null ? (
        <>
          {r.needs_review && r.category ? (
            <Button
              label="Accept"
              size="sm"
              variant="secondary"
              icon="check"
              loading={busy === 'acc'}
              onPress={() => run('acc', () => api.accept(r.id), `${reportLabel(r.report_no)} accepted`)}
            />
          ) : null}
          <Button label="Reclassify" size="sm" variant="secondary" icon="tag-edit-outline" onPress={onReclassify} />
          <Button label="Assign" size="sm" icon="account-arrow-right-outline" disabled={!r.category} onPress={onAssign} />
          {r.duplicate_status === 'suggested' ? (
            <Button
              label="Merge"
              size="sm"
              variant="secondary"
              icon="call-merge"
              loading={busy === 'mg'}
              onPress={() => run('mg', () => api.merge(r.id), 'Merged into the original report')}
            />
          ) : null}
        </>
      ) : (
        <StatusChip status={a.status} merged={a.merged_into != null} />
      )}
    </Row>
  );

  return (
    // Row = [open-report button] + [action buttons] as siblings (a button may not contain buttons).
    <View
      style={[
        styles.row,
        {
          backgroundColor: fresh ? p.accentSoft : p.surface,
          borderColor: p.border,
          borderWidth: p.borderWidth,
          borderLeftColor: sevColor,
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'center' : 'stretch',
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the report"
        accessibilityLabel={`${reportLabel(r.report_no)} ${r.severity ?? 'Unclassified'} ${r.category ?? ''} ${areaName}`}
        onPress={() => open(r.id)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({
          flex: wide ? 1 : undefined,
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'center' : 'stretch',
          gap: space.md,
          borderRadius: radius.md,
          opacity: hovered ? 0.85 : 1,
        })}
      >
        <View style={{ width: wide ? 120 : undefined, gap: 2 }}>
          <T v="mono">{reportLabel(r.report_no)}</T>
          <T v="micro" color="faint">
            {ago(r.created_at, now)} · Shift {r.shift}
          </T>
        </View>
        <View style={{ width: wide ? 120 : undefined, gap: 4 }}>
          <SeverityBadge severity={r.severity} />
          {r.ai_confidence != null ? (
            <T v="micro" color={r.ai_confidence < settings.confidence_threshold ? 'medium' : 'faint'}>
              AI {Math.round(r.ai_confidence * 100)}%
            </T>
          ) : null}
        </View>
        <View style={{ flex: wide ? 1 : undefined, gap: 4, minWidth: 0 }}>
          <Row gap={space.sm} wrap>
            <CategoryLabel category={r.category} v="body" />
            <T v="small" color="dim">
              · {areaName}
            </T>
          </Row>
          <T v="small" color="dim" numberOfLines={2}>
            {r.summary || r.transcript || '—'}
          </T>
          {flags}
        </View>
      </Pressable>
      <View style={{ alignItems: wide ? 'flex-end' : 'flex-start', maxWidth: wide ? 360 : undefined }}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { padding: space.lg, paddingBottom: space.md, gap: space.md, borderBottomWidth: 1 },
  chip: { paddingHorizontal: 12, minHeight: 34, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  row: { gap: space.md, padding: space.md, borderRadius: radius.lg, borderLeftWidth: 5 },
});
