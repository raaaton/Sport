import { getDatabase } from '@/shared/database';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { selectionHaptic } from '@/shared/haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getProgressVaultSettings, updateProgressVaultAutoLock } from '../data/progressPhotoRepository';
import type { ProgressVaultSettings, VaultAutoLockMinutes } from '../domain/vaultModels';
import { progressVaultService } from '../services/progressVaultService';

const options: { title: string; value: VaultAutoLockMinutes; detail: string }[] = [
  { title: 'Immédiatement', value: 0, detail: 'Verrouiller dès que Sport passe en arrière-plan.' },
  { title: 'Après 1 minute', value: 1, detail: 'Masquer tout de suite, garder la session au plus une minute.' },
  { title: 'Après 5 minutes', value: 5, detail: 'Masquer tout de suite, garder la session au plus cinq minutes.' },
];

export function VaultSettingsScreen() {
  const colorScheme = useColorScheme();
  const [settings, setSettings] = useState<ProgressVaultSettings | null>(null);
  const [faceIdReady, setFaceIdReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const db = await getDatabase();
    setSettings(await getProgressVaultSettings(db));
  };

  useEffect(() => {
    void (async () => {
      try {
        const db = await getDatabase();
        setSettings(await getProgressVaultSettings(db));
      } catch { setError('Les réglages du coffre sont indisponibles.'); }
    })();
    void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync()]).then(([hardware, enrolled, types]) => {
      setFaceIdReady(hardware && enrolled && types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION));
    }).catch(() => setFaceIdReady(false));
  }, []);

  const selectAutoLock = async (value: VaultAutoLockMinutes) => {
    if (busy || !settings) return;
    setBusy(true);
    try {
      await updateProgressVaultAutoLock(await getDatabase(), value);
      await refresh();
      await selectionHaptic();
    } catch { setError('Le délai de verrouillage n’a pas pu être enregistré.'); }
    finally { setBusy(false); }
  };

  const deleteAll = () => {
    if (settings?.setupState !== 'configured' || !settings.keyId) {
      Alert.alert('Aucune photo à supprimer', 'Le coffre ne contient aucune photo configurée.');
      return;
    }
    Alert.alert('Supprimer toutes les photos ?', 'Toutes les photos chiffrées du coffre seront supprimées définitivement. Les originaux de Photos ne seront pas touchés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer tout', style: 'destructive', onPress: () => {
        void (async () => {
          setBusy(true);
          try {
            await progressVaultService.deleteAllPhotos(await getDatabase());
            await refresh();
          } catch { setError('La suppression a échoué. Les références SQLite ont été retirées et les fichiers chiffrés restants seront nettoyés au prochain accès.'); }
          finally { setBusy(false); }
        })();
      } },
    ]);
  };

  const resetVault = () => {
    if (!settings || settings.setupState === 'unconfigured') return;
    Alert.alert('Réinitialiser le coffre ?', 'Cette action effacera définitivement les photos chiffrées et créera une nouvelle clé au prochain accès. Elle est nécessaire si les données Face ID changent et que l’ancienne clé devient inaccessible. Les copies dans Photos ne seront pas touchées.', [
      { text: 'Garder le coffre', style: 'cancel' },
      { text: 'Effacer et réinitialiser', style: 'destructive', onPress: () => {
        void (async () => {
          setBusy(true);
          try {
            await progressVaultService.resetInaccessibleVault(await getDatabase());
            await refresh();
          } catch { setError('Le coffre n’a pas pu être réinitialisé. Les fichiers restent conservés.'); }
          finally { setBusy(false); }
        })();
      } },
    ]);
  };

  return (
    <AppScreen safeAreaEdges={['bottom']}>
      <AppText colorRole="secondary" style={styles.intro} variant="subheadline">Réglages d’accès aux photos privées de progression.</AppText>
      <View style={[styles.statusRow, { borderBottomColor: colors[colorScheme].separator }]}>
        <AppSymbol name="faceid" color={faceIdReady ? colors[colorScheme].accent : colors[colorScheme].tertiary} size={23} />
        <View style={styles.statusText}>
          <AppText variant="body">Face ID</AppText>
          <AppText colorRole="secondary" variant="caption">{faceIdReady ? 'Disponible sur cet iPhone' : 'Indisponible ou non configuré'}</AppText>
        </View>
        {settings?.setupState === 'configured' ? <AppSymbol name="checkmark.circle.fill" color={colors[colorScheme].accent} size={20} /> : null}
      </View>

      <AppText colorRole="secondary" style={styles.sectionTitle} variant="footnote">VERROUILLAGE AUTOMATIQUE</AppText>
      <View style={[styles.options, { backgroundColor: colors[colorScheme].groupedBackground }]}>
        {options.map((option, index) => (
          <View key={option.value}>
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: settings?.autoLockMinutes === option.value }} disabled={busy} onPress={() => void selectAutoLock(option.value)} style={styles.optionRow}>
              <View style={styles.optionText}>
                <AppText variant="body">{option.title}</AppText>
                <AppText colorRole="secondary" style={styles.detail} variant="caption">{option.detail}</AppText>
              </View>
              {settings?.autoLockMinutes === option.value ? <AppSymbol name="checkmark" color={colors[colorScheme].accent} size={18} /> : null}
            </Pressable>
            {index < options.length - 1 ? <View style={[styles.separator, { backgroundColor: colors[colorScheme].separator }]} /> : null}
          </View>
        ))}
      </View>

      {settings?.setupState === 'pending' ? <AppText colorRole="secondary" style={styles.note} variant="footnote">La configuration a été interrompue. Retourne dans Progression pour terminer l’activation de Face ID.</AppText> : null}
      {error ? <AppText colorRole="destructive" style={styles.error} variant="footnote">{error}</AppText> : null}
      {busy ? <ActivityIndicator style={styles.loading} /> : null}

      <Pressable accessibilityRole="button" disabled={busy || settings?.setupState !== 'configured'} onPress={deleteAll} style={styles.deleteButton}>
        <AppText colorRole="destructive" variant="body">Supprimer toutes les photos du coffre</AppText>
      </Pressable>
      {settings?.setupState !== 'unconfigured' ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={resetVault} style={styles.resetButton}>
          <AppText colorRole="destructive" variant="footnote">Réinitialiser le coffre et effacer ses photos…</AppText>
        </Pressable>
      ) : null}
      <AppText colorRole="secondary" style={styles.note} variant="caption">Les photos exportées vers Photos deviennent des copies ordinaires de la photothèque et ne sont plus protégées par le coffre.</AppText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg, lineHeight: 21 },
  statusRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  statusText: { flex: 1, gap: 2 },
  sectionTitle: { marginTop: spacing.xl, marginLeft: spacing.md, marginBottom: spacing.xs, letterSpacing: 0.4 },
  options: { borderRadius: radii.medium, overflow: 'hidden' },
  optionRow: { minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionText: { flex: 1 },
  detail: { lineHeight: 17, marginTop: 3 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
  deleteButton: { minHeight: 52, justifyContent: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.md },
  resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  note: { lineHeight: 19, marginTop: spacing.md },
  error: { marginTop: spacing.md },
  loading: { marginTop: spacing.md },
});
