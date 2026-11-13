// Supervisor actions. Every button calls one audited RPC; the database
// enforces role, area and status machine, the UI only offers legal moves.
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { defaultDueAt, formatDuration, HOUR } from '@/domain/sla';
import { CATEGORIES, SEVERITIES, type Category, type Item, type Severity } from '@/domain/types';
import { api, assistant } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compressPhoto, upload } from '@/lib/media';
import { qk, useNow, useSettings, useUsers } from '@/lib/queries';
import { radius, SEVERITY_GLYPH, severityColors, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_ICON } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Row } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { useToast } from '@/ui/Toast';
import { Photo } from '@/features/worker/chrome';
import { plantClock, plantDate } from '@/domain/shift';

/** Run an RPC with a toast on failure and a refetch on success. */
export function useAct() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key);
    try {
      await fn();
      if (success) toast({ tone: 'success', title: success });
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.reports }),
        qc.invalidateQueries({ queryKey: qk.actions }),
        qc.invalidateQueries({ queryKey: ['audit'] }),
        qc.invalidateQueries({ queryKey: qk.feed }),
      ]);
      return true;
    } catch (e) {
      toast({ tone: 'error', title: 'Not saved', body: String((e as Error).message ?? e) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy };
}

export function SeverityPicker({ value, onChange }: { value: Severity | null; onChange: (s: Severity) => void }) {
  const { p } = useTheme();
  return (
    <Row gap={space.sm} wrap>
      {SEVERITIES.map((s) => {
        const on = value === s;
        const c = severityColors(p, s);
        return (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(s)}
            style={[styles.sev, { backgroundColor: on ? c.fill : p.sunken, borderColor: c.fill, borderWidth: on ? 0 : 1.5 }]}
          >
            <T v="h3" color={on ? c.on : p.text}>
              {SEVERITY_GLYPH[s]} {s}
            </T>
          </Pressable>
        );
      })}
    </Row>
  );
}

// Each dialog mounts fresh per report (keyed), so its state starts from the report.
export function ReclassifyDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return item ? <ReclassifyBody key={item.report.id} item={item} onClose={onClose} /> : null;
}

function ReclassifyBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const { p } = useTheme();
  const { run, busy } = useAct();
  const [cat, setCat] = useState<Category | null>(item.report.category ?? item.report.ai_category);
  const [sev, setSev] = useState<Severity | null>(item.report.severity ?? item.report.ai_severity);
  const [reason, setReason] = useState('');
  const r = item.report;
  return (
    <Dialog
      visible
      title="Reclassify"
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="quiet" onPress={onClose} />
          <Button
            label="Save override"
            icon="content-save-outline"
            disabled={!cat || !sev}
            loading={busy === 're'}
            onPress={async () => {
              if (await run('re', () => api.reclassify(r.id, cat!, sev!, reason), 'Reclassified · AI and human values both kept in audit')) onClose();
            }}
          />
        </>
      }
    >
      <View style={[styles.aiBox, { backgroundColor: p.sunken, borderColor: p.border }]}>
        <Icon name="robot-outline" color={p.textDim} />
        <T v="small" color="dim" style={{ flex: 1 }}>
          AI suggested {r.ai_category ?? '—'} · {r.ai_severity ?? '—'}
          {r.ai_confidence != null ? ` (${Math.round(r.ai_confidence * 100)}% model-reported confidence)` : ''}
          {r.guard_reason ? ` · keyword guard: ${r.guard_reason}` : ''}
        </T>
      </View>
      <View style={{ gap: space.sm }}>
        <T v="label" color="dim">
          Category
        </T>
        <View style={styles.grid}>
          {CATEGORIES.map((c) => {
            const on = cat === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setCat(c)}
                style={[styles.catBtn, { backgroundColor: on ? p.accentSoft : p.sunken, borderColor: on ? p.accent : p.border, borderWidth: on ? 2 : 1 }]}
              >
                <Icon name={CATEGORY_ICON[c]} size={18} color={on ? p.accent : p.textDim} />
                <T v="small" weight="semibold">
                  {c}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <T v="label" color="dim">
          Severity
        </T>
        <SeverityPicker value={sev} onChange={setSev} />
      </View>
      <Field label="Reason (optional, goes into the audit log)" value={reason} onChangeText={setReason} placeholder="e.g. Gas detector reading normal" />
    </Dialog>
  );
}

export function AssignDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return item ? <AssignBody key={item.report.id} item={item} onClose={onClose} /> : null;
}

function AssignBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const { p } = useTheme();
  const { me } = useAuth();
  const { run, busy } = useAct();
  const settings = useSettings();
  const now = useNow(30_000);
  const { data: users } = useUsers();
  const staff = (users ?? []).filter((u) => u.role !== 'worker');
  const [owner, setOwner] = useState<string | null>(item.action.owner_id ?? me?.id ?? null);
  const [due, setDue] = useState<'sla' | number>('sla');
  const r = item.report;
  const slaDue = item.action.due_overridden ? new Date(item.action.due_at) : defaultDueAt(r.created_at, r.severity, settings);
  const options: { key: 'sla' | number; label: string; at: Date }[] = [
    { key: 'sla', label: `SLA default (${r.severity ?? 'Medium'}: ${settings.sla[r.severity ?? 'Medium'].due_h} h)`, at: slaDue },
    { key: 1, label: '+1 h', at: new Date(now.getTime() + HOUR) },
    { key: 4, label: '+4 h', at: new Date(now.getTime() + 4 * HOUR) },
    { key: 24, label: '+24 h', at: new Date(now.getTime() + 24 * HOUR) },
  ];
  const chosen = options.find((o) => o.key === due)!;
  const past = chosen.at.getTime() <= now.getTime();

  return (
    <Dialog
      visible
      title={item.action.status === 'New' ? 'Assign owner and due date' : 'Reassign'}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="quiet" onPress={onClose} />
          <Button
            label="Assign"
            icon="account-arrow-right-outline"
            disabled={!owner || (due !== 'sla' && past)}
            loading={busy === 'as'}
            onPress={async () => {
              const dueIso = due === 'sla' ? null : chosen.at.toISOString();
              if (await run('as', () => api.assign(r.id, owner!, dueIso), 'Assigned')) onClose();
            }}
          />
        </>
      }
    >
      <View style={{ gap: space.sm }}>
        <T v="label" color="dim">
          Owner
        </T>
        {staff.map((u) => {
          const on = owner === u.id;
          return (
            <Pressable
              key={u.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setOwner(u.id)}
              style={[styles.option, { backgroundColor: on ? p.accentSoft : p.sunken, borderColor: on ? p.accent : p.border, borderWidth: on ? 2 : 1 }]}
            >
              <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} color={on ? p.accent : p.textDim} />
              <T v="body" weight="semibold" style={{ flex: 1 }}>
                {u.name}
              </T>
              <T v="small" color="dim">
                {u.role === 'ehs' ? 'EHS Lead' : 'Area Supervisor'}
                {u.id === me?.id ? ' · you' : ''}
              </T>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: space.sm }}>
        <T v="label" color="dim">
          Due
        </T>
        <Row wrap gap={space.sm}>
          {options.map((o) => {
            const on = o.key === due;
            return (
              <Pressable
                key={String(o.key)}
                onPress={() => setDue(o.key)}
                style={[styles.dueOpt, { backgroundColor: on ? p.accentSoft : p.sunken, borderColor: on ? p.accent : p.border, borderWidth: on ? 2 : 1 }]}
              >
                <T v="small" weight="semibold">
                  {o.label}
                </T>
                <T v="mono" color="dim">
                  {plantDate(o.at)} {plantClock(o.at)}
                </T>
              </Pressable>
            );
          })}
        </Row>
        <T v="small" color={chosen.at.getTime() < now.getTime() ? 'high' : 'dim'}>
          {chosen.at.getTime() < now.getTime() ? `Already overdue by ${formatDuration(now.getTime() - chosen.at.getTime())}` : `Due in ${formatDuration(chosen.at.getTime() - now.getTime())}`}
        </T>
      </View>
    </Dialog>
  );
}

export function CloseDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return item ? <CloseBody key={item.report.id} item={item} onClose={onClose} /> : null;
}

function CloseBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const { p } = useTheme();
  const { run, busy } = useAct();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const r = item.report;

  async function draft() {
    setDrafting(true);
    const res = await assistant.draftNote(r.id);
    setDrafting(false);
    if (res.ok && res.note) setNote(res.note);
    else toast({ tone: 'error', title: 'Could not draft a note', body: res.error ?? 'Write it yourself for now.' });
  }

  async function pick(camera: boolean) {
    try {
      const res = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!res.canceled && res.assets[0]) setPhoto(await compressPhoto(res.assets[0].uri, res.assets[0].width));
    } catch (e) {
      toast({ tone: 'error', title: 'Could not open camera', body: String((e as Error).message) });
    }
  }

  return (
    <Dialog
      visible
      title="Close action"
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="quiet" onPress={onClose} />
          <Button
            label="Close and notify reporter"
            icon="check-decagram"
            disabled={note.trim().length < 3}
            loading={busy === 'cl' || uploading}
            onPress={async () => {
              let path: string | null = null;
              if (photo) {
                setUploading(true);
                try {
                  path = await upload(`fix/${r.id}/fix-${randomUUID().slice(0, 8)}.jpg`, photo, 'image/jpeg');
                } catch (e) {
                  toast({ tone: 'error', title: 'Photo upload failed', body: String((e as Error).message) });
                  setUploading(false);
                  return;
                }
                setUploading(false);
              }
              if (await run('cl', () => api.close(r.id, note, path), 'Closed · the reporter can see what was done')) onClose();
            }}
          />
        </>
      }
    >
      <Field
        label="Resolution note (required — the reporter will see this)"
        value={note}
        onChangeText={setNote}
        multiline
        style={{ minHeight: 110 }}
        placeholder="What was fixed, and how was it checked?"
      />
      <Row gap={space.sm} wrap>
        <Button label={drafting ? 'Drafting…' : 'Draft with AI'} icon="creation" size="sm" variant="secondary" loading={drafting} onPress={draft} />
        <T v="small" color="faint" style={{ flex: 1 }}>
          The draft is a starting point. Read it and edit it: it is sent to the worker as written.
        </T>
      </Row>
      <View style={{ gap: space.sm }}>
        <T v="label" color="dim">
          Fix photo (optional)
        </T>
        {photo ? (
          <Row gap={space.md}>
            <Photo uri={photo} size={120} />
            <Button label="Remove" variant="quiet" icon="close" onPress={() => setPhoto(null)} />
          </Row>
        ) : (
          <Row gap={space.sm} wrap>
            <Button label="Choose photo" variant="secondary" icon="image-outline" onPress={() => pick(false)} />
            <Button label="Take photo" variant="secondary" icon="camera-outline" onPress={() => pick(true)} />
          </Row>
        )}
      </View>
      <View style={[styles.aiBox, { backgroundColor: p.clearSoft, borderColor: p.clear }]}>
        <Icon name="account-check-outline" color={p.clear} />
        <T v="small" style={{ flex: 1 }}>
          The reporter gets a notification and sees this note and photo on their phone.
        </T>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  sev: { paddingHorizontal: 16, minHeight: 44, borderRadius: radius.md, justifyContent: 'center' },
  aiBox: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, minHeight: 52 },
  dueOpt: { padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, gap: 2 },
});
