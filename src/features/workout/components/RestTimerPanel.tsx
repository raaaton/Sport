import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import type { RestTimer } from '../domain/models';
import { remainingSeconds } from '../domain/restTimerMachine';
import { PrimaryAction } from './PrimaryAction';

type Props = { timer: RestTimer; nowMs: number | null; nextSetNumber: number; actionBusy: boolean; onAction: (action: 'pause' | 'resume' | 'skip') => void };

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

export function RestTimerPanel({ timer, nowMs, nextSetNumber, actionBusy, onAction }: Props) {
  const palette = colors[useColorScheme()];
  const paused = timer.state === 'paused';
  return (
    <View style={styles.content}>
      <AppText variant="subheadline" colorRole="secondary">{paused ? 'Repos en pause' : 'Récupération'}</AppText>
      <AppText style={styles.clock} accessibilityLiveRegion="polite">{nowMs === null ? '—:—' : formatRemaining(remainingSeconds(timer, nowMs))}</AppText>
      <AppText variant="headline">Prochaine série · {nextSetNumber}</AppText>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={actionBusy} onPress={() => onAction(paused ? 'resume' : 'pause')} style={({ pressed }) => [styles.secondaryAction, { borderColor: palette.separator, opacity: actionBusy ? 0.5 : pressed ? 0.65 : 1 }]}>
          <AppSymbol name={paused ? 'play.fill' : 'pause.fill'} size={17} color={palette.accent} />
          <AppText variant="subheadline" style={{ color: palette.accent }}>{paused ? 'Reprendre' : 'Pause'}</AppText>
        </Pressable>
      </View>
      <PrimaryAction title="Passer le repos" onPress={() => onAction('skip')} busy={actionBusy} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  clock: { fontSize: 76, lineHeight: 88, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -3 },
  actions: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  secondaryAction: { minHeight: 48, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
