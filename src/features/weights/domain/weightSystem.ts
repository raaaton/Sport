import type { Exercise, PreviousPerformance, WeightComponentSnapshot } from '../../workout/domain/models.ts';
import { assessProgression, type ProgressionAssessment } from '../../workout/domain/progressionEngine.ts';

export type WeightItem = {
  id: string;
  name: string;
  weightGrams: number;
  isActive: boolean;
  sortOrder: number;
};

export type WeightInventory = { baseWeightGrams: number; items: WeightItem[] };

export type AvailableLoad = {
  addedWeightGrams: number;
  composition: WeightComponentSnapshot[];
};

export type LoadProgressionAssessment = {
  progression: ProgressionAssessment;
  previousLoadGrams: number | null;
  targetLoadGrams: number;
  targetLoad: AvailableLoad | null;
  noHigherLoadAvailable: boolean;
};

const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;

/** Builds every unique reachable added load; each active inventory item is used at most once. */
export function generateAvailableLoads(inventory: WeightInventory): AvailableLoad[] {
  if (!isPositiveInteger(inventory.baseWeightGrams)) throw new Error('Le poids du sac de base doit être positif.');
  const activeItems = inventory.items
    .filter((item) => item.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  for (const item of activeItems) {
    if (!item.name.trim() || !isPositiveInteger(item.weightGrams)) throw new Error(`Poids invalide pour « ${item.name} ».`);
  }

  const subsets = new Map<number, WeightComponentSnapshot[]>([[0, []]]);
  for (const item of activeItems) {
    const snapshot: WeightComponentSnapshot = { itemId: item.id, name: item.name, weightGrams: item.weightGrams };
    for (const [sum, composition] of [...subsets.entries()]) {
      const next = sum + item.weightGrams;
      if (!subsets.has(next)) subsets.set(next, [...composition, snapshot]);
    }
  }

  const base: WeightComponentSnapshot = { itemId: 'base-bag', name: 'Sac de base', weightGrams: inventory.baseWeightGrams };
  const loads: AvailableLoad[] = [
    { addedWeightGrams: 0, composition: [] },
    { addedWeightGrams: inventory.baseWeightGrams, composition: [base] },
  ];
  for (const [sum, composition] of subsets) {
    if (sum === 0) continue;
    loads.push({ addedWeightGrams: inventory.baseWeightGrams + sum, composition: [base, ...composition] });
  }
  return loads.sort((left, right) => left.addedWeightGrams - right.addedWeightGrams);
}

/** Converts kg text to exact gram units, accepting comma/dot and at most 1 g precision. */
export function parseWeightKilograms(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) throw new Error('Entrez un poids positif avec trois décimales maximum.');
  const grams = Math.round(Number(normalized) * 1000);
  if (!Number.isSafeInteger(grams) || grams <= 0) throw new Error('Le poids doit être supérieur à 0 kg.');
  return grams;
}

export function validateWeightItemName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Entrez un nom pour cet objet.');
  if (name.length > 60) throw new Error('Le nom est limité à 60 caractères.');
  return name;
}

export function formatKilograms(grams: number): string {
  if (!Number.isSafeInteger(grams) || grams < 0) throw new Error('Charge invalide.');
  const exact = (grams / 1000).toFixed(3);
  const compact = exact.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0{2,}$/, '.0');
  return compact.includes('.') ? compact : `${compact}.0`;
}

export function formatLoad(grams: number): string {
  return grams === 0 ? 'Poids du corps' : `+${formatKilograms(grams)} kg`;
}

export function formatLoadComposition(composition: WeightComponentSnapshot[] | null | undefined): string | null {
  return composition?.length ? composition.map((item) => item.name).join(' + ') : null;
}

function weightInGrams(weight: number | null): number {
  if (weight === null || !Number.isFinite(weight) || weight < 0) return 0;
  return Math.round(weight * 1000);
}

/** Applies the existing progression eligibility and resolves its concrete next available load. */
export function assessAvailableLoadProgression(
  exercise: Exercise,
  performance: PreviousPerformance | null,
  availableLoads: AvailableLoad[],
): LoadProgressionAssessment {
  const progression = assessProgression(exercise, performance);
  const setLoads = performance?.sets.map((set) => set.addedWeightGrams ?? weightInGrams(set.addedWeight)) ?? [];
  const previousLoadGrams = setLoads.length ? Math.max(...setLoads) : null;
  const lastSetLoad = setLoads.at(-1) ?? null;

  if (progression.status === 'increase_load_recommended' && previousLoadGrams !== null) {
    const nextLoad = availableLoads.find((load) => load.addedWeightGrams > previousLoadGrams);
    return {
      progression,
      previousLoadGrams,
      targetLoadGrams: nextLoad?.addedWeightGrams ?? previousLoadGrams,
      targetLoad: nextLoad ?? availableLoads.find((load) => load.addedWeightGrams === previousLoadGrams) ?? null,
      noHigherLoadAvailable: nextLoad === undefined,
    };
  }

  const configuredTarget = exercise.targetAddedWeight === null ? null : weightInGrams(exercise.targetAddedWeight);
  const targetLoadGrams = lastSetLoad ?? configuredTarget ?? 0;
  return {
    progression,
    previousLoadGrams,
    targetLoadGrams,
    targetLoad: availableLoads.find((load) => load.addedWeightGrams === targetLoadGrams) ?? null,
    noHigherLoadAvailable: false,
  };
}
