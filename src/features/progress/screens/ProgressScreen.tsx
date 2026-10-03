import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getDatabase } from '@/shared/database';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { notificationHaptic, selectionHaptic } from '@/shared/haptics';
import { ProgressPhotoDateSheet } from '../components/ProgressPhotoDateSheet';
import { ProgressPhotoGallery } from '../components/ProgressPhotoGallery';
import { ProgressPhotoViewer } from '../components/ProgressPhotoViewer';
import { getProgressVaultSettings } from '../data/progressPhotoRepository';
import { autoLockDeadline, hasAutoLockExpired, shouldLockVaultForAppState, transitionVaultSession, type ProgressPhoto, type ProgressVaultSettings, type VaultSessionState } from '../domain/vaultModels';
import { progressVaultService, type PhotoPreview } from '../services/progressVaultService';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

type VaultSettingsState = ProgressVaultSettings | null;

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fileExtensionForMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/heic':
    case 'image/heif': return 'heic';
    case 'image/webp': return 'webp';
    default: return 'jpg';
  }
}

async function assertFaceIdAvailable(): Promise<void> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled || !types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    throw new Error('Face ID doit être disponible et configuré sur cet iPhone pour créer le coffre.');
  }
}

export function ProgressScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<VaultSettingsState>(null);
  const [session, setSession] = useState<VaultSessionState>({ kind: 'locked' });
  const [key, setKey] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<PhotoPreview | null>(null);
  const [dateSheetVisible, setDateSheetVisible] = useState(false);
  const [photoDate, setPhotoDate] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionGenerationRef = useRef(0);
  const biometricPromptInFlightRef = useRef(false);
  const unlockInFlightRef = useRef(false);
  const warmKeyRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const settingsRef = useRef<VaultSettingsState>(null);
  const deadlineRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnlocked = session.kind === 'unlocked' && key !== null;

  useEffect(() => {
    keyRef.current = key;
    settingsRef.current = settings;
  }, [key, settings]);

  useEffect(() => {
    let mounted = true;
    void getDatabase().then(getProgressVaultSettings).then((value) => {
      if (mounted) setSettings(value);
    }).catch(() => {
      if (mounted) setErrorMessage('Le coffre ne peut pas être chargé pour le moment.');
    });
    return () => { mounted = false; };
  }, []);

  const loadPhotos = useCallback(async (vaultKey: string, generation = sessionGenerationRef.current) => {
    const db = await getDatabase();
    const nextPhotos = await progressVaultService.listPhotos(db);
    const nextThumbnails: Record<string, string> = {};
    let unavailableCount = 0;
    for (const photo of nextPhotos) {
      try {
        const preview = await progressVaultService.previewPhoto(photo, vaultKey, true);
        nextThumbnails[photo.id] = preview.uri;
      } catch { unavailableCount += 1; }
    }
    if (generation === sessionGenerationRef.current && AppState.currentState === 'active') {
      setPhotos(nextPhotos);
      setThumbnails(nextThumbnails);
      setErrorMessage(unavailableCount > 0 ? 'Certaines photos ne peuvent pas être déchiffrées. Leurs fichiers chiffrés sont conservés.' : null);
    }
  }, []);

  const unlock = async () => {
    if (unlockInFlightRef.current || busy) return;
    unlockInFlightRef.current = true;
    setBusy(true);
    setErrorMessage(null);
    setSession((current) => transitionVaultSession(current, { type: 'begin_setup_or_unlock' }));
    const generation = sessionGenerationRef.current;
    try {
      await assertFaceIdAvailable();
      const db = await getDatabase();
      if (generation !== sessionGenerationRef.current || AppState.currentState !== 'active') return;
      // SecureStore presents the system Face ID sheet. iOS can temporarily
      // mark this app inactive while that sheet is onscreen; do not treat that
      // presentation transition as a vault lock.
      biometricPromptInFlightRef.current = true;
      const result = await progressVaultService.setupOrUnlock(db);
      biometricPromptInFlightRef.current = false;
      await progressVaultService.reconcileFiles(db);
      if (generation !== sessionGenerationRef.current || AppState.currentState !== 'active') return;
      warmKeyRef.current = result.key;
      keyRef.current = result.key;
      setKey(result.key);
      setSession((current) => transitionVaultSession(current, { type: 'unlock_succeeded', sessionId: Date.now() }));
      await loadPhotos(result.key, generation);
      await notificationHaptic();
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      setPhotos([]);
      setThumbnails({});
      setKey(null);
      keyRef.current = null;
      setSession((current) => transitionVaultSession(current, { type: 'failed', error: 'key_unavailable' }));
      setErrorMessage(settingsRef.current?.setupState === 'configured'
        ? 'Le déverrouillage Face ID n’a pas abouti. Le coffre reste verrouillé et les fichiers chiffrés sont conservés.'
        : 'La configuration Face ID n’a pas abouti. Réessaie lorsque Face ID est disponible.');
    } finally {
      biometricPromptInFlightRef.current = false;
      unlockInFlightRef.current = false;
      setBusy(false);
      const db = await getDatabase().catch(() => null);
      if (db) setSettings(await getProgressVaultSettings(db).catch(() => null));
    }
  };

  const clearPrivateViews = useCallback(() => {
    sessionGenerationRef.current += 1;
    setPhotos([]);
    setThumbnails({});
    setSelected(null);
  }, []);

  const lock = useCallback(() => {
    clearPrivateViews();
    setKey(null);
    keyRef.current = null;
    warmKeyRef.current = null;
    deadlineRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSession((current) => {
      const locking = transitionVaultSession(current, { type: 'begin_lock' });
      return transitionVaultSession(locking, { type: 'lock_finished' });
    });
  }, [clearPrivateViews]);

  useFocusEffect(useCallback(() => () => lock(), [lock]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (shouldLockVaultForAppState(nextState, biometricPromptInFlightRef.current)) {
        clearPrivateViews();
        const delay = settingsRef.current?.autoLockMinutes ?? 0;
        const activeKey = keyRef.current;
        if (activeKey && delay > 0) {
          warmKeyRef.current = activeKey;
          deadlineRef.current = autoLockDeadline(Date.now(), delay);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            warmKeyRef.current = null;
            deadlineRef.current = null;
          }, delay * 60_000);
        } else {
          warmKeyRef.current = null;
          deadlineRef.current = null;
        }
        setKey(null);
        setSession((current) => {
          const locking = transitionVaultSession(current, { type: 'begin_lock' });
          return transitionVaultSession(locking, { type: 'lock_finished' });
        });
      } else if (nextState === 'active' && deadlineRef.current !== null && warmKeyRef.current && !hasAutoLockExpired(deadlineRef.current, Date.now())) {
        const retainedKey = warmKeyRef.current;
        keyRef.current = retainedKey;
        setKey(retainedKey);
        setSession({ kind: 'unlocked', sessionId: Date.now() });
        void loadPhotos(retainedKey, sessionGenerationRef.current).catch(() => {
          clearPrivateViews();
          setKey(null);
          setSession({ kind: 'error', error: 'storage_failure' });
        });
        deadlineRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } else if (nextState === 'active' && deadlineRef.current !== null) {
        warmKeyRef.current = null;
        deadlineRef.current = null;
      }
    });
    return () => {
      subscription.remove();
    };
  }, [clearPrivateViews, loadPhotos]);

  const addPickedPhoto = async (camera: boolean) => {
    setDateSheetVisible(false);
    if (!key) return;
    const generation = sessionGenerationRef.current;
    const sessionKey = key;
    setBusy(true);
    setErrorMessage(null);
    let sourceUri: string | null = null;
    let thumbnailUri: string | null = null;
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Autorise l’accès à la caméra dans les réglages iOS pour prendre une photo.');
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      sourceUri = asset.uri;
      const thumbnail = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 600 } }], { format: ImageManipulator.SaveFormat.JPEG, compress: 0.78 });
      thumbnailUri = thumbnail.uri;
      const photo = await progressVaultService.importPhoto(await getDatabase(), sessionKey, {
        id: Crypto.randomUUID(),
        date: toLocalDateString(photoDate),
        sourceUri: asset.uri,
        mimeType: asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg',
        thumbnailUri: thumbnail.uri,
      });
      sourceUri = null;
      thumbnailUri = null;
      const preview = await progressVaultService.previewPhoto(photo, sessionKey, true);
      if (generation !== sessionGenerationRef.current || keyRef.current !== sessionKey || AppState.currentState !== 'active') return;
      setPhotos((current) => [photo, ...current].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
      setThumbnails((current) => ({ ...current, [photo.id]: preview.uri }));
      await notificationHaptic();
    } catch {
      setErrorMessage('La photo n’a pas pu être chiffrée et ajoutée. Réessaie.');
    } finally {
      for (const uri of [sourceUri, thumbnailUri]) {
        if (uri) {
          const file = new File(uri);
          if (file.exists) file.delete();
        }
      }
      setBusy(false);
    }
  };

  const showPhoto = async (photo: ProgressPhoto) => {
    if (!key || busy) return;
    const generation = sessionGenerationRef.current;
    const sessionKey = key;
    setBusy(true);
    try {
      const preview = await progressVaultService.previewPhoto(photo, sessionKey);
      if (generation === sessionGenerationRef.current && AppState.currentState === 'active') setSelected(preview);
    } catch {
      setErrorMessage('Cette photo ne peut pas être déchiffrée. Le fichier chiffré est conservé.');
    } finally { setBusy(false); }
  };

  const removePhoto = (photo: ProgressPhoto) => {
    Alert.alert('Supprimer cette photo ?', 'La copie chiffrée et ses métadonnées seront supprimées du coffre. La photo originale dans Photos ne sera pas modifiée.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        void (async () => {
          try {
            await progressVaultService.deletePhoto(await getDatabase(), photo);
            setPhotos((current) => current.filter((item) => item.id !== photo.id));
            setThumbnails((current) => { const next = { ...current }; delete next[photo.id]; return next; });
            setSelected(null);
            await selectionHaptic();
          } catch {
            const latest = await progressVaultService.listPhotos(await getDatabase()).catch(() => null);
            if (latest) {
              const validIds = new Set(latest.map((entry) => entry.id));
              setPhotos(latest);
              setThumbnails((current) => Object.fromEntries(Object.entries(current).filter(([id]) => validIds.has(id))));
            }
            setSelected(null);
            setErrorMessage('Les métadonnées ont été retirées. Les fichiers chiffrés restants seront nettoyés au prochain déverrouillage.');
          }
        })();
      } },
    ]);
  };

  const exportPhoto = (photo: ProgressPhoto) => {
    Alert.alert('Enregistrer dans Photos ?', 'Sport va créer une copie dans ta photothèque. Cette copie ne sera plus protégée par le coffre Sport.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Continuer', onPress: () => {
        void (async () => {
          try {
            const permission = await MediaLibrary.requestPermissionsAsync(true);
            if (!permission.granted) throw new Error('L’autorisation d’ajout à Photos a été refusée.');
            if (!key) throw new Error('Le coffre est verrouillé.');
            const temp = new File(Paths.cache, `sport-export-${photo.id}.${fileExtensionForMime(photo.mimeType)}`);
            await progressVaultService.exportPhoto(photo, key, temp.uri);
            await notificationHaptic();
            Alert.alert('Copie enregistrée', 'La photo a été ajoutée à Photos et n’est plus protégée par le coffre Sport.');
          } catch { setErrorMessage('L’export vers Photos a échoué. Vérifie l’autorisation Photos et réessaie.'); }
        })();
      } },
    ]);
  };

  return (
    <AppScreen safeAreaEdges={['top', 'bottom']}>
      <View style={styles.header}>
        <View>
          <AppText variant="largeTitle">Progression</AppText>
          <AppText colorRole="secondary" style={styles.subtitle} variant="subheadline">Un espace privé pour tes photos.</AppText>
        </View>
        {isUnlocked ? (
          <Pressable accessibilityLabel="Verrouiller le coffre" accessibilityRole="button" onPress={lock} hitSlop={10}>
            <AppSymbol name="lock.fill" size={19} color={colors[colorScheme].secondary} />
          </Pressable>
        ) : null}
      </View>

      {errorMessage ? <AppText colorRole="destructive" style={styles.error} variant="footnote">{errorMessage}</AppText> : null}

      {!isUnlocked ? (
        <View style={styles.lockedContent}>
          <AppSymbol name="faceid" size={42} color={colors[colorScheme].accent} />
          <AppText style={styles.lockedTitle} variant="title">Coffre privé</AppText>
          <AppText colorRole="secondary" style={styles.explanation} variant="body">
            Tes photos sont chiffrées sur cet iPhone et protégées par Face ID. Elles restent indépendantes de ta photothèque.
          </AppText>
          <Pressable accessibilityRole="button" disabled={busy || settings === null} onPress={() => void unlock()} style={[styles.primaryButton, { backgroundColor: colors[colorScheme].accent }, (busy || settings === null) && styles.disabled]}>
            {busy ? <ActivityIndicator color="#fff" /> : <AppText style={styles.primaryLabel} variant="headline">{settings?.setupState === 'configured' ? 'Déverrouiller avec Face ID' : 'Configurer Face ID'}</AppText>}
          </Pressable>
          {session.kind === 'error' && settings?.setupState === 'configured' ? <AppText colorRole="secondary" style={styles.helpText} variant="footnote">Si Face ID a été réinitialisé, consulte Réglages › Coffre photo. Le coffre ne remplacera jamais sa clé sans confirmation.</AppText> : null}
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => { setPhotoDate(new Date()); setDateSheetVisible(true); }} style={({ pressed }) => [styles.addRow, { borderColor: colors[colorScheme].separator }, pressed && styles.pressed]}>
            <AppSymbol name="plus" size={19} color={colors[colorScheme].accent} />
            <AppText colorRole="accent" variant="body">Ajouter une photo</AppText>
          </Pressable>
          {busy ? <ActivityIndicator style={styles.loading} /> : null}
          <ProgressPhotoGallery photos={photos} thumbnails={thumbnails} busy={busy} onSelect={(photo) => void showPhoto(photo)} />
        </>
      )}

      <ProgressPhotoDateSheet
        visible={dateSheetVisible}
        date={photoDate}
        busy={busy}
        colorScheme={colorScheme}
        topInset={insets.top}
        onDateChange={setPhotoDate}
        onCancel={() => setDateSheetVisible(false)}
        onLibrary={() => void addPickedPhoto(false)}
        onCamera={() => void addPickedPhoto(true)}
      />
      <ProgressPhotoViewer
        preview={selected}
        visible={isUnlocked}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onClose={() => setSelected(null)}
        onExport={exportPhoto}
        onDelete={removePhoto}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  subtitle: { marginTop: spacing.xxs },
  lockedContent: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
  lockedTitle: { marginTop: spacing.xs },
  explanation: { textAlign: 'center', lineHeight: 23, maxWidth: 340 },
  primaryButton: { minHeight: 52, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', borderRadius: radii.medium, marginTop: spacing.sm, paddingHorizontal: spacing.md },
  primaryLabel: { color: '#fff' },
  disabled: { opacity: 0.55 },
  helpText: { textAlign: 'center', lineHeight: 20, marginTop: spacing.md },
  addRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  error: { marginBottom: spacing.md, lineHeight: 19 },
  loading: { marginTop: spacing.md },
  pressed: { opacity: 0.6 },
});
