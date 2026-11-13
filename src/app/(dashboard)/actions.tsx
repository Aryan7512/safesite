// Actions (PRD §5.2): kanban by status with SLA countdown, breach highlighting
// and escalation flags. Buttons move cards (no drag-and-drop by design).
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { isBreached } from '@/domain/metrics';
import { countdownText } from '@/domain/sla';
import { reportLabel, STATUSES, type Item, type Status } from '@/domain/types';
import { AssignDialog, CloseDialog, useAct } from '@/features/dashboard/dialogs';
import { useDash, WIDE } from '@/features/dashboard/store';
import { api } from '@/lib/api';
import { useAreas, useItems, useNow, useUserName } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, Flag, SeverityBadge } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Row } from '@/ui/Layout';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/Text';

const SEV_RANK = { High: 0, Medium: 1, Low: 2 } as const;

export default function Actions() {
  const { p } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { items } = useItems();
  const now = useNow(1000);
  // Recompute at most once per 30 s.
  const tick = Math.floor(now.getTime() / 30_000);
  const [assign, setAssign] = useState<Item | null>(null);
  const [closeItem, setCloseItem] = useState<Item | null>(null);
  const [only, setOnly] = useState<'all' | 'breached' | 'escalated'>('all');
  const [narrowStatus, setNarrowStatus] = useState<Status>('Assigned');

  const columns = useMemo(() => {
    const at = new Date(tick * 30_000);
    const live = items.filter((i) => i.action.merged_into == null);
    const filtered = live.filter((i) =>
      only === 'breached' ? isBreached(i, at) : only === 'escalated' ? i.action.escalated_level > 0 && i.action.status !== 'Closed' : true,
    );
    return STATUSES.map((s) => {
      let list = filtered.filter((i) => i.action.status === s);
      if (s === 'Closed') {
        list = list.sort((a, b) => new Date(b.action.closed_at ?? 0).getTime() - new Date(a.action.closed_at ?? 0).getTime()).slice(0, 12);
      } else {
        // Most urgent first: breached, then by due time
        list = list.sort((a, b) => {
          const br = Number(isBreached(b, at)) - Number(isBreached(a, at));
          return (
            br ||
            new Date(a.action.due_at).getTime() - new Date(b.action.due_at).getTime() ||
            SEV_RANK[a.report.severity ?? 'Medium'] - SEV_RANK[b.report.severity ?? 'Medium']
          );
        });
      }
      return { status: s, list, total: filtered.filter((i) => i.action.status === s).length };
    });
  }, [items, only, tick]);

  const breachedCount = items.filter((i) => i.action.merged_into == null && isBreached(i, now)).length;
  const escalatedCount = items.filter(
    (i) => i.action.merged_into == null && i.action.status !== 'Closed' && i.action.escalated_level > 0,
  ).length;

  const column = (c: (typeof columns)[number]) => (
    <View
      key={c.status}
      style={[
        styles.col,
        { backgroundColor: p.sunken, borderColor: p.border, borderWidth: p.borderWidth, width: wide ? undefined : '100%' },
      ]}
    >
      <Row between style={{ paddingHorizontal: 4 }}>
        <T v="label" color="dim">
          {c.status}
        </T>
        <T v="mono" color="dim">
          {c.status === 'Closed' && c.total > c.list.length ? `${c.list.length} of ${c.total}` : c.total}
        </T>
      </Row>
      {c.list.map((i) => (
        <ActionCard key={i.report.id} item={i} now={now} onAssign={() => setAssign(i)} onClose={() => setCloseItem(i)} />
      ))}
      {c.list.length === 0 ? (
        <T v="small" color="faint" style={{ padding: space.md }}>
          Nothing here.
        </T>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Row wrap gap={space.md} style={{ padding: space.lg, paddingBottom: 0 }}>
        <Segmented
          label="Show"
          value={only}
          onChange={setOnly}
          options={[
            { value: 'all', label: 'All actions' },
            { value: 'breached', label: `SLA breached · ${breachedCount}` },
            { value: 'escalated', label: `Escalated · ${escalatedCount}` },
          ]}
        />
        {!wide ? (
          <Segmented<Status>
            label="Status"
            value={narrowStatus}
            onChange={setNarrowStatus}
            options={STATUSES.map((s) => ({ value: s, label: s === 'In Progress' ? 'Doing' : s }))}
          />
        ) : null}
      </Row>
      {wide ? (
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          <Row gap={space.md} align="flex-start">
            {columns.map(column)}
          </Row>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}>
          {column(columns.find((c) => c.status === narrowStatus)!)}
        </ScrollView>
      )}
      <AssignDialog item={assign} onClose={() => setAssign(null)} />
      <CloseDialog item={closeItem} onClose={() => setCloseItem(null)} />
    </View>
  );
}

function ActionCard({ item, now, onAssign, onClose }: { item: Item; now: Date; onAssign: () => void; onClose: () => void }) {
  const { p } = useTheme();
  const open = useDash((s) => s.open);
  const userName = useUserName();
  const { data: areas } = useAreas();
  const { run, busy } = useAct();
  const { report: r, action: a } = item;
  const breached = isBreached(item, now);
  const cd = countdownText(a, now);
  const edge = breached ? p.high : a.escalated_level && a.status !== 'Closed' ? p.escalated : a.status === 'Closed' ? p.clear : p.border;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: p.surface,
          borderColor: edge,
          borderWidth: breached ? 2 : p.borderWidth,
          borderLeftWidth: 5,
          borderLeftColor: edge,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the report"
        onPress={() => open(r.id)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ gap: space.sm, opacity: hovered ? 0.85 : 1 })}
      >
        <Row between>
          <T v="mono">{reportLabel(r.report_no)}</T>
          <SeverityBadge severity={r.severity} />
        </Row>
        <CategoryLabel category={r.category} v="body" />
        <T v="small" color="dim" numberOfLines={2}>
          {areas?.find((x) => x.id === r.area_id)?.name} · {r.summary ?? r.transcript}
        </T>
        {a.status !== 'Closed' ? (
          <Row gap={6}>
            <Icon name={cd.overdue ? 'timer-alert' : 'timer-outline'} size={16} color={cd.overdue ? p.high : p.textDim} />
            <T v="mono" color={cd.overdue ? 'high' : 'dim'}>
              {cd.text}
            </T>
          </Row>
        ) : (
          <T v="small" color="clear" numberOfLines={2}>
            ✓ {a.resolution_note}
          </T>
        )}
        <Row gap={6} wrap>
          {a.escalated_level && a.status !== 'Closed' ? (
            <Flag icon="arrow-up-bold-circle-outline" label="Escalated to EHS" tone="escalated" />
          ) : null}
          {r.is_repeat ? <Flag icon="repeat" label={`Repeat ×${r.repeat_count}`} tone="warn" /> : null}
        </Row>
      </Pressable>
      <Row between>
        <T v="micro" color="faint">
          {userName(a.owner_id)}
        </T>
        <Row gap={6}>
          {a.status === 'New' ? <Button label="Assign" size="sm" disabled={!r.category} onPress={onAssign} /> : null}
          {a.status === 'Assigned' ? (
            <Button
              label="Start"
              size="sm"
              icon="progress-wrench"
              loading={busy === 'st'}
              onPress={() => run('st', () => api.start(r.id), `${reportLabel(r.report_no)} in progress`)}
            />
          ) : null}
          {a.status === 'In Progress' ? <Button label="Close" size="sm" icon="check" onPress={onClose} /> : null}
        </Row>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, minWidth: 250, gap: space.sm, padding: space.sm, borderRadius: radius.lg },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.md },
});
