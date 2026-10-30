import { adConfig } from './ad-config.js';

const $ = id => document.getElementById(id);

let currentResult = null;
let busy = false;
let fetchCount = 0;
let currentAdIndex = 0;
let adInterval = null;

// ==========================================
// AD BANNER & INTERSTITIAL SYSTEM
// ==========================================
function renderBannerAd() {
  const container = $('adBannerContainer');
  if (!container) return;

  if (adConfig.mode === 'network') {
    container.innerHTML = adConfig.networkSnippetHtml;
    return;
  }

  const banners = adConfig.sponsorBanners;
  if (!banners || !banners.length) return;

  const ad = banners[currentAdIndex % banners.length];

  container.innerHTML = `
    <div class="ad-content">
      <div class="ad-header-row">
        <span class="ad-sponsor-label">Sponsored</span>
        <span class="ad-badge ${ad.theme || 'emerald'}">${ad.badge}</span>
      </div>
      <div class="ad-title">${ad.title}</div>
      <div class="ad-desc">${ad.description}</div>
    </div>
    <button id="adCtaBtn" class="ad-cta-btn">
      ${ad.buttonText}
    </button>
  `;

  $('adCtaBtn')?.addEventListener('click', () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(ad.url);
    } else {
      window.open(ad.url, '_blank');
    }
  });
}

function rotateAd() {
  currentAdIndex = (currentAdIndex + 1) % adConfig.sponsorBanners.length;
  renderBannerAd();
}

function showInterstitialAd() {
  if (!adConfig.interstitialEnabled) return;

  const banners = adConfig.sponsorBanners;
  const ad = banners[Math.floor(Math.random() * banners.length)];

  $('modalBadge').textContent = ad.badge;
  $('modalBadge').className = `ad-badge ${ad.theme || 'emerald'}`;
  $('modalTitle').textContent = ad.title;
  $('modalDesc').textContent = ad.description;
  $('modalCtaBtn').textContent = ad.buttonText;

  $('modalCtaBtn').onclick = () => {
    window.electronAPI?.openExternal(ad.url);
    hideInterstitialAd();
  };

  $('adModalOverlay').classList.add('visible');
}

function hideInterstitialAd() {
  $('adModalOverlay').classList.remove('visible');
}

// ==========================================
// UI & TRANSCRIPT RENDERING
// ==========================================
function showStatus(text, type) {
  const box = $('statusBanner');
  box.textContent = text;
  box.className = `status-banner ${type}`;
}

function setAIStatus(text) {
  const box = $('aiStatusMsg');
  box.textContent = text;
  box.classList.add('visible');
  setTimeout(() => {
    box.classList.remove('visible');
  }, 4000);
}

function displayResult(result) {
  currentResult = result;
  $('videoTitle').textContent = result.title || result.videoId;
  $('metaLang').textContent = `Language: ${result.language || 'English'}`;
  $('metaSegments').textContent = `Total Segments: ${result.snippets?.length || 0}`;

  // Summary
  $('summaryList').replaceChildren();
  for (const text of result.summary) {
    const li = document.createElement('li');
    li.textContent = text;
    $('summaryList').append(li);
  }

  // Segments
  renderSegments(result.snippets);

  $('resultsWorkspace').classList.add('visible');
}

function renderSegments(snippets, filterQuery = '') {
  const container = $('segmentsScroll');
  container.replaceChildren();

  const query = filterQuery.toLowerCase().trim();

  for (const segment of snippets) {
    if (query && !segment.text.toLowerCase().includes(query)) continue;

    const row = document.createElement('div');
    row.className = 'segment-row';

    const timestamp = document.createElement('span');
    timestamp.className = 'segment-timestamp';
    const seconds = Math.floor(segment.start);
    timestamp.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    
    // Clicking timestamp seeks or copies time
    timestamp.title = `Jump to ${timestamp.textContent}`;
    timestamp.addEventListener('click', () => {
      const url = $('urlInput').value.trim();
      if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
        const timeUrl = `${url}${url.includes('?') ? '&' : '?'}t=${seconds}s`;
        window.electronAPI?.openExternal(timeUrl);
      }
    });

    const text = document.createElement('span');
    text.className = 'segment-text';
    text.textContent = segment.text;

    row.append(timestamp, text);
    container.append(row);
  }
}

// ==========================================
// AI PROMPT INTEGRATION
// ==========================================
function buildPrompt(result, videoUrl) {
  const title = result.title || result.videoId || 'YouTube Video';
  const urlLine = videoUrl ? `Video URL: ${videoUrl}\n` : '';
  const transcriptText = (result.snippets || []).map(s => s.text).join(' ');
  return `Please summarize the following YouTube video transcript and highlight the key takeaways:\n\nTitle: ${title}\n${urlLine}\nTranscript:\n${transcriptText}`;
}

async function handleAIAction(service) {
  if (busy) return;
  if (!currentResult || !currentResult.snippets?.length) {
    showStatus('Please fetch a transcript first.', 'error');
    return;
  }

  const videoUrl = $('urlInput').value.trim();
  const prompt = buildPrompt(currentResult, videoUrl);

  // Copy full prompt to clipboard
  window.electronAPI?.copyToClipboard(prompt);

  const MAX_SAFE_URL_LENGTH = 2000;
  let targetUrl = '';
  let label = '';

  if (service === 'chatgpt') {
    const directUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    if (directUrl.length <= MAX_SAFE_URL_LENGTH) {
      targetUrl = directUrl;
      label = '✓ Pre-filled prompt in ChatGPT! (Opening browser...)';
    } else {
      targetUrl = 'https://chatgpt.com/';
      label = '✓ Copied to clipboard! Press Ctrl+V in ChatGPT to paste.';
    }
  } else if (service === 'claude') {
    const directUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
    if (directUrl.length <= MAX_SAFE_URL_LENGTH) {
      targetUrl = directUrl;
      label = '✓ Pre-filled prompt in Claude! (Opening browser...)';
    } else {
      targetUrl = 'https://claude.ai/new';
      label = '✓ Copied to clipboard! Press Ctrl+V in Claude to paste.';
    }
  } else if (service === 'gemini') {
    targetUrl = 'https://gemini.google.com/app';
    label = '✓ Copied to clipboard! Press Ctrl+V in Gemini to paste.';
  }

  setAIStatus(label);
  window.electronAPI?.openExternal(targetUrl);
}

// ==========================================
// FETCH CONTROLLER
// ==========================================
async function fetchTranscript() {
  if (busy) return;
  const video = $('urlInput').value.trim();
  if (!video) {
    showStatus('Please enter a YouTube video URL or ID.', 'error');
    return;
  }

  busy = true;
  $('fetchBtn').disabled = true;
  $('loadingBox').classList.add('visible');
  $('resultsWorkspace').classList.remove('visible');
  showStatus('', '');

  try {
    const languages = $('langInput').value.split(',').map(s => s.trim()).filter(Boolean);
    const response = await window.electronAPI.fetchTranscript({ video, languages });

    if (!response?.ok) {
      throw new Error(response?.error?.message || 'Failed to fetch transcript.');
    }

    fetchCount++;
    displayResult(response.result);
    showStatus(`Successfully loaded ${response.result.snippets.length} segments.`, 'success');

    // Trigger interstitial ad if scheduled
    if (fetchCount > 0 && fetchCount % adConfig.interstitialFrequency === 0) {
      setTimeout(showInterstitialAd, 800);
    }
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    busy = false;
    $('fetchBtn').disabled = false;
    $('loadingBox').classList.remove('visible');
  }
}

// ==========================================
// INITIALIZATION & LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderBannerAd();
  adInterval = setInterval(rotateAd, 15000); // Rotate sponsor card every 15s

  $('fetchBtn').addEventListener('click', fetchTranscript);
  $('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') fetchTranscript();
  });

  // AI Buttons
  $('btnChatGPT').addEventListener('click', () => handleAIAction('chatgpt'));
  $('btnClaude').addEventListener('click', () => handleAIAction('claude'));
  $('btnGemini').addEventListener('click', () => handleAIAction('gemini'));

  // Copy Prompt Only Button
  $('btnCopyPrompt').addEventListener('click', () => {
    if (!currentResult) return;
    const prompt = buildPrompt(currentResult, $('urlInput').value.trim());
    window.electronAPI?.copyToClipboard(prompt);
    setAIStatus('✓ Full prompt and transcript copied to clipboard!');
  });

  // Search in segments
  $('searchSegments').addEventListener('input', e => {
    if (currentResult?.snippets) {
      renderSegments(currentResult.snippets, e.target.value);
    }
  });

  // Interstitial modal controls
  $('modalCloseBtn').addEventListener('click', hideInterstitialAd);
  $('modalSkipBtn').addEventListener('click', hideInterstitialAd);

  // App version
  window.electronAPI?.getAppVersion().then(v => {
    $('appVersion').textContent = `v${v}`;
  });
});
