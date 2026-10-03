import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getDatabase } from '@/shared/database';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { TimePickerSheet } from '@/shared/ui/TimePickerSheet';
import { getNotificationPreferences, getWorkoutReminderSchedules, updateNotificationPreferences } from '@/features/notifications/data/notificationRepository';
import type { NotificationPermissionState } from '@/features/notifications/services/localNotifications';
import { getManagedSportNotifications, getSportNotificationPermissionState, requestSportNotificationPermission, syncSportNotifications } from '@/features/notifications/services/localNotifications';
import type { NotificationPreferences } from '@/features/notifications/domain/notificationPlanner';

const emptyPreferences: NotificationPreferences = { workoutEnabled: false, photoEnabled: false, photoTimeMinutes: 360 };
const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function permissionLabel(state: NotificationPermissionState | null): string {
  switch (state) {
    case 'authorized': return 'Autorisée';
    case 'provisional': return 'Autorisée sans alerte sonore';
    case 'ephemeral': return 'Autorisée temporairement';
    case 'denied': return 'Refusée dans iOS';
    case 'not-determined': return 'Pas encore demandée';
    default: return 'Vérification…';
  }
}

function permissionAllows(state: NotificationPermissionState): boolean {
  return state === 'authorized' || state === 'provisional' || state === 'ephemeral';
}

export function NotificationSettingsScreen() {
  const palette = colors[useColorScheme()];
  const router = useRouter();
  const [preferences, setPreferences] = useState(emptyPreferences);
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [schedulesWithoutTime, setSchedulesWithoutTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [currentPreferences, currentPermission, managedRequests, schedules] = await Promise.all([
        getNotificationPreferences(db), getSportNotificationPermissionState(), getManagedSportNotifications(), getWorkoutReminderSchedules(db),
      ]);
      setPreferences(currentPreferences);
      setPermission(currentPermission);
      setPendingCount(managedRequests.length);
      setSchedulesWithoutTime(schedules.filter((schedule) => schedule.isActive && schedule.reminderTimeMinutes === null).length);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Les notifications n’ont pas pu être chargées.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const updateAndSync = async (changes: Partial<NotificationPreferences>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase();
      const updated = await updateNotificationPreferences(db, changes);
      setPreferences(updated);
      await syncSportNotifications(db);
      setPendingCount((await getManagedSportNotifications()).length);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Les rappels n’ont pas pu être mis à jour.');
      return false;
    } finally { setBusy(false); }
  };

  const toggleReminder = async (kind: 'workout' | 'photo', enabled: boolean) => {
    if (!enabled) {
      await updateAndSync(kind === 'workout' ? { workoutEnabled: false } : { photoEnabled: false });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextPermission = await requestSportNotificationPermission();
      setPermission(nextPermission);
      if (!permissionAllows(nextPermission)) {
        setError(nextPermission === 'denied'
          ? 'Les notifications sont refusées dans iOS. Ouvrez Réglages pour les autoriser.'
          : 'Les notifications n’ont pas été autorisées.');
        return;
      }
      const db = await getDatabase();
      const updated = await updateNotificationPreferences(db, kind === 'workout' ? { workoutEnabled: true } : { photoEnabled: true });
      setPreferences(updated);
      await syncSportNotifications(db);
      setPendingCount((await getManagedSportNotifications()).length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La permission n’a pas pu être vérifiée.');
    } finally { setBusy(false); }
  };

  const openSystemSettings = () => { void Linking.openSettings().catch(() => setError('Les réglages iOS ne peuvent pas être ouverts depuis cet appareil.')); };

  return (
    <AppScreen safeAreaEdges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <AppText variant="largeTitle">Notifications</AppText>
          <AppText variant="subheadline" colorRole="secondary">Les rappels restent sur cet appareil et suivent votre planning Sport.</AppText>
        </View>
        {loading ? <ActivityIndicator style={styles.loader} /> : null}

        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>RAPPELS</AppText>
          <View style={[styles.group, { backgroundColor: palette.groupedBackground }]}>
            <View style={styles.switchRow}>
              <View style={styles.rowCopy}><AppText variant="body">Séances</AppText><AppText variant="caption" colorRole="secondary">Horaires configurés dans le planning</AppText></View>
              <Switch accessibilityLabel="Notifications de séance" value={preferences.workoutEnabled} disabled={busy || loading} onValueChange={(value) => { void toggleReminder('workout', value); }} />
            </View>
            <View style={[styles.separator, { backgroundColor: palette.separator }]} />
            <View style={styles.switchRow}>
              <View style={styles.rowCopy}><AppText variant="body">Photos</AppText><AppText variant="caption" colorRole="secondary">Le premier jour du mois</AppText></View>
              <Switch accessibilityLabel="Rappel mensuel des photos" value={preferences.photoEnabled} disabled={busy || loading} onValueChange={(value) => { void toggleReminder('photo', value); }} />
            </View>
          </View>
          {schedulesWithoutTime > 0 ? <AppText variant="caption" colorRole="tertiary" style={styles.note}>{schedulesWithoutTime} séance{schedulesWithoutTime === 1 ? ' active n’a pas encore d’horaire' : 's actives n’ont pas encore d’horaire'} de rappel. Définissez leur heure dans Planning.</AppText> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings/schedule')} style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.55 : 1 }]}>
            <AppSymbol name="calendar" size={17} color={palette.accent} />
            <AppText variant="subheadline" style={{ color: palette.accent }}>Configurer les jours et heures des séances</AppText>
            <AppSymbol name="chevron.right" size={13} color={palette.tertiary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>RAPPEL PHOTO</AppText>
          <View style={[styles.group, { backgroundColor: palette.groupedBackground }]}>
            <Pressable accessibilityRole="button" accessibilityHint="Choisir l’heure du rappel mensuel des photos" disabled={busy || loading} onPress={() => setPhotoPickerVisible(true)} style={({ pressed }) => [styles.timeRow, { opacity: pressed ? 0.55 : 1 }]}>
              <View style={styles.rowCopy}><AppText variant="body">Heure</AppText><AppText variant="caption" colorRole="secondary">Le 1er de chaque mois</AppText></View>
              <AppText variant="body" colorRole="secondary">{formatTime(preferences.photoTimeMinutes)}</AppText>
              <AppSymbol name="chevron.right" color={palette.tertiary} size={13} />
            </Pressable>
          </View>
          <AppText variant="caption" colorRole="tertiary" style={styles.note}>Le rappel photo conserve 06:00 par défaut. Son contenu ne révèle aucune information privée.</AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>AUTORISATION IOS</AppText>
          <View style={[styles.statusRow, { backgroundColor: palette.groupedBackground }]}>
            <AppText variant="body">{permissionLabel(permission)}</AppText>
            {permissionAllows(permission ?? 'not-determined') ? <AppSymbol name="checkmark.circle.fill" color={palette.accent} size={20} /> : null}
          </View>
          {permission === 'denied' ? <Pressable accessibilityRole="button" onPress={openSystemSettings} style={styles.settingsLink}><AppText variant="subheadline" style={{ color: palette.accent }}>Ouvrir les réglages iOS</AppText><AppSymbol name="arrow.up.right" color={palette.accent} size={13} /></Pressable> : null}
          {permissionAllows(permission ?? 'not-determined') ? <AppText variant="caption" colorRole="tertiary" style={styles.note}>{pendingCount} rappel{pendingCount === 1 ? '' : 's'} Sport en attente. Au premier plan, les rappels apparaissent en bannière et dans le centre de notifications, sans son.</AppText> : null}
        </View>
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
      </View>
      <TimePickerSheet
        visible={photoPickerVisible}
        title="Heure du rappel photo"
        initialTimeMinutes={preferences.photoTimeMinutes}
        onCancel={() => setPhotoPickerVisible(false)}
        onSave={(photoTimeMinutes) => {
          setPhotoPickerVisible(false);
          void updateAndSync({ photoTimeMinutes });
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xs, paddingBottom: spacing.xl },
  heading: { gap: spacing.xs },
  loader: { marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  sectionTitle: { marginLeft: spacing.md, marginBottom: spacing.xs, letterSpacing: 0.45 },
  group: { overflow: 'hidden', borderRadius: radii.medium },
  switchRow: { minHeight: 68, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowCopy: { flex: 1, gap: 2 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
  timeRow: { minHeight: 66, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkRow: { minHeight: 44, marginHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  note: { marginHorizontal: spacing.md, marginTop: spacing.xs },
  statusRow: { minHeight: 54, paddingHorizontal: spacing.md, borderRadius: radii.medium, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsLink: { minHeight: 42, marginHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
