// Admin · demo tools (PRD §5.2, §7 Demo clock). EHS Lead only.
import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { plantClock, plantDate } from '@/domain/shift';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAreas, useNow, useSettings, useUsers } from '@/lib/queries';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Flag } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Card, Divider, Row, SectionTitle } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { useToast } from '@/ui/Toast';

export default function Admin() {
  const { p } = useTheme();
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useSettings();
  const now = useNow(1000);
  const { data: users } = useUsers();
  const { data: areas } = useAreas();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (me && me.role !== 'ehs') return <Redirect href="/overview" />;

  async function go(key: string, fn: () => Promise<unknown>, ok: (r: any) => string) {
    setBusy(key);
    try {
      const r = await fn();
      toast({ tone: 'success', title: ok(r) });
      await qc.invalidateQueries();
    } catch (e) {
      toast({ tone: 'error', title: 'Failed', body: String((e as Error).message) });
    } finally {
      setBusy(null);
    }
  }

  const offset = settings.demo_offset_minutes;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl, maxWidth: 980 }}>
      <Card accent={p.escalated}>
        <SectionTitle>Demo clock</SectionTitle>
        <Row gap={space.xl} wrap>
          <View>
            <T v="micro" color="dim">
              Plant time (real + offset)
            </T>
            <T v="kpi">
              {plantDate(now)} {plantClock(now)}
            </T>
          </View>
          <View>
            <T v="micro" color="dim">
              Offset
            </T>
            <T v="kpi" color={offset ? 'escalated' : 'text'}>
              +{Math.floor(offset / 60)} h {offset % 60 ? `${offset % 60} m` : ''}
            </T>
          </View>
        </Row>
        <T v="small" color="dim">
          settings.demo_offset_minutes is added to now() for every SLA calculation and every timestamp the system writes. Fast-forward moves the clock and runs the SLA check
          immediately; pg_cron also runs it every minute.
        </T>
        <Row gap={space.sm} wrap>
          <Button
            label="Fast-forward 3 h"
            icon="fast-forward"
            size="lg"
            loading={busy === 'ff'}
            onPress={() => go('ff', () => api.fastForward(180), (r) => `Clock +3 h · ${r.escalated} escalated · ${r.breached} breached`)}
          />
          <Button label="+1 h" variant="secondary" loading={busy === 'ff1'} onPress={() => go('ff1', () => api.fastForward(60), (r) => `Clock +1 h · ${r.escalated} escalated · ${r.breached} breached`)} />
          <Button label="Run SLA check now" variant="secondary" icon="timer-cog-outline" loading={busy === 'sla'} onPress={() => go('sla', () => api.checkSla(), (r) => `${r.escalated} escalated · ${r.breached} breached`)} />
        </Row>
      </Card>

      <Card>
        <SectionTitle>SLA table (configurable assumptions)</SectionTitle>
        {(['High', 'Medium', 'Low'] as const).map((s) => (
          <Row key={s} between>
            <T v="body" weight="semibold" style={{ width: 90 }}>
              {s}
            </T>
            <T v="small" color="dim" style={{ flex: 1 }}>
              Owner: Area Supervisor · due {settings.sla[s].due_h} h · escalates to EHS Lead after {settings.sla[s].escalate_h} h{s === 'Low' ? ' (reminder only)' : ''}
            </T>
          </Row>
        ))}
        <Divider />
        <T v="small" color="dim">
          Confidence threshold {Math.round(settings.confidence_threshold * 100)}% · duplicate window {settings.duplicate_window_h} h · repeat window {settings.repeat_window_d} days · media retention{' '}
          {settings.retention_days} days (assumption)
        </T>
      </Card>

      <Card accent={p.high}>
        <SectionTitle>Seed reset</SectionTitle>
        <T v="small" color="dim">
          Rebuilds the seeded 30-day story relative to now (70 reports, planted repeats, duplicates, breaches) and resets the demo clock. This is the only operation that clears
          the audit log, and only from this EHS-only screen.
        </T>
        <Button label="Reset demo data…" variant="danger" icon="restore" onPress={() => setConfirmReset(true)} />
      </Card>

      <Card>
        <SectionTitle>{`Users · ${users?.length ?? 0}`}</SectionTitle>
        {(users ?? []).map((u) => (
          <Row key={u.id} between wrap style={{ paddingVertical: 4 }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <T v="body" weight="semibold">
                {u.name}
              </T>
              <T v="micro" color="faint">
                {u.email}
              </T>
            </View>
            <Row gap={6} wrap>
              <Flag icon={u.role === 'ehs' ? 'shield-account-outline' : u.role === 'supervisor' ? 'clipboard-account-outline' : 'hard-hat'} label={u.role === 'ehs' ? 'EHS Lead' : u.role === 'supervisor' ? 'Supervisor' : 'Worker'} tone="accent" />
              {u.role === 'supervisor' ? <Flag icon="map-marker-multiple-outline" label={`${(areas ?? []).filter((a) => a.supervisor_id === u.id).length} areas`} /> : null}
              {u.is_contractor ? <Flag icon="badge-account-outline" label={u.induction_completed_at ? 'Contractor · inducted' : 'Contractor · induction due'} tone={u.induction_completed_at ? 'neutral' : 'warn'} /> : null}
              <Flag icon="translate" label={u.language === 'hi' ? 'हिं' : 'EN'} />
            </Row>
          </Row>
        ))}
      </Card>

      <Dialog
        visible={confirmReset}
        title="Reset demo data?"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button label="Cancel" variant="quiet" onPress={() => setConfirmReset(false)} />
            <Button
              label="Reset"
              variant="danger"
              icon="restore"
              loading={busy === 'reset'}
              onPress={async () => {
                await go('reset', () => api.resetDemo(), (r) => `Demo reset · ${r.reports} reports`);
                setConfirmReset(false);
              }}
            />
          </>
        }
      >
        <T>All reports, actions, notifications and the audit log are replaced with the seeded story. Live reports from this session are removed.</T>
      </Dialog>
    </ScrollView>
  );
}
