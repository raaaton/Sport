import { FeaturePlaceholder } from '@/shared/ui/FeaturePlaceholder';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ProgressScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <FeaturePlaceholder
        symbol="chart.xyaxis.line"
        title="Progression"
        message="Vos progrès apparaîtront ici au fil des séances."
      />
    </SafeAreaView>
  );
}
