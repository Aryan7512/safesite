import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shiftFor } from '@/domain/shift';
import type { AreaRow } from '@/domain/types';
import { useOutbox } from '@/features/capture/submit';
import { useAuth } from '@/lib/auth';
import { setLanguage, useLang } from '@/lib/i18n';
import { useAreas, useItems, useNow, useSignedUrl } from '@/lib/queries';
import { api } from '@/lib/api';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Image } from 'expo-image';
import { BrandMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Icon, type IconName } from '@/ui/Icon';
import { Row } from '@/ui/Layout';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/Text';

export function WorkerHeader({ title }: { title?: string }) {
  const { t } = useTranslation();
  const { p, name, toggle } = useTheme();
  const { me, signOut } = useAuth();
  const lang = useLang();
  const now = useNow(30_000);
  const [menu, setMenu] = useState(false);

  return (
    <View style={{ gap: space.md }}>
      <Row between>
        <Row gap={10}>
          <BrandMark size={30} />
          <T v="h3" weight="bold">
            {title ?? 'SafeSite'}
          </T>
        </Row>
        <Row gap={space.sm}>
          <Segmented
            size="lg"
            label={t('common.language')}
            value={lang}
            onChange={(l) => {
              setLanguage(l);
              api.setLanguage(l).catch(() => {});
            }}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'hi', label: 'हिं' },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('common.theme')}: ${name === 'control' ? t('common.themeControl') : t('common.themeDaylight')}`}
            onPress={toggle}
            style={[styles.iconBtn, { borderColor: p.border, borderWidth: p.borderWidth }]}
          >
            <Icon name={name === 'control' ? 'white-balance-sunny' : 'weather-night'} color={p.textDim} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.signOut')}
            onPress={() => setMenu(true)}
            style={[styles.iconBtn, { borderColor: p.border, borderWidth: p.borderWidth }]}
          >
            <Icon name="account-circle-outline" color={p.textDim} />
          </Pressable>
        </Row>
      </Row>
      {me ? (
        <T v="small" color="dim">
          {[me.name, me.is_contractor ? t('common.contractor') : null, t('common.shift', { shift: shiftFor(now) })]
            .filter(Boolean)
            .join(' · ')}
        </T>
      ) : null}

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: p.overlay }]} onPress={() => setMenu(false)}>
          <View style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border }]}>
            <T v="h3">{me?.name}</T>
            <T v="small" color="dim">
              {me?.email}
            </T>
            <Button
              label={t('common.signOut')}
              variant="secondary"
              size="lg"
              icon="logout"
              full
              onPress={async () => {
                setMenu(false);
                await signOut();
                router.replace('/login');
              }}
            />
            <Button label={t('common.cancel')} variant="quiet" full onPress={() => setMenu(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function WorkerTabs() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { items } = useItems();
  const pending = useOutbox((s) => s.pending.length);
  const openCount = items.filter((i) => i.action.status !== 'Closed').length;

  const tab = (href: '/capture' | '/reports', label: string, icon: IconName, badge?: number) => {
    const on = path === href || (href === '/reports' && path.startsWith('/reports'));
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
        onPress={() => router.replace(href)}
        style={[styles.tab, on && { borderTopColor: p.accent }]}
      >
        <View>
          <Icon name={icon} size={26} color={on ? p.accent : p.textDim} />
          {badge ? (
            <View style={[styles.badge, { backgroundColor: p.accent }]}>
              <T v="micro" weight="bold" color={p.accentText}>
                {badge}
              </T>
            </View>
          ) : null}
        </View>
        <T v="small" weight="semibold" color={on ? p.text : p.textDim}>
          {label}
        </T>
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabs, { backgroundColor: p.surface, borderTopColor: p.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tab('/capture', t('tabs.report'), 'alert-plus-outline')}
      {tab('/reports', t('tabs.mine'), 'clipboard-text-clock-outline', openCount + pending || undefined)}
    </View>
  );
}

export function useAreaName() {
  const { data: areas } = useAreas();
  const lang = useLang();
  return (id: number | null | undefined) => {
    const a = areas?.find((x) => x.id === id);
    return a ? (lang === 'hi' ? a.name_hi : a.name) : '—';
  };
}

export function AreaPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (a: AreaRow) => void }) {
  const { t } = useTranslation();
  const { p } = useTheme();
  const lang = useLang();
  const { data: areas } = useAreas();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: p.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border, maxHeight: '80%' }]}>
          <T v="h2">{t('capture.pickArea')}</T>
          <ScrollView contentContainerStyle={{ gap: space.sm }}>
            {(areas ?? []).map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                onPress={() => onPick(a)}
                style={({ pressed }) => [
                  styles.areaRow,
                  { backgroundColor: pressed ? p.raised : p.sunken, borderColor: p.border, borderWidth: p.borderWidth },
                ]}
              >
                <Icon name="map-marker-outline" color={p.accent} />
                <View style={{ flex: 1 }}>
                  <T v="h3">{lang === 'hi' ? a.name_hi : a.name}</T>
                  {lang === 'hi' ? (
                    <T v="small" color="dim">
                      {a.name}
                    </T>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Button label={t('common.cancel')} variant="quiet" full onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Private photo by storage path (signed URL) or a local uri. */
export function Photo({ path, uri, size = 88, radiusPx = radius.md }: { path?: string | null; uri?: string; size?: number | '100%'; radiusPx?: number }) {
  const { p } = useTheme();
  const signed = useSignedUrl(uri ? null : path);
  const src = uri ?? signed.data;
  return (
    <View style={{ width: size, height: size === '100%' ? 220 : size, borderRadius: radiusPx, overflow: 'hidden', backgroundColor: p.sunken, borderWidth: 1, borderColor: p.border }}>
      {src ? <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderTopWidth: 1 },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 8, minHeight: touch.primary,
    borderTopWidth: 3, borderTopColor: 'transparent',
  },
  badge: { position: 'absolute', right: -10, top: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.md, borderWidth: 1 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, minHeight: 56 },
});
