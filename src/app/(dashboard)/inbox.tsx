// Inbox: every report that needs a person, as a table you can scan. One compact
// bar for tabs, search and filters; severity by marker and edge colour; the row
// says what it is, what is wrong with it, who has it and when it is due.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { isBreached } from '@/domain/metrics';
import { ago, countdownText } from '@/domain/sla';
import { reportLabel, SEVERITIES, type Item, type Severity } from '@/domain/types';
import { AssignDialog, ReclassifyDialog, useAct } from '@/features/dashboard/dialogs';
import { useDash, WIDE } from '@/features/dashboard/store';
import { SevMark, Tag, SEV_RANK, useSevColor } from '@/features/dashboard/widgets';
import { api } from '@/lib/api';
import { useAreas, useItems, useNow, useSettings, useUserName } from '@/lib/queries';
import { fontFor } from '@/theme/fonts';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ordinal } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Empty } from '@/ui/Layout';
import { T } from '@/ui/Text';

type Scope = 'new' | 'open' | 'closed' | 'all';
type FlagFilter = 'any' | 'review' | 'duplicate' | 'repeat' | 'guard' | 'overdue' | 'escalated';

const FLAGS: { value: FlagFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'review', label: 'Needs review' },
  { value: 'duplicate', label: 'Possible duplicate' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'guard', label: 'Keyword guard' },
];

export default function Inbox() {
  const { p } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { items } = useItems();
  const { data: areas } = useAreas();
  const now = useNow(30_000);
  const userName = useUserName();
  const { shift, setShift } = useDash();
  const [scope, setScope] = useState<Scope>('new');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [area, setArea] = useState<number | 'all'>('all');
  const [sev, setSev] = useState<Severity | 'all' | 'none'>('all');
  const [flag, setFlag] = useState<FlagFilter>('any');
  const [reclass, setReclass] = useState<Item | null>(null);
  const [assign, setAssign] = useState<Item | null>(null);

  const live = useMemo(() => items.filter((i) => i.action.merged_into == null), [items]);
  const counts = {
    new: live.filter((i) => i.action.status === 'New').length,
    open: live.filter((i) => i.action.status !== 'Closed').length,
    closed: live.filter((i) => i.action.status === 'Closed').length,
    all: live.length,
  };
  const activeFilters = (shift !== 'All' ? 1 : 0) + (area !== 'all' ? 1 : 0) + (sev !== 'all' ? 1 : 0) + (flag !== 'any' ? 1 : 0);
  const tick = Math.floor(now.getTime() / 30_000);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const at = new Date(tick * 30_000);
    return live
      .filter((i) => {
        const r = i.report;
        const a = i.action;
        if (scope === 'new' && a.status !== 'New') return false;
        if (scope === 'open' && a.status === 'Closed') return false;
        if (scope === 'closed' && a.status !== 'Closed') return false;
        if (shift !== 'All' && r.shift !== shift) return false;
        if (area !== 'all' && r.area_id !== area) return false;
        if (sev === 'none' && r.severity) return false;
        if (sev !== 'all' && sev !== 'none' && r.severity !== sev) return false;
        if (flag === 'review' && !r.needs_review) return false;
        if (flag === 'duplicate' && r.duplicate_status !== 'suggested') return false;
        if (flag === 'repeat' && !r.is_repeat) return false;
        if (flag === 'guard' && !r.guard_reason) return false;
        if (flag === 'overdue' && !isBreached(i, at)) return false;
        if (flag === 'escalated' && !(a.escalated_level > 0 && a.status !== 'Closed')) return false;
        if (q) {
          const hay =
            `${reportLabel(r.report_no)} ${r.title ?? ''} ${r.summary ?? ''} ${r.transcript} ${r.transcript_en ?? ''} ${r.category ?? ''} ${areas?.find((x) => x.id === r.area_id)?.name ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (scope === 'closed') return new Date(b.action.closed_at ?? 0).getTime() - new Date(a.action.closed_at ?? 0).getTime();
        const urg = (i: Item) => (i.report.severity === 'High' ? 3 : 0) + (isBreached(i, at) ? 2 : 0) + (i.report.needs_review ? 1 : 0);
        return (
          urg(b) - urg(a) ||
          SEV_RANK[b.report.severity ?? 'Medium'] - SEV_RANK[a.report.severity ?? 'Medium'] ||
          new Date(b.report.created_at).getTime() - new Date(a.report.created_at).getTime()
        );
      });
  }, [live, scope, shift, area, sev, flag, query, areas, tick]);

  const tabs: { v: Scope; label: string }[] = [
    { v: 'new', label: 'New' },
    { v: 'open', label: 'All open' },
    { v: 'closed', label: 'Closed' },
    { v: 'all', label: 'Everything' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.bar, { backgroundColor: p.surface, borderBottomColor: p.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, alignItems: 'center' }} style={{ flexGrow: 0 }}>
          {tabs.map((tb) => {
            const on = tb.v === scope;
            return (
              <Pressable
                key={tb.v}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setScope(tb.v)}
                style={[styles.tab, { borderBottomColor: on ? p.text : 'transparent' }]}
              >
                <T v="h3" weight={on ? 'bold' : 'medium'} color={on ? 'text' : 'dim'}>
                  {tb.label}
                </T>
                <View style={[styles.tabCount, { backgroundColor: on ? p.text : p.raised }]}>
                  <T v="small" weight="bold" style={{ color: on ? p.surface : p.textDim }}>
                    {counts[tb.v]}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View
          style={{ flex: 1, flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end', alignItems: 'center', minWidth: 240, paddingVertical: space.sm }}
        >
          <View style={[styles.search, { borderColor: p.borderStrong, backgroundColor: p.sunken }]}>
            <Icon name="magnify" size={20} color={p.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search reports"
              placeholderTextColor={p.textFaint}
              accessibilityLabel="Search reports"
              style={{ flex: 1, minHeight: 40, color: p.text, fontSize: 15, fontFamily: fontFor('regular', false), outlineStyle: 'none' } as object}
            />
            {query ? (
              <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={8}>
                <Icon name="close-circle" size={18} color={p.textFaint} />
              </Pressable>
            ) : null}
          </View>
          <Button
            label={activeFilters ? `Filters · ${activeFilters}` : 'Filters'}
            icon="tune-variant"
            size="md"
            variant={showFilters || activeFilters ? 'primary' : 'secondary'}
            onPress={() => setShowFilters((v) => !v)}
          />
        </View>
      </View>

      {showFilters ? (
        <View style={[styles.filters, { backgroundColor: p.raised, borderBottomColor: p.border }]}>
          <FilterGroup label="Severity">
            <Chip label="Any" on={sev === 'all'} onPress={() => setSev('all')} />
            {SEVERITIES.map((s) => (
              <Chip key={s} label={s} on={sev === s} onPress={() => setSev(s)} sev={s} />
            ))}
            <Chip label="Unclassified" on={sev === 'none'} onPress={() => setSev('none')} />
          </FilterGroup>
          <FilterGroup label="Shift">
            {(['All', 'A', 'B', 'C'] as const).map((s) => (
              <Chip key={s} label={s === 'All' ? 'Any' : s} on={shift === s} onPress={() => setShift(s)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Flag">
            {FLAGS.map((f) => (
              <Chip key={f.value} label={f.label} on={flag === f.value} onPress={() => setFlag(f.value)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Area">
            <Chip label="All areas" on={area === 'all'} onPress={() => setArea('all')} />
            {(areas ?? []).map((a) => (
              <Chip key={a.id} label={a.name} on={area === a.id} onPress={() => setArea(a.id)} />
            ))}
          </FilterGroup>
          {activeFilters ? (
            <Button
              label="Clear filters"
              size="sm"
              variant="quiet"
              onPress={() => {
                setSev('all');
                setShift('All');
                setFlag('any');
                setArea('all');
              }}
            />
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: wide ? space.xl : space.md, paddingBottom: space.xxxl }}>
        <View style={{ maxWidth: 1560, width: '100%', alignSelf: 'center', gap: space.sm }}>
          {wide && rows.length ? (
            <View style={[styles.head, { borderBottomColor: p.borderStrong }]}>
              <View style={{ flex: 3.6 }}>
                <T v="small" color="dim" weight="semibold" style={{ paddingLeft: 52 }}>
                  Report
                </T>
              </View>
              <T v="small" color="dim" weight="semibold" style={{ flex: 1.4 }}>
                Flags
              </T>
              <T v="small" color="dim" weight="semibold" style={{ width: 150 }}>
                Status and owner
              </T>
              <T v="small" color="dim" weight="semibold" style={{ width: 96, textAlign: 'right' }}>
                Due
              </T>
              <View style={{ width: 270 }} />
            </View>
          ) : null}
          {rows.length === 0 ? (
            <Empty
              title={scope === 'new' ? 'Inbox clear' : 'Nothing matches'}
              body={scope === 'new' ? 'Every new report has an owner.' : 'Try a different tab or clear the filters.'}
            />
          ) : null}
          {rows.map((i) => (
            <ReportRow
              key={i.report.id}
              item={i}
              wide={wide}
              now={now}
              areaName={areas?.find((a) => a.id === i.report.area_id)?.name ?? ''}
              owner={userName(i.action.owner_id)}
              onReclassify={() => setReclass(i)}
              onAssign={() => setAssign(i)}
            />
          ))}
        </View>
      </ScrollView>

      <ReclassifyDialog item={reclass} onClose={() => setReclass(null)} />
      <AssignDialog item={assign} onClose={() => setAssign(null)} />
    </View>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="small" color="dim" weight="semibold">
        {label}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
    </View>
  );
}

function Chip({ label, on, onPress, sev }: { label: string; on: boolean; onPress: () => void; sev?: Severity }) {
  const { p } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? p.text : p.surface, borderColor: on ? p.text : p.borderStrong }]}
    >
      {sev ? <SevMark severity={sev} size={16} /> : null}
      <T v="body" weight="semibold" style={{ color: on ? p.surface : p.text }}>
        {label}
      </T>
    </Pressable>
  );
}

function ReportRow({
  item,
  wide,
  now,
  areaName,
  owner,
  onReclassify,
  onAssign,
}: {
  item: Item;
  wide: boolean;
  now: Date;
  areaName: string;
  owner: string;
  onReclassify: () => void;
  onAssign: () => void;
}) {
  const { p } = useTheme();
  const sevColor = useSevColor();
  const open = useDash((s) => s.open);
  const settings = useSettings();
  const { items } = useItems();
  const { run, busy } = useAct();
  const { report: r, action: a } = item;
  const parent = r.is_duplicate_of ? items.find((x) => x.report.id === r.is_duplicate_of) : null;
  const overdue = isBreached(item, now);
  const cd = countdownText(a, now);
  const fresh = now.getTime() - new Date(r.created_at).getTime() < 5 * 60_000;
  const edge = r.severity ? sevColor(r.severity) : p.borderStrong;

  const flags: { label: string; tone: 'esc' | 'dup' | 'rev' | 'plain' }[] = [];
  if (r.ai_status === 'pending') flags.push({ label: 'AI sorting…', tone: 'plain' });
  if (r.ai_status === 'failed') flags.push({ label: 'AI failed, sort it yourself', tone: 'rev' });
  if (r.needs_review && r.ai_status !== 'failed') flags.push({ label: 'Check the AI’s category', tone: 'rev' });
  if (r.vision_severity === 'High') flags.push({ label: 'Photo shows High', tone: 'plain' });
  if (r.guard_reason) flags.push({ label: `Keyword: ${r.guard_reason}`, tone: 'plain' });
  if (r.is_repeat) flags.push({ label: `${ordinal(r.repeat_count)} in ${settings.repeat_window_d} days`, tone: 'rev' });
  if (r.duplicate_status === 'suggested' && parent) flags.push({ label: `Possible duplicate of ${reportLabel(parent.report.report_no)}`, tone: 'dup' });
  if (a.escalated_level && a.status !== 'Closed') flags.push({ label: 'Escalated to EHS Lead', tone: 'esc' });

  const actions = (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: wide ? 'flex-end' : 'flex-start' }}>
      {a.status === 'New' ? (
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
      ) : a.status === 'Closed' ? (
        <T v="small" color="clear" weight="semibold">
          Closed
        </T>
      ) : (
        <Button label="Open" size="sm" variant="secondary" onPress={() => open(r.id)} />
      )}
    </View>
  );

  const title = r.title || r.summary || r.transcript || 'New report';
  const indent = wide ? 0 : 52;
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: fresh ? p.accentSoft : p.surface,
          borderColor: p.border,
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'center' : 'stretch',
        },
      ]}
    >
      <View style={[styles.rowEdge, { backgroundColor: edge }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${reportLabel(r.report_no)}, ${r.severity ?? 'unclassified'}, ${title}, ${areaName}`}
        onPress={() => open(r.id)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({
          flex: wide ? 3.6 : undefined,
          flexDirection: 'row',
          gap: space.md,
          alignItems: 'flex-start',
          opacity: hovered ? 0.85 : 1,
        })}
      >
        <View style={{ width: 40, alignItems: 'center', paddingTop: 2 }}>
          <SevMark severity={r.severity} size={30} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3" numberOfLines={2} style={{ lineHeight: 21 }}>
            {title}
          </T>
          <T v="small" color="dim" numberOfLines={2}>
            {[areaName, r.category, reportLabel(r.report_no), `${ago(r.created_at, now)}, shift ${r.shift}`].filter(Boolean).join(' · ')}
          </T>
          {r.recommended_action && a.status !== 'Closed' ? (
            <T v="small" color="faint" numberOfLines={2}>
              Suggested: {r.recommended_action}
            </T>
          ) : null}
        </View>
      </Pressable>

      <View style={{ flex: wide ? 1.4 : undefined, flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingLeft: indent, alignItems: 'center' }}>
        {flags.map((f) => (
          <Tag key={f.label} {...f} />
        ))}
        {r.ai_confidence != null && r.severity ? (
          <T v="small" color={r.needs_review ? 'medium' : 'faint'}>
            AI {Math.round(r.ai_confidence * 100)}% sure
          </T>
        ) : null}
      </View>

      {wide ? (
        <>
          <View style={{ width: wide ? 150 : undefined, paddingLeft: indent }}>
            <T v="body" weight="semibold">
              {a.status === 'New' ? 'Waiting to be assigned' : a.status}
            </T>
            <T v="small" color="dim" numberOfLines={1}>
              {a.owner_id ? (a.status === 'New' ? `Area owner: ${owner}` : owner) : 'No owner yet'}
            </T>
          </View>

          <View style={{ width: wide ? 96 : undefined, alignItems: wide ? 'flex-end' : 'flex-start', paddingLeft: indent }}>
            {a.status === 'Closed' ? (
              <T v="small" color="faint">
                {a.closed_at ? ago(a.closed_at, now) : ''}
              </T>
            ) : (
              <>
                <T v="h3" color={overdue ? 'high' : 'text'}>
                  {cd.text.replace(/^Due in |^Overdue /, '')}
                </T>
                <T v="small" color={overdue ? 'high' : 'faint'}>
                  {overdue ? 'overdue' : 'left'}
                </T>
              </>
            )}
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md, paddingLeft: indent }}>
          <View style={{ flex: 1 }}>
            <T v="body" weight="semibold">
              {a.status === 'New' ? 'Waiting to be assigned' : a.status}
            </T>
            <T v="small" color="dim" numberOfLines={1}>
              {a.owner_id ? (a.status === 'New' ? `Area owner: ${owner}` : owner) : 'No owner yet'}
            </T>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            {a.status === 'Closed' ? (
              <T v="small" color="faint">
                {a.closed_at ? ago(a.closed_at, now) : ''}
              </T>
            ) : (
              <>
                <T v="h3" color={overdue ? 'high' : 'text'}>
                  {cd.text.replace(/^Due in |^Overdue /, '')}
                </T>
                <T v="small" color={overdue ? 'high' : 'faint'}>
                  {overdue ? 'overdue' : 'left'}
                </T>
              </>
            )}
          </View>
        </View>
      )}
      <View style={{ width: wide ? 270 : undefined, paddingLeft: indent }}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, minHeight: 52, borderBottomWidth: 3 },
  tabCount: { minWidth: 24, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  search: {
    flex: 1,
    maxWidth: 340,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  filters: { padding: space.lg, gap: space.md, borderBottomWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: radius.pill, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: 6, paddingHorizontal: space.lg, borderBottomWidth: 1 },
  row: { position: 'relative', gap: space.md, padding: space.md, paddingLeft: space.lg, borderWidth: 1, borderRadius: 5, overflow: 'hidden' },
  rowEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
});
