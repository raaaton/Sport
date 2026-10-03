import { StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { DynamicScrollView } from './DynamicScrollView';

type AppScreenProps = {
  children: React.ReactNode;
  safeAreaEdges?: Edge[];
  scrollable?: boolean;
};

export function AppScreen({ children, safeAreaEdges = [], scrollable = true }: AppScreenProps) {
  const colorScheme = useColorScheme();
  if (!scrollable) {
    const content = (
      <View style={[styles.staticContent, { backgroundColor: colors[colorScheme].background }]}>
        {children}
      </View>
    );
    return safeAreaEdges.length === 0
      ? content
      : <SafeAreaView edges={safeAreaEdges} style={styles.safeArea}>{content}</SafeAreaView>;
  }

  const content = (
    <DynamicScrollView
      contentContainerStyle={styles.content}
      style={[styles.scroll, { backgroundColor: colors[colorScheme].background }]}
    >
      {children}
    </DynamicScrollView>
  );

  if (safeAreaEdges.length === 0) return content;
  return <SafeAreaView edges={safeAreaEdges} style={styles.safeArea}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
