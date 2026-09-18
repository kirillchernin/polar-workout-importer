/**
 * Polar Workout Importer - Content Script
 *
 * Injected exclusively on https://flow.polar.com/*
 * Executes real browser automation on the Polar Flow Web interface.
 */

import {
  logPolar,
  isPolarFlowHost,
  checkIsLoggedIn,
  checkTargetPageReady,
  createPhasedTargetInPolarFlow,
} from './polarSelectors';
import { ExtensionMessage } from './types';

logPolar('Content script loaded on Polar Flow');

let contentCreationInProgress = false;

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    logPolar('Message received in content script:', message.type);

    if (message.type === 'CHECK_POLAR_STATUS') {
      const isPolar = isPolarFlowHost();
      const loggedIn = isPolar ? checkIsLoggedIn() : false;
      sendResponse({ isPolar, isLoggedIn: loggedIn });
      return false;
    }

    if (message.type === 'CHECK_TARGET_PAGE_READY') {
      const status = checkTargetPageReady();
      sendResponse(status);
      return false;
    }

    if (message.type === 'CREATE_IN_POLAR') {
      if (contentCreationInProgress) {
        sendResponse({
          success: false,
          error: 'WORKOUT_CREATION_ALREADY_IN_PROGRESS',
        });
        return false;
      }

      contentCreationInProgress = true;
      const workout = message.payload;
      createPhasedTargetInPolarFlow(workout)
        .then((res) => {
          if (res && res.success) {
            sendResponse({ success: true });
          } else {
            sendResponse(res);
          }
        })
        .catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logPolar('Failed to create phased workout:', errorMsg);
          sendResponse({
            success: false,
            error: errorMsg || 'Could not create workout',
          });
        })
        .finally(() => {
          contentCreationInProgress = false;
        });
      return true; // Keep message channel open for async response
    }

    return false;
  });
}
