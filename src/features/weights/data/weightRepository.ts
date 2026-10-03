import type { SportDatabase } from '../../../shared/database/contract.ts';
import { generateAvailableLoads, validateWeightItemName, type AvailableLoad, type WeightInventory, type WeightItem } from '../domain/weightSystem.ts';

type WeightItemRow = { id: string; name: string; weight_grams: number; is_active: number; sort_order: number };

function toWeightItem(row: WeightItemRow): WeightItem {
  return { id: row.id, name: row.name, weightGrams: row.weight_grams, isActive: row.is_active === 1, sortOrder: row.sort_order };
}

function assertWeightGrams(weightGrams: number): void {
  if (!Number.isSafeInteger(weightGrams) || weightGrams <= 0) throw new Error('Le poids doit être supérieur à 0 kg.');
}

export async function getWeightInventory(db: SportDatabase): Promise<WeightInventory> {
  const [settings, rows] = await Promise.all([
    db.getFirstAsync<{ base_weight_grams: number }>('SELECT base_weight_grams FROM weight_inventory_settings WHERE id=1'),
    db.getAllAsync<WeightItemRow>('SELECT id,name,weight_grams,is_active,sort_order FROM weight_items ORDER BY sort_order,name'),
  ]);
  if (!settings) throw new Error('Le poids fixe du sac de base est introuvable.');
  return { baseWeightGrams: settings.base_weight_grams, items: rows.map(toWeightItem) };
}

export async function getAvailableLoads(db: SportDatabase): Promise<AvailableLoad[]> {
  return generateAvailableLoads(await getWeightInventory(db));
}

export async function createWeightItem(
  db: SportDatabase,
  input: { name: string; weightGrams: number },
  idFactory: () => string,
): Promise<WeightItem> {
  const name = validateWeightItemName(input.name);
  assertWeightGrams(input.weightGrams);
  return db.withExclusiveTransactionAsync(async (tx) => {
    const order = await tx.getFirstAsync<{ next_order: number }>('SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM weight_items');
    const row = { id: idFactory(), name, weight_grams: input.weightGrams, is_active: 1, sort_order: order?.next_order ?? 0 };
    await tx.runAsync('INSERT INTO weight_items(id,name,weight_grams,is_active,sort_order) VALUES (?,?,?,?,?)', row.id, row.name, row.weight_grams, row.is_active, row.sort_order);
    return toWeightItem(row);
  });
}

export async function updateWeightItem(
  db: SportDatabase,
  id: string,
  input: { name: string; weightGrams: number },
): Promise<void> {
  const name = validateWeightItemName(input.name);
  assertWeightGrams(input.weightGrams);
  const result = await db.runAsync('UPDATE weight_items SET name=?,weight_grams=? WHERE id=?', name, input.weightGrams, id);
  if (result.changes !== 1) throw new Error('Cet objet de lest est introuvable.');
}

export async function setWeightItemActive(db: SportDatabase, id: string, isActive: boolean): Promise<void> {
  const result = await db.runAsync('UPDATE weight_items SET is_active=? WHERE id=?', isActive ? 1 : 0, id);
  if (result.changes !== 1) throw new Error('Cet objet de lest est introuvable.');
}

/** Deletion only affects future combinations; saved set compositions are independent snapshots. */
export async function deleteWeightItem(db: SportDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM weight_items WHERE id=?', id);
  if (result.changes !== 1) throw new Error('Cet objet de lest est introuvable.');
}
