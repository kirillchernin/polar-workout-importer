# Polar Workout Importer — Stable Extension ID

## Stable Extension ID
```
bfaciogjibpdpphhpcjhgilfhhgoholo
```

## TypeScript Constant
Exported in `src/types.ts`:
```ts
export const POLAR_EXTENSION_ID = 'bfaciogjibpdpphhpcjhgilfhhgoholo';
```

## How It Works
In Google Chrome / Chromium extensions, an extension loaded with "Load unpacked" normally receives a randomly generated ID based on the absolute file path of the folder on disk.

To make the Extension ID deterministic and stable across:
- rebuilding
- downloading a new ZIP
- extracting into different directories
- removing and re-loading unpacked in Chrome

a fixed 2048-bit RSA public key (SubjectPublicKeyInfo in base64 format) has been embedded into `manifest.json` under the `"key"` attribute.

### Deterministic ID Derivation Algorithm:
1. Base64-decode the `"key"` in `manifest.json` to its DER SubjectPublicKeyInfo representation.
2. Compute the SHA-256 hash of the decoded bytes.
3. Take the first 16 bytes (128 bits) of the SHA-256 hash.
4. Encode each byte into two 4-bit nibbles, mapping values 0–15 to ASCII characters `'a'`–`'p'`:
   - High nibble: `String.fromCharCode(97 + (byte >> 4 & 0x0f))`
   - Low nibble: `String.fromCharCode(97 + (byte & 0x0f))`
5. Result is the exact 32-character string:
   `bfaciogjibpdpphhpcjhgilfhhgoholo`

### Security Policy
- **Public Key Only**: Only the DER SubjectPublicKeyInfo public key is stored in `manifest.json`.
- **No Private Key Stored**: No private signing key is stored in the repository, distributed in downloadable ZIPs, or exposed in source code.

## Verification Procedure
1. Run `node scripts/build-extension.js`.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the extension directory (or unzipped folder).
5. Confirm the Extension ID shown under "Polar Workout Importer" is:
   `bfaciogjibpdpphhpcjhgilfhhgoholo`
6. Remove the extension from Chrome.
7. Move or copy the folder to another directory on your disk and load it unpacked again.
8. Confirm the Extension ID remains **identical**:
   `bfaciogjibpdpphhpcjhgilfhhgoholo`

## Direct Generator Communication (Job-Based Architecture)
From `https://polar-workout-generator.ai.studio/`, send messages directly using:
```js
const EXTENSION_ID = "bfaciogjibpdpphhpcjhgilfhhgoholo";

// 1. Ping extension
chrome.runtime.sendMessage(
  EXTENSION_ID,
  { type: "PING_POLAR_EXTENSION" },
  (response) => {
    console.log("Ping response:", response);
    // { success: true, status: "READY" }
  }
);

// 2. Create workout (Job-based, non-blocking)
function createPolarWorkoutFromGenerator(workoutData, onStatusChange) {
  // 1. Send CREATE_POLAR_WORKOUT
  chrome.runtime.sendMessage(
    EXTENSION_ID,
    {
      type: "CREATE_POLAR_WORKOUT",
      workout: workoutData
    },
    (createResponse) => {
      if (chrome.runtime.lastError || !createResponse || !createResponse.success) {
        onStatusChange("ERROR", createResponse?.error || chrome.runtime.lastError?.message || "Could not connect to extension");
        return;
      }

      const jobId = createResponse.jobId;
      const startTime = Date.now();
      const MAX_POLL_MS = 120 * 1000; // 120s limit

      // 3. Display: Creating...
      onStatusChange("RUNNING", "Creating...");

      // 4. Poll every 1 second: GET_POLAR_JOB_STATUS
      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          clearInterval(intervalId);
          // Do NOT assume the workout failed
          onStatusChange("TIMEOUT", "Polar creation is taking longer than expected.");
          return;
        }

        chrome.runtime.sendMessage(
          EXTENSION_ID,
          {
            type: "GET_POLAR_JOB_STATUS",
            jobId: jobId
          },
          (statusResponse) => {
            if (chrome.runtime.lastError || !statusResponse || !statusResponse.success || !statusResponse.job) {
              return; // continue polling
            }

            const job = statusResponse.job;
            if (job.status === "RUNNING") {
              onStatusChange("RUNNING", "Creating...");
            } else if (job.status === "SUCCESS") {
              clearInterval(intervalId);
              onStatusChange("SUCCESS", "Created in Polar Flow ✓");
            } else if (job.status === "ERROR") {
              clearInterval(intervalId);
              onStatusChange("ERROR", job.error || "Could not create workout");
            }
          }
        );
      }, 1000);
    }
  );
}
```
