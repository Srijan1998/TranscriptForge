const $ = id => document.getElementById(id);
let busy = false;
let currentResult = null;
function showMessage(text, type) {
  $('messageBox').className = `message ${type}`;
  $('messageBox').textContent = text;
}
function displayResult(result) {
  currentResult = result;
  $('videoTitle').textContent = result.title || result.videoId;
  $('segments').replaceChildren();
  $('summary').replaceChildren();
  for (const text of result.summary) {
    const item = document.createElement('li');
    item.textContent = text;
    $('summary').append(item);
  }
  for (const segment of result.snippets) {
    const row = document.createElement('div');
    row.className = 'transcript-segment';
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    const seconds = Math.floor(segment.start);
    timestamp.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = segment.text;
    row.append(timestamp, text);
    $('segments').append(row);
  }
  $('transcriptOutput').classList.add('visible');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }
}

function openTab(url) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}

function buildPrompt(result, videoUrl) {
  const title = result.title || result.videoId || 'YouTube Video';
  const urlLine = videoUrl ? `Video URL: ${videoUrl}\n` : '';
  const transcriptText = (result.snippets || []).map(s => s.text).join(' ');
  return `Please summarize the following YouTube video transcript and highlight the key takeaways:\n\nTitle: ${title}\n${urlLine}\nTranscript:\n${transcriptText}`;
}

function setAIStatus(text, isError = false) {
  const el = $('aiStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `ai-status visible${isError ? ' error' : ''}`;
}

function showDesktopNotification(title, message) {
  if (typeof chrome !== 'undefined' && chrome.notifications?.create) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title,
        message,
        priority: 1
      });
    } catch {
      // Fallback silently if notifications are restricted
    }
  }
}

async function openWithAI(service) {
  if (busy) return;
  if (!currentResult || !currentResult.snippets?.length) {
    setAIStatus('Fetch a transcript first before opening with AI.', true);
    return;
  }

  const videoUrl = $('urlInput').value.trim();
  const prompt = buildPrompt(currentResult, videoUrl);
  await copyToClipboard(prompt);

  const btnId = service === 'chatgpt' ? 'btnChatGPT' : service === 'claude' ? 'btnClaude' : 'btnGemini';
  const btn = $(btnId);
  const label = btn?.querySelector('.ai-btn-label');
  const originalLabel = label?.textContent || service;

  const MAX_SAFE_URL_LENGTH = 2000;
  let targetUrl = '';
  let statusText = '';
  let notificationText = '';

  if (service === 'chatgpt') {
    const directUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    if (directUrl.length <= MAX_SAFE_URL_LENGTH) {
      targetUrl = directUrl;
      if (label) label.textContent = '✓ Opening!';
      statusText = '✓ Pre-filled prompt in ChatGPT! (Also copied to clipboard)';
      notificationText = 'Opened ChatGPT with pre-filled prompt!';
    } else {
      targetUrl = 'https://chatgpt.com/';
      if (label) label.textContent = '✓ Copied!';
      statusText = '✓ Transcript copied to clipboard! Press Ctrl+V in ChatGPT to paste.';
      notificationText = 'Transcript copied to clipboard! Press Ctrl+V in ChatGPT to paste.';
    }
  } else if (service === 'claude') {
    const directUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
    if (directUrl.length <= MAX_SAFE_URL_LENGTH) {
      targetUrl = directUrl;
      if (label) label.textContent = '✓ Opening!';
      statusText = '✓ Pre-filled prompt in Claude! (Also copied to clipboard)';
      notificationText = 'Opened Claude with pre-filled prompt!';
    } else {
      targetUrl = 'https://claude.ai/new';
      if (label) label.textContent = '✓ Copied!';
      statusText = '✓ Transcript copied to clipboard! Press Ctrl+V in Claude to paste.';
      notificationText = 'Transcript copied to clipboard! Press Ctrl+V in Claude to paste.';
    }
  } else if (service === 'gemini') {
    targetUrl = 'https://gemini.google.com/app';
    if (label) label.textContent = '✓ Copied!';
    statusText = '✓ Transcript copied to clipboard! Press Ctrl+V in Gemini to paste.';
    notificationText = 'Transcript copied to clipboard! Press Ctrl+V in Gemini to paste.';
  }

  setAIStatus(statusText);
  showDesktopNotification('TranscriptForge', notificationText);

  // Give the user visual feedback in the popup before the tab opens and takes focus
  await new Promise(resolve => setTimeout(resolve, 600));
  openTab(targetUrl);

  setTimeout(() => {
    if (label) label.textContent = originalLabel;
  }, 3000);
}

async function fetchTranscript() {
  if (busy) return;
  const video = $('urlInput').value.trim();
  if (!video) return showMessage('Enter a YouTube URL or video ID.', 'error');
  busy = true;
  $('fetchBtn').disabled = true;
  $('loadingBox').classList.add('visible');
  $('transcriptOutput').classList.remove('visible');
  showMessage('', '');
  try {
    const languages = $('languages').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!languages.length) throw new Error('Enter at least one language code.');
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', video, languages });
    if (!response?.ok) throw new Error(response?.error?.message || 'The background worker did not return a result. Reload the extension and try again.');
    displayResult(response.result);
    showMessage(`${response.result.language} · ${response.result.snippets.length} segments`, 'success');
  } catch (error) { showMessage(error.message, 'error'); }
  finally {
    busy = false;
    $('fetchBtn').disabled = false;
    $('loadingBox').classList.remove('visible');
  }
}
$('fetchBtn').addEventListener('click', fetchTranscript);
$('urlInput').addEventListener('keydown', event => { if (event.key === 'Enter') fetchTranscript(); });
$('btnChatGPT').addEventListener('click', () => openWithAI('chatgpt'));
$('btnClaude').addEventListener('click', () => openWithAI('claude'));
$('btnGemini').addEventListener('click', () => openWithAI('gemini'));
$('btnCopyPrompt').addEventListener('click', async () => {
  if (!currentResult || !currentResult.snippets?.length) {
    setAIStatus('Fetch a transcript first to copy.', true);
    return;
  }
  const videoUrl = $('urlInput').value.trim();
  const prompt = buildPrompt(currentResult, videoUrl);
  await copyToClipboard(prompt);
  $('copyPromptLabel').textContent = '✓ Copied!';
  setAIStatus('✓ Prompt and transcript copied to clipboard! (Ready to paste)');
  showDesktopNotification('TranscriptForge', 'Prompt & transcript copied to clipboard!');
  setTimeout(() => { $('copyPromptLabel').textContent = 'Copy Prompt'; }, 2500);
});
(async () => {
  try {
    const { lastResult } = await chrome.storage.session.get('lastResult');
    if (lastResult && !busy) displayResult(lastResult);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//.test(tab.url) && !$('urlInput').value) $('urlInput').value = tab.url;
  } catch (error) { showMessage(error.message, 'error'); }
})();
