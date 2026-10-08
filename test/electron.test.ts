// The Electron helpers, with BrowserWindow-shaped fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { frameSizeOf, maskRectsFromContent, unitsPerDip, windowIdOf } from '../dist/index';
import type { BoxLike } from '../dist/index';

test('windowIdOf parses the media source id', () => {
  assert.equal(windowIdOf({ getMediaSourceId: () => 'window:12345:0' }), 12345);
  assert.equal(windowIdOf({ getMediaSourceId: () => 'window:2295978:1' }), 2295978);
  for (const bad of ['screen:1:0', 'window::0', 'window:0:0', 'window:12', 'window:-3:0', '', 'window:99999999999999999999:0']) {
    assert.throws(() => windowIdOf({ getMediaSourceId: () => bad }), /not a window media source id/, bad);
  }
});

// A 640x400 content area under a 28-point title bar (macOS-like), or inside
// an 8-DIP border and a 31-DIP caption (Windows-like).
const mac = { getBounds: (): BoxLike => ({ x: 200, y: 100, width: 640, height: 428 }), getContentBounds: (): BoxLike => ({ x: 200, y: 128, width: 640, height: 400 }) };
const win = { getBounds: (): BoxLike => ({ x: 100, y: 50, width: 656, height: 439 }), getContentBounds: (): BoxLike => ({ x: 108, y: 81, width: 640, height: 400 }) };
const card: BoxLike = { x: 40, y: 60, width: 200, height: 120 };

test('macOS: content rects move by the title bar, in points (scale ignored)', () => {
  assert.deepEqual(maskRectsFromContent(mac, [card], 2, 'darwin'), [{ x: 40, y: 88, w: 200, h: 120 }]);
  assert.deepEqual(frameSizeOf(mac, 2, 'darwin'), [640, 428]);
});

test('Windows: moved by the frame offset, then times the scale factor', () => {
  assert.deepEqual(maskRectsFromContent(win, [card], 1, 'win32'), [{ x: 48, y: 91, w: 200, h: 120 }]);
  assert.deepEqual(maskRectsFromContent(win, [card], 1.5, 'win32'), [{ x: 72, y: 136.5, w: 300, h: 180 }]);
  assert.deepEqual(frameSizeOf(win, 1.5, 'win32'), [984, 658.5]);
});

test('Linux: X11 pixels, times the scale factor like Windows', () => {
  assert.deepEqual(maskRectsFromContent(win, [card], 1, 'linux'), [{ x: 48, y: 91, w: 200, h: 120 }]);
  assert.deepEqual(maskRectsFromContent(win, [card], 2, 'linux'), [{ x: 96, y: 182, w: 400, h: 240 }]);
});

test('several rects, none, and a nonsense scale factor', () => {
  assert.deepEqual(maskRectsFromContent(mac, [], 1, 'darwin'), []);
  assert.equal(maskRectsFromContent(mac, [card, card, card], 1, 'darwin').length, 3);
  assert.equal(unitsPerDip(0, 'win32'), 1);
  assert.equal(unitsPerDip(NaN, 'win32'), 1);
  assert.equal(unitsPerDip(1.25, 'win32'), 1.25);
  assert.equal(unitsPerDip(2, 'darwin'), 1);
  assert.equal(unitsPerDip(2, 'linux'), 2);
});
