/**
 * The decisions of the Slack and Telegram write confinement. Slack: one Slack
 * workspace runs in one Kortix workspace, so the link decides (a fake link
 * state here; the rows behind the real one are proven on PostgreSQL in
 * `__tests__/integration-channel-write-scope.test.ts`).
 */
import { describe, expect, test } from 'bun:test';
import { CHANNEL_READ_SCOPES, CONVERSATION_NOT_IN_PROJECT } from './channel-read-scope';
import {
  SLACK_WRITE_TARGETS,
  type SlackLinkState,
  TELEGRAM_READS,
  gateChannelWrite,
  slackWriteRefusal,
  telegramReplyRefusal,
  telegramWriteRefusal,
} from './channel-write-scope';
import { SLACK_NOT_LINKED } from './slack-visibility';
import { channelCatalog } from './channels';

const MINE = 'project-mine';

function linkOf(state: SlackLinkState) {
  const asked: string[] = [];
  return {
    asked,
    linkState: async (projectId: string) => {
      asked.push(projectId);
      return state;
    },
  };
}

async function write(actionPath: string, args: Record<string, unknown>, state: SlackLinkState = 'linked') {
  return (await gateChannelWrite({ projectId: MINE, platform: 'slack', actionPath, args }, linkOf(state).linkState)).refusal;
}

describe('every Slack write is classified', () => {
  test('the write table covers exactly the catalog actions that are not reads', () => {
    const writes = channelCatalog('slack')
      .filter((a) => a.risk !== 'read')
      .map((a) => a.path)
      .sort();
    expect(Object.keys(SLACK_WRITE_TARGETS).sort()).toEqual(writes);
    expect(writes).toEqual(
      Object.entries(CHANNEL_READ_SCOPES.slack)
        .filter(([, scope]) => scope === 'write')
        .map(([path]) => path)
        .sort(),
    );
  });

  test('reads and other platforms are left to their own gates', async () => {
    expect(await write('get_history', { channel: 'C0ANY00001' }, 'not_linked')).toBeNull();
    expect(
      (await gateChannelWrite({ projectId: MINE, platform: 'email', actionPath: 'send_message', args: {} }, linkOf('not_linked').linkState))
        .refusal,
    ).toBeNull();
  });
});

describe('Slack writes follow the link', () => {
  test('the Kortix workspace holding the Slack workspace posts, replies, edits, reacts and joins anywhere its bot may', async () => {
    expect(await write('send_message', { channel: 'C0ANY00001', text: 'hi' })).toBeNull();
    expect(await write('send_message', { channel: 'U0PERSON01', text: 'hi' })).toBeNull();
    expect(await write('send_message', { channel: 'G0PRIVATE1', thread_ts: '100.000100', text: 'hi' })).toBeNull();
    expect(await write('update_message', { channel: 'C0ANY00001', ts: '100.000100', text: 'edit' })).toBeNull();
    expect(await write('add_reaction', { channel: 'C0ANY00001', timestamp: '100.000100', name: 'eyes' })).toBeNull();
    expect(await write('join_channel', { channel: 'C0ANY00001' })).toBeNull();
  });

  test('a Kortix workspace that does not hold the Slack workspace writes nothing', async () => {
    for (const [action, args] of [
      ['send_message', { channel: 'C0ANY00001', text: 'hi' }],
      ['join_channel', { channel: 'C0ANY00001' }],
      ['delete_message', { channel: 'C0ANY00001', ts: '100.000100' }],
    ] as const) {
      const refusal = await write(action, args, 'not_linked');
      expect(refusal?.reason).toBe(SLACK_NOT_LINKED);
      expect(refusal?.message).toContain('another Kortix workspace is connected to it');
    }
  });

  test('edits, deletes and reactions need the message ts', async () => {
    for (const [action, arg] of [
      ['update_message', 'ts'],
      ['delete_message', 'ts'],
      ['add_reaction', 'timestamp'],
      ['remove_reaction', 'timestamp'],
    ] as const) {
      const refusal = await write(action, { channel: 'C0ANY00001' });
      expect(refusal?.reason).toBe(CONVERSATION_NOT_IN_PROJECT);
      expect(refusal?.message).toBe(`\`${arg}\` is required.`);
    }
  });
});

describe('ids and installs', () => {
  test('a channel name, a lowercase id or a padded id is refused before the link is read: Slack resolves names', async () => {
    for (const channel of ['general', '#general', 'c0other001', ' C0OTHER001', 'C0OTHER001\n', ['C0MINE0001'], 42, undefined]) {
      const { linkState, asked } = linkOf('linked');
      const refusal = await slackWriteRefusal(MINE, { channel }, linkState);
      expect(refusal?.kind).toBe('invalid');
      expect(refusal?.message).toContain('`channel` must be one Slack conversation or user id');
      expect(asked).toEqual([]);
    }
  });

  test('a malformed thread_ts is refused; an empty one means no thread', async () => {
    expect((await write('send_message', { channel: 'C0MINE0001', thread_ts: 1700000000.0001 }))?.message).toBe(
      '`thread_ts` must be one Slack message timestamp, for example 1700000000.000100.',
    );
    expect((await write('send_message', { channel: 'C0MINE0001', thread_ts: 'latest' }))?.message).toContain('`thread_ts`');
    expect(await write('send_message', { channel: 'C0MINE0001', thread_ts: '', text: 'hi' })).toBeNull();
  });

  test('the refusal kinds the routes map to statuses', async () => {
    const kind = async (state: SlackLinkState, channel = 'C0ANY00001') =>
      (await slackWriteRefusal(MINE, { channel }, linkOf(state).linkState))?.kind ?? null;
    expect(await kind('linked', 'nope')).toBe('invalid');
    expect(await kind('no_install')).toBe('install');
    expect(await kind('not_linked')).toBe('not_linked');
    expect(await kind('linked')).toBeNull();
  });
});

describe('Telegram writes', () => {
  const OTHER_CHAT = 'This session answers Telegram chat 111222333 only. It does not send to, edit or delete messages in other chats.';

  test('every Telegram action but the two reads is a write into the chat its `chat_id` names', () => {
    const writes = channelCatalog('telegram').filter((a) => !TELEGRAM_READS.has(a.path));
    expect(writes.map((a) => a.path).sort()).toEqual(['delete_message', 'edit_message_text', 'send_chat_action', 'send_message']);
    for (const action of writes) {
      expect((action.inputSchema as { required: string[] }).required).toContain('chat_id');
    }
    expect([...TELEGRAM_READS].sort()).toEqual(['get_chat', 'get_me']);
  });

  test('a session no Telegram chat started or is bound to writes to any chat of the bot', () => {
    for (const chatId of [111222333, 444555666, '-1001234567890', '@any_channel']) {
      expect(telegramWriteRefusal(chatId, null)).toBeNull();
    }
  });

  test("a chat's session writes to its own chat, as a number or a string", () => {
    expect(telegramWriteRefusal(111222333, ['111222333'])).toBeNull();
    expect(telegramWriteRefusal('111222333', ['111222333'])).toBeNull();
    expect(telegramWriteRefusal(-1001234567890, ['-1001234567890'])).toBeNull();
  });

  test('another chat, a channel username and a malformed id are refused', () => {
    for (const chatId of [444555666, '444555666', '@other_channel', '111222333 ', '0111222333', 'abc', 111222333.5, '', undefined, null, [111222333]]) {
      expect(telegramWriteRefusal(chatId, ['111222333'])).toBe(OTHER_CHAT);
    }
  });

  test('a session bound to several chats writes to each of them and to no other', () => {
    expect(telegramWriteRefusal(111222333, ['111222333', '-100777888'])).toBeNull();
    expect(telegramWriteRefusal(-100777888, ['111222333', '-100777888'])).toBeNull();
    expect(telegramWriteRefusal(444555666, ['111222333', '-100777888'])).toBe(
      'This session answers Telegram chat 111222333 or -100777888 only. It does not send to, edit or delete messages in other chats.',
    );
  });

  test('a reply quotes a message of one of the chats the session answers, given as an object', () => {
    const own = ['111222333'];
    expect(telegramReplyRefusal(undefined, own)).toBeNull();
    expect(telegramReplyRefusal({ message_id: 5 }, own)).toBeNull();
    expect(telegramReplyRefusal({ chat_id: 111222333, message_id: 5 }, own)).toBeNull();
    expect(telegramReplyRefusal({ chat_id: 444555666, message_id: 5 }, own)).toBe(OTHER_CHAT);
    expect(telegramReplyRefusal({ chat_id: '@other_channel', message_id: 5 }, own)).toBe(OTHER_CHAT);
    for (const notAnObject of ['{"chat_id":444555666,"message_id":5}', null, 5, [5]]) {
      expect(telegramReplyRefusal(notAnObject, own)).toBe('`reply_parameters` must be an object, for example {"message_id": 5}.');
    }
    // A session no chat started quotes any chat, in any shape Telegram reads.
    expect(telegramReplyRefusal({ chat_id: 444555666, message_id: 5 }, null)).toBeNull();
    expect(telegramReplyRefusal('{"chat_id":444555666,"message_id":5}', null)).toBeNull();
  });

  test('a confined session whose chat is not on record writes nowhere', () => {
    expect(telegramWriteRefusal(111222333, [])).toBe(
      "This session's Telegram chat is not on record, so it writes to no chat. It does not send to, edit or delete messages in other chats.",
    );
  });
});
