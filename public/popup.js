(() => {
  // src/types.ts
  function formatDisplayDate(dateStr) {
    if (!dateStr) return "";
    const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  }
  function countPhases(phases) {
    if (!Array.isArray(phases)) return 0;
    return phases.reduce((total, p) => {
      if (Array.isArray(p.phases) && p.phases.length > 0) {
        const rep2 = Number(p.repetitions ?? p.repeatCount ?? 1);
        return total + (rep2 > 0 ? rep2 : 1) * countPhases(p.phases);
      }
      const rep = Number(p.repetitions ?? p.repeatCount ?? 1);
      return total + (rep > 1 ? rep : 1);
    }, 0);
  }
  function validateWorkoutExport(data) {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "Invalid workout: not a JSON object" };
    }
    const obj = data;
    let workoutObj = null;
    if (obj.workout && typeof obj.workout === "object") {
      workoutObj = obj.workout;
    } else if (typeof obj.name === "string" && Array.isArray(obj.phases)) {
      workoutObj = obj;
    }
    if (!workoutObj) {
      return { valid: false, error: "Invalid workout: missing workout data" };
    }
    if (typeof workoutObj.name !== "string" || !workoutObj.name.trim()) {
      return { valid: false, error: "Invalid workout: missing name" };
    }
    if (typeof workoutObj.date !== "string" || !workoutObj.date.trim()) {
      return { valid: false, error: "Invalid workout: missing date" };
    }
    if (!Array.isArray(workoutObj.phases) || workoutObj.phases.length === 0) {
      return { valid: false, error: "Invalid workout: phases array is empty" };
    }
    const normalizedExport = {
      schemaVersion: typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1,
      source: typeof obj.source === "string" ? obj.source : "polar-workout-generator",
      workout: {
        name: workoutObj.name.trim(),
        sport: typeof workoutObj.sport === "string" ? workoutObj.sport : "running",
        date: workoutObj.date.trim(),
        startTime: typeof workoutObj.startTime === "string" ? workoutObj.startTime.trim() : void 0,
        phases: workoutObj.phases,
        description: typeof workoutObj.description === "string" ? workoutObj.description : void 0
      }
    };
    return {
      valid: true,
      exportData: normalizedExport
    };
  }

  // src/polarSelectors.ts
  function logPolar(message, ...args) {
    console.log(`[Polar Extension] ${message}`, ...args);
  }

  // src/popup.ts
  var currentExport = null;
  var currentState = "NO_WORKOUT";
  var statusArea = document.getElementById("status-area");
  var workoutDetails = document.getElementById("workout-details");
  var detailName = document.getElementById("detail-name");
  var detailDate = document.getElementById("detail-date");
  var detailPhases = document.getElementById("detail-phases");
  var btnRead = document.getElementById("btn-read");
  var btnCreate = document.getElementById("btn-create");
  function setState(state, customMessage) {
    currentState = state;
    logPolar("State:", state, customMessage || "");
    statusArea.className = "status-area";
    switch (state) {
      case "NO_WORKOUT":
        statusArea.textContent = customMessage || "No workout loaded";
        workoutDetails.style.display = "none";
        btnCreate.disabled = true;
        btnRead.disabled = false;
        break;
      case "WORKOUT_LOADED":
        statusArea.textContent = customMessage || "Workout loaded";
        statusArea.classList.add("loaded");
        if (currentExport) {
          workoutDetails.style.display = "flex";
          detailName.textContent = currentExport.workout.name;
          detailDate.textContent = formatDisplayDate(currentExport.workout.date);
          detailPhases.textContent = String(countPhases(currentExport.workout.phases));
        }
        btnCreate.disabled = false;
        btnRead.disabled = false;
        break;
      case "CREATING":
        statusArea.textContent = customMessage || "Selecting Running...";
        statusArea.classList.add("creating");
        btnCreate.disabled = true;
        btnRead.disabled = true;
        break;
      case "SUCCESS":
        statusArea.textContent = customMessage || "Running selected";
        statusArea.classList.add("success");
        btnCreate.disabled = false;
        btnRead.disabled = false;
        break;
      case "ERROR":
        statusArea.textContent = customMessage || "Could not select Running";
        statusArea.classList.add("error");
        btnCreate.disabled = !currentExport;
        btnRead.disabled = false;
        break;
    }
  }
  async function handleReadWorkout() {
    logPolar("Reading workout from clipboard...");
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setState("ERROR", "Invalid workout");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        setState("ERROR", "Invalid workout");
        return;
      }
      const validation = validateWorkoutExport(parsed);
      if (!validation.valid || !validation.exportData) {
        setState("ERROR", "Invalid workout");
        return;
      }
      currentExport = validation.exportData;
      setState("WORKOUT_LOADED", "Workout loaded");
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: "STORE_WORKOUT",
          payload: currentExport
        });
      }
    } catch (err) {
      logPolar("Clipboard read failed:", err);
      setState("ERROR", "Invalid workout");
    }
  }
  async function handleCreateInPolar() {
    if (!currentExport) {
      setState("NO_WORKOUT");
      return;
    }
    setState("CREATING", "Creating...");
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        {
          type: "CREATE_POLAR_WORKOUT",
          workout: currentExport.workout
        },
        (createResponse) => {
          if (chrome.runtime.lastError || !createResponse) {
            const err = chrome.runtime.lastError?.message || "Could not connect to Polar extension";
            setState("ERROR", err.includes("log in") ? "Please log in to Polar Flow first." : err);
            return;
          }
          if (!createResponse.success || !createResponse.jobId) {
            setState("ERROR", createResponse.error || "Could not start workout creation");
            return;
          }
          const jobId = createResponse.jobId;
          const startTime = Date.now();
          const MAX_POLL_MS = 120 * 1e3;
          setState("CREATING", "Creating...");
          const intervalId = setInterval(() => {
            const elapsed = Date.now() - startTime;
            if (elapsed >= MAX_POLL_MS) {
              clearInterval(intervalId);
              statusArea.textContent = "Polar creation is taking longer than expected.";
              return;
            }
            chrome.runtime.sendMessage(
              {
                type: "GET_POLAR_JOB_STATUS",
                jobId
              },
              (statusResponse) => {
                if (chrome.runtime.lastError || !statusResponse || !statusResponse.success || !statusResponse.job) {
                  return;
                }
                const job = statusResponse.job;
                if (job.status === "RUNNING") {
                  setState("CREATING", "Creating...");
                } else if (job.status === "SUCCESS") {
                  clearInterval(intervalId);
                  setState("SUCCESS", "Created in Polar Flow \u2713");
                } else if (job.status === "ERROR") {
                  clearInterval(intervalId);
                  setState("ERROR", job.error || "Could not create workout");
                }
              }
            );
          }, 1e3);
        }
      );
    } else {
      setTimeout(() => {
        setState("SUCCESS", "Created in Polar Flow \u2713");
      }, 1500);
    }
  }
  function initPopup() {
    btnRead.addEventListener("click", handleReadWorkout);
    btnCreate.addEventListener("click", handleCreateInPolar);
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "GET_STORED_WORKOUT" }, (res) => {
        if (res && res.workoutExport) {
          currentExport = res.workoutExport;
          setState("WORKOUT_LOADED");
        } else {
          setState("NO_WORKOUT");
        }
      });
    } else {
      setState("NO_WORKOUT");
    }
  }
  document.addEventListener("DOMContentLoaded", initPopup);
})();
//# sourceMappingURL=popup.js.map
