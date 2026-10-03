import { useCallback, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDatabase } from '@/shared/database';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { getNotificationPreferences, updateNotificationPreferences } from '@/features/notifications/data/notificationRepository';
import type { NotificationPermissionState } from '@/features/notifications/services/localNotifications';
import { getManagedSportNotifications, getSportNotificationPermissionState, requestSportNotificationPermission, syncSportNotifications } from '@/features/notifications/services/localNotifications';
import type { NotificationPreferences } from '@/features/notifications/domain/notificationPlanner';

type ReminderKind = 'workout' | 'photo';
type HourPickerTarget = { kind: ReminderKind; enableAfterPick: boolean } | null;

const emptyPreferences: NotificationPreferences = { workoutEnabled: false, photoEnabled: false, workoutHour: null, photoHour: 6 };
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const formatHour = (hour: number | null) => hour === null ? 'Choisir une heure' : `${String(hour).padStart(2, '0')}:00`;

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
  const [preferences, setPreferences] = useState(emptyPreferences);
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hourPickerTarget, setHourPickerTarget] = useState<HourPickerTarget>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [currentPreferences, currentPermission, managedRequests] = await Promise.all([
        getNotificationPreferences(db), getSportNotificationPermissionState(), getManagedSportNotifications(),
      ]);
      setPreferences(currentPreferences);
      setPermission(currentPermission);
      setPendingCount(managedRequests.length);
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

  const enableReminder = async (kind: ReminderKind) => {
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
      await updateAndSync(kind === 'workout' ? { workoutEnabled: true } : { photoEnabled: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La permission n’a pas pu être vérifiée.');
    } finally { setBusy(false); }
  };

  const chooseHour = (kind: ReminderKind, enableAfterPick = false) => {
    if (Platform.OS === 'ios') {
      const options = [...hours.map((hour) => formatHour(hour)), 'Annuler'];
      ActionSheetIOS.showActionSheetWithOptions({ title: kind === 'workout' ? 'Heure des séances' : 'Heure des photos', options, cancelButtonIndex: hours.length }, (index) => {
        if (index >= 0 && index < hours.length) void saveHour(kind, index, enableAfterPick);
      });
    } else setHourPickerTarget({ kind, enableAfterPick });
  };

  const saveHour = async (kind: ReminderKind, hour: number, enableAfterPick: boolean) => {
    setHourPickerTarget(null);
    const saved = await updateAndSync(kind === 'workout' ? { workoutHour: hour } : { photoHour: hour });
    if (saved && enableAfterPick) await enableReminder(kind);
  };

  const toggleReminder = async (kind: ReminderKind, enabled: boolean) => {
    if (!enabled) {
      await updateAndSync(kind === 'workout' ? { workoutEnabled: false } : { photoEnabled: false });
      return;
    }
    if (kind === 'workout' && preferences.workoutHour === null) {
      chooseHour('workout', true);
      return;
    }
    await enableReminder(kind);
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
              <View style={styles.rowCopy}><AppText variant="body">Séances</AppText><AppText variant="caption" colorRole="secondary">Jours actifs du planning</AppText></View>
              <Switch accessibilityLabel="Notifications de séance" value={preferences.workoutEnabled} disabled={busy || loading} onValueChange={(value) => { void toggleReminder('workout', value); }} />
            </View>
            <View style={[styles.separator, { backgroundColor: palette.separator }]} />
            <View style={styles.switchRow}>
              <View style={styles.rowCopy}><AppText variant="body">Photos</AppText><AppText variant="caption" colorRole="secondary">Le premier jour du mois</AppText></View>
              <Switch accessibilityLabel="Rappel mensuel des photos" value={preferences.photoEnabled} disabled={busy || loading} onValueChange={(value) => { void toggleReminder('photo', value); }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>HORAIRES</AppText>
          <View style={[styles.group, { backgroundColor: palette.groupedBackground }]}>
            <Pressable accessibilityRole="button" accessibilityHint="Choisir l’heure des rappels de séance" disabled={busy} onPress={() => chooseHour('workout')} style={({ pressed }) => [styles.timeRow, { opacity: pressed ? 0.55 : 1 }]}>
              <View style={styles.rowCopy}><AppText variant="body">Séances</AppText><AppText variant="caption" colorRole="secondary">Appliqué à tous les jours actifs</AppText></View>
              <AppText variant="body" style={{ color: preferences.workoutHour === null ? palette.accent : palette.secondary }}>{formatHour(preferences.workoutHour)}</AppText>
              <AppSymbol name="chevron.right" color={palette.tertiary} size={13} />
            </Pressable>
            <View style={[styles.separator, { backgroundColor: palette.separator }]} />
            <Pressable accessibilityRole="button" accessibilityHint="Modifier l’heure du rappel mensuel des photos" disabled={busy} onPress={() => chooseHour('photo')} style={({ pressed }) => [styles.timeRow, { opacity: pressed ? 0.55 : 1 }]}>
              <View style={styles.rowCopy}><AppText variant="body">Photos</AppText><AppText variant="caption" colorRole="secondary">Le premier jour du mois</AppText></View>
              <AppText variant="body" colorRole="secondary">{formatHour(preferences.photoHour)}</AppText>
              <AppSymbol name="chevron.right" color={palette.tertiary} size={13} />
            </Pressable>
          </View>
          <AppText variant="caption" colorRole="tertiary" style={styles.note}>Aucune heure de séance n’était définie auparavant. Choisissez-la avant d’activer ce rappel. L’heure des photos reprend la valeur historique de 06:00.</AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>AUTORISATION IOS</AppText>
          <View style={[styles.statusRow, { backgroundColor: palette.groupedBackground }]}>
            <AppText variant="body">{permissionLabel(permission)}</AppText>
            {permission === 'authorized' || permission === 'provisional' || permission === 'ephemeral'
              ? <AppSymbol name="checkmark.circle.fill" color={palette.accent} size={20} />
              : null}
          </View>
          {permission === 'denied' ? <Pressable accessibilityRole="button" onPress={openSystemSettings} style={styles.settingsLink}><AppText variant="subheadline" style={{ color: palette.accent }}>Ouvrir les réglages iOS</AppText><AppSymbol name="arrow.up.right" color={palette.accent} size={13} /></Pressable> : null}
          {permissionAllows(permission ?? 'not-determined') ? <AppText variant="caption" colorRole="tertiary" style={styles.note}>{pendingCount} rappel{pendingCount === 1 ? '' : 's'} Sport en attente. Au premier plan, les rappels apparaissent en bannière et dans le centre de notifications, sans son.</AppText> : null}
        </View>
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
      </View>

      <Modal visible={hourPickerTarget !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHourPickerTarget(null)}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.hourModal, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: palette.separator }]}>
            <Pressable accessibilityRole="button" onPress={() => setHourPickerTarget(null)}><AppText style={{ color: palette.accent }}>Annuler</AppText></Pressable>
            <AppText variant="headline">Choisir une heure</AppText>
            <View style={styles.headerSpace} />
          </View>
          <ScrollView contentContainerStyle={styles.hourList}>
            {hours.map((hour) => <Pressable key={hour} accessibilityRole="button" onPress={() => { if (hourPickerTarget) void saveHour(hourPickerTarget.kind, hour, hourPickerTarget.enableAfterPick); }} style={[styles.hourOption, { borderBottomColor: palette.separator }]}>
              <AppText variant="body">{formatHour(hour)}</AppText>
              {((hourPickerTarget?.kind === 'workout' && preferences.workoutHour === hour) || (hourPickerTarget?.kind === 'photo' && preferences.photoHour === hour)) ? <AppSymbol name="checkmark" color={palette.accent} size={18} /> : null}
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  note: { marginHorizontal: spacing.md, marginTop: spacing.xs },
  statusRow: { minHeight: 54, paddingHorizontal: spacing.md, borderRadius: radii.medium, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsLink: { minHeight: 42, marginHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hourModal: { flex: 1 },
  modalHeader: { minHeight: 56, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpace: { width: 52 },
  hourList: { paddingHorizontal: spacing.lg },
  hourOption: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
