/**
 * Typed structures for Polar Workout Importer
 */

/**
 * Deterministic Chrome Extension ID derived from the fixed public key in manifest.json.
 * Remains stable across rebuilds, folder paths, and reinstalls.
 */
export const POLAR_EXTENSION_ID = 'bfaciogjibpdpphhpcjhgilfhhgoholo';

export type PolarWorkflowStage =
  | 'INITIALIZING'
  | 'TARGET_PAGE_READY'
  | 'FORM_FILLING'
  | 'PHASES_CREATING'
  | 'READY_TO_SAVE'
  | 'SAVING'
  | 'SUCCESS'
  | 'FAILED';

export type PopupState =
  | 'NO_WORKOUT'
  | 'WORKOUT_LOADED'
  | 'CREATING'
  | 'SUCCESS'
  | 'ERROR';

export type PhaseIntensityType =
  | 'easy'
  | 'recovery'
  | 'pace'
  | 'threshold'
  | 'tempo'
  | 'marathon pace'
  | 'heart rate'
  | 'power'
  | 'free'
  | string;

export interface PolarWorkoutPhase {
  name: string;
  type?: string; // warmup, work, rest, cooldown, etc.
  // Time phases
  durationSeconds?: number;
  duration?: string | number; // e.g. "00:10:00" or 600
  // Distance phases
  distanceMeters?: number;
  distance?: string | number; // e.g. 1000 or "1.00 km"
  // Intensity & targets
  intensityType?: string; // heartRate, pace, power, free
  intensity?: PhaseIntensityType; // easy, recovery, pace, threshold, tempo, marathon pace, heart rate, power
  targetZone?: number | { min: number; max: number } | string;
  zoneMin?: number;
  zoneMax?: number;
  heartRateZone?: number; // 1-5
  paceZone?: number; // 1-5
  powerZone?: number; // 1-5
  pace?: string; // e.g. "4:30 min/km"
  powerWatts?: number;
  // Repeat blocks
  repeatCount?: number;
  repetitions?: number;
  phases?: PolarWorkoutPhase[];
  [key: string]: unknown;
}

export interface PolarWorkoutData {
  name: string;
  sport?: string;
  date: string; // e.g. 2026-09-14 or 14/09/2026
  startTime?: string; // e.g. "08:00"
  phases: PolarWorkoutPhase[];
  repeatCount?: number;
  description?: string;
}

export interface PolarWorkoutExport {
  schemaVersion?: number;
  source?: string;
  workout: PolarWorkoutData;
}

export type WorkoutValidationResult =
  | { valid: true; exportData: PolarWorkoutExport; error?: undefined }
  | { valid: false; error: string; exportData?: undefined };

/**
 * Format ISO date YYYY-MM-DD to DD/MM/YYYY for UI display (matching Polar conventions)
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

/**
 * Calculate total number of phases, recursively accounting for repeat blocks
 */
export function countPhases(phases: PolarWorkoutPhase[]): number {
  if (!Array.isArray(phases)) return 0;
  return phases.reduce((total, p) => {
    if (Array.isArray(p.phases) && p.phases.length > 0) {
      const rep = Number(p.repetitions ?? p.repeatCount ?? 1);
      return total + (rep > 0 ? rep : 1) * countPhases(p.phases);
    }
    const rep = Number(p.repetitions ?? p.repeatCount ?? 1);
    return total + (rep > 1 ? rep : 1);
  }, 0);
}

/**
 * Validation helper for Workout JSON
 */
export function validateWorkoutExport(data: unknown): WorkoutValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid workout: not a JSON object' };
  }

  const obj = data as Record<string, unknown>;

  // Accept direct workout object or wrapped in { workout: ... }
  let workoutObj: Record<string, unknown> | null = null;
  if (obj.workout && typeof obj.workout === 'object') {
    workoutObj = obj.workout as Record<string, unknown>;
  } else if (typeof obj.name === 'string' && Array.isArray(obj.phases)) {
    workoutObj = obj;
  }

  if (!workoutObj) {
    return { valid: false, error: 'Invalid workout: missing workout data' };
  }

  if (typeof workoutObj.name !== 'string' || !workoutObj.name.trim()) {
    return { valid: false, error: 'Invalid workout: missing name' };
  }

  if (typeof workoutObj.date !== 'string' || !workoutObj.date.trim()) {
    return { valid: false, error: 'Invalid workout: missing date' };
  }

  if (!Array.isArray(workoutObj.phases) || workoutObj.phases.length === 0) {
    return { valid: false, error: 'Invalid workout: phases array is empty' };
  }

  const normalizedExport: PolarWorkoutExport = {
    schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1,
    source: typeof obj.source === 'string' ? obj.source : 'polar-workout-generator',
    workout: {
      name: workoutObj.name.trim(),
      sport: typeof workoutObj.sport === 'string' ? workoutObj.sport : 'running',
      date: workoutObj.date.trim(),
      startTime: typeof workoutObj.startTime === 'string' ? workoutObj.startTime.trim() : undefined,
      phases: workoutObj.phases as PolarWorkoutPhase[],
      description: typeof workoutObj.description === 'string' ? workoutObj.description : undefined,
    },
  };

  return {
    valid: true,
    exportData: normalizedExport,
  };
}

export type PolarJobStatus = 'RUNNING' | 'SUCCESS' | 'ERROR';

export interface PolarCreationJob {
  jobId: string;
  status: PolarJobStatus;
  error: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export type ExtensionMessage =
  | { type: 'CREATE_IN_POLAR'; payload: PolarWorkoutData }
  | { type: 'CHECK_POLAR_STATUS' }
  | { type: 'CHECK_TARGET_PAGE_READY' }
  | { type: 'CREATE_IN_POLAR_WORKFLOW'; payload: PolarWorkoutData }
  | { type: 'STORE_WORKOUT'; payload: PolarWorkoutExport }
  | { type: 'GET_STORED_WORKOUT' }
  | { type: 'CREATE_POLAR_WORKOUT'; workout?: unknown }
  | { type: 'GET_POLAR_JOB_STATUS'; jobId?: string }
  | { type: 'PING_POLAR_EXTENSION' };

