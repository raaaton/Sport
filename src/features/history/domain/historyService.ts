import type { CompletedWorkoutInput, Exercise } from '../../workout/domain/models.ts';
import { validateSetEntry } from '../../workout/domain/workoutService.ts';

export type HistoryWorkoutDraft = {
  date: string;
  workoutType: string;
  exercises: {
    exerciseId: string;
    feeling: string;
    sets: { value: string; weight: string }[];
  }[];
};

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Validates and converts the editable UI draft into a complete database payload. */
export function validateHistoryWorkoutDraft(
  draft: HistoryWorkoutDraft,
  catalog: Exercise[],
  today: string,
): CompletedWorkoutInput {
  if (!validCalendarDate(draft.date) || draft.date > today) {
    throw new Error('Entrez une date réelle au format AAAA-MM-JJ, aujourd’hui ou dans le passé.');
  }
  const workoutType = draft.workoutType.trim();
  if (!workoutType || workoutType.length > 60) throw new Error('Entrez un type de séance (60 caractères maximum).');
  if (draft.exercises.length === 0) throw new Error('Ajoutez au moins un exercice.');

  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const selected = new Set<string>();
  const exercises: CompletedWorkoutInput['exercises'] = [];
  for (const entry of draft.exercises) {
    if (selected.has(entry.exerciseId)) throw new Error('Un exercice ne peut apparaître qu’une fois dans une séance.');
    selected.add(entry.exerciseId);
    const exercise = byId.get(entry.exerciseId);
    if (!exercise) throw new Error('Un exercice sélectionné n’existe plus. Rechargez le formulaire.');
    if (entry.sets.length !== exercise.targetSets) throw new Error(`${exercise.name} doit contenir ${exercise.targetSets} séries.`);

    const feelingText = entry.feeling.trim().replace(',', '.');
    const feeling = Number(feelingText);
    if (!feelingText || !Number.isFinite(feeling) || feeling < 0 || feeling > 10) {
      throw new Error(`Le ressenti de ${exercise.name} doit être compris entre 0 et 10.`);
    }

    const sets = entry.sets.map((set, index) => {
      const errors = validateSetEntry(set.value, set.weight, exercise);
      if (errors.value) throw new Error(`${exercise.name}, série ${index + 1} : ${errors.value}`);
      if (errors.weight) throw new Error(`${exercise.name}, série ${index + 1} : ${errors.weight}`);
      return {
        value: Number(set.value.trim().replace(',', '.')),
        addedWeight: set.weight.trim() === '' ? null : Number(set.weight.trim().replace(',', '.')),
      };
    });
    exercises.push({ exerciseId: exercise.id, feeling, sets });
  }
  return { date: draft.date, workoutType, exercises };
}

export function currentCalendarDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
