/**
 * Polar Flow Selectors and Browser Automation
 *
 * Centralized DOM selectors, semantic locators, and automation logic
 * for creating Phased Targets on real Polar Flow Web (https://flow.polar.com/target).
 */

import { PolarWorkoutData, PolarWorkoutPhase, PolarWorkflowStage } from './types';

export function logPolar(message: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(`[Polar Extension] ${message}`, ...args);
}

// ============================================================================
// DOM Utilities & Helpers
// ============================================================================

/**
 * Reusable helper: Wait for an element matching selector to appear in the DOM.
 */
export async function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeout = 5000
): Promise<T> {
  const existing = document.querySelector<T>(selector);
  if (existing) return existing;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}

/**
 * Reusable helper: Wait for an element matching selector inside a parent container.
 */
export async function waitForElementInside<T extends Element = HTMLElement>(
  parent: HTMLElement,
  selector: string,
  timeout = 5000
): Promise<T> {
  const existing = parent.querySelector<T>(selector);
  if (existing) return existing;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element inside container: ${selector}`));
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = parent.querySelector<T>(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(parent, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}

/**
 * Convert generator date YYYY-MM-DD to Polar Flow format DD.MM.YYYY
 * formatPolarDate("2026-09-15") -> "15.09.2026"
 */
export function formatPolarDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  // If already in DD.MM.YYYY format
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  // YYYY-MM-DD
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${day}.${month}.${year}`;
  }
  return dateStr;
}

/**
 * Convert duration in seconds to Polar Flow format HH:MM:SS
 * 600 -> "00:10:00"
 * 90 -> "00:01:30"
 * 3600 -> "01:00:00"
 */
export function formatPolarDuration(secondsOrDuration: number | string | undefined): string {
  let totalSeconds = 0;
  if (typeof secondsOrDuration === 'number') {
    totalSeconds = Math.max(0, Math.floor(secondsOrDuration));
  } else if (typeof secondsOrDuration === 'string') {
    // If it's already HH:MM:SS
    if (/^\d{2}:\d{2}:\d{2}$/.test(secondsOrDuration.trim())) {
      return secondsOrDuration.trim();
    }
    // If MM:SS
    if (/^\d{1,2}:\d{2}$/.test(secondsOrDuration.trim())) {
      const parts = secondsOrDuration.trim().split(':');
      const mm = parts[0].padStart(2, '0');
      const ss = parts[1];
      return `00:${mm}:${ss}`;
    }
    const parsed = parseInt(secondsOrDuration, 10);
    totalSeconds = isNaN(parsed) ? 0 : Math.max(0, parsed);
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

/**
 * Check if current page is Polar Flow
 */
export function isPolarFlowHost(urlStr = window.location.href): boolean {
  try {
    const url = new URL(urlStr);
    return url.hostname === 'flow.polar.com' || url.hostname.endsWith('.polar.com');
  } catch {
    return false;
  }
}

/**
 * Check whether the user is logged into Polar Flow
 */
export function checkIsLoggedIn(): boolean {
  const loginInputs = document.querySelectorAll(
    'input[name="email"], input[type="password"], form[action*="login"], form[action*="signin"]'
  );
  if (loginInputs.length > 0) {
    return false;
  }

  const authSelectors = [
    '[data-qa*="user-menu"]',
    '[data-qa*="profile"]',
    '[data-qa*="user-avatar"]',
    '[data-qa*="nav-diary"]',
    'a[href*="/diary"]',
    'a[href*="/settings"]',
    'a[href*="/signout"]',
    'a[href*="/logout"]',
    '#header-user',
    '.user-profile',
  ];

  for (const sel of authSelectors) {
    if (document.querySelector(sel)) return true;
  }

  const path = window.location.pathname;
  if (
    path.startsWith('/target') ||
    path.startsWith('/diary') ||
    path.startsWith('/training-target') ||
    path.startsWith('/feed')
  ) {
    return true;
  }

  return false;
}

/**
 * Verify that the target page REAL DOM contains all 5 required elements:
 * - #sport-picker
 * - #name-field
 * - #date-field
 * - #time-field
 * - #target-type-option-phased
 *
 * Only when all these elements exist does it return ready === true (TARGET_PAGE_READY).
 */
export function checkTargetPageReady(): { ready: boolean; status?: string } {
  const sportPicker = document.querySelector('#sport-picker');
  const nameField = document.querySelector('#name-field');
  const dateField = document.querySelector('#date-field');
  const timeField = document.querySelector('#time-field');
  const targetPhased = document.querySelector('#target-type-option-phased');

  const ready = !!(sportPicker && nameField && dateField && timeField && targetPhased);

  logPolar('Target page readiness verification:', {
    hasSportPicker: !!sportPicker,
    hasNameField: !!nameField,
    hasDateField: !!dateField,
    hasTimeField: !!timeField,
    hasTargetPhased: !!targetPhased,
    ready,
  });

  return ready ? { ready: true, status: 'TARGET_PAGE_READY' } : { ready: false };
}

// ============================================================================
// Step-by-Step Tested DOM Interactions
// ============================================================================

/**
 * Step 1: SELECT RUNNING
 *
 * Polar sport picker is react-select.
 * Stable selectors:
 * #sport-picker input
 * .sport-picker__option
 */
export async function stepSelectRunning(): Promise<void> {
  logPolar('1. Selecting Running...');

  let sportInput: HTMLInputElement;
  try {
    sportInput = await waitForElement<HTMLInputElement>('#sport-picker input', 6000);
  } catch {
    throw new Error('Sport picker not found');
  }

  sportInput.focus();

  sportInput.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      bubbles: true,
    })
  );

  let running: HTMLElement | undefined;
  try {
    await waitForElement('.sport-picker__option', 5000);
    const options = Array.from(document.querySelectorAll<HTMLElement>('.sport-picker__option'));
    running = options.find((el) => el.textContent?.trim() === 'Running');
  } catch {
    throw new Error('Running option not found');
  }

  if (!running) {
    throw new Error('Running option not found');
  }

  running.click();

  // Verify that #sport-picker contains "Running"
  const sportPicker = document.querySelector<HTMLElement>('#sport-picker');
  if (!sportPicker || !sportPicker.textContent?.includes('Running')) {
    // Wait briefly and recheck verification
    const verified = await new Promise<boolean>((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const picker = document.querySelector<HTMLElement>('#sport-picker');
        if (picker && picker.textContent?.includes('Running')) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > 3000) {
          clearInterval(interval);
          resolve(false);
        }
      }, 150);
    });

    if (!verified) {
      throw new Error('Running option not found');
    }
  }

  logPolar('Running selected and verified');
}

/**
 * Step 2: TARGET NAME
 * Stable selector: #name-field
 */
export async function stepTargetName(name: string): Promise<void> {
  logPolar('2. Setting Target Name:', name);

  let nameField: HTMLInputElement;
  try {
    nameField = await waitForElement<HTMLInputElement>('#name-field', 5000);
  } catch {
    throw new Error('Target name field not found');
  }

  nameField.focus();
  nameField.value = name;
  nameField.dispatchEvent(new Event('input', { bubbles: true }));
  nameField.dispatchEvent(new Event('change', { bubbles: true }));
  nameField.blur();

  if (nameField.value !== name) {
    throw new Error('Target name field not found');
  }

  logPolar('Target name set successfully');
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

/**
 * Parses month name string (e.g. "September 2026" or Finnish/German variants) into { year, month (1-12) }
 */
function parseSwitchDaysText(text: string): { year: number; month: number } | null {
  const clean = text.trim().toLowerCase();
  // Match year: 4 digits
  const yearMatch = clean.match(/\b(20\d\d)\b/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  // Match English month name
  for (let m = 0; m < MONTH_NAMES.length; m++) {
    if (clean.includes(MONTH_NAMES[m])) {
      return { year, month: m + 1 };
    }
  }

  // Common multilingual month names (Finnish, German, French)
  const multilingualMonths: Record<string, number> = {
    tammikuu: 1, januar: 1, janvier: 1,
    helmikuu: 2, februar: 2, février: 2,
    maaliskuu: 3, märz: 3, mars: 3,
    huhtikuu: 4, avril: 4,
    toukokuu: 5, mai: 5,
    kesäkuu: 6, juni: 6, juin: 6,
    heinäkuu: 7, juli: 7, juillet: 7,
    elokuu: 8, august: 8, août: 8,
    syyskuu: 9, septembre: 9,
    lokakuu: 10, oktober: 10, octobre: 10,
    marraskuu: 11, novembre: 11,
    joulukuu: 12, dezember: 12, décembre: 12,
  };

  for (const [mName, mNum] of Object.entries(multilingualMonths)) {
    if (clean.includes(mName)) {
      return { year, month: mNum };
    }
  }

  return null;
}

/**
 * Helper to check if an element is visible in the viewport
 */
function isElementVisible(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Step 3: DATE
 * Selects date using the REAL Polar date picker UI:
 * 1. Parse date (year, month, day) from YYYY-MM-DD
 * 2. Focus + click #date-field, wait for .picker-switch-days to exist & be visible
 * 3. Read displayed month/year from .picker-switch-days
 * 4. Navigate using .picker-next-button or .picker-previous-button (up to 120 times)
 * 5. Find target td.day (excluding 'old' and 'new') matching day number
 * 6. Click target day
 * 7. Verify #date-field contains non-empty date corresponding to requested date
 */
export async function selectPolarDate(dateString: string): Promise<void> {
  logPolar('3. Selecting Polar Date via date picker:', dateString);

  // STEP 1: Parse
  const trimmed = dateString.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let reqYear: number;
  let reqMonth: number;
  let reqDay: number;

  if (match) {
    reqYear = parseInt(match[1], 10);
    reqMonth = parseInt(match[2], 10);
    reqDay = parseInt(match[3], 10);
  } else {
    // Fallback for DD.MM.YYYY
    const ddmmyyyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (ddmmyyyy) {
      reqDay = parseInt(ddmmyyyy[1], 10);
      reqMonth = parseInt(ddmmyyyy[2], 10);
      reqYear = parseInt(ddmmyyyy[3], 10);
    } else {
      const now = new Date();
      reqYear = now.getFullYear();
      reqMonth = now.getMonth() + 1;
      reqDay = now.getDate();
    }
  }

  // STEP 2: Find #date-field and open picker
  let dateField: HTMLInputElement;
  try {
    dateField = await waitForElement<HTMLInputElement>('#date-field', 5000);
  } catch {
    throw new Error('Date field not found');
  }

  dateField.focus();
  dateField.click();

  let switchDaysEl: HTMLElement;
  try {
    await waitForElement('.picker-switch-days', 5000);
    const switchDays = document.querySelector<HTMLElement>('.picker-switch-days');
    if (!switchDays) {
      throw new Error('Polar date picker did not open');
    }
    // Verify visible or wait a moment
    const visible = await new Promise<boolean>((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const el = document.querySelector<HTMLElement>('.picker-switch-days');
        if (el && isElementVisible(el)) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > 3000) {
          clearInterval(interval);
          resolve(Boolean(el));
        }
      }, 100);
    });

    if (!visible) {
      throw new Error('Polar date picker did not open');
    }
    switchDaysEl = document.querySelector<HTMLElement>('.picker-switch-days')!;
  } catch {
    throw new Error('Polar date picker did not open');
  }

  // STEP 3 & 4: Read and compare displayed month/year, navigate if needed
  const targetTotalMonths = reqYear * 12 + reqMonth;
  const maxNavClicks = 120;
  let clicks = 0;

  while (clicks < maxNavClicks) {
    const currentText = switchDaysEl.textContent || '';
    const parsed = parseSwitchDaysText(currentText);
    if (!parsed) {
      logPolar('Could not parse month text:', currentText);
      throw new Error('Could not navigate Polar calendar to requested month');
    }

    const currentTotalMonths = parsed.year * 12 + parsed.month;
    if (currentTotalMonths === targetTotalMonths) {
      // Reached requested month
      break;
    }

    const prevBtn = document.querySelector<HTMLElement>('.picker-previous-button');
    const nextBtn = document.querySelector<HTMLElement>('.picker-next-button');

    const prevText = currentText;

    if (currentTotalMonths < targetTotalMonths) {
      if (!nextBtn) {
        throw new Error('Could not navigate Polar calendar to requested month');
      }
      nextBtn.click();
    } else {
      if (!prevBtn) {
        throw new Error('Could not navigate Polar calendar to requested month');
      }
      prevBtn.click();
    }

    // Wait until .picker-switch-days text changes
    const changed = await new Promise<boolean>((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const freshSwitch = document.querySelector<HTMLElement>('.picker-switch-days');
        if (freshSwitch && (freshSwitch.textContent || '') !== prevText) {
          clearInterval(interval);
          switchDaysEl = freshSwitch;
          resolve(true);
        } else if (Date.now() - start > 2500) {
          clearInterval(interval);
          resolve(false);
        }
      }, 50);
    });

    if (!changed) {
      throw new Error('Could not navigate Polar calendar to requested month');
    }

    clicks++;
  }

  if (clicks >= maxNavClicks) {
    throw new Error('Could not navigate Polar calendar to requested month');
  }

  // STEP 5: Find requested day in CURRENT displayed month
  const dayElements = Array.from(document.querySelectorAll<HTMLElement>('td.day')).filter(
    (el) => !el.classList.contains('old') && !el.classList.contains('new')
  );

  const targetDay = dayElements.find((el) => Number(el.textContent?.trim()) === reqDay);
  if (!targetDay) {
    throw new Error('Requested day not found in Polar calendar');
  }

  // STEP 6: Click targetDay
  logPolar(`Clicking day ${reqDay}...`);
  targetDay.click();

  // STEP 7: Verify #date-field contains non-empty date corresponding to requested date
  const verified = await new Promise<boolean>((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const val = dateField.value?.trim();
      if (val && val.length > 0) {
        const dayPadded = String(reqDay).padStart(2, '0');
        const dayUnpadded = String(reqDay);
        // Verify contains day number or formatted date
        if (val.includes(dayPadded) || val.includes(dayUnpadded) || val.includes(String(reqYear))) {
          clearInterval(interval);
          resolve(true);
          return;
        }
      }
      if (Date.now() - start > 3000) {
        clearInterval(interval);
        // If it has any non-empty value after click
        resolve(Boolean(dateField.value?.trim()));
      }
    }, 100);
  });

  if (!verified || !dateField.value?.trim()) {
    throw new Error('Polar date selection could not be verified');
  }

  logPolar('Polar date selected and verified via UI picker:', dateField.value);
}

export const stepDate = selectPolarDate;

/**
 * Step 4: START TIME
 * Stable selector: #time-field
 */
export async function stepStartTime(startTime: string = '08:00'): Promise<void> {
  logPolar('4. Setting Start Time:', startTime);

  let timeField: HTMLInputElement;
  try {
    timeField = await waitForElement<HTMLInputElement>('#time-field', 5000);
  } catch {
    throw new Error('Start time field not found');
  }

  timeField.focus();
  timeField.value = startTime;
  timeField.dispatchEvent(new Event('input', { bubbles: true }));
  timeField.dispatchEvent(new Event('change', { bubbles: true }));
  timeField.blur();

  if (timeField.value !== startTime) {
    logPolar(`Notice: timeField.value is "${timeField.value}", expected "${startTime}"`);
  }

  logPolar('Start time set successfully');
}

/**
 * Step 5: SELECT PHASED
 * Stable selector: #target-type-option-phased
 */
export async function stepSelectPhased(): Promise<void> {
  logPolar('5. Selecting Phased target type...');

  let phasedOption: HTMLElement;
  try {
    phasedOption = await waitForElement<HTMLElement>('#target-type-option-phased', 5000);
  } catch {
    throw new Error('Phased target button not found');
  }

  phasedOption.click();

  try {
    await waitForElement('.add-duration-phase-button', 5000);
  } catch {
    throw new Error('Phased target button not found');
  }

  logPolar('Phased selected and .add-duration-phase-button visible');
}

/**
 * Step 6: ADD DURATION PHASE
 * Stable selector: .add-duration-phase-button
 * Waits until the number of .phase-container elements increases by exactly 1.
 * Returns the newly created phase container.
 */
export async function stepAddDurationPhase(phaseIndex = 1): Promise<HTMLElement> {
  logPolar(`Adding duration phase ${phaseIndex}...`);

  const initialContainers = Array.from(document.querySelectorAll<HTMLElement>('.phase-container'));
  const initialCount = initialContainers.length;

  let addDurationBtn: HTMLElement;
  try {
    addDurationBtn = await waitForElement<HTMLElement>('.add-duration-phase-button', 5000);
  } catch {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  addDurationBtn.click();

  // Wait until the number of .phase-container increases by exactly 1
  const newCountReached = await new Promise<boolean>((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const currentContainers = document.querySelectorAll('.phase-container');
      if (currentContainers.length === initialCount + 1) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > 5000) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  if (!newCountReached) {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  const phaseContainers = Array.from(document.querySelectorAll<HTMLElement>('.phase-container'));
  const newContainer = phaseContainers[phaseContainers.length - 1];
  if (!newContainer) {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  logPolar(`Duration phase ${phaseIndex} added. Container count: ${phaseContainers.length}`);
  return newContainer;
}

/**
 * Step 6b: ADD DISTANCE PHASE
 * Stable selector: .add-distance-phase-button
 * Waits until the number of .phase-container elements increases by exactly 1.
 * Returns the newly created phase container.
 */
export async function stepAddDistancePhase(phaseIndex = 1): Promise<HTMLElement> {
  logPolar(`Adding distance phase ${phaseIndex}...`);

  const initialContainers = Array.from(document.querySelectorAll<HTMLElement>('.phase-container'));
  const initialCount = initialContainers.length;

  let addDistanceBtn: HTMLElement;
  try {
    addDistanceBtn = await waitForElement<HTMLElement>('.add-distance-phase-button', 5000);
  } catch {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  addDistanceBtn.click();

  // Wait until the number of .phase-container increases by exactly 1
  const newCountReached = await new Promise<boolean>((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const currentContainers = document.querySelectorAll('.phase-container');
      if (currentContainers.length === initialCount + 1) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > 5000) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  if (!newCountReached) {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  const phaseContainers = Array.from(document.querySelectorAll<HTMLElement>('.phase-container'));
  const newContainer = phaseContainers[phaseContainers.length - 1];
  if (!newContainer) {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  logPolar(`Distance phase ${phaseIndex} added. Container count: ${phaseContainers.length}`);
  return newContainer;
}

/**
 * Step 7: EXPAND PHASE
 * Stable selector inside the newly created phase container: [aria-label="expand"]
 * Supports checking either duration or distance input visibility.
 */
export async function stepExpandPhase(
  phaseContainer: HTMLElement,
  phaseIndex = 1,
  durationType: 'time' | 'distance' = 'time'
): Promise<void> {
  logPolar(`Expanding phase ${phaseIndex} (${durationType})...`);

  const inputSelector =
    durationType === 'distance'
      ? '.phase-settings-input.distance'
      : '.phase-settings-input.duration';

  // Check if input is already visible in this container
  if (phaseContainer.querySelector(inputSelector)) {
    logPolar(`Phase ${phaseIndex} is already expanded`);
    return;
  }

  const expandBtn = phaseContainer.querySelector<HTMLElement>('[aria-label="expand"]');
  if (expandBtn) {
    expandBtn.click();
  }

  // Wait until settings input appears inside this phase container
  const expanded = await new Promise<boolean>((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (
        phaseContainer.querySelector('.phase-settings-input.duration') ||
        phaseContainer.querySelector('.phase-settings-input.distance')
      ) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > 5000) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  if (!expanded) {
    throw new Error(`Could not create phase ${phaseIndex}`);
  }

  logPolar(`Phase ${phaseIndex} expanded successfully`);
}

/**
 * Step 8: PHASE NAME
 * Stable selector: phaseContainer.querySelector('.name-input')
 */
export async function stepPhaseName(
  name: string,
  phaseContainer: HTMLElement,
  phaseIndex = 1
): Promise<void> {
  logPolar(`Setting Phase ${phaseIndex} Name:`, name);

  const phaseNameField = phaseContainer.querySelector<HTMLInputElement>('.name-input');
  if (!phaseNameField) {
    throw new Error(`Could not set name for phase ${phaseIndex}`);
  }

  phaseNameField.focus();
  phaseNameField.value = name;
  phaseNameField.dispatchEvent(new Event('input', { bubbles: true }));
  phaseNameField.dispatchEvent(new Event('change', { bubbles: true }));
  phaseNameField.blur();

  const currentVal = phaseContainer.querySelector<HTMLInputElement>('.name-input')?.value;
  if (currentVal !== name) {
    throw new Error(`Could not set name for phase ${phaseIndex}`);
  }

  logPolar(`Phase ${phaseIndex} name set successfully and verified:`, name);
}

/**
 * Step 9: SET DURATION
 * Stable selector: phaseContainer.querySelector('.phase-settings-input.duration')
 */
export async function stepSetDuration(
  durationInSeconds: number | string | undefined,
  phaseContainer: HTMLElement,
  phaseIndex = 1
): Promise<void> {
  logPolar(`Setting Phase ${phaseIndex} Duration:`, durationInSeconds);

  const durationField = phaseContainer.querySelector<HTMLInputElement>(
    '.phase-settings-input.duration'
  );
  if (!durationField) {
    throw new Error(`Could not set duration for phase ${phaseIndex}`);
  }

  const formattedDuration = formatPolarDuration(durationInSeconds ?? 600);

  durationField.focus();
  durationField.value = formattedDuration;
  durationField.dispatchEvent(new Event('input', { bubbles: true }));
  durationField.dispatchEvent(new Event('change', { bubbles: true }));
  durationField.blur();

  const currentVal = phaseContainer.querySelector<HTMLInputElement>(
    '.phase-settings-input.duration'
  )?.value;
  if (currentVal !== formattedDuration) {
    throw new Error(`Could not set duration for phase ${phaseIndex}`);
  }

  logPolar(`Phase ${phaseIndex} duration set successfully and verified:`, formattedDuration);
}

/**
 * Step 9b: SET DISTANCE
 * Stable selector: phaseContainer.querySelector('.phase-settings-input.distance')
 * Converts meters to kilometers: distanceKm = distanceMeters / 1000
 */
export async function stepSetDistance(
  distanceInMeters: number | string | undefined,
  phaseContainer: HTMLElement,
  phaseIndex = 1
): Promise<void> {
  logPolar(`Setting Phase ${phaseIndex} Distance:`, distanceInMeters);

  const distanceField = phaseContainer.querySelector<HTMLInputElement>(
    '.phase-settings-input.distance'
  );
  if (!distanceField) {
    throw new Error(`Could not set distance for phase ${phaseIndex}`);
  }

  let metersNum = 1000;
  if (typeof distanceInMeters === 'number') {
    metersNum = distanceInMeters;
  } else if (typeof distanceInMeters === 'string') {
    const parsed = parseFloat(distanceInMeters);
    metersNum = isNaN(parsed) ? 1000 : parsed;
  }

  const distanceKm = metersNum / 1000;
  const expectedDistanceStr = String(distanceKm);

  distanceField.focus();
  distanceField.value = expectedDistanceStr;
  distanceField.dispatchEvent(new Event('input', { bubbles: true }));
  distanceField.dispatchEvent(new Event('change', { bubbles: true }));
  distanceField.blur();

  const currentVal = phaseContainer.querySelector<HTMLInputElement>(
    '.phase-settings-input.distance'
  )?.value?.trim();

  // Verify the distance field contains the expected value (allow float formatting like "2" vs "2.00")
  const currentNum = parseFloat(currentVal || '');
  if (currentVal !== expectedDistanceStr && currentNum !== distanceKm) {
    throw new Error(`Could not set distance for phase ${phaseIndex}`);
  }

  logPolar(`Phase ${phaseIndex} distance set successfully and verified:`, currentVal);
}

/**
 * Step 10: ENABLE TRAINING ZONES
 * Stable selector: phaseContainer.querySelector('input[id^="use-training-zones-"]')
 *
 * For each created phase, the checkbox must be ENABLED by default.
 * Do not click the checkbox if it is already checked.
 */
export async function stepEnableTrainingZones(
  phaseContainer: HTMLElement,
  phaseIndex = 1
): Promise<void> {
  logPolar(`Enabling training zones for phase ${phaseIndex}...`);

  const zonesCheckbox = phaseContainer.querySelector<HTMLInputElement>(
    'input[id^="use-training-zones-"]'
  );

  if (!zonesCheckbox) {
    throw new Error(`Could not enable training zones for phase ${phaseIndex}`);
  }

  if (!zonesCheckbox.checked) {
    zonesCheckbox.click();
  }

  // Verify checked === true
  if (zonesCheckbox.checked !== true) {
    throw new Error(`Could not enable training zones for phase ${phaseIndex}`);
  }

  logPolar(`Training zones enabled and verified for phase ${phaseIndex} (checked === true)`);
}

// Backward compatibility alias if needed
export const stepDisableTrainingZones = stepEnableTrainingZones;

/**
 * Resolves intensity type from workout JSON to Polar Flow option name.
 * Only "heart_rate" and "speed" are supported. Returns null otherwise.
 */
export function getTargetIntensityType(
  intensityType?: string
): 'Heart rate' | 'Speed' | null {
  if (!intensityType) return null;
  const lower = intensityType.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (lower === 'heart_rate' || lower === 'heartrate') {
    return 'Heart rate';
  }
  if (lower === 'speed') {
    return 'Speed';
  }
  return null;
}

/**
 * Extracts upper zone from phase object.
 * Priority: phase.zoneMax -> phase.targetZone -> phase.heartRateZone -> phase.paceZone.
 * Ignores zoneMin since lower zone is always fixed to Zone 1 in cumulative Polar zones.
 */
export function getUpperZone(phase: PolarWorkoutPhase): number | null {
  if (phase.zoneMax != null) {
    const parsed = Number(phase.zoneMax);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
  }
  if (typeof phase.targetZone === 'number' && phase.targetZone >= 1 && phase.targetZone <= 5) {
    return phase.targetZone;
  }
  if (typeof phase.heartRateZone === 'number' && phase.heartRateZone >= 1 && phase.heartRateZone <= 5) {
    return phase.heartRateZone;
  }
  if (typeof phase.paceZone === 'number' && phase.paceZone >= 1 && phase.paceZone <= 5) {
    return phase.paceZone;
  }
  return null;
}

/**
 * Step: SELECT INTENSITY TYPE (Heart rate | Speed)
 *
 * Polar intensity selector is a react-select component inside the phase container.
 * Tested react-select interaction:
 *   focus input
 *   → ArrowDown
 *   → find .select-component__option
 *   → click exact option
 */
export async function stepSelectIntensity(
  phaseContainer: HTMLElement,
  targetType: 'Heart rate' | 'Speed',
  phaseIndex = 1
): Promise<void> {
  logPolar(`Setting Phase ${phaseIndex} Intensity to "${targetType}"...`);

  // Check if intensity is already set to targetType
  const selectWrapper = phaseContainer.querySelector(
    '.select-component, [class*="select-component"], .intensity-select'
  );
  if (selectWrapper && selectWrapper.textContent?.includes(targetType)) {
    logPolar(`Phase ${phaseIndex} intensity is already "${targetType}"`);
    return;
  }

  // Find react-select input inside phaseContainer
  let selectField = phaseContainer.querySelector<HTMLInputElement>(
    '.select-component input, [class*="select-component"] input'
  );
  if (!selectField) {
    selectField = phaseContainer.querySelector<HTMLInputElement>(
      'input[aria-autocomplete="list"], input[id*="react-select"]'
    );
  }

  if (!selectField) {
    throw new Error(`Could not find intensity selector for phase ${phaseIndex}`);
  }

  selectField.focus();

  // Also trigger click on control or input to ensure dropdown opens
  const control = selectWrapper?.querySelector('[class*="control"]') || selectField;
  (control as HTMLElement).click();

  selectField.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true,
    })
  );

  let targetOption: HTMLElement | undefined;
  try {
    await waitForElement('.select-component__option', 5000);
    const options = Array.from(
      document.querySelectorAll<HTMLElement>('.select-component__option')
    );
    targetOption = options.find((el) => el.textContent?.trim() === targetType);
  } catch {
    throw new Error(`Could not find intensity option "${targetType}" for phase ${phaseIndex}`);
  }

  if (!targetOption) {
    throw new Error(`Could not find intensity option "${targetType}" for phase ${phaseIndex}`);
  }

  targetOption.click();

  // Verify that targetType is now selected
  const verified = await new Promise<boolean>((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const current = phaseContainer.querySelector(
        '.select-component, [class*="select-component"], .intensity-select'
      );
      if (current && current.textContent?.includes(targetType)) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > 3000) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  if (!verified) {
    throw new Error(`Could not set intensity to "${targetType}" for phase ${phaseIndex}`);
  }

  logPolar(`Phase ${phaseIndex} intensity set and verified: "${targetType}"`);
}

/**
 * Step: SET UPPER ZONE (Cumulative Zones 1–N)
 *
 * 1. Verify Lower Zone is Zone 1:
 *    [aria-label="select lower zone"]
 *    aria-valuenow === "1"
 *    If unexpectedly not 1, returns an explicit error instead of manipulating it.
 *
 * 2. Move Upper Zone handle until aria-valuenow === zoneMax:
 *    [aria-label="select upper zone"]
 *    ArrowRight to increase, ArrowLeft to decrease.
 *    Dispatches both keydown and keyup.
 *    Re-reads aria-valuenow after each step.
 *    Continues until Number(handle.getAttribute('aria-valuenow')) === zoneMax (max 10 attempts).
 *    Verifies final value.
 */
export async function stepSetUpperZone(
  phaseContainer: HTMLElement,
  zoneMax: number,
  phaseIndex = 1
): Promise<void> {
  logPolar(`Setting Phase ${phaseIndex} upper zone to ${zoneMax}...`);

  // 1. Lower zone verification
  let lowerHandle: HTMLElement | null = null;
  try {
    lowerHandle = await waitForElementInside<HTMLElement>(
      phaseContainer,
      '[aria-label="select lower zone"], [aria-label*="lower zone" i]',
      4000
    );
  } catch {
    throw new Error(`Could not find lower zone handle for phase ${phaseIndex}`);
  }

  const lowerVal = lowerHandle.getAttribute('aria-valuenow');
  if (lowerVal !== '1') {
    throw new Error(`Lower zone is unexpectedly ${lowerVal} (expected 1) for phase ${phaseIndex}`);
  }

  // 2. Locate upper zone handle
  let upperHandle: HTMLElement | null = null;
  try {
    upperHandle = await waitForElementInside<HTMLElement>(
      phaseContainer,
      '[aria-label="select upper zone"], [aria-label*="upper zone" i]',
      4000
    );
  } catch {
    throw new Error(`Could not find upper zone handle for phase ${phaseIndex}`);
  }

  upperHandle.focus();

  let currentVal = Number(upperHandle.getAttribute('aria-valuenow'));
  logPolar(`Phase ${phaseIndex} initial upper zone: ${currentVal}, target: ${zoneMax}`);

  let attempts = 0;
  const maxAttempts = 10;

  while (currentVal !== zoneMax && attempts < maxAttempts) {
    const key = currentVal < zoneMax ? 'ArrowRight' : 'ArrowLeft';
    const keyCode = key === 'ArrowRight' ? 39 : 37;

    upperHandle.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        code: key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
      })
    );

    upperHandle.dispatchEvent(
      new KeyboardEvent('keyup', {
        key,
        code: key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
      })
    );

    // After every step dispatch both keydown and keyup, then re-read aria-valuenow
    await new Promise((resolve) => setTimeout(resolve, 100));
    currentVal = Number(upperHandle.getAttribute('aria-valuenow'));
    attempts++;
  }

  // Verify final value
  if (currentVal !== zoneMax) {
    throw new Error(
      `Could not set upper zone to ${zoneMax} for phase ${phaseIndex} (final value: ${currentVal})`
    );
  }

  logPolar(`Phase ${phaseIndex} upper zone set and verified at ${currentVal} (zones 1–${currentVal})`);
}

/**
 * Step 11: SAVE
 * Stable selector: #add-target-to-calendar-button
 */
export async function stepSave(): Promise<void> {
  logPolar('11. Clicking Add to Diary...');

  let saveButton: HTMLElement;
  try {
    saveButton = await waitForElement<HTMLElement>('#add-target-to-calendar-button', 5000);
  } catch {
    throw new Error('Add to Diary button not found');
  }

  saveButton.click();
  logPolar('Add to Diary clicked');
}

/**
 * Step 12: SUCCESS VERIFICATION
 *
 * Consider creation successful only if at least one reliable condition occurs:
 * - /target page closes/navigates away
 * - the Add Training Target form disappears
 * - Diary becomes visible
 * - a Polar success confirmation appears
 * Timeout: 10 seconds.
 */
export async function stepVerifySuccess(timeoutMs = 10000): Promise<boolean> {
  logPolar('12. Verifying successful save...');

  const start = Date.now();

  const successOccurred = await new Promise<boolean>((resolve) => {
    // Check repeatedly for any of the reliable success conditions
    const interval = setInterval(() => {
      // 1. /target page navigates away or pathname no longer ends with /target
      const path = window.location.pathname;
      if (!path.includes('/target') || path.startsWith('/diary')) {
        clearInterval(interval);
        resolve(true);
        return;
      }

      // 2. The Add Training Target form / Add to Diary button disappears
      const saveBtn = document.querySelector('#add-target-to-calendar-button');
      if (!saveBtn) {
        clearInterval(interval);
        resolve(true);
        return;
      }

      // 3. Diary becomes visible
      const diaryView = document.querySelector('.diary-view, [data-qa*="diary"], #diary, .calendar-view');
      if (diaryView) {
        clearInterval(interval);
        resolve(true);
        return;
      }

      // 4. Polar success confirmation appears
      const toasts = document.querySelectorAll(
        '.toast, .notification, .alert-success, [data-qa*="notification"], [data-qa*="toast"], .flash-message, [role="alert"]'
      );
      for (const t of Array.from(toasts)) {
        const txt = (t.textContent || '').toLowerCase();
        if (
          txt.includes('saved') ||
          txt.includes('tallennettu') ||
          txt.includes('onnistui') ||
          txt.includes('gespeichert') ||
          txt.includes('success')
        ) {
          clearInterval(interval);
          resolve(true);
          return;
        }
      }

      // Timeout check
      if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 250);
  });

  if (successOccurred) {
    logPolar('Polar save successfully verified!');
  }
  return successOccurred;
}

// ============================================================================
// Phase Flattening (Repeat Blocks)
// ============================================================================

/**
 * Converts a workout phase list into a flat list containing ONLY normal phases
 * by recursively expanding repeat blocks.
 *
 * Rules:
 * 1. Normal phase: add directly to output (shallow copied).
 * 2. Repeat block: repeat its child phases exactly repeat.repetitions times.
 * 3. Preserve the original order.
 * 4. Support nested repeat blocks recursively.
 * 5. Do NOT mutate the original Workout JSON.
 *
 * Phase names:
 * Preserves the original phase names without modifying or appending indices.
 */
export function flattenPhases(
  phases: (PolarWorkoutPhase | Record<string, unknown>)[]
): PolarWorkoutPhase[] {
  if (!Array.isArray(phases)) return [];

  const result: PolarWorkoutPhase[] = [];

  for (const item of phases) {
    if (!item) continue;

    const isRepeat =
      item.type === 'repeat' ||
      (Array.isArray(item.phases) && (item.repetitions != null || item.repeatCount != null));

    if (isRepeat && Array.isArray(item.phases)) {
      const childFlat = flattenPhases(item.phases);
      const rawReps = item.repetitions ?? item.repeatCount ?? 1;
      const reps = Math.max(1, Math.floor(Number(rawReps)));

      for (let r = 0; r < reps; r++) {
        for (const child of childFlat) {
          result.push({ ...child });
        }
      }
    } else {
      // Normal phase
      result.push({ ...(item as PolarWorkoutPhase) });
    }
  }

  return result;
}

// ============================================================================
// Main Pipeline: Multiple time-based and distance-based phases
// ============================================================================

export async function createPhasedTargetInPolarFlow(
  workout?: PolarWorkoutData
): Promise<{ success: boolean; error?: string; message?: string }> {
  let workflowStage: PolarWorkflowStage = 'INITIALIZING';
  let sportSelectionCompleted = false;
  let phasedSelectionCompleted = false;

  try {
    if (!isPolarFlowHost()) {
      workflowStage = 'FAILED';
      return { success: false, error: 'Current tab is not Polar Flow (flow.polar.com)' };
    }

    if (!checkIsLoggedIn()) {
      workflowStage = 'FAILED';
      return { success: false, error: 'Please log in to Polar Flow first.' };
    }

    if (!workout) {
      workflowStage = 'FAILED';
      return { success: false, error: 'No workout data provided' };
    }

    // SAFETY: Before starting Polar automation, flatten repeat blocks into flat phases
    const flatPhases = flattenPhases(workout.phases || []);

    if (flatPhases.length === 0) {
      workflowStage = 'FAILED';
      return { success: false, error: 'No phases found in workout' };
    }

    // Temporary safety limit
    if (flatPhases.length > 50) {
      workflowStage = 'FAILED';
      throw new Error(
        'Workout contains more than 50 phases after expanding repetitions.'
      );
    }

    const phasesToCreate = flatPhases;

    // Workflow stage: TARGET_PAGE_READY
    workflowStage = 'TARGET_PAGE_READY';
    logPolar('Stage: TARGET_PAGE_READY');

    // Workflow stage: FORM_FILLING
    workflowStage = 'FORM_FILLING';
    logPolar('Stage: FORM_FILLING');

    // 1. SELECT RUNNING
    // "Sport picker not found" is a valid error ONLY during FORM_FILLING, before Running has successfully been selected.
    await stepSelectRunning();
    sportSelectionCompleted = true;
    logPolar('Sport selection completed (Running verified). Never rechecking #sport-picker again.');

    // 2. TARGET NAME
    await stepTargetName(workout.name || 'Workout');

    // 3. DATE
    await stepDate(workout.date || new Date().toISOString().slice(0, 10));

    // 4. START TIME
    await stepStartTime(workout.startTime || '08:00');

    // 5. SELECT PHASED
    await stepSelectPhased();
    phasedSelectionCompleted = true;
    logPolar('Phased selection completed. Never rechecking #target-type-option-phased again.');

    // Workflow stage: PHASES_CREATING
    workflowStage = 'PHASES_CREATING';
    logPolar('Stage: PHASES_CREATING');

    // Iterate through supported phases in original order
    for (let i = 0; i < phasesToCreate.length; i++) {
      const phaseIndex = i + 1; // 1-based index for logs and errors
      const phase = phasesToCreate[i];
      const isDistance =
        phase.durationType === 'distance' ||
        (!phase.durationType && (phase.distanceMeters != null || (typeof phase.distance === 'number' && phase.distance > 100)));

      logPolar(
        `--- Creating phase ${phaseIndex}/${phasesToCreate.length}: "${phase.name}" (${isDistance ? 'distance' : 'time'}) ---`
      );

      let phaseContainer: HTMLElement;

      if (isDistance) {
        // Distance phase: click .add-distance-phase-button
        phaseContainer = await stepAddDistancePhase(phaseIndex);

        // Expand phase
        await stepExpandPhase(phaseContainer, phaseIndex, 'distance');

        // Set Phase name
        await stepPhaseName(phase.name || `Phase ${phaseIndex}`, phaseContainer, phaseIndex);

        // Set Distance (meters converted to km)
        const rawDistance =
          phase.distanceMeters ??
          (typeof phase.duration === 'number' ? phase.duration : 2000);
        await stepSetDistance(rawDistance, phaseContainer, phaseIndex);
      } else {
        // Time phase: click .add-duration-phase-button
        phaseContainer = await stepAddDurationPhase(phaseIndex);

        // Expand phase
        await stepExpandPhase(phaseContainer, phaseIndex, 'time');

        // Set Phase name
        await stepPhaseName(phase.name || `Phase ${phaseIndex}`, phaseContainer, phaseIndex);

        // Set Duration
        const durationSeconds =
          phase.durationSeconds ??
          (typeof phase.duration === 'number' ? phase.duration : 600);
        await stepSetDuration(durationSeconds, phaseContainer, phaseIndex);
      }

      // Intensity Type (Heart rate | Speed)
      const targetIntensity = getTargetIntensityType(phase.intensityType);
      if (targetIntensity) {
        await stepSelectIntensity(phaseContainer, targetIntensity, phaseIndex);
      }

      // Enable Training Zones (Ensure checked === true)
      await stepEnableTrainingZones(phaseContainer, phaseIndex);

      // Cumulative Upper Zone Handling (Z1 -> 1-1, Z2 -> 1-2, etc.)
      const upperZone = getUpperZone(phase);
      if (targetIntensity && upperZone != null) {
        await stepSetUpperZone(phaseContainer, upperZone, phaseIndex);
      }
    }

    // VALIDATION:
    // After all phases are created, verify:
    // number of .phase-container elements === number of supported phases in workout.phases
    const allContainers = Array.from(document.querySelectorAll<HTMLElement>('.phase-container'));
    if (allContainers.length !== phasesToCreate.length) {
      logPolar(
        `Validation failed: expected ${phasesToCreate.length} containers, found ${allContainers.length}`
      );
      throw new Error(`Could not create phase ${allContainers.length + 1}`);
    }

    // Verify each phase independently
    for (let i = 0; i < phasesToCreate.length; i++) {
      const phaseIndex = i + 1;
      const phase = phasesToCreate[i];
      const container = allContainers[i];
      const isDistance =
        phase.durationType === 'distance' ||
        (!phase.durationType && (phase.distanceMeters != null || (typeof phase.distance === 'number' && phase.distance > 100)));

      const nameVal = container.querySelector<HTMLInputElement>('.name-input')?.value;
      if (nameVal !== phase.name) {
        throw new Error(`Could not set name for phase ${phaseIndex}`);
      }

      if (isDistance) {
        const rawDistance =
          phase.distanceMeters ??
          (typeof phase.duration === 'number' ? phase.duration : 2000);
        const expectedKm = rawDistance / 1000;
        const distVal = container.querySelector<HTMLInputElement>(
          '.phase-settings-input.distance'
        )?.value?.trim();
        const distNum = parseFloat(distVal || '');
        if (distVal !== String(expectedKm) && distNum !== expectedKm) {
          throw new Error(`Could not set distance for phase ${phaseIndex}`);
        }
      } else {
        const durationSeconds =
          phase.durationSeconds ??
          (typeof phase.duration === 'number' ? phase.duration : 600);
        const expectedDuration = formatPolarDuration(durationSeconds);
        const durVal = container.querySelector<HTMLInputElement>(
          '.phase-settings-input.duration'
        )?.value;
        if (durVal !== expectedDuration) {
          throw new Error(`Could not set duration for phase ${phaseIndex}`);
        }
      }

      // Verify zones if supported intensity and upper zone were specified
      const targetIntensity = getTargetIntensityType(phase.intensityType);
      const upperZone = getUpperZone(phase);
      if (targetIntensity && upperZone != null) {
        const lowerHandle = container.querySelector(
          '[aria-label="select lower zone"], [aria-label*="lower zone" i]'
        );
        if (lowerHandle && lowerHandle.getAttribute('aria-valuenow') !== '1') {
          throw new Error(`Lower zone is not 1 for phase ${phaseIndex}`);
        }
        const upperHandle = container.querySelector(
          '[aria-label="select upper zone"], [aria-label*="upper zone" i]'
        );
        if (upperHandle && Number(upperHandle.getAttribute('aria-valuenow')) !== upperZone) {
          throw new Error(`Upper zone is not ${upperZone} for phase ${phaseIndex}`);
        }
      }
    }

    logPolar(`All ${phasesToCreate.length} phases created and verified successfully.`);

    // Workflow stage: READY_TO_SAVE
    workflowStage = 'READY_TO_SAVE';
    logPolar('Stage: READY_TO_SAVE');

    let saveButton: HTMLElement;
    try {
      saveButton = await waitForElement<HTMLElement>('#add-target-to-calendar-button', 5000);
    } catch {
      throw new Error('Add to Diary button not found');
    }

    // Workflow stage: SAVING
    // Immediately before clicking: #add-target-to-calendar-button set: workflowStage = "SAVING"
    workflowStage = 'SAVING';
    logPolar('Stage: SAVING. Clicking Add to Diary...');
    saveButton.click();

    // After clicking, wait for a reliable success signal.
    // Success can be:
    // - URL changes away from /target
    // - target creation form disappears / Add to Diary button disappears
    // - Diary becomes visible
    // - Polar success confirmation appears
    const saveSucceeded = await stepVerifySuccess(10000);

    if (saveSucceeded) {
      workflowStage = 'SUCCESS';
      logPolar('Stage: SUCCESS. Save confirmed! Stopping all automation and validation immediately.');
      return {
        success: true,
      };
    }

    // Check if URL navigated away or save button disappeared
    const currentPath = window.location.pathname;
    const saveBtnGone = !document.querySelector('#add-target-to-calendar-button');
    if (!currentPath.includes('/target') || currentPath.startsWith('/diary') || saveBtnGone) {
      workflowStage = 'SUCCESS';
      logPolar('Stage: SUCCESS. Save confirmed by URL change / form disappearance.');
      return {
        success: true,
      };
    }

    throw new Error('Polar did not confirm that the workout was saved.');
  } catch (err) {
    // ERROR PRIORITY:
    // If Polar confirms that the workout was saved: SUCCESS always wins.
    // Do not return an earlier or delayed DOM error after successful save.
    if (workflowStage === 'SUCCESS') {
      return { success: true };
    }

    // If workflow was in SAVING stage, check if the workout was actually saved
    if (workflowStage === 'SAVING') {
      const currentPath = window.location.pathname;
      const saveBtnGone = !document.querySelector('#add-target-to-calendar-button');
      const diaryVisible = !!document.querySelector('.diary-view, [data-qa*="diary"], #diary, .calendar-view');
      if (!currentPath.includes('/target') || currentPath.startsWith('/diary') || saveBtnGone || diaryVisible) {
        logPolar('Save confirmed during SAVING error check. Suppressing error and returning SUCCESS.');
        workflowStage = 'SUCCESS';
        return { success: true };
      }
    }

    workflowStage = 'FAILED';
    const errorMsg = err instanceof Error ? err.message : String(err);
    logPolar('Step failed with error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

