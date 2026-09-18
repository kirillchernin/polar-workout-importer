(() => {
  // src/polarSelectors.ts
  function logPolar(message, ...args) {
    console.log(`[Polar Extension] ${message}`, ...args);
  }
  async function waitForElement(selector, timeout = 5e3) {
    const existing = document.querySelector(selector);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true
      });
    });
  }
  async function waitForElementInside(parent, selector, timeout = 5e3) {
    const existing = parent.querySelector(selector);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element inside container: ${selector}`));
      }, timeout);
      const observer = new MutationObserver(() => {
        const el = parent.querySelector(selector);
        if (el) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(parent, {
        childList: true,
        subtree: true,
        attributes: true
      });
    });
  }
  function formatPolarDuration(secondsOrDuration) {
    let totalSeconds = 0;
    if (typeof secondsOrDuration === "number") {
      totalSeconds = Math.max(0, Math.floor(secondsOrDuration));
    } else if (typeof secondsOrDuration === "string") {
      if (/^\d{2}:\d{2}:\d{2}$/.test(secondsOrDuration.trim())) {
        return secondsOrDuration.trim();
      }
      if (/^\d{1,2}:\d{2}$/.test(secondsOrDuration.trim())) {
        const parts = secondsOrDuration.trim().split(":");
        const mm2 = parts[0].padStart(2, "0");
        const ss2 = parts[1];
        return `00:${mm2}:${ss2}`;
      }
      const parsed = parseInt(secondsOrDuration, 10);
      totalSeconds = isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  function isPolarFlowHost(urlStr = window.location.href) {
    try {
      const url = new URL(urlStr);
      return url.hostname === "flow.polar.com" || url.hostname.endsWith(".polar.com");
    } catch {
      return false;
    }
  }
  function checkIsLoggedIn() {
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
      "#header-user",
      ".user-profile"
    ];
    for (const sel of authSelectors) {
      if (document.querySelector(sel)) return true;
    }
    const path = window.location.pathname;
    if (path.startsWith("/target") || path.startsWith("/diary") || path.startsWith("/training-target") || path.startsWith("/feed")) {
      return true;
    }
    return false;
  }
  function checkTargetPageReady() {
    const sportPicker = document.querySelector("#sport-picker");
    const nameField = document.querySelector("#name-field");
    const dateField = document.querySelector("#date-field");
    const timeField = document.querySelector("#time-field");
    const targetPhased = document.querySelector("#target-type-option-phased");
    const ready = !!(sportPicker && nameField && dateField && timeField && targetPhased);
    logPolar("Target page readiness verification:", {
      hasSportPicker: !!sportPicker,
      hasNameField: !!nameField,
      hasDateField: !!dateField,
      hasTimeField: !!timeField,
      hasTargetPhased: !!targetPhased,
      ready
    });
    return ready ? { ready: true, status: "TARGET_PAGE_READY" } : { ready: false };
  }
  async function stepSelectRunning() {
    logPolar("1. Selecting Running...");
    let sportInput;
    try {
      sportInput = await waitForElement("#sport-picker input", 6e3);
    } catch {
      throw new Error("Sport picker not found");
    }
    sportInput.focus();
    sportInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        bubbles: true
      })
    );
    let running;
    try {
      await waitForElement(".sport-picker__option", 5e3);
      const options = Array.from(document.querySelectorAll(".sport-picker__option"));
      running = options.find((el) => el.textContent?.trim() === "Running");
    } catch {
      throw new Error("Running option not found");
    }
    if (!running) {
      throw new Error("Running option not found");
    }
    running.click();
    const sportPicker = document.querySelector("#sport-picker");
    if (!sportPicker || !sportPicker.textContent?.includes("Running")) {
      const verified = await new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
          const picker = document.querySelector("#sport-picker");
          if (picker && picker.textContent?.includes("Running")) {
            clearInterval(interval);
            resolve(true);
          } else if (Date.now() - start > 3e3) {
            clearInterval(interval);
            resolve(false);
          }
        }, 150);
      });
      if (!verified) {
        throw new Error("Running option not found");
      }
    }
    logPolar("Running selected and verified");
  }
  async function stepTargetName(name) {
    logPolar("2. Setting Target Name:", name);
    let nameField;
    try {
      nameField = await waitForElement("#name-field", 5e3);
    } catch {
      throw new Error("Target name field not found");
    }
    nameField.focus();
    nameField.value = name;
    nameField.dispatchEvent(new Event("input", { bubbles: true }));
    nameField.dispatchEvent(new Event("change", { bubbles: true }));
    nameField.blur();
    if (nameField.value !== name) {
      throw new Error("Target name field not found");
    }
    logPolar("Target name set successfully");
  }
  var MONTH_NAMES = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];
  function parseSwitchDaysText(text) {
    const clean = text.trim().toLowerCase();
    const yearMatch = clean.match(/\b(20\d\d)\b/);
    if (!yearMatch) return null;
    const year = parseInt(yearMatch[1], 10);
    for (let m = 0; m < MONTH_NAMES.length; m++) {
      if (clean.includes(MONTH_NAMES[m])) {
        return { year, month: m + 1 };
      }
    }
    const multilingualMonths = {
      tammikuu: 1,
      januar: 1,
      janvier: 1,
      helmikuu: 2,
      februar: 2,
      f\u00E9vrier: 2,
      maaliskuu: 3,
      m\u00E4rz: 3,
      mars: 3,
      huhtikuu: 4,
      avril: 4,
      toukokuu: 5,
      mai: 5,
      kes\u00E4kuu: 6,
      juni: 6,
      juin: 6,
      hein\u00E4kuu: 7,
      juli: 7,
      juillet: 7,
      elokuu: 8,
      august: 8,
      ao\u00FBt: 8,
      syyskuu: 9,
      septembre: 9,
      lokakuu: 10,
      oktober: 10,
      octobre: 10,
      marraskuu: 11,
      novembre: 11,
      joulukuu: 12,
      dezember: 12,
      d\u00E9cembre: 12
    };
    for (const [mName, mNum] of Object.entries(multilingualMonths)) {
      if (clean.includes(mName)) {
        return { year, month: mNum };
      }
    }
    return null;
  }
  function isElementVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  async function selectPolarDate(dateString) {
    logPolar("3. Selecting Polar Date via date picker:", dateString);
    const trimmed = dateString.trim();
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    let reqYear;
    let reqMonth;
    let reqDay;
    if (match) {
      reqYear = parseInt(match[1], 10);
      reqMonth = parseInt(match[2], 10);
      reqDay = parseInt(match[3], 10);
    } else {
      const ddmmyyyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (ddmmyyyy) {
        reqDay = parseInt(ddmmyyyy[1], 10);
        reqMonth = parseInt(ddmmyyyy[2], 10);
        reqYear = parseInt(ddmmyyyy[3], 10);
      } else {
        const now = /* @__PURE__ */ new Date();
        reqYear = now.getFullYear();
        reqMonth = now.getMonth() + 1;
        reqDay = now.getDate();
      }
    }
    let dateField;
    try {
      dateField = await waitForElement("#date-field", 5e3);
    } catch {
      throw new Error("Date field not found");
    }
    dateField.focus();
    dateField.click();
    let switchDaysEl;
    try {
      await waitForElement(".picker-switch-days", 5e3);
      const switchDays = document.querySelector(".picker-switch-days");
      if (!switchDays) {
        throw new Error("Polar date picker did not open");
      }
      const visible = await new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
          const el = document.querySelector(".picker-switch-days");
          if (el && isElementVisible(el)) {
            clearInterval(interval);
            resolve(true);
          } else if (Date.now() - start > 3e3) {
            clearInterval(interval);
            resolve(Boolean(el));
          }
        }, 100);
      });
      if (!visible) {
        throw new Error("Polar date picker did not open");
      }
      switchDaysEl = document.querySelector(".picker-switch-days");
    } catch {
      throw new Error("Polar date picker did not open");
    }
    const targetTotalMonths = reqYear * 12 + reqMonth;
    const maxNavClicks = 120;
    let clicks = 0;
    while (clicks < maxNavClicks) {
      const currentText = switchDaysEl.textContent || "";
      const parsed = parseSwitchDaysText(currentText);
      if (!parsed) {
        logPolar("Could not parse month text:", currentText);
        throw new Error("Could not navigate Polar calendar to requested month");
      }
      const currentTotalMonths = parsed.year * 12 + parsed.month;
      if (currentTotalMonths === targetTotalMonths) {
        break;
      }
      const prevBtn = document.querySelector(".picker-previous-button");
      const nextBtn = document.querySelector(".picker-next-button");
      const prevText = currentText;
      if (currentTotalMonths < targetTotalMonths) {
        if (!nextBtn) {
          throw new Error("Could not navigate Polar calendar to requested month");
        }
        nextBtn.click();
      } else {
        if (!prevBtn) {
          throw new Error("Could not navigate Polar calendar to requested month");
        }
        prevBtn.click();
      }
      const changed = await new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
          const freshSwitch = document.querySelector(".picker-switch-days");
          if (freshSwitch && (freshSwitch.textContent || "") !== prevText) {
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
        throw new Error("Could not navigate Polar calendar to requested month");
      }
      clicks++;
    }
    if (clicks >= maxNavClicks) {
      throw new Error("Could not navigate Polar calendar to requested month");
    }
    const dayElements = Array.from(document.querySelectorAll("td.day")).filter(
      (el) => !el.classList.contains("old") && !el.classList.contains("new")
    );
    const targetDay = dayElements.find((el) => Number(el.textContent?.trim()) === reqDay);
    if (!targetDay) {
      throw new Error("Requested day not found in Polar calendar");
    }
    logPolar(`Clicking day ${reqDay}...`);
    targetDay.click();
    const verified = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const val = dateField.value?.trim();
        if (val && val.length > 0) {
          const dayPadded = String(reqDay).padStart(2, "0");
          const dayUnpadded = String(reqDay);
          if (val.includes(dayPadded) || val.includes(dayUnpadded) || val.includes(String(reqYear))) {
            clearInterval(interval);
            resolve(true);
            return;
          }
        }
        if (Date.now() - start > 3e3) {
          clearInterval(interval);
          resolve(Boolean(dateField.value?.trim()));
        }
      }, 100);
    });
    if (!verified || !dateField.value?.trim()) {
      throw new Error("Polar date selection could not be verified");
    }
    logPolar("Polar date selected and verified via UI picker:", dateField.value);
  }
  var stepDate = selectPolarDate;
  async function stepStartTime(startTime = "08:00") {
    logPolar("4. Setting Start Time:", startTime);
    let timeField;
    try {
      timeField = await waitForElement("#time-field", 5e3);
    } catch {
      throw new Error("Start time field not found");
    }
    timeField.focus();
    timeField.value = startTime;
    timeField.dispatchEvent(new Event("input", { bubbles: true }));
    timeField.dispatchEvent(new Event("change", { bubbles: true }));
    timeField.blur();
    if (timeField.value !== startTime) {
      logPolar(`Notice: timeField.value is "${timeField.value}", expected "${startTime}"`);
    }
    logPolar("Start time set successfully");
  }
  async function stepSelectPhased() {
    logPolar("5. Selecting Phased target type...");
    let phasedOption;
    try {
      phasedOption = await waitForElement("#target-type-option-phased", 5e3);
    } catch {
      throw new Error("Phased target button not found");
    }
    phasedOption.click();
    try {
      await waitForElement(".add-duration-phase-button", 5e3);
    } catch {
      throw new Error("Phased target button not found");
    }
    logPolar("Phased selected and .add-duration-phase-button visible");
  }
  async function stepAddDurationPhase(phaseIndex = 1) {
    logPolar(`Adding duration phase ${phaseIndex}...`);
    const initialContainers = Array.from(document.querySelectorAll(".phase-container"));
    const initialCount = initialContainers.length;
    let addDurationBtn;
    try {
      addDurationBtn = await waitForElement(".add-duration-phase-button", 5e3);
    } catch {
      throw new Error(`Could not create phase ${phaseIndex}`);
    }
    addDurationBtn.click();
    const newCountReached = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const currentContainers = document.querySelectorAll(".phase-container");
        if (currentContainers.length === initialCount + 1) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > 5e3) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
    if (!newCountReached) {
      throw new Error(`Could not create phase ${phaseIndex}`);
    }
    const phaseContainers = Array.from(document.querySelectorAll(".phase-container"));
    const newContainer = phaseContainers[phaseContainers.length - 1];
    if (!newContainer) {
      throw new Error(`Could not create phase ${phaseIndex}`);
    }
    logPolar(`Duration phase ${phaseIndex} added. Container count: ${phaseContainers.length}`);
    return newContainer;
  }
  async function stepAddDistancePhase(phaseIndex = 1) {
    logPolar(`Adding distance phase ${phaseIndex}...`);
    const initialContainers = Array.from(document.querySelectorAll(".phase-container"));
    const initialCount = initialContainers.length;
    let addDistanceBtn;
    try {
      addDistanceBtn = await waitForElement(".add-distance-phase-button", 5e3);
    } catch {
      throw new Error(`Could not create phase ${phaseIndex}`);
    }
    addDistanceBtn.click();
    const newCountReached = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const currentContainers = document.querySelectorAll(".phase-container");
        if (currentContainers.length === initialCount + 1) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > 5e3) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
    if (!newCountReached) {
      throw new Error(`Could not create phase ${phaseIndex}`);
    }
    const phaseContainers = Array.from(document.querySelectorAll(".phase-container"));
    const newContainer = phaseContainers[phaseContainers.length - 1];
    if (!newContainer) {
      throw new Error(`Could not create phase ${phaseIndex}`);
    }
    logPolar(`Distance phase ${phaseIndex} added. Container count: ${phaseContainers.length}`);
    return newContainer;
  }
  async function stepExpandPhase(phaseContainer, phaseIndex = 1, durationType = "time") {
    logPolar(`Expanding phase ${phaseIndex} (${durationType})...`);
    const inputSelector = durationType === "distance" ? ".phase-settings-input.distance" : ".phase-settings-input.duration";
    if (phaseContainer.querySelector(inputSelector)) {
      logPolar(`Phase ${phaseIndex} is already expanded`);
      return;
    }
    const expandBtn = phaseContainer.querySelector('[aria-label="expand"]');
    if (expandBtn) {
      expandBtn.click();
    }
    const expanded = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (phaseContainer.querySelector(".phase-settings-input.duration") || phaseContainer.querySelector(".phase-settings-input.distance")) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > 5e3) {
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
  async function stepPhaseName(name, phaseContainer, phaseIndex = 1) {
    logPolar(`Setting Phase ${phaseIndex} Name:`, name);
    const phaseNameField = phaseContainer.querySelector(".name-input");
    if (!phaseNameField) {
      throw new Error(`Could not set name for phase ${phaseIndex}`);
    }
    phaseNameField.focus();
    phaseNameField.value = name;
    phaseNameField.dispatchEvent(new Event("input", { bubbles: true }));
    phaseNameField.dispatchEvent(new Event("change", { bubbles: true }));
    phaseNameField.blur();
    const currentVal = phaseContainer.querySelector(".name-input")?.value;
    if (currentVal !== name) {
      throw new Error(`Could not set name for phase ${phaseIndex}`);
    }
    logPolar(`Phase ${phaseIndex} name set successfully and verified:`, name);
  }
  async function stepSetDuration(durationInSeconds, phaseContainer, phaseIndex = 1) {
    logPolar(`Setting Phase ${phaseIndex} Duration:`, durationInSeconds);
    const durationField = phaseContainer.querySelector(
      ".phase-settings-input.duration"
    );
    if (!durationField) {
      throw new Error(`Could not set duration for phase ${phaseIndex}`);
    }
    const formattedDuration = formatPolarDuration(durationInSeconds ?? 600);
    durationField.focus();
    durationField.value = formattedDuration;
    durationField.dispatchEvent(new Event("input", { bubbles: true }));
    durationField.dispatchEvent(new Event("change", { bubbles: true }));
    durationField.blur();
    const currentVal = phaseContainer.querySelector(
      ".phase-settings-input.duration"
    )?.value;
    if (currentVal !== formattedDuration) {
      throw new Error(`Could not set duration for phase ${phaseIndex}`);
    }
    logPolar(`Phase ${phaseIndex} duration set successfully and verified:`, formattedDuration);
  }
  async function stepSetDistance(distanceInMeters, phaseContainer, phaseIndex = 1) {
    logPolar(`Setting Phase ${phaseIndex} Distance:`, distanceInMeters);
    const distanceField = phaseContainer.querySelector(
      ".phase-settings-input.distance"
    );
    if (!distanceField) {
      throw new Error(`Could not set distance for phase ${phaseIndex}`);
    }
    let metersNum = 1e3;
    if (typeof distanceInMeters === "number") {
      metersNum = distanceInMeters;
    } else if (typeof distanceInMeters === "string") {
      const parsed = parseFloat(distanceInMeters);
      metersNum = isNaN(parsed) ? 1e3 : parsed;
    }
    const distanceKm = metersNum / 1e3;
    const expectedDistanceStr = String(distanceKm);
    distanceField.focus();
    distanceField.value = expectedDistanceStr;
    distanceField.dispatchEvent(new Event("input", { bubbles: true }));
    distanceField.dispatchEvent(new Event("change", { bubbles: true }));
    distanceField.blur();
    const currentVal = phaseContainer.querySelector(
      ".phase-settings-input.distance"
    )?.value?.trim();
    const currentNum = parseFloat(currentVal || "");
    if (currentVal !== expectedDistanceStr && currentNum !== distanceKm) {
      throw new Error(`Could not set distance for phase ${phaseIndex}`);
    }
    logPolar(`Phase ${phaseIndex} distance set successfully and verified:`, currentVal);
  }
  async function stepEnableTrainingZones(phaseContainer, phaseIndex = 1) {
    logPolar(`Enabling training zones for phase ${phaseIndex}...`);
    const zonesCheckbox = phaseContainer.querySelector(
      'input[id^="use-training-zones-"]'
    );
    if (!zonesCheckbox) {
      throw new Error(`Could not enable training zones for phase ${phaseIndex}`);
    }
    if (!zonesCheckbox.checked) {
      zonesCheckbox.click();
    }
    if (zonesCheckbox.checked !== true) {
      throw new Error(`Could not enable training zones for phase ${phaseIndex}`);
    }
    logPolar(`Training zones enabled and verified for phase ${phaseIndex} (checked === true)`);
  }
  function getTargetIntensityType(intensityType) {
    if (!intensityType) return null;
    const lower = intensityType.toLowerCase().trim().replace(/[\s-]+/g, "_");
    if (lower === "heart_rate" || lower === "heartrate") {
      return "Heart rate";
    }
    if (lower === "speed") {
      return "Speed";
    }
    return null;
  }
  function getUpperZone(phase) {
    if (phase.zoneMax != null) {
      const parsed = Number(phase.zoneMax);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
    }
    if (typeof phase.targetZone === "number" && phase.targetZone >= 1 && phase.targetZone <= 5) {
      return phase.targetZone;
    }
    if (typeof phase.heartRateZone === "number" && phase.heartRateZone >= 1 && phase.heartRateZone <= 5) {
      return phase.heartRateZone;
    }
    if (typeof phase.paceZone === "number" && phase.paceZone >= 1 && phase.paceZone <= 5) {
      return phase.paceZone;
    }
    return null;
  }
  async function stepSelectIntensity(phaseContainer, targetType, phaseIndex = 1) {
    logPolar(`Setting Phase ${phaseIndex} Intensity to "${targetType}"...`);
    const selectWrapper = phaseContainer.querySelector(
      '.select-component, [class*="select-component"], .intensity-select'
    );
    if (selectWrapper && selectWrapper.textContent?.includes(targetType)) {
      logPolar(`Phase ${phaseIndex} intensity is already "${targetType}"`);
      return;
    }
    let selectField = phaseContainer.querySelector(
      '.select-component input, [class*="select-component"] input'
    );
    if (!selectField) {
      selectField = phaseContainer.querySelector(
        'input[aria-autocomplete="list"], input[id*="react-select"]'
      );
    }
    if (!selectField) {
      throw new Error(`Could not find intensity selector for phase ${phaseIndex}`);
    }
    selectField.focus();
    const control = selectWrapper?.querySelector('[class*="control"]') || selectField;
    control.click();
    selectField.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        which: 40,
        bubbles: true
      })
    );
    let targetOption;
    try {
      await waitForElement(".select-component__option", 5e3);
      const options = Array.from(
        document.querySelectorAll(".select-component__option")
      );
      targetOption = options.find((el) => el.textContent?.trim() === targetType);
    } catch {
      throw new Error(`Could not find intensity option "${targetType}" for phase ${phaseIndex}`);
    }
    if (!targetOption) {
      throw new Error(`Could not find intensity option "${targetType}" for phase ${phaseIndex}`);
    }
    targetOption.click();
    const verified = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const current = phaseContainer.querySelector(
          '.select-component, [class*="select-component"], .intensity-select'
        );
        if (current && current.textContent?.includes(targetType)) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start > 3e3) {
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
  async function stepSetUpperZone(phaseContainer, zoneMax, phaseIndex = 1) {
    logPolar(`Setting Phase ${phaseIndex} upper zone to ${zoneMax}...`);
    let lowerHandle = null;
    try {
      lowerHandle = await waitForElementInside(
        phaseContainer,
        '[aria-label="select lower zone"], [aria-label*="lower zone" i]',
        4e3
      );
    } catch {
      throw new Error(`Could not find lower zone handle for phase ${phaseIndex}`);
    }
    const lowerVal = lowerHandle.getAttribute("aria-valuenow");
    if (lowerVal !== "1") {
      throw new Error(`Lower zone is unexpectedly ${lowerVal} (expected 1) for phase ${phaseIndex}`);
    }
    let upperHandle = null;
    try {
      upperHandle = await waitForElementInside(
        phaseContainer,
        '[aria-label="select upper zone"], [aria-label*="upper zone" i]',
        4e3
      );
    } catch {
      throw new Error(`Could not find upper zone handle for phase ${phaseIndex}`);
    }
    upperHandle.focus();
    let currentVal = Number(upperHandle.getAttribute("aria-valuenow"));
    logPolar(`Phase ${phaseIndex} initial upper zone: ${currentVal}, target: ${zoneMax}`);
    let attempts = 0;
    const maxAttempts = 10;
    while (currentVal !== zoneMax && attempts < maxAttempts) {
      const key = currentVal < zoneMax ? "ArrowRight" : "ArrowLeft";
      const keyCode = key === "ArrowRight" ? 39 : 37;
      upperHandle.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true
        })
      );
      upperHandle.dispatchEvent(
        new KeyboardEvent("keyup", {
          key,
          code: key,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      currentVal = Number(upperHandle.getAttribute("aria-valuenow"));
      attempts++;
    }
    if (currentVal !== zoneMax) {
      throw new Error(
        `Could not set upper zone to ${zoneMax} for phase ${phaseIndex} (final value: ${currentVal})`
      );
    }
    logPolar(`Phase ${phaseIndex} upper zone set and verified at ${currentVal} (zones 1\u2013${currentVal})`);
  }
  async function stepVerifySuccess(timeoutMs = 1e4) {
    logPolar("12. Verifying successful save...");
    const start = Date.now();
    const successOccurred = await new Promise((resolve) => {
      const interval = setInterval(() => {
        const path = window.location.pathname;
        if (!path.includes("/target") || path.startsWith("/diary")) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        const saveBtn = document.querySelector("#add-target-to-calendar-button");
        if (!saveBtn) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        const diaryView = document.querySelector('.diary-view, [data-qa*="diary"], #diary, .calendar-view');
        if (diaryView) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        const toasts = document.querySelectorAll(
          '.toast, .notification, .alert-success, [data-qa*="notification"], [data-qa*="toast"], .flash-message, [role="alert"]'
        );
        for (const t of Array.from(toasts)) {
          const txt = (t.textContent || "").toLowerCase();
          if (txt.includes("saved") || txt.includes("tallennettu") || txt.includes("onnistui") || txt.includes("gespeichert") || txt.includes("success")) {
            clearInterval(interval);
            resolve(true);
            return;
          }
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 250);
    });
    if (successOccurred) {
      logPolar("Polar save successfully verified!");
    }
    return successOccurred;
  }
  function flattenPhases(phases) {
    if (!Array.isArray(phases)) return [];
    const result = [];
    for (const item of phases) {
      if (!item) continue;
      const isRepeat = item.type === "repeat" || Array.isArray(item.phases) && (item.repetitions != null || item.repeatCount != null);
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
        result.push({ ...item });
      }
    }
    return result;
  }
  async function createPhasedTargetInPolarFlow(workout) {
    let workflowStage = "INITIALIZING";
    let sportSelectionCompleted = false;
    let phasedSelectionCompleted = false;
    try {
      if (!isPolarFlowHost()) {
        workflowStage = "FAILED";
        return { success: false, error: "Current tab is not Polar Flow (flow.polar.com)" };
      }
      if (!checkIsLoggedIn()) {
        workflowStage = "FAILED";
        return { success: false, error: "Please log in to Polar Flow first." };
      }
      if (!workout) {
        workflowStage = "FAILED";
        return { success: false, error: "No workout data provided" };
      }
      const flatPhases = flattenPhases(workout.phases || []);
      if (flatPhases.length === 0) {
        workflowStage = "FAILED";
        return { success: false, error: "No phases found in workout" };
      }
      if (flatPhases.length > 50) {
        workflowStage = "FAILED";
        throw new Error(
          "Workout contains more than 50 phases after expanding repetitions."
        );
      }
      const phasesToCreate = flatPhases;
      workflowStage = "TARGET_PAGE_READY";
      logPolar("Stage: TARGET_PAGE_READY");
      workflowStage = "FORM_FILLING";
      logPolar("Stage: FORM_FILLING");
      await stepSelectRunning();
      sportSelectionCompleted = true;
      logPolar("Sport selection completed (Running verified). Never rechecking #sport-picker again.");
      await stepTargetName(workout.name || "Workout");
      await stepDate(workout.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
      await stepStartTime(workout.startTime || "08:00");
      await stepSelectPhased();
      phasedSelectionCompleted = true;
      logPolar("Phased selection completed. Never rechecking #target-type-option-phased again.");
      workflowStage = "PHASES_CREATING";
      logPolar("Stage: PHASES_CREATING");
      for (let i = 0; i < phasesToCreate.length; i++) {
        const phaseIndex = i + 1;
        const phase = phasesToCreate[i];
        const isDistance = phase.durationType === "distance" || !phase.durationType && (phase.distanceMeters != null || typeof phase.distance === "number" && phase.distance > 100);
        logPolar(
          `--- Creating phase ${phaseIndex}/${phasesToCreate.length}: "${phase.name}" (${isDistance ? "distance" : "time"}) ---`
        );
        let phaseContainer;
        if (isDistance) {
          phaseContainer = await stepAddDistancePhase(phaseIndex);
          await stepExpandPhase(phaseContainer, phaseIndex, "distance");
          await stepPhaseName(phase.name || `Phase ${phaseIndex}`, phaseContainer, phaseIndex);
          const rawDistance = phase.distanceMeters ?? (typeof phase.duration === "number" ? phase.duration : 2e3);
          await stepSetDistance(rawDistance, phaseContainer, phaseIndex);
        } else {
          phaseContainer = await stepAddDurationPhase(phaseIndex);
          await stepExpandPhase(phaseContainer, phaseIndex, "time");
          await stepPhaseName(phase.name || `Phase ${phaseIndex}`, phaseContainer, phaseIndex);
          const durationSeconds = phase.durationSeconds ?? (typeof phase.duration === "number" ? phase.duration : 600);
          await stepSetDuration(durationSeconds, phaseContainer, phaseIndex);
        }
        const targetIntensity = getTargetIntensityType(phase.intensityType);
        if (targetIntensity) {
          await stepSelectIntensity(phaseContainer, targetIntensity, phaseIndex);
        }
        await stepEnableTrainingZones(phaseContainer, phaseIndex);
        const upperZone = getUpperZone(phase);
        if (targetIntensity && upperZone != null) {
          await stepSetUpperZone(phaseContainer, upperZone, phaseIndex);
        }
      }
      const allContainers = Array.from(document.querySelectorAll(".phase-container"));
      if (allContainers.length !== phasesToCreate.length) {
        logPolar(
          `Validation failed: expected ${phasesToCreate.length} containers, found ${allContainers.length}`
        );
        throw new Error(`Could not create phase ${allContainers.length + 1}`);
      }
      for (let i = 0; i < phasesToCreate.length; i++) {
        const phaseIndex = i + 1;
        const phase = phasesToCreate[i];
        const container = allContainers[i];
        const isDistance = phase.durationType === "distance" || !phase.durationType && (phase.distanceMeters != null || typeof phase.distance === "number" && phase.distance > 100);
        const nameVal = container.querySelector(".name-input")?.value;
        if (nameVal !== phase.name) {
          throw new Error(`Could not set name for phase ${phaseIndex}`);
        }
        if (isDistance) {
          const rawDistance = phase.distanceMeters ?? (typeof phase.duration === "number" ? phase.duration : 2e3);
          const expectedKm = rawDistance / 1e3;
          const distVal = container.querySelector(
            ".phase-settings-input.distance"
          )?.value?.trim();
          const distNum = parseFloat(distVal || "");
          if (distVal !== String(expectedKm) && distNum !== expectedKm) {
            throw new Error(`Could not set distance for phase ${phaseIndex}`);
          }
        } else {
          const durationSeconds = phase.durationSeconds ?? (typeof phase.duration === "number" ? phase.duration : 600);
          const expectedDuration = formatPolarDuration(durationSeconds);
          const durVal = container.querySelector(
            ".phase-settings-input.duration"
          )?.value;
          if (durVal !== expectedDuration) {
            throw new Error(`Could not set duration for phase ${phaseIndex}`);
          }
        }
        const targetIntensity = getTargetIntensityType(phase.intensityType);
        const upperZone = getUpperZone(phase);
        if (targetIntensity && upperZone != null) {
          const lowerHandle = container.querySelector(
            '[aria-label="select lower zone"], [aria-label*="lower zone" i]'
          );
          if (lowerHandle && lowerHandle.getAttribute("aria-valuenow") !== "1") {
            throw new Error(`Lower zone is not 1 for phase ${phaseIndex}`);
          }
          const upperHandle = container.querySelector(
            '[aria-label="select upper zone"], [aria-label*="upper zone" i]'
          );
          if (upperHandle && Number(upperHandle.getAttribute("aria-valuenow")) !== upperZone) {
            throw new Error(`Upper zone is not ${upperZone} for phase ${phaseIndex}`);
          }
        }
      }
      logPolar(`All ${phasesToCreate.length} phases created and verified successfully.`);
      workflowStage = "READY_TO_SAVE";
      logPolar("Stage: READY_TO_SAVE");
      let saveButton;
      try {
        saveButton = await waitForElement("#add-target-to-calendar-button", 5e3);
      } catch {
        throw new Error("Add to Diary button not found");
      }
      workflowStage = "SAVING";
      logPolar("Stage: SAVING. Clicking Add to Diary...");
      saveButton.click();
      const saveSucceeded = await stepVerifySuccess(1e4);
      if (saveSucceeded) {
        workflowStage = "SUCCESS";
        logPolar("Stage: SUCCESS. Save confirmed! Stopping all automation and validation immediately.");
        return {
          success: true
        };
      }
      const currentPath = window.location.pathname;
      const saveBtnGone = !document.querySelector("#add-target-to-calendar-button");
      if (!currentPath.includes("/target") || currentPath.startsWith("/diary") || saveBtnGone) {
        workflowStage = "SUCCESS";
        logPolar("Stage: SUCCESS. Save confirmed by URL change / form disappearance.");
        return {
          success: true
        };
      }
      throw new Error("Polar did not confirm that the workout was saved.");
    } catch (err) {
      if (workflowStage === "SUCCESS") {
        return { success: true };
      }
      if (workflowStage === "SAVING") {
        const currentPath = window.location.pathname;
        const saveBtnGone = !document.querySelector("#add-target-to-calendar-button");
        const diaryVisible = !!document.querySelector('.diary-view, [data-qa*="diary"], #diary, .calendar-view');
        if (!currentPath.includes("/target") || currentPath.startsWith("/diary") || saveBtnGone || diaryVisible) {
          logPolar("Save confirmed during SAVING error check. Suppressing error and returning SUCCESS.");
          workflowStage = "SUCCESS";
          return { success: true };
        }
      }
      workflowStage = "FAILED";
      const errorMsg = err instanceof Error ? err.message : String(err);
      logPolar("Step failed with error:", errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  // src/content.ts
  logPolar("Content script loaded on Polar Flow");
  var contentCreationInProgress = false;
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      logPolar("Message received in content script:", message.type);
      if (message.type === "CHECK_POLAR_STATUS") {
        const isPolar = isPolarFlowHost();
        const loggedIn = isPolar ? checkIsLoggedIn() : false;
        sendResponse({ isPolar, isLoggedIn: loggedIn });
        return false;
      }
      if (message.type === "CHECK_TARGET_PAGE_READY") {
        const status = checkTargetPageReady();
        sendResponse(status);
        return false;
      }
      if (message.type === "CREATE_IN_POLAR") {
        if (contentCreationInProgress) {
          sendResponse({
            success: false,
            error: "WORKOUT_CREATION_ALREADY_IN_PROGRESS"
          });
          return false;
        }
        contentCreationInProgress = true;
        const workout = message.payload;
        createPhasedTargetInPolarFlow(workout).then((res) => {
          if (res && res.success) {
            sendResponse({ success: true });
          } else {
            sendResponse(res);
          }
        }).catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logPolar("Failed to create phased workout:", errorMsg);
          sendResponse({
            success: false,
            error: errorMsg || "Could not create workout"
          });
        }).finally(() => {
          contentCreationInProgress = false;
        });
        return true;
      }
      return false;
    });
  }
})();
//# sourceMappingURL=content.js.map
