(() => {
  // src/background.ts
  var LOG_PREFIX = "[Polar Extension]";
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }
  log("Service worker initialized.");
  var polarCreationJobs = {};
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["polarCreationJobs"], (res) => {
      if (res && res.polarCreationJobs && typeof res.polarCreationJobs === "object") {
        polarCreationJobs = {
          ...res.polarCreationJobs,
          ...polarCreationJobs
        };
        log("Restored polarCreationJobs from storage:", Object.keys(polarCreationJobs).length);
      }
    });
  }
  function hasActiveRunningJob() {
    return Object.values(polarCreationJobs).some((job) => job.status === "RUNNING");
  }
  function createNewPolarJob(jobId) {
    const cleaned = {};
    for (const [id, job] of Object.entries(polarCreationJobs)) {
      if (job.status === "RUNNING") {
        cleaned[id] = job;
      }
    }
    const newJob = {
      jobId,
      status: "RUNNING",
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    cleaned[jobId] = newJob;
    polarCreationJobs = cleaned;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ polarCreationJobs: cleaned });
    }
    log("Created new Polar creation job:", jobId);
    return newJob;
  }
  function updatePolarJobStatus(jobId, status, error = null) {
    const existing = polarCreationJobs[jobId] || { jobId };
    const updated = {
      ...existing,
      jobId,
      status,
      error,
      updatedAt: Date.now()
    };
    polarCreationJobs[jobId] = updated;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["polarCreationJobs"], (res) => {
        const stored = res && res.polarCreationJobs || {};
        stored[jobId] = updated;
        chrome.storage.local.set({ polarCreationJobs: stored });
      });
    }
    log(`Job ${jobId} status updated to:`, status, error ? `(${error})` : "");
  }
  function isExactTargetPage(urlStr) {
    if (!urlStr) return false;
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname === "flow.polar.com" && (parsed.pathname === "/target" || parsed.pathname === "/target/");
    } catch {
      return false;
    }
  }
  function waitForTabStatusComplete(tabId, timeoutMs = 25e3) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => {
        if (finished) return;
        cleanup();
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            reject(new Error(`Tab ${tabId} could not be loaded or was closed.`));
          } else if (tab.status === "complete") {
            resolve();
          } else {
            reject(new Error(`Timeout waiting for tab ${tabId} navigation to complete.`));
          }
        });
      }, timeoutMs);
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
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
  async function getOrNavigatePolarTargetTab() {
    log("1. Finding existing Polar Flow tabs (https://flow.polar.com/*)...");
    const tabs = await chrome.tabs.query({ url: "*://flow.polar.com/*" });
    if (tabs.length === 0) {
      log("No Polar Flow tab exists. Opening new tab: https://flow.polar.com/target ...");
      let targetTabId;
      const waitPromise2 = new Promise((resolve, reject) => {
        let finished = false;
        const timer = setTimeout(() => {
          if (finished) return;
          cleanup();
          if (targetTabId !== void 0) {
            chrome.tabs.get(targetTabId, (tab2) => {
              if (tab2 && tab2.status === "complete") resolve();
              else reject(new Error("Timeout loading new Polar Flow tab."));
            });
          } else {
            reject(new Error("Timeout creating new Polar Flow tab."));
          }
        }, 25e3);
        const cleanup = () => {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timer);
        };
        const listener = (updatedTabId, changeInfo) => {
          if (targetTabId !== void 0 && updatedTabId === targetTabId && changeInfo.status === "complete") {
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
        url: "https://flow.polar.com/target",
        active: true
      });
      if (newTab.id === void 0) {
        throw new Error("Failed to create new Polar Flow tab");
      }
      targetTabId = newTab.id;
      if (newTab.status !== "complete") {
        log("Waiting for new /target page to load...");
        await waitPromise2;
      }
      return newTab;
    }
    const tab = tabs[0];
    if (tab.id === void 0) {
      throw new Error("Polar Flow tab has no valid ID");
    }
    log(`Using first available Polar Flow tab (ID: ${tab.id}, URL: ${tab.url})`);
    if (isExactTargetPage(tab.url)) {
      log("Tab is already on https://flow.polar.com/target. Activating tab without reload.");
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId !== void 0) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      if (tab.status !== "complete") {
        log("Tab is currently loading, waiting for complete status...");
        await waitForTabStatusComplete(tab.id);
      }
      return tab;
    }
    log(`Tab URL is "${tab.url}". Navigating same tab to https://flow.polar.com/target ...`);
    const waitPromise = waitForTabStatusComplete(tab.id);
    await chrome.tabs.update(tab.id, {
      url: "https://flow.polar.com/target",
      active: true
    });
    if (tab.windowId !== void 0) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    log('Waiting for navigation to complete (changeInfo.status === "complete")...');
    await waitPromise;
    return tab;
  }
  var getOrOpenPolarTab = getOrNavigatePolarTargetTab;
  async function pollTargetPageReady(tabId) {
    const maxAttempts = 40;
    const intervalMs = 250;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { type: "CHECK_TARGET_PAGE_READY" }, (res) => {
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
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    log(`Target page NOT ready after ${maxAttempts} attempts (10s)`);
    return false;
  }
  async function sendToContentScript(tabId, message, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await new Promise((resolve, reject) => {
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
    throw new Error("Could not communicate with Polar Flow tab.");
  }
  async function handleCreateInPolarFlow(workout) {
    try {
      const tab = await getOrNavigatePolarTargetTab();
      if (!tab.id) {
        return { success: false, error: "Polar Flow tab could not be opened" };
      }
      log("Waiting for TARGET_PAGE_READY (polling CHECK_TARGET_PAGE_READY for up to 10s)...");
      const ready = await pollTargetPageReady(tab.id);
      if (!ready) {
        try {
          const statusRes = await sendToContentScript(
            tab.id,
            { type: "CHECK_POLAR_STATUS" },
            1
          );
          if (statusRes && !statusRes.isLoggedIn) {
            return { success: false, error: "Please log in to Polar Flow first." };
          }
        } catch {
        }
        return {
          success: false,
          error: "Target page not ready: required form elements were not found after 10 seconds."
        };
      }
      log("TARGET_PAGE_READY confirmed! Running workout creation automation...");
      const result = await sendToContentScript(
        tab.id,
        {
          type: "CREATE_IN_POLAR",
          payload: workout
        }
      );
      if (result && result.success) {
        return { success: true };
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log("Error during workout creation:", errorMsg);
      return {
        success: false,
        error: errorMsg || "Could not create workout"
      };
    }
  }
  var createPolarWorkout = handleCreateInPolarFlow;
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const msg = message;
      if (msg.type === "PING_POLAR_EXTENSION") {
        sendResponse({
          success: true,
          status: "READY"
        });
        return false;
      }
      if (msg.type === "GET_POLAR_JOB_STATUS") {
        const jobId = msg.jobId;
        const job = jobId ? polarCreationJobs[jobId] : null;
        if (!job) {
          sendResponse({
            success: false,
            error: "JOB_NOT_FOUND"
          });
          return false;
        }
        sendResponse({
          success: true,
          job: {
            jobId: job.jobId,
            status: job.status,
            error: job.error
          }
        });
        return false;
      }
      if (msg.type === "CREATE_POLAR_WORKOUT" || msg.type === "CREATE_IN_POLAR_WORKFLOW") {
        const workoutRaw = msg.workout || msg.payload;
        if (!workoutRaw) {
          sendResponse({
            success: false,
            error: "WORKOUT_MISSING"
          });
          return false;
        }
        if (hasActiveRunningJob()) {
          sendResponse({
            success: false,
            error: "WORKOUT_CREATION_ALREADY_IN_PROGRESS"
          });
          return false;
        }
        const jobId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        createNewPolarJob(jobId);
        sendResponse({
          success: true,
          accepted: true,
          jobId
        });
        const workoutObj = typeof workoutRaw === "object" && workoutRaw !== null && "workout" in workoutRaw && Array.isArray(
          workoutRaw.workout && workoutRaw.workout.phases
        ) ? workoutRaw.workout : workoutRaw;
        handleCreateInPolarFlow(workoutObj).then((result) => {
          if (result && result.success) {
            updatePolarJobStatus(jobId, "SUCCESS", null);
          } else {
            updatePolarJobStatus(
              jobId,
              "ERROR",
              result?.error || "Could not create workout in Polar Flow"
            );
          }
        }).catch((error) => {
          const errorMsg = error instanceof Error ? error.message : String(error) || "UNKNOWN_ERROR";
          updatePolarJobStatus(jobId, "ERROR", errorMsg);
        });
        return false;
      }
      if (msg.type === "STORE_WORKOUT") {
        const exportData = msg.payload;
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
      if (msg.type === "GET_STORED_WORKOUT") {
        const storageArea = chrome.storage?.session || chrome.storage?.local;
        if (storageArea) {
          storageArea.get(["currentWorkout"], (res) => {
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
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener(
      (message, sender, sendResponse) => {
        if (!sender.url || !sender.url.startsWith("https://polar-workout-generator.ai.studio/")) {
          sendResponse({
            success: false,
            error: "UNAUTHORIZED_SENDER"
          });
          return false;
        }
        const msg = message;
        if (msg?.type === "PING_POLAR_EXTENSION") {
          sendResponse({
            success: true,
            status: "READY"
          });
          return false;
        }
        if (msg?.type === "CREATE_POLAR_WORKOUT") {
          if (!msg.workout) {
            sendResponse({
              success: false,
              error: "WORKOUT_MISSING"
            });
            return false;
          }
          if (hasActiveRunningJob()) {
            sendResponse({
              success: false,
              error: "WORKOUT_CREATION_ALREADY_IN_PROGRESS"
            });
            return false;
          }
          const jobId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          createNewPolarJob(jobId);
          sendResponse({
            success: true,
            accepted: true,
            jobId
          });
          const workoutObj = typeof msg.workout === "object" && msg.workout !== null && "workout" in msg.workout && Array.isArray(
            msg.workout.workout && msg.workout.workout.phases
          ) ? msg.workout.workout : msg.workout;
          handleCreateInPolarFlow(workoutObj).then((result) => {
            if (result && result.success) {
              updatePolarJobStatus(jobId, "SUCCESS", null);
            } else {
              updatePolarJobStatus(
                jobId,
                "ERROR",
                result?.error || "Could not create workout in Polar Flow"
              );
            }
          }).catch((error) => {
            const errorMsg = error instanceof Error ? error.message : String(error) || "UNKNOWN_ERROR";
            updatePolarJobStatus(jobId, "ERROR", errorMsg);
          });
          return false;
        }
        if (msg?.type === "GET_POLAR_JOB_STATUS") {
          const jobId = msg.jobId;
          const job = jobId ? polarCreationJobs[jobId] : null;
          if (!job) {
            sendResponse({
              success: false,
              error: "JOB_NOT_FOUND"
            });
            return false;
          }
          sendResponse({
            success: true,
            job: {
              jobId: job.jobId,
              status: job.status,
              error: job.error
            }
          });
          return false;
        }
        sendResponse({
          success: false,
          error: "UNKNOWN_MESSAGE"
        });
        return false;
      }
    );
  }
})();
//# sourceMappingURL=background.js.map
