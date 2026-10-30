import test from 'node:test';
import assert from 'node:assert/strict';
import { adConfig } from '../desktop/ad-config.js';

test('desktop ad-config has required fields and active banners', () => {
  assert.ok(adConfig.mode === 'sponsor' || adConfig.mode === 'network');
  assert.equal(typeof adConfig.interstitialEnabled, 'boolean');
  assert.ok(adConfig.interstitialFrequency >= 1);
  assert.ok(Array.isArray(adConfig.sponsorBanners));
  assert.ok(adConfig.sponsorBanners.length >= 1);

  for (const banner of adConfig.sponsorBanners) {
    assert.ok(banner.id, 'Banner must have an id');
    assert.ok(banner.title, 'Banner must have a title');
    assert.ok(banner.description, 'Banner must have a description');
    assert.ok(banner.badge, 'Banner must have a badge');
    assert.ok(banner.buttonText, 'Banner must have a CTA label');
    assert.ok(banner.url.startsWith('https://'), 'Banner URL must be https');
  }
});
