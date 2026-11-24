const { isConfiguredAppUrl } = require('./native-sender');

/**
 * Who may use the microphone in the shell. The signed macOS build carries the
 * audio-input entitlement (composer dictation), so a grant here is a real,
 * silent microphone: only the main window's own page on the configured app
 * origin gets it, and only for audio. Popups (connector and OAuth pages),
 * iframes (sandbox previews) and every other origin are refused.
 *
 * Every other permission keeps Electron's default (granted), as before a
 * handler existed.
 */
function allowsMedia({ webContents, appWebContents, requestingUrl, isMainFrame, mediaTypes }, appUrl) {
  if (!webContents || !appWebContents || webContents !== appWebContents) return false;
  if (isMainFrame === false) return false;
  if (!isConfiguredAppUrl(requestingUrl, appUrl)) return false;
  const types = Array.isArray(mediaTypes) ? mediaTypes : [];
  return types.length > 0 && types.every((type) => type === 'audio');
}

/**
 * Install the policy on a session. `appWebContents()` and `appUrl()` are read
 * per request: the main window is recreated and the app URL can change.
 */
function installMediaPermissionPolicy(session, { appWebContents, appUrl, onDenied = () => {} }) {
  session.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    if (permission !== 'media') return callback(true);
    const allowed = allowsMedia(
      {
        webContents,
        appWebContents: appWebContents(),
        requestingUrl: details.requestingUrl,
        isMainFrame: details.isMainFrame,
        mediaTypes: details.mediaTypes,
      },
      appUrl(),
    );
    if (!allowed) onDenied(details.requestingUrl, details.mediaTypes);
    callback(allowed);
  });
  session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details = {}) => {
    if (permission !== 'media') return true;
    return allowsMedia(
      {
        webContents,
        appWebContents: appWebContents(),
        requestingUrl: details.requestingUrl || requestingOrigin,
        isMainFrame: details.isMainFrame,
        mediaTypes: details.mediaType ? [details.mediaType] : [],
      },
      appUrl(),
    );
  });
}

module.exports = { allowsMedia, installMediaPermissionPolicy };
