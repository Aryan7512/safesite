import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon } from './Icon';
import { Row } from './Layout';
import { T } from './Text';

export function Dialog({
  visible, title, onClose, children, footer, width = 520,
}: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const { p } = useTheme();
  const { width: W } = useWindowDimensions();
  const narrow = W < 640;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={[styles.backdrop, { backgroundColor: p.overlay, justifyContent: narrow ? 'flex-end' : 'center' }]} onPress={onClose}>
          <Pressable
            accessibilityViewIsModal
            style={[
              styles.box,
              {
                backgroundColor: p.surface,
                borderColor: p.borderStrong,
                borderWidth: p.borderWidth,
                width: narrow ? '100%' : width,
                maxHeight: '90%',
                borderBottomLeftRadius: narrow ? 0 : radius.xl,
                borderBottomRightRadius: narrow ? 0 : radius.xl,
              },
            ]}
          >
            <Row between style={{ padding: space.lg, paddingBottom: space.sm }}>
              <T v="h2">{title}</T>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.x}>
                <Icon name="close" color={p.textDim} />
              </Pressable>
            </Row>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={[styles.footer, { borderTopColor: p.border }]}>{footer}</View> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', padding: 0 },
  box: { borderRadius: radius.xl, overflow: 'hidden', shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 12 } },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, padding: space.lg, borderTopWidth: 1, flexWrap: 'wrap' },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
