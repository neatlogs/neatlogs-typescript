import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NeatlogsOpencodePlugin } from '../../../src/opencode-plugin.js';
import { TraceShipper, type OtlpSpan } from '../../../src/opencode-trace-shipper.js';

const UNSET = 0;
const OK = 1;
const ERROR = 2;

let shipped: OtlpSpan[];

beforeEach(() => {
  shipped = [];
  vi.spyOn(TraceShipper.prototype, 'enqueue').mockImplementation((span: OtlpSpan) => {
    shipped.push(span);
  });
  vi.spyOn(TraceShipper.prototype, 'flush').mockResolvedValue(undefined as never);
});
afterEach(() => vi.restoreAllMocks());

const named = (prefix: string) => shipped.filter((span) => span.name.startsWith(prefix));
const attr = (span: OtlpSpan, key: string) => {
  const value = span.attributes.find((a) => a.key === key)?.value;
  return value?.stringValue ?? value?.boolValue;
};

/** One user turn in session `s1`, answered by `assistant`, then idle. */
async function turn(assistant: Record<string, unknown>, extra: Array<Record<string, unknown>> = []) {
  const plugin = await NeatlogsOpencodePlugin({});
  await plugin['chat.message']({ sessionID: 's1' }, { parts: [{ type: 'text', text: 'hello' }] });
  const events = [
    { type: 'message.updated', properties: { info: { id: 'm1', sessionID: 's1', role: 'assistant', modelID: 'gpt-test', ...assistant } } },
    ...extra,
    { type: 'session.idle', properties: { sessionID: 's1' } },
  ];
  for (const event of events) await plugin.event({ event });
}

describe('NeatlogsOpencodePlugin span status', () => {
  it('records a failed assistant message and its turn as errors', async () => {
    await turn({ error: { name: 'APIError', data: { message: 'Rate limit exceeded' } } });

    const [llm] = named('opencode.llm.');
    expect(llm.status).toEqual({ code: ERROR, message: 'Rate limit exceeded' });
    expect(attr(llm, 'neatlogs.error.type')).toBe('APIError');
    expect(attr(llm, 'neatlogs.error.message')).toBe('Rate limit exceeded');

    const [root] = named('opencode.turn');
    expect(root.status).toEqual({ code: ERROR, message: 'Rate limit exceeded' });
  });

  it('records a session error on the turn', async () => {
    await turn({ time: { completed: 1 } }, [
      { type: 'session.error', properties: { sessionID: 's1', error: { name: 'UnknownError', data: { message: 'boom' } } } },
    ]);

    expect(named('opencode.llm.')[0].status?.code).toBe(OK);
    expect(named('opencode.turn')[0].status).toEqual({ code: ERROR, message: 'boom' });
  });

  it('records a user abort as cancelled, not as an error', async () => {
    await turn({ error: { name: 'MessageAbortedError', data: { message: 'The operation was aborted.' } } });

    for (const span of [named('opencode.llm.')[0], named('opencode.turn')[0]]) {
      expect(span.status?.code).toBe(UNSET);
      expect(attr(span, 'neatlogs.stream.cancelled')).toBe(true);
    }
  });

  it('records a failed tool call as an error', async () => {
    const plugin = await NeatlogsOpencodePlugin({});
    await plugin['chat.message']({ sessionID: 's1' }, { parts: [{ type: 'text', text: 'hello' }] });
    await plugin['tool.execute.before']({ sessionID: 's1', callID: 'c1', tool: 'bash' }, { args: { command: 'ls' } });
    await plugin.event({
      event: {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            callID: 'c1',
            messageID: 'm1',
            sessionID: 's1',
            state: { status: 'error', input: { command: 'ls' }, error: 'command not found' },
          },
        },
      },
    });

    const [tool] = named('opencode.tool.bash');
    expect(tool.status).toEqual({ code: ERROR, message: 'command not found' });
  });

  it('still records a successful turn as OK', async () => {
    await turn({ time: { completed: 1 } });

    expect(named('opencode.llm.')[0].status).toEqual({ code: OK });
    expect(named('opencode.turn')[0].status).toEqual({ code: OK });
  });
});
