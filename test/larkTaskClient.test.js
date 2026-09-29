import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LarkTaskClient, taskListGuidFromInput } from '../src/larkTaskClient.js';

test('extracts task list guid from Lark applink', () => {
  const guid = taskListGuidFromInput('https://applink.larksuite.com/client/todo/task_list?guid=7882b6a5-3269-4916-8cc4-a90067bdc55f');

  assert.equal(guid, '7882b6a5-3269-4916-8cc4-a90067bdc55f');
});

test('uses raw value as task list guid', () => {
  assert.equal(taskListGuidFromInput('tl_123'), 'tl_123');
});

test('reads task list and tasks', async () => {
  const urls = [];
  const client = new LarkTaskClient({
    baseUrl: 'https://open.larksuite.com',
    larkClient: {
      async getTenantAccessToken() {
        return 'tenant-token';
      },
    },
    async fetchImpl(url, options) {
      urls.push({ url, options });
      if (url.includes('/tasks?')) {
        return Response.json({
          code: 0,
          data: {
            items: [
              { guid: 'task_1', summary: 'Follow up with client' },
              { guid: 'task_2', summary: 'Ship report' },
            ],
            has_more: false,
          },
        });
      }
      return Response.json({
        code: 0,
        data: {
          tasklist: {
            guid: 'tl_123',
            name: 'Account Management',
          },
        },
      });
    },
  });

  const result = await client.readTaskList('tl_123');

  assert.equal(result.guid, 'tl_123');
  assert.equal(result.tasklist.name, 'Account Management');
  assert.equal(result.tasks.length, 2);
  assert.equal(urls[0].options.headers.authorization, 'Bearer tenant-token');
  assert.match(urls[0].url, /\/open-apis\/task\/v2\/tasklists\/tl_123\?user_id_type=open_id$/);
  assert.match(urls[1].url, /\/open-apis\/task\/v2\/tasklists\/tl_123\/tasks\?user_id_type=open_id&page_size=50$/);
});

test('prefers user OAuth token by default when available', async () => {
  const urls = [];
  const client = new LarkTaskClient({
    baseUrl: 'https://open.larksuite.com',
    larkClient: {
      async getTenantAccessToken() {
        return 'tenant-token';
      },
    },
    userAuthClient: {
      async getAccessToken() {
        return 'user-token';
      },
    },
    async fetchImpl(url, options) {
      urls.push({ url, options });
      return Response.json({
        code: 0,
        data: {
          tasklist: {
            guid: 'tl_123',
            name: 'Account Management',
          },
        },
      });
    },
  });

  await client.getTaskList('tl_123');

  assert.equal(urls[0].options.headers.authorization, 'Bearer user-token');
});

test('uses tenant token when user OAuth token is missing', async () => {
  const urls = [];
  const client = new LarkTaskClient({
    baseUrl: 'https://open.larksuite.com',
    larkClient: {
      async getTenantAccessToken() {
        return 'tenant-token';
      },
    },
    async fetchImpl(url, options) {
      urls.push({ url, options });
      return Response.json({
        code: 0,
        data: {
          tasklist: {
            guid: 'tl_123',
            name: 'Account Management',
          },
        },
      });
    },
  });

  await client.getTaskList('tl_123');

  assert.equal(urls[0].options.headers.authorization, 'Bearer tenant-token');
});
