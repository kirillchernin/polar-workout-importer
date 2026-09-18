/**
 * Polar Workout Importer - Background Service Worker (Manifest V3)
 *
 * Coordinates:
 * - Tab discovery and navigation for Polar Flow (https://flow.polar.com/)
 * - Sending automation instructions to content script
 * - Session storage for current workout
 */

import {
  ExtensionMessage,
  PolarWorkoutData,
  PolarWorkoutExport,
  PolarCreationJob,
  PolarJobStatus,
  validateWorkoutExport,
} from './types';

const LOG_PREFIX = '[Polar Extension]';

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, ...args);
}

log('Service worker initialized.');

/**
 * Job-based creation state
 */
let polarCreationJobs: Record<string, PolarCreationJob> = {};

// Restore persistent jobs from chrome.storage.local at worker initialization
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['polarCreationJobs'], (res) => {
    if (res && res.polarCreationJobs && typeof res.polarCreationJobs === 'object') {
      polarCreationJobs = {
        ...(res.polarCreationJobs as Record<string, PolarCreationJob>),
        ...polarCreationJobs,
      };
      log('Restored polarCreationJobs from storage:', Object.keys(polarCreationJobs).length);
    }
  });
}

/**
 * Check if there is an active running job
 */
function hasActiveRunningJob(): boolean {
  return Object.values(polarCreationJobs).some((job) => job.status === 'RUNNING');
}

/**
 * Create a new job in memory and persist in chrome.storage.local
 */
function createNewPolarJob(jobId: string): PolarCreationJob {
  // Remove old completed jobs, keep only active running jobs
  const cleaned: Record<string, PolarCreationJob> = {};
  for (const [id, job] of Object.entries(polarCreationJobs)) {
    if (job.status === 'RUNNING') {
      cleaned[id] = job;
    }
  }

  const newJob: PolarCreationJob = {
    jobId,
    status: 'RUNNING',
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  cleaned[jobId] = newJob;
  polarCreationJobs = cleaned;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ polarCreationJobs: cleaned });
  }

  log('Created new Polar creation job:', jobId);
  return newJob;
}

/**
 * Update job status in memory and persist in chrome.storage.local
 */
function updatePolarJobStatus(
  jobId: string,
  status: PolarJobStatus,
  error: string | null = null
): void {
  const existing = polarCreationJobs[jobId] || { jobId };
  const updated: PolarCreationJob = {
    ...existing,
    jobId,
    status,
    error,
    updatedAt: Date.now(),
  };

  polarCreationJobs[jobId] = updated;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['polarCreationJobs'], (res) => {
      const stored = (res && res.polarCreationJobs) || {};
      stored[jobId] = updated;
      chrome.storage.local.set({ polarCreationJobs: stored });
    });
  }

  log(`Job ${jobId} status updated to:`, status, error ? `(${error})` : '');
}

/**
 * Helper to check if a URL is exactly the Polar Flow target page
 * (https://flow.polar.com/target)
 */
export function isExactTargetPage(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    return (
      parsed.hostname === 'flow.polar.com' &&
      (parsed.pathname === '/target' || parsed.pathname === '/target/')
    );
  } catch {
    return false;
  }
}

/**
 * Wait for a tab to reach changeInfo.status === "complete"
 */
function waitForTabStatusComplete(tabId: number, timeoutMs = 25000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      if (finished) return;
      cleanup();
      // Final inspection
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          reject(new Error(`Tab ${tabId} could not be loaded or was closed.`));
        } else if (tab.status === 'complete') {
          resolve();
        } else {
          reject(new Error(`Timeout waiting for tab ${tabId} navigation to complete.`));
        }
      });
    }, timeoutMs);

    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string }
    ) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (!finished) {
          finished = true;
          cleanup();
          resolve();
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * START WORKFLOW:
 * 1. Find an existing Chrome tab whose URL matches: https://flow.polar.com/*
 * 2. If multiple Polar Flow tabs exist: use the first available Polar Flow tab.
 * 3. If no Polar Flow tab exists: create a new tab with https://flow.polar.com/target
 * 4. If a Polar Flow tab exists but its URL is NOT exactly the target page:
 *    navigate that SAME tab to https://flow.polar.com/target using chrome.tabs.update(tab.id, { url: 'https://flow.polar.com/target', active: true })
 * 5. If the tab is already on https://flow.polar.com/target: do not reload it unnecessarily. Just activate it.
 */
export async function getOrNavigatePolarTargetTab(): Promise<chrome.tabs.Tab> {
  log('1. Finding existing Polar Flow tabs (https://flow.polar.com/*)...');
  const tabs = await chrome.tabs.query({ url: '*://flow.polar.com/*' });

  if (tabs.length === 0) {
    // 3. If no Polar Flow tab exists: create a new tab with https://flow.polar.com/target
    log('No Polar Flow tab exists. Opening new tab: https://flow.polar.com/target ...');
    let targetTabId: number | undefined;

    const waitPromise = new Promise<void>((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        cleanup();
        if (targetTabId !== undefined) {
          chrome.tabs.get(targetTabId, (tab) => {
            if (tab && tab.status === 'complete') resolve();
            else reject(new Error('Timeout loading new Polar Flow tab.'));
          });
        } else {
          reject(new Error('Timeout creating new Polar Flow tab.'));
        }
      }, 25000);

      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
      };

      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (targetTabId !== undefined && updatedTabId === targetTabId && changeInfo.status === 'complete') {
          if (!finished) {
            finished = true;
            cleanup();
            resolve();
          }
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });

    const newTab = await chrome.tabs.create({
      url: 'https://flow.polar.com/target',
      active: true,
    });

    if (newTab.id === undefined) {
      throw new Error('Failed to create new Polar Flow tab');
    }

    targetTabId = newTab.id;

    if (newTab.status !== 'complete') {
      log('Waiting for new /target page to load...');
      await waitPromise;
    }

    return newTab;
  }

  // 2. If multiple Polar Flow tabs exist: use the first available Polar Flow tab.
  const tab = tabs[0];
  if (tab.id === undefined) {
    throw new Error('Polar Flow tab has no valid ID');
  }

  log(`Using first available Polar Flow tab (ID: ${tab.id}, URL: ${tab.url})`);

  // 5. If the tab is already on https://flow.polar.com/target: do not reload it unnecessarily. Just activate it.
  if (isExactTargetPage(tab.url)) {
    log('Tab is already on https://flow.polar.com/target. Activating tab without reload.');
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (tab.status !== 'complete') {
      log('Tab is currently loading, waiting for complete status...');
      await waitForTabStatusComplete(tab.id);
    }
    return tab;
  }

  // 4. If a Polar Flow tab exists but its URL is NOT exactly the target page:
  // navigate that SAME tab to: https://flow.polar.com/target
  log(`Tab URL is "${tab.url}". Navigating same tab to https://flow.polar.com/target ...`);
  const waitPromise = waitForTabStatusComplete(tab.id);

  await chrome.tabs.update(tab.id, {
    url: 'https://flow.polar.com/target',
    active: true,
  });

  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  log('Waiting for navigation to complete (changeInfo.status === "complete")...');
  await waitPromise;

  return tab;
}

// Alias for backwards compatibility
export const getOrOpenPolarTab = getOrNavigatePolarTargetTab;

/**
 * Poll content script with CHECK_TARGET_PAGE_READY for up to 10 seconds
 * (every 250 ms, maximum 40 attempts).
 * Only returns true when ready === true (all 5 DOM elements present).
 */
export async function pollTargetPageReady(tabId: number): Promise<boolean> {
  const maxAttempts = 40;
  const intervalMs = 250;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await new Promise<{ ready?: boolean; status?: string }>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: 'CHECK_TARGET_PAGE_READY' }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res || {});
          }
        });
      });

      if (response && response.ready === true) {
        log(`Target page ready confirmed on attempt ${attempt}/${maxAttempts} (TARGET_PAGE_READY)`);
        return true;
      }
    } catch {
      // Content script may still be initializing or DOM elements rendering
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  log(`Target page NOT ready after ${maxAttempts} attempts (10s)`);
  return false;
}

/**
 * Send message to content script with retry
 */
async function sendToContentScript<T>(tabId: number, message: ExtensionMessage, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await new Promise<T>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      return res;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new Error('Could not communicate with Polar Flow tab.');
}

/**
 * Orchestrate workout creation in Polar Flow:
 * - Navigates Polar Flow tab directly to https://flow.polar.com/target
 * - Waits for page load complete
 * - Polls CHECK_TARGET_PAGE_READY for up to 10s (40 attempts, 250ms)
 * - Runs existing working Polar workout creation automation
 */
export async function handleCreateInPolarFlow(
  workout: PolarWorkoutData
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // 1. Find or navigate Polar Flow tab to https://flow.polar.com/target
    const tab = await getOrNavigatePolarTargetTab();
    if (!tab.id) {
      return { success: false, error: 'Polar Flow tab could not be opened' };
    }

    // 2. Poll content script for TARGET_PAGE_READY
    log('Waiting for TARGET_PAGE_READY (polling CHECK_TARGET_PAGE_READY for up to 10s)...');
    const ready = await pollTargetPageReady(tab.id);

    if (!ready) {
      // Check if user is logged in to provide clear feedback if redirected to login
      try {
        const statusRes = await sendToContentScript<{ isPolar: boolean; isLoggedIn: boolean }>(
          tab.id,
          { type: 'CHECK_POLAR_STATUS' },
          1
        );
        if (statusRes && !statusRes.isLoggedIn) {
          return { success: false, error: 'Please log in to Polar Flow first.' };
        }
      } catch {
        // ignore
      }

      return {
        success: false,
        error: 'Target page not ready: required form elements were not found after 10 seconds.',
      };
    }

    log('TARGET_PAGE_READY confirmed! Running workout creation automation...');

    // 3. Trigger existing working Target Creation automation on Polar Flow /target
    const result = await sendToContentScript<{ success: boolean; error?: string; message?: string }>(
      tab.id,
      {
        type: 'CREATE_IN_POLAR',
        payload: workout,
      }
    );

    if (result && result.success) {
      return { success: true };
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log('Error during workout creation:', errorMsg);
    return {
      success: false,
      error: errorMsg || 'Could not create workout',
    };
  }
}

/**
 * Direct workout creation entry point (reused identically for popup and external messages)
 */
export const createPolarWorkout = handleCreateInPolarFlow;

// Runtime message listener (internal messages from popup and options)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const msg = message as {
      type: string;
      payload?: unknown;
      workout?: unknown;
      jobId?: string;
    };

    if (msg.type === 'PING_POLAR_EXTENSION') {
      sendResponse({
        success: true,
        status: 'READY',
      });
      return false;
    }

    if (msg.type === 'GET_POLAR_JOB_STATUS') {
      const jobId = msg.jobId;
      const job = jobId ? polarCreationJobs[jobId] : null;

      if (!job) {
        sendResponse({
          success: false,
          error: 'JOB_NOT_FOUND',
        });
        return false;
      }

      sendResponse({
        success: true,
        job: {
          jobId: job.jobId,
          status: job.status,
          error: job.error,
        },
      });
      return false;
    }

    if (msg.type === 'CREATE_POLAR_WORKOUT' || msg.type === 'CREATE_IN_POLAR_WORKFLOW') {
      const workoutRaw = msg.workout || msg.payload;

      if (!workoutRaw) {
        sendResponse({
          success: false,
          error: 'WORKOUT_MISSING',
        });
        return false;
      }

      if (hasActiveRunningJob()) {
        sendResponse({
          success: false,
          error: 'WORKOUT_CREATION_ALREADY_IN_PROGRESS',
        });
        return false;
      }

      const jobId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      createNewPolarJob(jobId);

      // Respond immediately with accepted status and jobId
      sendResponse({
        success: true,
        accepted: true,
        jobId: jobId,
      });

      // Parse workout data
      const workoutObj =
        typeof workoutRaw === 'object' &&
        workoutRaw !== null &&
        'workout' in workoutRaw &&
        Array.isArray(
          (workoutRaw as Record<string, unknown>).workout &&
            ((workoutRaw as Record<string, unknown>).workout as Record<string, unknown>).phases
        )
          ? ((workoutRaw as Record<string, unknown>).workout as PolarWorkoutData)
          : (workoutRaw as PolarWorkoutData);

      // Run existing Polar Flow automation asynchronously
      handleCreateInPolarFlow(workoutObj)
        .then((result) => {
          if (result && result.success) {
            updatePolarJobStatus(jobId, 'SUCCESS', null);
          } else {
            updatePolarJobStatus(
              jobId,
              'ERROR',
              result?.error || 'Could not create workout in Polar Flow'
            );
          }
        })
        .catch((error) => {
          const errorMsg =
            error instanceof Error ? error.message : String(error) || 'UNKNOWN_ERROR';
          updatePolarJobStatus(jobId, 'ERROR', errorMsg);
        });

      return false;
    }

    if (msg.type === 'STORE_WORKOUT') {
      const exportData = msg.payload as PolarWorkoutExport;
      const storageArea = chrome.storage?.session || chrome.storage?.local;
      if (storageArea) {
        storageArea.set({ currentWorkout: exportData }, () => {
          sendResponse({ success: true });
        });
        return true;
      }
      sendResponse({ success: false });
      return false;
    }

    if (msg.type === 'GET_STORED_WORKOUT') {
      const storageArea = chrome.storage?.session || chrome.storage?.local;
      if (storageArea) {
        storageArea.get(['currentWorkout'], (res) => {
          sendResponse({ workoutExport: res.currentWorkout || null });
        });
        return true;
      }
      sendResponse({ workoutExport: null });
      return false;
    }

    return false;
  });
}

// External message listener (Direct communication from Polar Workout Generator)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener(
    (message: unknown, sender, sendResponse) => {
      // Only accept messages from our Generator.
      if (
        !sender.url ||
        !sender.url.startsWith('https://polar-workout-generator.ai.studio/')
      ) {
        sendResponse({
          success: false,
          error: 'UNAUTHORIZED_SENDER',
        });
        return false;
      }

      const msg = message as { type?: string; workout?: unknown; jobId?: string };

      // 1. PING
      if (msg?.type === 'PING_POLAR_EXTENSION') {
        sendResponse({
          success: true,
          status: 'READY',
        });
        return false;
      }

      // 2. CREATE
      if (msg?.type === 'CREATE_POLAR_WORKOUT') {
        if (!msg.workout) {
          sendResponse({
            success: false,
            error: 'WORKOUT_MISSING',
          });
          return false;
        }

        // Concurrency guard: allow only one active Polar creation job at a time
        if (hasActiveRunningJob()) {
          sendResponse({
            success: false,
            error: 'WORKOUT_CREATION_ALREADY_IN_PROGRESS',
          });
          return false;
        }

        const jobId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        createNewPolarJob(jobId);

        // Immediately respond to caller
        sendResponse({
          success: true,
          accepted: true,
          jobId: jobId,
        });

        // Support both direct workout object and wrapped { workout: ... } export object
        const workoutObj =
          typeof msg.workout === 'object' &&
          msg.workout !== null &&
          'workout' in msg.workout &&
          Array.isArray(
            (msg.workout as Record<string, unknown>).workout &&
              ((msg.workout as Record<string, unknown>).workout as Record<string, unknown>).phases
          )
            ? ((msg.workout as Record<string, unknown>).workout as PolarWorkoutData)
            : (msg.workout as PolarWorkoutData);

        // Start existing handleCreateInPolarFlow asynchronously
        handleCreateInPolarFlow(workoutObj)
          .then((result) => {
            if (result && result.success) {
              updatePolarJobStatus(jobId, 'SUCCESS', null);
            } else {
              updatePolarJobStatus(
                jobId,
                'ERROR',
                result?.error || 'Could not create workout in Polar Flow'
              );
            }
          })
          .catch((error) => {
            const errorMsg =
              error instanceof Error ? error.message : String(error) || 'UNKNOWN_ERROR';
            updatePolarJobStatus(jobId, 'ERROR', errorMsg);
          });

        // Do NOT return true for this CREATE handler because the response is immediate.
        return false;
      }

      // 3. GET STATUS
      if (msg?.type === 'GET_POLAR_JOB_STATUS') {
        const jobId = msg.jobId;
        const job = jobId ? polarCreationJobs[jobId] : null;

        if (!job) {
          sendResponse({
            success: false,
            error: 'JOB_NOT_FOUND',
          });
          return false;
        }

        sendResponse({
          success: true,
          job: {
            jobId: job.jobId,
            status: job.status,
            error: job.error,
          },
        });
        return false;
      }

      sendResponse({
        success: false,
        error: 'UNKNOWN_MESSAGE',
      });

      return false;
    }
  );
}
