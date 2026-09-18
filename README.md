# Polar Workout Importer

A Chrome Extension (Manifest V3) that receives Workout JSON from the **Polar Workout Generator** and creates that workout as a **Phased Target** in **Polar Flow Web** (`https://flow.polar.com/`).

---

## Purpose & Behavior

The extension has a single, focused purpose:
**Workout JSON → Polar Flow Phased Target**

1. Reads the Workout JSON directly from the clipboard.
2. Validates the JSON.
3. Finds an existing Polar Flow tab (or opens `https://flow.polar.com/`).
4. Verifies whether the user is logged into their existing Chrome session.
5. Navigates to the workout target creation page.
6. Selects **Phased Target**.
7. Creates the phases from the loaded Workout JSON (time, distance, intensity, zones, repeat blocks).
8. Saves the target and adds it to the target workout date.
9. Reports the result.

> **Security**: The extension **never** asks for, receives, or stores your Polar password. It uses your existing logged-in Chrome session.

---

## Workout Support

The extension supports all phases created by the Polar Workout Generator:
- **Time phases** (duration in minutes and seconds)
- **Distance phases** (distance in meters and kilometers)
- **Intensity types & zones**:
  - `easy` (Heart rate zone 2)
  - `recovery` (Heart rate zone 1)
  - `marathon pace` (Zone 3)
  - `tempo` (Zone 4)
  - `threshold` (Zone 4)
  - `heart rate` (Heart rate zones 1–5)
  - `pace` (Pace zones 1–5)
  - `power` (Power zones 1–5)
- **Repeat blocks** (interval repetitions and nested phases)

---

## Extension Interface & States

The popup UI is clean and minimal:
- **Title**: `Polar Workout Importer`
- **Status Area**:
  - `No workout loaded` (initial state)
  - `Workout loaded` (shows Name, Date, Phases)
  - `Creating Polar workout...`
  - `Workout created successfully`
  - `Could not create workout` (or `Please log in to Polar Flow first.`)
  - `Invalid workout` (if clipboard data fails validation)
- **Actions**:
  - **[ Read Workout ]**: Reads JSON from clipboard and validates.
  - **[ Create in Polar Flow ]**: Automates Phased Target creation in Polar Flow.

---

## Direct Generator Communication & Stable Extension ID

The extension has a deterministic, permanent Extension ID derived from the fixed public key in `manifest.json`:
```
bfaciogjibpdpphhpcjhgilfhhgoholo
```

- **Exported Constant**: `POLAR_EXTENSION_ID` in `src/types.ts`.
- **Security**: Only the public key (SPKI) is embedded in `manifest.json`. No private keys are stored, distributed, or exposed in source code.
- **Generator Integration**: Directly connects to `https://polar-workout-generator.ai.studio/*` via `externally_connectable`, responding to `PING_POLAR_EXTENSION` and `CREATE_POLAR_WORKOUT`.

---

## Installation in Google Chrome

1. **Build Extension**:
   ```bash
   npm run build:ext
   ```
2. **Open Extensions in Chrome**:
   Navigate to:
   ```text
   chrome://extensions/
   ```
3. **Enable Developer Mode**:
   Toggle the **Developer mode** switch in the top-right corner to **ON**.
4. **Load the Extension**:
   - Click **Load unpacked** in the top-left corner.
   - Select either the project root directory or the `dist-extension/` directory.
5. **Pin Extension**:
   Click the Extensions puzzle icon in Chrome's toolbar and pin **Polar Workout Importer**.

---

## Technical Structure

- `manifest.json`: Manifest V3 configuration with permissions restricted to `storage`, `tabs`, `clipboardRead`, `activeTab`, and host permissions exclusively for `https://flow.polar.com/*`.
- `popup.html` & `src/popup.ts`: Minimal popup UI and state machine.
- `src/background.ts`: Service worker handling tab queries, navigation, and message coordination.
- `src/content.ts`: Injected script on `https://flow.polar.com/*` executing DOM automation.
- `src/polarSelectors.ts`: Centralized Polar Flow DOM selectors and automation routines.
- `src/types.ts`: Workout data structures, popup state types, and JSON validation.
