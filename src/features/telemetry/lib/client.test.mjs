import assert from 'node:assert/strict';
import test from 'node:test';
import { createCursorStore } from './client.ts';

test('cursor resumes notifications after cleanup cancels a pending frame', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const pending = new Map();
  let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => {
    pending.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => pending.delete(id);
  try {
    const cursor = createCursorStore();
    cursor.set(100);
    cursor.destroy();
    assert.equal(pending.size, 0);
    const positions = [];
    const unsubscribe = cursor.subscribe(() => positions.push(cursor.get()));
    cursor.set(1500);
    cursor.set(3000);
    assert.equal(pending.size, 1, 'pointer updates share one animation frame');
    const flush = () => {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(0));
    };
    flush();
    assert.deepEqual(positions, [3000], 'map and slider receive the latest position');
    unsubscribe();
    cursor.set(4000);
    flush();
    assert.deepEqual(positions, [3000]);
    cursor.destroy();
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
