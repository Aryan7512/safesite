// Dashboard shell (PRD §5.2): a slim top bar with the navigation across it, so the
// full width goes to content on a laptop or projector; bottom tabs on a phone.
// Report detail opens in a right drawer; the assistant opens in a side panel.
import { Redirect, router, Slot, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { plantClock, plantDate, shiftFor } from '@/domain/shift';
import { ago } from '@/domain/sla';
import { reportLabel } from '@/domain/types';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { useAssistant } from '@/features/assistant/store';
import { ReportPanel } from '@/features/dashboard/ReportPanel';
import { useDash, WIDE } from '@/features/dashboard/store';
import { notificationText } from '@/features/notifications/text';
import { api } from '@/lib/api';
import { isStaff, useAuth } from '@/lib/auth';
import { useItems, useNotifications, useNow, useSettings } from '@/lib/queries';
import { onRealtimeStatus } from '@/lib/realtime';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Brand } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Icon, type IconName } from '@/ui/Icon';
import { T } from '@/ui/Text';

type NavHref = '/overview' | '/inbox' | '/actions' | '/areas' | '/admin';
const NAV: { href: NavHref; label: string; icon: IconName; ehsOnly?: boolean }[] = [
  { href: '/overview', label: 'Overview', icon: 'view-dashboard-outline' },
  { href: '/inbox', label: 'Inbox', icon: 'inbox-arrow-down-outline' },
  { href: '/actions', label: 'Actions', icon: 'clipboard-check-outline' },
  { href: '/areas', label: 'Areas', icon: 'map-outline' },
  { href: '/admin', label: 'Admin', icon: 'tune-variant', ehsOnly: true },
];

/** The top bar stays graphite in the light theme (like a control-room header) and follows the surface in dark. */
function useBar() {
  const { p } = useTheme();
  const light = p.name !== 'control';
  return {
    bg: light ? '#1C2228' : p.surface,
    text: '#EEF1F4',
    dim: '#AEB7BF',
    line: light ? '#3A4550' : p.border,
    chip: light ? '#3A4550' : p.raised,
  };
}

export default function DashboardLayout() {
  const { session, me, loading } = useAuth();
  const { p } = useTheme();
  const bar = useBar();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { items } = useItems();
  const inboxCount = items.filter((i) => i.action.status === 'New' && i.action.merged_into == null).length;

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (me && !isStaff(me)) return <Redirect href="/capture" />;

  const nav = NAV.filter((n) => !n.ehsOnly || me?.role === 'ehs');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: bar.bg }}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <TopBar wide={wide} nav={nav} inboxCount={inboxCount} />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
        {!wide ? <BottomTabs nav={nav} inboxCount={inboxCount} /> : null}
      </View>
      <Drawer wide={wide} />
      <AssistantPanel />
    </SafeAreaView>
  );
}

function Count({ n, tone }: { n: number; tone?: 'alarm' }) {
  const { p } = useTheme();
  const bar = useBar();
  return (
    <View style={[styles.count, { backgroundColor: tone === 'alarm' ? p.high : bar.chip }]}>
      <T v="micro" weight="bold" color="#fff">
        {n}
      </T>
    </View>
  );
}

function TopBar({ wide, nav, inboxCount }: { wide: boolean; nav: typeof NAV; inboxCount: number }) {
  const bar = useBar();
  const path = usePathname();
  const settings = useSettings();
  const now = useNow(15_000);
  const { me } = useAuth();
  const openAssistant = useAssistant((s) => s.setOpen);
  const offset = settings.demo_offset_minutes;
  return (
    <View style={[styles.top, { backgroundColor: bar.bg, borderBottomColor: bar.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xl, flex: 1 }}>
        <BrandOnBar />
        {wide ? (
          <View style={{ flexDirection: 'row', height: '100%' }}>
            {nav.map((n) => {
              const on = path.startsWith(n.href);
              return (
                <Pressable
                  key={n.href}
                  accessibilityRole="link"
                  accessibilityState={{ selected: on }}
                  onPress={() => router.navigate(n.href)}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.navItem, { borderBottomColor: on ? '#fff' : 'transparent', backgroundColor: hovered && !on ? 'rgba(255,255,255,.06)' : 'transparent' }]}
                >
                  <T v="h3" weight={on ? 'bold' : 'medium'} style={{ color: on ? '#fff' : bar.dim }}>
                    {n.label}
                  </T>
                  {n.href === '/inbox' && inboxCount ? <Count n={inboxCount} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? space.lg : space.sm }}>
        {offset ? (
          <View style={[styles.pill, { backgroundColor: '#3C2A55' }]}>
            <Icon name="fast-forward" size={14} color="#D9C2F5" />
            <T v="small" weight="bold" style={{ color: '#E9DAFB' }}>
              Demo clock +{Math.round(offset / 60)} h
            </T>
          </View>
        ) : wide ? (
          <T v="body" style={{ color: bar.dim }}>
            {plantDate(now)}, {plantClock(now)}, shift {shiftFor(now)}
          </T>
        ) : null}
        <LiveDot />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask the assistant"
          onPress={() => openAssistant(true)}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.ask, { backgroundColor: hovered ? '#fff' : '#E9EEF4' }]}
        >
          <Icon name="creation" size={20} color="#1C2228" />
          {wide ? (
            <T v="body" weight="bold" style={{ color: '#1C2228' }}>
              Ask assistant
            </T>
          ) : null}
        </Pressable>
        <Bell />
        {wide ? (
          <T v="body" style={{ color: bar.text }} numberOfLines={1}>
            {me?.name}, {me?.role === 'ehs' ? 'EHS Lead' : 'Area Supervisor'}
          </T>
        ) : null}
        <AccountButton wide={wide} />
      </View>
    </View>
  );
}

function BrandOnBar() {
  const bar = useBar();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Brand compactDark />
      <T v="small" style={{ color: bar.dim }}>
        Plant X
      </T>
    </View>
  );
}

function BottomTabs({ nav, inboxCount }: { nav: typeof NAV; inboxCount: number }) {
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  return (
    <View style={[styles.tabs, { backgroundColor: p.surface, borderTopColor: p.border, paddingBottom: Math.max(insets.bottom, 6) }]}>
      {nav.map((n) => {
        const on = path.startsWith(n.href);
        return (
          <Pressable key={n.href} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => router.navigate(n.href)} style={[styles.tab, { borderTopColor: on ? p.accent : 'transparent' }]}>
            <View>
              <Icon name={n.icon} size={24} color={on ? p.accent : p.textDim} />
              {n.href === '/inbox' && inboxCount ? (
                <View style={{ position: 'absolute', right: -14, top: -6 }}>
                  <Count n={inboxCount} tone="alarm" />
                </View>
              ) : null}
            </View>
            <T v="small" weight="semibold" color={on ? 'text' : 'dim'}>
              {n.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

function LiveDot() {
  const { p } = useTheme();
  const bar = useBar();
  const [s, setS] = useState<'connecting' | 'live' | 'offline'>('connecting');
  useEffect(() => onRealtimeStatus(setS), []);
  const c = s === 'live' ? '#4CC38A' : s === 'offline' ? p.high : '#E5B04A';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`Connection: ${s}`}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
      <T v="small" weight="semibold" style={{ color: bar.text }}>
        {s === 'live' ? 'Live' : s === 'offline' ? 'Offline' : 'Connecting'}
      </T>
    </View>
  );
}

function Bell() {
  const { p } = useTheme();
  const bar = useBar();
  const { data } = useNotifications();
  const open = useDash((s) => s.open);
  const now = useNow(30_000);
  const [show, setShow] = useState(false);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  const { width } = useWindowDimensions();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => setShow(true)} style={styles.iconBtn}>
        <Icon name={unread ? 'bell-ring-outline' : 'bell-outline'} size={24} color={bar.text} />
        {unread ? (
          <View style={[styles.bellCount, { backgroundColor: p.high }]}>
            <T v="micro" weight="bold" color="#fff">
              {unread}
            </T>
          </View>
        ) : null}
      </Pressable>
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <Pressable style={{ flex: 1, backgroundColor: p.overlay }} onPress={() => setShow(false)}>
          <Pressable style={[styles.popover, { backgroundColor: p.surface, borderColor: p.borderStrong, width: Math.min(440, width - 24) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md }}>
              <T v="h2">Notifications</T>
              {unread ? <Button label="Mark all read" size="sm" variant="quiet" onPress={() => api.markRead()} /> : null}
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              {(data ?? []).length === 0 ? (
                <T v="body" color="dim" style={{ padding: space.md }}>
                  Nothing yet. Escalations and new high-severity reports will appear here.
                </T>
              ) : null}
              {(data ?? []).map((n) => {
                const tx = notificationText(n);
                const tone = n.type === 'escalation' ? p.escalated : n.type === 'sla_breach' || n.type === 'high_severity' ? p.high : p.accent;
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => {
                      setShow(false);
                      if (!n.read_at) api.markRead([n.id]);
                      if (n.report_id) open(n.report_id);
                    }}
                    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.notif, { borderTopColor: p.border, backgroundColor: hovered ? p.raised : n.read_at ? 'transparent' : p.sunken }]}
                  >
                    <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: n.read_at ? 'transparent' : tone }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T v="body" weight="semibold">
                        {tx.title}
                      </T>
                      <T v="small" color="dim">
                        {tx.body}
                      </T>
                    </View>
                    <T v="small" color="faint">
                      {ago(n.created_at, now)}
                    </T>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function AccountButton({ wide }: { wide: boolean }) {
  const { p, name, toggle } = useTheme();
  const bar = useBar();
  const { me, signOut } = useAuth();
  const [show, setShow] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Account and settings" onPress={() => setShow(true)} style={styles.iconBtn}>
        <Icon name={wide ? 'chevron-down' : 'account-circle-outline'} size={wide ? 22 : 26} color={bar.text} />
      </Pressable>
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <Pressable style={{ flex: 1, backgroundColor: p.overlay, justifyContent: wide ? 'flex-start' : 'flex-end', alignItems: wide ? 'flex-end' : 'stretch' }} onPress={() => setShow(false)}>
          <Pressable style={{ backgroundColor: p.surface, borderRadius: wide ? radius.md : 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, margin: wide ? space.md : 0, marginTop: wide ? 60 : 0, padding: space.lg, gap: space.md, width: wide ? 320 : '100%', borderWidth: 1, borderColor: p.borderStrong }}>
            <View>
              <T v="h3">{me?.name}</T>
              <T v="small" color="dim">
                {me?.role === 'ehs' ? 'EHS Lead, all areas' : 'Area Supervisor'}
              </T>
            </View>
            <Button label={name === 'control' ? 'Switch to light theme' : 'Switch to dark theme'} icon={name === 'control' ? 'white-balance-sunny' : 'weather-night'} variant="secondary" size="lg" full onPress={toggle} />
            <Button
              label="Sign out"
              icon="logout"
              variant="secondary"
              size="lg"
              full
              onPress={async () => {
                setShow(false);
                await signOut();
                router.replace('/login');
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Right-hand drawer (wide) or full-screen sheet (narrow) for the selected report. */
function Drawer({ wide }: { wide: boolean }) {
  const { p } = useTheme();
  const id = useDash((s) => s.drawerId);
  const close = useDash((s) => s.close);
  const { items } = useItems();
  const item = items.find((i) => i.report.id === id);
  const { width } = useWindowDimensions();
  if (!id) return null;
  return (
    <Modal visible transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? <Pressable style={{ flex: 1, backgroundColor: p.overlay }} onPress={close} accessibilityLabel="Close report" /> : null}
        <SafeAreaView edges={['top', 'bottom', 'right']} style={{ width: wide ? Math.min(760, width * 0.58) : '100%', backgroundColor: p.bg, borderLeftWidth: wide ? 1 : 0, borderLeftColor: p.borderStrong }}>
          <View style={{ flex: 1, backgroundColor: p.bg }}>
            <View style={[styles.drawerHead, { borderBottomColor: p.border, backgroundColor: p.surface }]}>
              <T v="h2" style={{ fontFamily: undefined }}>
                {item ? reportLabel(item.report.report_no) : 'Report'}
              </T>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.drawerClose}>
                <Icon name="close" size={24} color={p.textDim} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}>
              {item ? <ReportPanel item={item} /> : <T color="dim">This report is not visible to you.</T>}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, minHeight: 60, gap: space.md, borderBottomWidth: 1 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, borderBottomWidth: 3, height: '100%', minHeight: 60 },
  count: { minWidth: 22, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellCount: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabs: { flexDirection: 'row', borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 8, paddingBottom: 4, minHeight: 60, borderTopWidth: 3 },
  popover: { position: 'absolute', top: 64, right: 12, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  notif: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 1, alignItems: 'center' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.lg, paddingRight: space.sm, minHeight: 60, borderBottomWidth: 1 },
  drawerClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
