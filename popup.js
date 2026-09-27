const $ = id => document.getElementById(id);
let busy = false;
function showMessage(text, type) {
  $('messageBox').className = `message ${type}`;
  $('messageBox').textContent = text;
}
function displayResult(result) {
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
(async () => {
  try {
    const { lastResult } = await chrome.storage.session.get('lastResult');
    if (lastResult && !busy) displayResult(lastResult);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//.test(tab.url) && !$('urlInput').value) $('urlInput').value = tab.url;
  } catch (error) { showMessage(error.message, 'error'); }
})();
