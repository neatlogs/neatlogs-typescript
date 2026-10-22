/**
 * trace() must never throw into the caller because of what it is asked to
 * record. A self-referencing input or result used to overflow the stack in
 * serializeObj, which skipped the callback (input) or failed a successful
 * call (result).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';

import { trace, _setSessionConfig } from '../../src/core/context.js';
import { serializeObj } from '../../src/decorators/base.js';
import { _clearMaskRegistry } from '../../src/core/mask.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
  _setSessionConfig({});
  _clearMaskRegistry();
});

function circular(): Record<string, any> {
  const node: Record<string, any> = { name: 'root', child: { name: 'leaf' } };
  node.child.parent = node;
  node.self = node;
  return node;
}

describe('serializeObj with reference cycles', () => {
  it('replaces a cycle with [Circular] and keeps the rest', () => {
    const out = serializeObj(circular());
    expect(out.name).toBe('root');
    expect(out.self).toBe('[Circular]');
    expect(out.child.name).toBe('leaf');
    expect(out.child.parent).toBe('[Circular]');
  });

  it('does not flag a value that is shared but not circular', () => {
    const shared = { x: 1 };
    const out = serializeObj({ a: shared, b: shared, list: [shared, shared] });
    expect(out.a).toEqual({ x: 1 });
    expect(out.b).toEqual({ x: 1 });
    expect(out.list).toEqual([{ x: 1 }, { x: 1 }]);
  });

  it('handles a cycle that goes through an array', () => {
    const list: any[] = [1];
    list.push(list);
    expect(serializeObj({ list })).toEqual({ list: [1, '[Circular]'] });
  });
});

describe('trace() with self-referencing values', () => {
  it('runs the callback when the input is circular', async () => {
    let ran = false;
    const result = await trace({ name: 'circ-in', input: circular() }, async () => {
      ran = true;
      return 'done';
    });
    expect(ran).toBe(true);
    expect(result).toBe('done');
    const span = exporter.getFinishedSpans().find((s) => s.name === 'circ-in')!;
    expect(span.status.code).not.toBe(2);
    expect(String(span.attributes['input.value'])).toContain('[Circular]');
  });

  it('returns the caller\'s circular result without failing the call', async () => {
    const value = circular();
    const result = await trace({ name: 'circ-out' }, async () => value);
    expect(result).toBe(value);
    const span = exporter.getFinishedSpans().find((s) => s.name === 'circ-out')!;
    expect(span.status.code).not.toBe(2);
    expect(String(span.attributes['output.value'])).toContain('[Circular]');
  });
});
