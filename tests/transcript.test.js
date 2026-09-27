import test from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeTranscriptApi, parseTranscript, selectTrack, extractVideoId, assertPlayability } from '../transcript.js';
import { summarize } from '../summary.js';

const id = 'abcdefghijk';
const track = { languageCode: 'en', name: { runs: [{ text: 'English' }] }, baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&fmt=srv3', isTranslatable: true };
const player = { playabilityStatus: { status: 'OK' }, videoDetails: { title: 'Example' }, captions: {
  playerCaptionsTracklistRenderer: { captionTracks: [track], translationLanguages: [{ languageCode: 'de', languageName: { runs: [{ text: 'German' }] } }] }
} };
const xml = '<transcript><text start="1.2" dur="2.3">Hello &amp;amp; &amp;lt;i&amp;gt;world&amp;lt;/i&amp;gt; &#39;ok&#39;</text><text start="4">Bye</text></transcript>';
function mock(responses, calls = []) {
  return async (url, options) => { calls.push({ url, options }); const next = responses.shift(); if (next instanceof Error) throw next; return new Response(next?.body ?? next, { status: next?.status ?? 200 }); };
}
test('validates host and exact ID; handles reordered URL queries', () => {
  assert.equal(extractVideoId(`https://www.youtube.com/watch?x=1&v=${id}`), id);
  for (const path of ['shorts', 'live', 'embed']) assert.equal(extractVideoId(`https://youtube.com/${path}/${id}`), id);
  assert.equal(extractVideoId(`https://youtu.be/${id}?t=4`), id);
  assert.equal(extractVideoId(`https://evil.com/watch?v=${id}`), null);
  assert.equal(extractVideoId(id + 'x'), null);
});
test('language priority first, manual preferred within each language', () => {
  const generated = { ...track, kind: 'asr', languageCode: 'de' };
  assert.equal(selectTrack([track, generated], ['de', 'en']), generated);
  assert.equal(selectTrack([{ ...track, kind: 'asr' }, track]), track);
  assert.throws(() => selectTrack([track], ['fr']), { code: 'NO_TRANSCRIPT_FOUND' });
});
test('XML entity decoding, formatting, fractional timing, missing duration', () => {
  assert.deepEqual(parseTranscript(xml), [{ start: 1.2, duration: 2.3, text: "Hello & world 'ok'" }, { start: 4, duration: 0, text: 'Bye' }]);
  assert.match(parseTranscript(xml, true)[0].text, /<i>world<\/i>/);
  assert.throws(() => parseTranscript('<html>Challenge</html>'), { code: 'INVALID_TRANSCRIPT' });
  assert.throws(() => parseTranscript(''), { code: 'EMPTY_TRANSCRIPT' });
  assert.throws(() => parseTranscript('<transcript><text>'), { code: 'INVALID_TRANSCRIPT' });
});
test('watch → Android player → selected XML captions', async () => {
  const calls = [];
  const api = new YouTubeTranscriptApi({ fetchImpl: mock(['"INNERTUBE_API_KEY": "dynamic-key"', JSON.stringify(player), xml], calls) });
  const result = await api.fetch(id);
  assert.equal(result.title, 'Example');
  assert.equal(result.snippets.length, 2);
  assert.match(calls[1].url, /key=dynamic-key/);
  assert.deepEqual(JSON.parse(calls[1].options.body), { context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId: id });
  assert.equal(new URL(calls[2].url).searchParams.has('fmt'), false);
  assert.ok(calls.every(c => c.options.credentials === 'include'));
});
test('consent cookie and exactly one watch retry', async () => {
  let cookie;
  const api = new YouTubeTranscriptApi({ setConsent: async v => { cookie = v; }, fetchImpl: mock([
    '<form action="https://consent.youtube.com/s"><input name="v" value="abc"></form>',
    '"INNERTUBE_API_KEY":"key"', JSON.stringify(player), xml
  ]) });
  await api.fetch(id);
  assert.equal(cookie, 'YES+abc');
});
test('translation uses tlang and updates metadata', async () => {
  const calls = [];
  const api = new YouTubeTranscriptApi({ fetchImpl: mock(['"INNERTUBE_API_KEY":"key"', JSON.stringify(player), xml], calls) });
  const result = await api.fetch(id, { translateTo: 'de' });
  assert.equal(result.languageCode, 'de');
  assert.equal(result.isGenerated, true);
  assert.equal(new URL(calls[2].url).searchParams.get('tlang'), 'de');
});
test('preserves block, no captions, token and HTTP errors', async () => {
  assert.throws(() => assertPlayability({ status: 'LOGIN_REQUIRED', reason: "Sign in to confirm you're not a bot" }), { code: 'REQUEST_BLOCKED' });
  assert.throws(() => assertPlayability({ status: 'LOGIN_REQUIRED', reason: 'Please confirm your age' }), { code: 'AGE_RESTRICTED' });
  const api = new YouTubeTranscriptApi({ fetchImpl: mock([{ status: 429, body: '' }]) });
  await assert.rejects(api.fetch(id), { code: 'IP_BLOCKED' });
  await assert.rejects(api.request('https://evil.com/'), { code: 'INVALID_URL' });
  const noCaptions = new YouTubeTranscriptApi({ fetchImpl: mock(['"INNERTUBE_API_KEY":"key"', '{"playabilityStatus":{"status":"OK"}}']) });
  await assert.rejects(noCaptions.fetch(id), { code: 'TRANSCRIPTS_DISABLED' });
  const tokenPlayer = structuredClone(player);
  tokenPlayer.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl += '&exp=xpe';
  const tokenApi = new YouTubeTranscriptApi({ fetchImpl: mock(['"INNERTUBE_API_KEY":"key"', JSON.stringify(tokenPlayer)]) });
  await assert.rejects(tokenApi.fetch(id), { code: 'PO_TOKEN_REQUIRED' });
});
test('summary is bounded, ordered, and source-derived', () => {
  const text = 'Plants need sunlight. Sunlight helps plants grow. Water also helps plants. Rocks are hard. Plants grow leaves. Leaves absorb sunlight.';
  const result = summarize([{ text }], 3);
  assert.equal(result.length, 3);
  assert.ok(result.every(s => text.includes(s)));
  assert.deepEqual(result.map(s => text.indexOf(s)), result.map(s => text.indexOf(s)).sort((a, b) => a - b));
  assert.deepEqual(summarize([]), []);
});

test('denied host permission is distinguished before sending a request', async () => {
  let requested = false;
  const api = new YouTubeTranscriptApi({ checkPermission: async origin => {
    assert.equal(origin, 'https://www.youtube.com');
    return false;
  }, fetchImpl: async () => { requested = true; } });
  await assert.rejects(api.fetch(id), { code: 'SITE_PERMISSION_REQUIRED' });
  assert.equal(requested, false);
});

test('network failure identifies the stage without exposing signed query parameters', async () => {
  const api = new YouTubeTranscriptApi({ fetchImpl: mock([new TypeError('Failed to fetch')]) });
  await assert.rejects(api.request('https://www.youtube.com/api/timedtext?signature=secret'), error => {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.diagnostic.stage, 'caption download');
    assert.equal(error.diagnostic.browserMessage, 'Failed to fetch');
    assert.equal(error.diagnostic.endpoint, 'https://www.youtube.com/api/timedtext');
    assert.ok(!JSON.stringify(error).includes('secret'));
    return true;
  });
});

test('default browser fetch receives the worker global as its receiver', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async function (url, options) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    calls++;
    assert.equal(url, 'https://www.youtube.com/watch?v=abcdefghijk');
    assert.equal(options.credentials, 'include');
    return new Response('watch HTML');
  };
  try {
    const api = new YouTubeTranscriptApi();
    assert.equal(await api.request('https://www.youtube.com/watch?v=abcdefghijk'), 'watch HTML');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTTP rejection reports status and endpoint without signed parameters', async () => {
  const api = new YouTubeTranscriptApi({ fetchImpl: mock([{ status: 403, body: 'Forbidden' }]) });
  await assert.rejects(api.request('https://www.youtube.com/youtubei/v1/player?key=secret'), error => {
    assert.equal(error.code, 'HTTP_ERROR');
    assert.equal(error.message, 'YouTube player API returned HTTP 403.');
    assert.equal(error.diagnostic.status, 403);
    assert.equal(error.diagnostic.stage, 'player API');
    assert.ok(!JSON.stringify(error).includes('secret'));
    return true;
  });
});
