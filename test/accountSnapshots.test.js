import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureAccountSnapshots } from '../src/accountSnapshots.js';

function memoryStore(initialEvents = []) {
  const events = [...initialEvents];
  return {
    events,
    async append(event) {
      events.push(event);
    },
    async all() {
      return events;
    },
  };
}

test('captures task-list baseline and reuses the same date snapshot', async () => {
  const store = memoryStore();
  let reads = 0;
  const result = await captureAccountSnapshots({
    eventStore: store,
    dateKey: '2026-09-29',
    now: new Date('2026-09-29T13:00:00.000Z'),
    taskListGuids: ['tl_1'],
    taskClient: {
      async readTaskList(guid) {
        reads += 1;
        return {
          guid,
          tasklist: { guid, name: 'Pathkind deployment' },
          tasks: [{ guid: 'task_1', summary: 'Questionnaire', completed_at: '0' }],
        };
      },
    },
    timelineDocsClient: {
      async readWikiDocument() {
        return { title: 'Timeline', wikiToken: 'wiki', content: 'Pathkind due Friday' };
      },
    },
    timelineWikiToken: 'wiki',
  });

  assert.match(result.changesText, /baseline captured/);
  assert.equal(store.events.length, 1);

  const reused = await captureAccountSnapshots({
    eventStore: store,
    dateKey: '2026-09-29',
    taskListGuids: ['tl_1'],
    taskClient: {
      async readTaskList() {
        throw new Error('should not reread same date');
      },
    },
  });

  assert.equal(reads, 1);
  assert.equal(reused.snapshot.dateKey, '2026-09-29');
});

test('detects completed tasks and changed timeline lines', async () => {
  const store = memoryStore([
    {
      source: 'account_snapshot',
      snapshot: {
        dateKey: '2026-09-28',
        taskLists: [{
          guid: 'tl_1',
          name: 'DS18 deployment',
          taskCount: 1,
          openCount: 1,
          tasks: [{ guid: 'task_1', summary: 'Platform Setup', completed: false, due: '' }],
        }],
        timelineDoc: {
          title: 'Timeline',
          contentHash: 'old',
          lines: ['DS18 starts Monday'],
        },
      },
    },
  ]);

  const result = await captureAccountSnapshots({
    eventStore: store,
    dateKey: '2026-09-29',
    taskListGuids: ['tl_1'],
    taskClient: {
      async readTaskList(guid) {
        return {
          guid,
          tasklist: { guid, name: 'DS18 deployment' },
          tasks: [{ guid: 'task_1', summary: 'Platform Setup', completed_at: '1790000000000' }],
        };
      },
    },
    timelineDocsClient: {
      async readWikiDocument() {
        return { title: 'Timeline', wikiToken: 'wiki', content: 'DS18 starts Tuesday' };
      },
    },
    timelineWikiToken: 'wiki',
  });

  assert.match(result.changesText, /completed "Platform Setup"/);
  assert.match(result.changesText, /DS18 starts Tuesday/);
});

test('can force a fresh same-date snapshot before sending the report', async () => {
  const store = memoryStore([
    {
      source: 'account_snapshot',
      snapshot: {
        dateKey: '2026-09-29',
        taskLists: [{
          guid: 'tl_1',
          name: 'DS18 deployment',
          taskCount: 1,
          openCount: 1,
          tasks: [{ guid: 'task_1', summary: 'Platform Setup', completed: false, due: '' }],
        }],
      },
    },
  ]);

  const result = await captureAccountSnapshots({
    eventStore: store,
    dateKey: '2026-09-29',
    force: true,
    taskListGuids: ['tl_1'],
    taskClient: {
      async readTaskList(guid) {
        return {
          guid,
          tasklist: { guid, name: 'DS18 deployment' },
          tasks: [
            { guid: 'task_1', summary: 'Platform Setup', completed_at: '0' },
            { guid: 'task_2', summary: 'Prod QA', completed_at: '0' },
          ],
        };
      },
    },
  });

  assert.match(result.changesText, /added task "Prod QA"/);
  assert.equal(store.events.length, 2);
});
