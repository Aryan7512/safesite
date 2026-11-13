// Dashboard shell (PRD §5.2): responsive — left nav on wide screens (laptop /
// projector), bottom tabs on a phone. Report detail opens in a right drawer.
import { Redirect, router, Slot, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { plantClock, plantDate, shiftFor } from '@/domain/shift';
import { reportLabel } from '@/domain/types';
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
import { Row } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { ago } from '@/domain/sla';

type NavHref = '/overview' | '/inbox' | '/actions' | '/areas' | '/admin';
const NAV: { href: NavHref; label: string; icon: IconName; ehsOnly?: boolean }[] = [
  { href: '/overview', label: 'Overview', icon: 'view-dashboard-outline' },
  { href: '/inbox', label: 'Inbox', icon: 'inbox-arrow-down-outline' },
  { href: '/actions', label: 'Actions', icon: 'clipboard-check-outline' },
  { href: '/areas', label: 'Areas', icon: 'map-outline' },
  { href: '/admin', label: 'Admin', icon: 'tune-variant', ehsOnly: true },
];

export default function DashboardLayout() {
  const { session, me, loading } = useAuth();
  const { p } = useTheme();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const wide = width >= WIDE;
  const { items } = useItems();
  const inboxCount = items.filter((i) => i.action.status === 'New' && i.action.merged_into == null).length;

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (me && !isStaff(me)) return <Redirect href="/capture" />;

  const nav = NAV.filter((n) => !n.ehsOnly || me?.role === 'ehs');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? (
          <View style={[styles.side, { backgroundColor: p.surface, borderRightColor: p.border, borderRightWidth: p.borderWidth }]}>
            <View style={{ padding: space.lg, paddingBottom: space.xl }}>
              <Brand sub="Plant X · Safety" />
            </View>
            {nav.map((n) => {
              const on = path.startsWith(n.href);
              return (
                <Pressable
                  key={n.href}
                  accessibilityRole="link"
                  accessibilityState={{ selected: on }}
                  onPress={() => router.navigate(n.href)}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.navItem,
                    on ? { backgroundColor: p.accentSoft } : hovered ? { backgroundColor: p.raised } : null,
                  ]}
                >
                  <View style={[styles.navBar, { backgroundColor: on ? p.accent : 'transparent' }]} />
                  <Icon name={n.icon} color={on ? p.accent : p.textDim} />
                  <T v="body" weight={on ? 'semibold' : 'medium'} color={on ? 'text' : 'dim'} style={{ flex: 1 }}>
                    {n.label}
                  </T>
                  {n.href === '/inbox' && inboxCount ? <Count n={inboxCount} /> : null}
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <UserBox />
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          <TopBar wide={wide} />
          <View style={{ flex: 1 }}>
            <Slot />
          </View>
          {!wide ? <BottomTabs nav={nav} inboxCount={inboxCount} /> : null}
        </View>

        <Drawer wide={wide} />
      </View>
    </SafeAreaView>
  );
}

function Count({ n }: { n: number }) {
  const { p } = useTheme();
  return (
    <View style={[styles.count, { backgroundColor: p.accent }]}>
      <T v="micro" weight="bold" color={p.accentText}>
        {n}
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
          <Pressable key={n.href} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => router.navigate(n.href)} style={styles.tab}>
            <View>
              <Icon name={n.icon} color={on ? p.accent : p.textDim} />
              {n.href === '/inbox' && inboxCount ? (
                <View style={{ position: 'absolute', right: -12, top: -6 }}>
                  <Count n={inboxCount} />
                </View>
              ) : null}
            </View>
            <T v="micro" weight="semibold" color={on ? 'text' : 'dim'}>
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
  const [s, setS] = useState<'connecting' | 'live' | 'offline'>('connecting');
  useEffect(() => onRealtimeStatus(setS), []);
  const c = s === 'live' ? p.clear : s === 'offline' ? p.high : p.medium;
  return (
    <Row gap={6} style={[styles.pill, { borderColor: p.border }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
      <T v="micro" weight="semibold" color="dim">
        {s === 'live' ? 'LIVE' : s === 'offline' ? 'OFFLINE' : 'CONNECTING'}
      </T>
    </Row>
  );
}

function TopBar({ wide }: { wide: boolean }) {
  const { p, name, toggle } = useTheme();
  const settings = useSettings();
  const now = useNow(15_000);
  const path = usePathname();
  const title = NAV.find((n) => path.startsWith(n.href))?.label ?? (path.startsWith('/report') ? 'Report' : 'SafeSite');
  const offset = settings.demo_offset_minutes;
  return (
    <View style={[styles.top, { borderBottomColor: p.border, borderBottomWidth: p.borderWidth }]}>
      <Row gap={space.md} style={{ flex: 1 }}>
        {!wide ? <Brand /> : <T v="h1">{title}</T>}
      </Row>
      <Row gap={space.sm}>
        {offset ? (
          <Row gap={6} style={[styles.pill, { borderColor: p.escalated, backgroundColor: p.escalatedSoft }]}>
            <Icon name="fast-forward" size={14} color={p.escalated} />
            <T v="micro" weight="bold" color={p.name === 'daylight' ? p.text : p.escalated}>
              DEMO CLOCK +{Math.round(offset / 60)} h · {plantClock(now)}
            </T>
          </Row>
        ) : wide ? (
          <T v="mono" color="dim">
            {plantDate(now)} {plantClock(now)} · Shift {shiftFor(now)}
          </T>
        ) : null}
        <LiveDot />
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={toggle} style={[styles.iconBtn, { borderColor: p.border, borderWidth: p.borderWidth }]}>
          <Icon name={name === 'control' ? 'white-balance-sunny' : 'weather-night'} color={p.textDim} />
        </Pressable>
        <Bell />
        {!wide ? <UserMenuButton /> : null}
      </Row>
    </View>
  );
}

function Bell() {
  const { p } = useTheme();
  const { data } = useNotifications();
  const open = useDash((s) => s.open);
  const now = useNow(30_000);
  const [show, setShow] = useState(false);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  const { width } = useWindowDimensions();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => setShow(true)} style={[styles.iconBtn, { borderColor: unread ? p.escalated : p.border, borderWidth: p.borderWidth }]}>
        <Icon name={unread ? 'bell-ring-outline' : 'bell-outline'} color={unread ? p.escalated : p.textDim} />
        {unread ? (
          <View style={[styles.bellCount, { backgroundColor: p.escalated }]}>
            <T v="micro" weight="bold" color="#fff">
              {unread}
            </T>
          </View>
        ) : null}
      </Pressable>
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <Pressable style={{ flex: 1, backgroundColor: p.overlay }} onPress={() => setShow(false)}>
          <Pressable style={[styles.popover, { backgroundColor: p.surface, borderColor: p.borderStrong, width: Math.min(420, width - 24) }]}>
            <Row between style={{ padding: space.md }}>
              <T v="h3">Notifications</T>
              {unread ? <Button label="Mark all read" size="sm" variant="quiet" onPress={() => api.markRead()} /> : null}
            </Row>
            <ScrollView style={{ maxHeight: 480 }}>
              {(data ?? []).length === 0 ? (
                <T v="small" color="dim" style={{ padding: space.md }}>
                  Nothing yet.
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
                      <T v="small" weight="semibold">
                        {tx.title}
                      </T>
                      <T v="micro" color="dim">
                        {tx.body}
                      </T>
                    </View>
                    <T v="micro" color="faint">
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

function UserBox() {
  const { p } = useTheme();
  const { me, signOut } = useAuth();
  return (
    <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderTopColor: p.border }}>
      <T v="body" weight="semibold">
        {me?.name}
      </T>
      <T v="micro" color="dim">
        {me?.role === 'ehs' ? 'EHS Lead · all areas' : 'Area Supervisor'}
      </T>
      <Button
        label="Sign out"
        size="sm"
        variant="quiet"
        icon="logout"
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
      />
    </View>
  );
}

function UserMenuButton() {
  const { p } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => setShow(true)} style={[styles.iconBtn, { borderColor: p.border, borderWidth: p.borderWidth }]}>
        <Icon name="account-circle-outline" color={p.textDim} />
      </Pressable>
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <Pressable style={{ flex: 1, backgroundColor: p.overlay, justifyContent: 'flex-end' }} onPress={() => setShow(false)}>
          <View style={{ backgroundColor: p.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }}>
            <UserBox />
          </View>
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
  const panel = (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Row between style={[styles.drawerHead, { borderBottomColor: p.border }]}>
        <T v="h3">{item ? reportLabel(item.report.report_no) : 'Report'}</T>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={[styles.iconBtn, { borderColor: p.border, borderWidth: p.borderWidth }]}>
          <Icon name="close" color={p.textDim} />
        </Pressable>
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}>
        {item ? <ReportPanel item={item} /> : <T color="dim">Report not visible to you.</T>}
      </ScrollView>
    </View>
  );
  return (
    <Modal visible transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? <Pressable style={{ flex: 1, backgroundColor: p.overlay }} onPress={close} accessibilityLabel="Close report" /> : null}
        <SafeAreaView
          edges={['top', 'bottom', 'right']}
          style={{ width: wide ? Math.min(720, width * 0.55) : '100%', backgroundColor: p.bg, borderLeftWidth: wide ? p.borderWidth : 0, borderLeftColor: p.borderStrong }}
        >
          {panel}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  side: { width: 232 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingRight: space.lg, marginHorizontal: space.sm, borderRadius: radius.md, minHeight: 48 },
  navBar: { width: 3, height: 22, borderRadius: 2, marginLeft: 2 },
  count: { minWidth: 22, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabs: { flexDirection: 'row', borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 8, minHeight: 56 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md, minHeight: 64 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bellCount: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  popover: { position: 'absolute', top: 64, right: 12, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  notif: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 1, alignItems: 'center' },
  drawerHead: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1 },
});
