// Full-page report (deep link from a notification toast, or a phone screen).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { ReportPanel } from '@/features/dashboard/ReportPanel';
import { useItems } from '@/lib/queries';
import { space } from '@/theme/tokens';
import { T } from '@/ui/Text';

export default function ReportPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, isLoading } = useItems();
  const item = items.find((i) => i.report.id === Number(id));
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
      {item ? <ReportPanel item={item} /> : <T color="dim">{isLoading ? 'Loading…' : 'Report not visible to you.'}</T>}
    </ScrollView>
  );
}
