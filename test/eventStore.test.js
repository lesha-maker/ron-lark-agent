import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JsonlEventStore } from '../src/eventStore.js';

test('reads recent JSONL events', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ron-events-'));
  const store = new JsonlEventStore(path.join(dir, 'events.jsonl'));

  await store.append({ id: 1 });
  await store.append({ id: 2 });
  await store.append({ id: 3 });

  assert.deepEqual(await store.recent(2), [{ id: 2 }, { id: 3 }]);
});

test('returns empty recent events when store is missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ron-events-'));
  const store = new JsonlEventStore(path.join(dir, 'missing.jsonl'));

  assert.deepEqual(await store.recent(), []);
});
