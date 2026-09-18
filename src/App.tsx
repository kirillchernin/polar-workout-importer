import React, { useState, useEffect } from 'react';
import { Download, Check, AlertCircle, ExternalLink, Copy } from 'lucide-react';
import JSZip from 'jszip';
import {
  PopupState,
  PolarWorkoutExport,
  validateWorkoutExport,
  formatDisplayDate,
  countPhases,
  POLAR_EXTENSION_ID,
} from './types';

export default function App() {
  const [popupState, setPopupState] = useState<PopupState>('NO_WORKOUT');
  const [statusMessage, setStatusMessage] = useState<string>('No workout loaded');
  const [workoutExport, setWorkoutExport] = useState<PolarWorkoutExport | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(POLAR_EXTENSION_ID);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Check if there is stored workout in extension session
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_STORED_WORKOUT' }, (res) => {
        if (res && res.workoutExport) {
          setWorkoutExport(res.workoutExport);
          setPopupState('WORKOUT_LOADED');
          setStatusMessage('Workout loaded');
        }
      });
    }
  }, []);

  /**
   * Handle "Read Workout" from clipboard
   */
  const handleReadWorkout = async () => {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      if (!text || !text.trim()) {
        setPopupState('ERROR');
        setStatusMessage('Invalid workout');
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setPopupState('ERROR');
        setStatusMessage('Invalid workout');
        return;
      }

      const validation = validateWorkoutExport(parsed);
      if (!validation.valid || !validation.exportData) {
        setPopupState('ERROR');
        setStatusMessage('Invalid workout');
        return;
      }

      setWorkoutExport(validation.exportData);
      setPopupState('WORKOUT_LOADED');
      setStatusMessage('Workout loaded');

      // Persist in background session if in Chrome
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'STORE_WORKOUT',
          payload: validation.exportData,
        });
      }
    } catch {
      setPopupState('ERROR');
      setStatusMessage('Invalid workout');
    }
  };

  /**
   * Handle "Create in Polar Flow"
   *
   * Implements the 7-step job-based polling architecture:
   * 1. Send CREATE_POLAR_WORKOUT
   * 2. Receive immediately: { success: true, accepted: true, jobId: "..." }
   * 3. Display: Creating...
   * 4. Poll every 1 second: GET_POLAR_JOB_STATUS with that jobId
   * 5. If status === "RUNNING": keep displaying Creating...
   * 6. If status === "SUCCESS": stop polling and display: Created in Polar Flow ✓
   * 7. If status === "ERROR": stop polling and display the returned error
   * Maximum polling time: 120 seconds
   * If 120 seconds expires: stop polling and show: "Polar creation is taking longer than expected."
   */
  const handleCreateInPolar = async () => {
    if (!workoutExport) {
      setPopupState('NO_WORKOUT');
      setStatusMessage('No workout loaded');
      return;
    }

    setPopupState('CREATING');
    setStatusMessage('Creating...');

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // 1. Send CREATE_POLAR_WORKOUT
      chrome.runtime.sendMessage(
        {
          type: 'CREATE_POLAR_WORKOUT',
          workout: workoutExport.workout,
        },
        (createResponse?: { success: boolean; accepted?: boolean; jobId?: string; error?: string }) => {
          if (chrome.runtime.lastError || !createResponse) {
            const err = chrome.runtime.lastError?.message || 'Could not connect to Polar extension';
            setPopupState('ERROR');
            setStatusMessage(err.includes('log in') ? 'Please log in to Polar Flow first.' : err);
            return;
          }

          if (!createResponse.success || !createResponse.jobId) {
            setPopupState('ERROR');
            setStatusMessage(createResponse.error || 'Could not start workout creation');
            return;
          }

          const jobId = createResponse.jobId;
          const startTime = Date.now();
          const MAX_POLL_MS = 120 * 1000; // 120 seconds

          // 3. Display: Creating...
          setStatusMessage('Creating...');

          // 4. Poll every 1 second: GET_POLAR_JOB_STATUS with jobId
          const intervalId = setInterval(() => {
            const elapsed = Date.now() - startTime;
            if (elapsed >= MAX_POLL_MS) {
              clearInterval(intervalId);
              // Stop polling and show notice without assuming failure
              setStatusMessage('Polar creation is taking longer than expected.');
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
                  return; // continue polling
                }

                const job = statusResponse.job;

                if (job.status === 'RUNNING') {
                  // 5. If status === "RUNNING": keep displaying Creating...
                  setStatusMessage('Creating...');
                } else if (job.status === 'SUCCESS') {
                  // 6. If status === "SUCCESS": stop polling and display: Created in Polar Flow ✓
                  clearInterval(intervalId);
                  setPopupState('SUCCESS');
                  setStatusMessage('Created in Polar Flow ✓');
                } else if (job.status === 'ERROR') {
                  // 7. If status === "ERROR": stop polling and display the returned error
                  clearInterval(intervalId);
                  setPopupState('ERROR');
                  setStatusMessage(job.error || 'Could not create workout');
                }
              }
            );
          }, 1000);
        }
      );
    } else {
      // In web preview fallback
      setStatusMessage('Creating...');
      setTimeout(() => {
        setPopupState('SUCCESS');
        setStatusMessage('Created in Polar Flow ✓');
      }, 1500);
    }
  };

  /**
   * Download ready-to-load Chrome Extension ZIP
   */
  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();

      // Fetch built files
      const fileNames = [
        'manifest.json',
        'popup.html',
        'styles.css',
        'popup.js',
        'background.js',
        'content.js',
      ];

      for (const name of fileNames) {
        try {
          const res = await fetch(`/${name}`);
          if (res.ok) {
            const content = await res.text();
            zip.file(name, content);
          }
        } catch {
          // If not served at root, skip
        }
      }

      // Add a concise install README
      zip.file(
        'README.txt',
        `Polar Workout Importer - Chrome Extension (Manifest V3)
=====================================================

Stable Extension ID:
${POLAR_EXTENSION_ID}

Installation Instructions:
1. Unzip this downloaded archive into a folder on your computer.
2. Open Google Chrome and navigate to: chrome://extensions/
3. Toggle "Developer mode" ON in the top-right corner.
4. Click "Load unpacked" in the top-left corner.
5. Select the unzipped folder.
6. The Polar Workout Importer icon is now in your Chrome toolbar!
   Notice the Extension ID is always: ${POLAR_EXTENSION_ID}

Direct Generator Communication:
The Polar Workout Generator (https://polar-workout-generator.ai.studio/)
communicates directly with this Extension using Extension ID:
${POLAR_EXTENSION_ID}

Manual Fallback:
1. Generate your phased running workout in the Polar Workout Generator.
2. Copy the Workout JSON to your clipboard.
3. Open the Polar Workout Importer extension popup.
4. Click [ Read Workout ].
5. Click [ Create in Polar Flow ].
The extension finds your logged-in Polar Flow tab and builds the Phased Target.
`
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'polar-workout-importer.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch {
      // ignore
    } finally {
      setIsDownloading(false);
    }
  };

  // Compute status styles
  let statusBg = 'bg-slate-100 text-slate-700 border-slate-200';
  if (popupState === 'WORKOUT_LOADED') {
    statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (popupState === 'CREATING') {
    statusBg = 'bg-sky-50 text-sky-800 border-sky-200';
  } else if (popupState === 'SUCCESS') {
    statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (popupState === 'ERROR') {
    statusBg = 'bg-rose-50 text-rose-800 border-rose-200';
  }

  const isLoadedOrActive = popupState === 'WORKOUT_LOADED' || popupState === 'CREATING' || popupState === 'SUCCESS';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      {/* Extension Popup Card */}
      <div className="w-[320px] bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col gap-3.5">
        <h1 className="text-[15px] font-bold text-slate-900 tracking-tight text-center pb-2 border-b border-slate-200">
          Polar Workout Importer
        </h1>

        {/* Status area */}
        <div
          className={`px-3 py-2.5 rounded-md text-[13px] font-semibold text-center border min-h-[40px] flex items-center justify-center transition-colors ${statusBg}`}
        >
          {statusMessage}
        </div>

        {/* Loaded Workout Details */}
        {isLoadedOrActive && workoutExport && (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 flex flex-col gap-1.5 text-[13px]">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500 font-medium">Name:</span>
              <span className="font-semibold text-slate-900 max-w-[190px] truncate text-right">
                {workoutExport.workout.name}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500 font-medium">Date:</span>
              <span className="font-semibold text-slate-900">
                {formatDisplayDate(workoutExport.workout.date)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500 font-medium">Phases:</span>
              <span className="font-semibold text-slate-900">
                {countPhases(workoutExport.workout.phases)}
              </span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleReadWorkout}
            disabled={popupState === 'CREATING'}
            className="w-full py-2.5 px-3.5 text-[13px] font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Read Workout
          </button>

          <button
            type="button"
            onClick={handleCreateInPolar}
            disabled={popupState === 'NO_WORKOUT' || popupState === 'CREATING' || !workoutExport}
            className="w-full py-2.5 px-3.5 text-[13px] font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Create in Polar Flow
          </button>
        </div>
      </div>

      {/* Extension Packaging & Install Guide */}
      <div className="w-[320px] mt-4 flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={isDownloading}
          className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 py-2 px-4 rounded-md shadow-2xs transition-colors cursor-pointer w-full"
        >
          {downloadSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Downloaded ZIP!</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>{isDownloading ? 'Packaging...' : 'Download Extension (.zip)'}</span>
            </>
          )}
        </button>

        {/* Stable Extension ID display */}
        <div className="w-full bg-slate-200/70 border border-slate-300 rounded-md p-2 flex items-center justify-between gap-2 text-left">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Stable Extension ID
            </span>
            <code className="text-[11px] font-mono text-slate-800 truncate" title={POLAR_EXTENSION_ID}>
              {POLAR_EXTENSION_ID}
            </code>
          </div>
          <button
            type="button"
            onClick={handleCopyId}
            className="shrink-0 p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-300/60 transition-colors cursor-pointer"
            title="Copy Extension ID"
          >
            {copiedId ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Manifest V3 • Stable ID • Real Polar Flow Automation
        </p>
      </div>
    </div>
  );
}
