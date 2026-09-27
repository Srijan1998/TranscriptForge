import { YouTubeTranscriptApi } from './transcript.js';
import { summarize } from './summary.js';

let requestRuleReady;
function preparePlayerRequest() {
  // Python sends no Origin. Chrome's extension Origin causes this endpoint to
  // return 403. Restrict removal to our own POSTs to this exact endpoint.
  return requestRuleReady ??= chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
      condition: {
        regexFilter: '^https://www\\.youtube\\.com/youtubei/v1/player([?]|$)',
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ['xmlhttprequest'],
        requestMethods: ['post']
      }
    }]
  }).catch(error => {
    requestRuleReady = undefined;
    throw new Error(`Could not prepare the YouTube player request. Reload the extension in chrome://extensions. ${error.message}`);
  });
}

const api = new YouTubeTranscriptApi({
  checkPermission: origin => chrome.permissions.contains({ origins: [`${origin}/*`] }),
  setConsent: value => chrome.cookies.set({
  url: 'https://www.youtube.com', domain: '.youtube.com', name: 'CONSENT', value, path: '/', secure: true
}) });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== 'FETCH_TRANSCRIPT') return false;
  (async () => {
    try {
      await preparePlayerRequest();
      const transcript = await api.fetch(message.video, { languages: message.languages || ['en'] });
      const result = { ...transcript, summary: summarize(transcript.snippets) };
      await chrome.storage.session.set({ lastResult: result });
      sendResponse({ ok: true, result });
    } catch (error) {
      sendResponse({ ok: false, error: { code: error.code || 'UNEXPECTED_ERROR', message: error.message, diagnostic: error.diagnostic } });
    }
  })();
  return true; // Keep the asynchronous message channel open.
});
