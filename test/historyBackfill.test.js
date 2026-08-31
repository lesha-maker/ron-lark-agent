import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backfillLarkChatHistory } from '../src/historyBackfill.js';

test('backfills Lark history into normalized events', async () => {
  const stored = [];
  const calls = [];
  const result = await backfillLarkChatHistory({
    chatId: 'oc_history',
    days: 1,
    pageSize: 2,
    maxPages: 2,
    eventStore: {
      async append(event) {
        stored.push(event);
      },
    },
    larkClient: {
      async listMessages(args) {
        calls.push(args);
        return {
          has_more: false,
          items: [{
            message_id: 'om_history_1',
            chat_id: 'oc_history',
            chat_type: 'group',
            msg_type: 'text',
            create_time: '1798704000',
            sender: {
              id: { open_id: 'ou_sender' },
              sender_type: 'user',
            },
            body: {
              content: JSON.stringify({ text: 'historical customer note' }),
            },
          }],
        };
      },
    },
  });

  assert.equal(result.stored, 1);
  assert.equal(result.pages, 1);
  assert.equal(calls[0].containerId, 'oc_history');
  assert.equal(stored[0].sourceEventId, 'history:om_history_1');
  assert.equal(stored[0].message.text, 'historical customer note');
  assert.equal(stored[0].ingestion.mode, 'history_backfill');
});
