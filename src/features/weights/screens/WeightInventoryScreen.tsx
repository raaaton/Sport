import * as Crypto from 'expo-crypto';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDatabase } from '@/shared/database';
import { impactHaptic, selectionHaptic } from '@/shared/haptics';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { NumericField } from '@/features/workout/components/NumericField';
import { createWeightItem, deleteWeightItem, getAvailableLoads, getWeightInventory, setWeightItemActive, updateWeightItem } from '../data/weightRepository';
import { formatKilograms, formatLoad, formatLoadComposition, parseWeightKilograms, validateWeightItemName, type AvailableLoad, type WeightItem } from '../domain/weightSystem';

export function WeightInventoryScreen() {
  const palette = colors[useColorScheme()];
  const [baseWeightGrams, setBaseWeightGrams] = useState(3000);
  const [items, setItems] = useState<WeightItem[]>([]);
  const [loads, setLoads] = useState<AvailableLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WeightItem | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [inventory, availableLoads] = await Promise.all([getWeightInventory(db), getAvailableLoads(db)]);
      setBaseWeightGrams(inventory.baseWeightGrams);
      setItems(inventory.items);
      setLoads(availableLoads);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le matériel n’a pas pu être chargé.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openEditor = (item?: WeightItem) => {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setWeight(item ? formatKilograms(item.weightGrams) : '');
    setFormError(null);
  };

  const saveItem = async () => {
    try {
      const normalizedName = validateWeightItemName(name);
      const weightGrams = parseWeightKilograms(weight);
      setSaving(true);
      const db = await getDatabase();
      if (editing) await updateWeightItem(db, editing.id, { name: normalizedName, weightGrams });
      else await createWeightItem(db, { name: normalizedName, weightGrams }, () => Crypto.randomUUID());
      setEditing(undefined);
      void impactHaptic().catch(() => undefined);
      await refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'L’objet n’a pas pu être enregistré.');
    } finally { setSaving(false); }
  };

  const toggleItem = async (item: WeightItem, value: boolean) => {
    try {
      await setWeightItemActive(await getDatabase(), item.id, value);
      void selectionHaptic().catch(() => undefined);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Le matériel n’a pas pu être modifié.'); }
  };

  const confirmDelete = (item: WeightItem) => Alert.alert(
    'Supprimer cet objet ?',
    'Il ne sera plus proposé dans les charges futures. Les séances déjà enregistrées garderont leur charge et leur composition d’origine.',
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        void getDatabase().then((db) => deleteWeightItem(db, item.id)).then(() => refresh()).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'L’objet n’a pas pu être supprimé.'));
      } },
    ],
  );

  return (
    <AppScreen safeAreaEdges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <AppText variant="largeTitle">Matériel</AppText>
          <AppText variant="subheadline" colorRole="secondary">Votre sac et les objets utilisés pour calculer les charges possibles.</AppText>
        </View>
        {loading ? <ActivityIndicator style={styles.loader} /> : null}
        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>SAC DE BASE</AppText>
          <View style={[styles.row, styles.fixedRow, { backgroundColor: palette.groupedBackground }]}>
            <View><AppText variant="body">Sac de base</AppText><AppText variant="caption" colorRole="secondary">Poids fixe</AppText></View>
            <AppText variant="headline">{formatKilograms(baseWeightGrams)} kg</AppText>
          </View>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>OBJETS</AppText>
            <Pressable accessibilityRole="button" onPress={() => openEditor()} hitSlop={10} style={styles.addButton}>
              <AppSymbol name="plus" color={palette.accent} size={16} /><AppText variant="subheadline" style={{ color: palette.accent }}>Ajouter</AppText>
            </Pressable>
          </View>
          {items.length ? <View style={[styles.group, { backgroundColor: palette.groupedBackground }]}>
            {items.map((item, index) => (
              <View key={item.id}>
                <View style={styles.itemRow}>
                  <View style={styles.itemCopy}><AppText variant="body">{item.name}</AppText><AppText variant="caption" colorRole="secondary">{formatKilograms(item.weightGrams)} kg</AppText></View>
                  <Switch accessibilityLabel={`Activer ${item.name}`} value={item.isActive} onValueChange={(value) => { void toggleItem(item, value); }} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Modifier ${item.name}`} onPress={() => openEditor(item)} hitSlop={8} style={styles.iconButton}><AppSymbol name="pencil" color={palette.accent} size={17} /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Supprimer ${item.name}`} onPress={() => confirmDelete(item)} hitSlop={8} style={styles.iconButton}><AppSymbol name="trash" color={palette.destructive} size={17} /></Pressable>
                </View>
                {index < items.length - 1 ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
              </View>
            ))}
          </View> : <AppText colorRole="secondary">Aucun objet de lest enregistré.</AppText>}
        </View>
        <View style={styles.section}>
          <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>CHARGES DISPONIBLES</AppText>
          <AppText variant="caption" colorRole="tertiary" style={styles.previewIntro}>Les charges sont calculées avec le sac et les objets actifs.</AppText>
          <View style={[styles.group, { backgroundColor: palette.groupedBackground }]}>
            {loads.map((load, index) => {
              const composition = formatLoadComposition(load.composition);
              return <View key={load.addedWeightGrams}>
                <View style={styles.loadRow}><AppText variant="subheadline">{formatLoad(load.addedWeightGrams)}</AppText>{composition ? <AppText variant="caption" colorRole="secondary" style={styles.composition}>{composition}</AppText> : null}</View>
                {index < loads.length - 1 ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
              </View>;
            })}
          </View>
        </View>
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
      </View>
      <Modal visible={editing !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(undefined)}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.modal, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: palette.separator }]}>
            <Pressable accessibilityRole="button" onPress={() => setEditing(undefined)}><AppText style={{ color: palette.accent }}>Annuler</AppText></Pressable>
            <AppText variant="headline">{editing ? 'Modifier l’objet' : 'Nouvel objet'}</AppText>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void saveItem(); }}><AppText style={{ color: palette.accent, opacity: saving ? 0.5 : 1 }}>Enregistrer</AppText></Pressable>
          </View>
          <View style={styles.form}>
            <View style={styles.nameField}>
              <AppText variant="subheadline" colorRole="secondary">Nom</AppText>
              <TextInput accessibilityLabel="Nom de l’objet" value={name} onChangeText={setName} placeholder="Ex. Livre" maxLength={60} returnKeyType="done" style={[styles.nameInput, { color: palette.primary, backgroundColor: palette.groupedBackground, borderColor: palette.separator }]} />
            </View>
            <NumericField label="Poids" value={weight} onChangeText={setWeight} placeholder="1,2" suffix="kg" decimal />
            {formError ? <AppText colorRole="destructive" accessibilityRole="alert">{formError}</AppText> : null}
          </View>
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { marginLeft: spacing.md, marginBottom: spacing.xs, letterSpacing: 0.45 },
  addButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  group: { overflow: 'hidden', borderRadius: radii.medium },
  row: { minHeight: 60, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fixedRow: { borderRadius: radii.medium },
  itemRow: { minHeight: 68, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemCopy: { flex: 1, gap: 2 },
  iconButton: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
  previewIntro: { marginHorizontal: spacing.md, marginBottom: spacing.xs },
  loadRow: { minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, justifyContent: 'center', gap: 2 },
  composition: { flexShrink: 1 },
  modal: { flex: 1, paddingBottom: spacing.xl },
  modalHeader: { minHeight: 56, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  form: { padding: spacing.lg, gap: spacing.lg },
  nameField: { gap: spacing.xs },
  nameInput: { minHeight: 54, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.medium, paddingHorizontal: spacing.md, fontSize: 17 },
});
