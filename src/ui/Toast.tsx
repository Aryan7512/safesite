import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

export type ToastTone = 'info' | 'success' | 'error' | 'escalation' | 'high';
interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  onPress?: () => void;
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

const ICON: Record<ToastTone, IconName> = {
  info: 'information-outline',
  success: 'check-circle-outline',
  error: 'alert-circle-outline',
  escalation: 'arrow-up-bold-circle-outline',
  high: 'alert-octagon-outline',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === 'escalation' || t.tone === 'high' ? 9000 : 4500);
  }, []);

  const toneColor: Record<ToastTone, string> = {
    info: p.accent,
    success: p.clear,
    error: p.danger,
    escalation: p.escalated,
    high: p.high,
  };

  return (
    <Ctx.Provider value={push}>
      {children}
      <View pointerEvents="box-none" style={[styles.stack, { top: insets.top + space.sm }]}>
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} color={toneColor[t.tone]} onClose={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))} />
        ))}
      </View>
    </Ctx.Provider>
  );
}

function ToastView({ toast, color, onClose }: { toast: Toast; color: string; onClose: () => void }) {
  const { p } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [anim]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}
    >
      <Pressable
        onPress={() => {
          toast.onPress?.();
          onClose();
        }}
        style={[
          styles.toast,
          { backgroundColor: p.raised, borderColor: color, borderLeftColor: color, shadowColor: p.shadow },
        ]}
      >
        <Icon name={ICON[toast.tone]} size={24} color={color} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{toast.title}</T>
          {toast.body ? (
            <T v="small" color="dim">
              {toast.body}
            </T>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg,
    borderRadius: radius.md, borderWidth: 1, borderLeftWidth: 5, maxWidth: 520, width: '100%',
    shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
});
