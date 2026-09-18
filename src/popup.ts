/**
 * Polar Workout Importer - Popup Controller
 *
 * Minimalist, focused controller for the extension popup:
 * - Read Workout (from clipboard)
 * - Validate JSON
 * - Create in Polar Flow
 */

import {
  PopupState,
  PolarWorkoutExport,
  validateWorkoutExport,
  formatDisplayDate,
  countPhases,
} from './types';
import { logPolar } from './polarSelectors';

let currentExport: PolarWorkoutExport | null = null;
let currentState: PopupState = 'NO_WORKOUT';

// DOM elements
const statusArea = document.getElementById('status-area') as HTMLDivElement;
const workoutDetails = document.getElementById('workout-details') as HTMLDivElement;
const detailName = document.getElementById('detail-name') as HTMLSpanElement;
const detailDate = document.getElementById('detail-date') as HTMLSpanElement;
const detailPhases = document.getElementById('detail-phases') as HTMLSpanElement;
const btnRead = document.getElementById('btn-read') as HTMLButtonElement;
const btnCreate = document.getElementById('btn-create') as HTMLButtonElement;

/**
 * Set popup state and update UI
 */
export function setState(state: PopupState, customMessage?: string): void {
  currentState = state;
  logPolar('State:', state, customMessage || '');

  // Reset status classes
  statusArea.className = 'status-area';

  switch (state) {
    case 'NO_WORKOUT':
      statusArea.textContent = customMessage || 'No workout loaded';
      workoutDetails.style.display = 'none';
      btnCreate.disabled = true;
      btnRead.disabled = false;
      break;

    case 'WORKOUT_LOADED':
      statusArea.textContent = customMessage || 'Workout loaded';
      statusArea.classList.add('loaded');
      if (currentExport) {
        workoutDetails.style.display = 'flex';
        detailName.textContent = currentExport.workout.name;
        detailDate.textContent = formatDisplayDate(currentExport.workout.date);
        detailPhases.textContent = String(countPhases(currentExport.workout.phases));
      }
      btnCreate.disabled = false;
      btnRead.disabled = false;
      break;

    case 'CREATING':
      statusArea.textContent = customMessage || 'Selecting Running...';
      statusArea.classList.add('creating');
      btnCreate.disabled = true;
      btnRead.disabled = true;
      break;

    case 'SUCCESS':
      statusArea.textContent = customMessage || 'Running selected';
      statusArea.classList.add('success');
      btnCreate.disabled = false;
      btnRead.disabled = false;
      break;

    case 'ERROR':
      statusArea.textContent = customMessage || 'Could not select Running';
      statusArea.classList.add('error');
      btnCreate.disabled = !currentExport;
      btnRead.disabled = false;
      break;
  }
}

/**
 * Handle "Read Workout"
 */
async function handleReadWorkout(): Promise<void> {
  logPolar('Reading workout from clipboard...');
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      setState('ERROR', 'Invalid workout');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setState('ERROR', 'Invalid workout');
      return;
    }

    const validation = validateWorkoutExport(parsed);
    if (!validation.valid || !validation.exportData) {
      setState('ERROR', 'Invalid workout');
      return;
    }

    currentExport = validation.exportData;
    setState('WORKOUT_LOADED', 'Workout loaded');

    // Persist in background session
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'STORE_WORKOUT',
        payload: currentExport,
      });
    }
  } catch (err) {
    logPolar('Clipboard read failed:', err);
    setState('ERROR', 'Invalid workout');
  }
}

/**
 * Handle "Create in Polar Flow"
 */
async function handleCreateInPolar(): Promise<void> {
  if (!currentExport) {
    setState('NO_WORKOUT');
    return;
  }

  setState('CREATING', 'Creating...');

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_POLAR_WORKOUT',
        workout: currentExport.workout,
      },
      (createResponse?: { success: boolean; accepted?: boolean; jobId?: string; error?: string }) => {
        if (chrome.runtime.lastError || !createResponse) {
          const err = chrome.runtime.lastError?.message || 'Could not connect to Polar extension';
          setState('ERROR', err.includes('log in') ? 'Please log in to Polar Flow first.' : err);
          return;
        }

        if (!createResponse.success || !createResponse.jobId) {
          setState('ERROR', createResponse.error || 'Could not start workout creation');
          return;
        }

        const jobId = createResponse.jobId;
        const startTime = Date.now();
        const MAX_POLL_MS = 120 * 1000;

        setState('CREATING', 'Creating...');

        const intervalId = setInterval(() => {
          const elapsed = Date.now() - startTime;
          if (elapsed >= MAX_POLL_MS) {
            clearInterval(intervalId);
            statusArea.textContent = 'Polar creation is taking longer than expected.';
            return;
          }

          chrome.runtime.sendMessage(
            {
              type: 'GET_POLAR_JOB_STATUS',
              jobId: jobId,
            },
            (statusResponse?: {
              success: boolean;
              job?: { jobId: string; status: 'RUNNING' | 'SUCCESS' | 'ERROR'; error: string | null };
              error?: string;
            }) => {
              if (
                chrome.runtime.lastError ||
                !statusResponse ||
                !statusResponse.success ||
                !statusResponse.job
              ) {
                return;
              }

              const job = statusResponse.job;

              if (job.status === 'RUNNING') {
                setState('CREATING', 'Creating...');
              } else if (job.status === 'SUCCESS') {
                clearInterval(intervalId);
                setState('SUCCESS', 'Created in Polar Flow ✓');
              } else if (job.status === 'ERROR') {
                clearInterval(intervalId);
                setState('ERROR', job.error || 'Could not create workout');
              }
            }
          );
        }, 1000);
      }
    );
  } else {
    // Development fallback
    setTimeout(() => {
      setState('SUCCESS', 'Created in Polar Flow ✓');
    }, 1500);
  }
}

/**
 * Initialize popup
 */
function initPopup(): void {
  btnRead.addEventListener('click', handleReadWorkout);
  btnCreate.addEventListener('click', handleCreateInPolar);

  // Restore stored workout if any
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'GET_STORED_WORKOUT' }, (res) => {
      if (res && res.workoutExport) {
        currentExport = res.workoutExport;
        setState('WORKOUT_LOADED');
      } else {
        setState('NO_WORKOUT');
      }
    });
  } else {
    setState('NO_WORKOUT');
  }
}

document.addEventListener('DOMContentLoaded', initPopup);
