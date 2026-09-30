import test from 'node:test';
import assert from 'node:assert/strict';

function buildPrompt(result, videoUrl) {
  const title = result.title || result.videoId || 'YouTube Video';
  const urlLine = videoUrl ? `Video URL: ${videoUrl}\n` : '';
  const transcriptText = (result.snippets || []).map(s => s.text).join(' ');
  return `Please summarize the following YouTube video transcript and highlight the key takeaways:\n\nTitle: ${title}\n${urlLine}\nTranscript:\n${transcriptText}`;
}

function resolveAIUrl(service, prompt) {
  const MAX_SAFE_URL_LENGTH = 2000;
  if (service === 'chatgpt') {
    const directUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    return directUrl.length <= MAX_SAFE_URL_LENGTH ? { url: directUrl, prefilled: true } : { url: 'https://chatgpt.com/', prefilled: false };
  }
  if (service === 'claude') {
    const directUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
    return directUrl.length <= MAX_SAFE_URL_LENGTH ? { url: directUrl, prefilled: true } : { url: 'https://claude.ai/new', prefilled: false };
  }
  if (service === 'gemini') {
    return { url: 'https://gemini.google.com/app', prefilled: false };
  }
  throw new Error(`Unknown service: ${service}`);
}

test('buildPrompt formats title, url, and snippets cleanly', () => {
  const prompt = buildPrompt({
    title: 'Test Video Title',
    snippets: [{ text: 'Sentence one.' }, { text: 'Sentence two.' }]
  }, 'https://www.youtube.com/watch?v=123');

  assert.ok(prompt.includes('Title: Test Video Title'));
  assert.ok(prompt.includes('Video URL: https://www.youtube.com/watch?v=123'));
  assert.ok(prompt.includes('Sentence one. Sentence two.'));
});

test('Option B: short transcripts are pre-filled via URL parameter for ChatGPT & Claude', () => {
  const shortPrompt = 'Please summarize: Short test transcript.';
  const chatgpt = resolveAIUrl('chatgpt', shortPrompt);
  assert.equal(chatgpt.prefilled, true);
  assert.ok(chatgpt.url.startsWith('https://chatgpt.com/?q='));

  const claude = resolveAIUrl('claude', shortPrompt);
  assert.equal(claude.prefilled, true);
  assert.ok(claude.url.startsWith('https://claude.ai/new?q='));
});

test('Option B: long transcripts safely fall back to base URL for ChatGPT & Claude to avoid 414 errors', () => {
  const longPrompt = 'A'.repeat(2500);
  const chatgpt = resolveAIUrl('chatgpt', longPrompt);
  assert.equal(chatgpt.prefilled, false);
  assert.equal(chatgpt.url, 'https://chatgpt.com/');

  const claude = resolveAIUrl('claude', longPrompt);
  assert.equal(claude.prefilled, false);
  assert.equal(claude.url, 'https://claude.ai/new');
});

test('Option A: Gemini always uses base URL without query parameter', () => {
  const geminiShort = resolveAIUrl('gemini', 'Short prompt');
  assert.equal(geminiShort.prefilled, false);
  assert.equal(geminiShort.url, 'https://gemini.google.com/app');

  const geminiLong = resolveAIUrl('gemini', 'B'.repeat(5000));
  assert.equal(geminiLong.prefilled, false);
  assert.equal(geminiLong.url, 'https://gemini.google.com/app');
});
