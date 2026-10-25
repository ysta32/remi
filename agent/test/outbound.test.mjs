import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingCallConfig, normalizeDestination } from '../lib/outbound.mjs';

test('destinations: US numbers get +1, emails are Apple IDs, junk is refused', () => {
  assert.deepEqual(normalizeDestination('215-555-0142'), { destination: '+12155550142', destination_type: 'phone' });
  assert.deepEqual(normalizeDestination('+44 20 7946 0958'), { destination: '+442079460958', destination_type: 'phone' });
  assert.deepEqual(normalizeDestination('hal@icloud.com'), { destination: 'hal@icloud.com', destination_type: 'email' });
  assert.throws(() => normalizeDestination('12'));
});

test('placeholders count as missing', () => {
  assert.deepEqual(missingCallConfig({ LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's', CHERT_FACETIME_TOKEN: 'YOUR_TOKEN', CHERT_PROJECT_ID: 'p' }), ['CHERT_FACETIME_TOKEN']);
});
