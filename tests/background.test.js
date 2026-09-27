import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MV3 worker owns requests, responds asynchronously, and saves results', async () => {
  const originalFetch = globalThis.fetch;
  let listener, saved, rules;
  globalThis.chrome = {
    runtime: { id: 'test-extension', onMessage: { addListener: fn => { listener = fn; } } },
    cookies: { set: async () => {} },
    permissions: { contains: async () => true },
    declarativeNetRequest: { updateSessionRules: async value => { rules = value; } },
    storage: { session: { set: async value => { saved = value; } } }
  };
  const responses = ['"INNERTUBE_API_KEY":"test"', JSON.stringify({
    playabilityStatus: { status: 'OK' }, captions: { playerCaptionsTracklistRenderer: {
      captionTracks: [{ languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk' }]
    } }
  }), '<transcript><text start="0" dur="3">A sample sentence.</text></transcript>'];
  globalThis.fetch = async () => {
    assert.ok(rules, 'Request rule must be ready before fetching');
    return new Response(responses.shift());
  };
  try {
    await import('../background.js');
    assert.equal(listener({ type: 'FETCH_TRANSCRIPT' }, { id: 'other' }, () => {}), false);
    assert.equal(listener({ type: 'FETCH_TRANSCRIPT' }, { id: 'test-extension', tab: {} }, () => {}), false);
    const response = await new Promise(resolve => {
      assert.equal(listener({ type: 'FETCH_TRANSCRIPT', video: 'abcdefghijk' }, { id: 'test-extension' }, resolve), true);
    });
    assert.equal(response.ok, true);
    const rule = rules.addRules[0];
    assert.deepEqual(rule.action.requestHeaders, [{ header: 'origin', operation: 'remove' }]);
    assert.deepEqual(rule.condition.initiatorDomains, ['test-extension']);
    assert.deepEqual(rule.condition.requestMethods, ['post']);
    assert.deepEqual(rule.condition.resourceTypes, ['xmlhttprequest']);
    const filter = new RegExp(rule.condition.regexFilter);
    assert.ok(filter.test('https://www.youtube.com/youtubei/v1/player?key=test'));
    assert.ok(!filter.test('https://www.youtube.com/youtubei/v1/player/other'));
    assert.ok(!filter.test('https://www.youtube.com.evil.test/youtubei/v1/player'));
    assert.ok(!filter.test('https://www.youtube.com/watch?v=abcdefghijk'));
    assert.equal(response.result.snippets[0].text, 'A sample sentence.');
    assert.deepEqual(saved.lastResult, response.result);
    const failure = await new Promise(resolve => listener({ type: 'FETCH_TRANSCRIPT', video: 'bad' }, { id: 'test-extension' }, resolve));
    assert.equal(failure.error.code, 'INVALID_VIDEO_ID');
    const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
    assert.equal(manifest.background.service_worker, 'dist/background.js');
    assert.ok(manifest.host_permissions.includes('https://*.youtube.com/*'));
    assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
    assert.doesNotMatch(await readFile(new URL('../popup.js', import.meta.url), 'utf8'), /\bfetch\s*\(/);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});
