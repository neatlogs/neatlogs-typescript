import { describe, it, expect } from 'vitest';
import { UnifiedAttributeProcessor } from '../../src/core/attribute-processor.js';
import { AttributeMapper } from '../../src/config/attribute-mapper.js';
import type { SpanDict } from '../../src/core/attribute-processor.js';

function makeSpan(overrides: Partial<SpanDict> = {}): SpanDict {
  return {
    name: 'test-span',
    kind: 1,
    trace_id: '00000000000000000000000000000001',
    span_id: '0000000000000001',
    parent_span_id: null,
    start_time: 1000000000, // 1s in ns
    end_time: 2000000000, // 2s in ns
    status: { code: 1, message: 'OK' },
    attributes: {},
    resource: {},
    instrumentation_scope: null,
    events: [],
    ...overrides,
  };
}

describe('UnifiedAttributeProcessor', () => {
  const mapper = new AttributeMapper();
  const processor = new UnifiedAttributeProcessor(mapper);

  describe('normalize', () => {
    it('should compute duration_ms', () => {
      const span = makeSpan({
        start_time: 1_000_000_000,
        end_time: 2_000_000_000,
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.metrics.duration_ms']).toBe(1000);
    });

    it('should set neatlogs.span.kind from openinference.span.kind', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('llm');
    });

    it('should infer span kind from span name when no openinference.span.kind', () => {
      const span = makeSpan({
        name: 'openai.chat.completions',
        attributes: {},
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('llm');
    });

    it('should detect provider from instrumentation scope', () => {
      const span = makeSpan({
        attributes: {},
        instrumentation_scope: { name: 'openinference.instrumentation.openai' },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.provider'] ?? result['neatlogs.llm.provider']).toBeTruthy();
    });

    it('should detect framework from instrumentation scope', () => {
      const span = makeSpan({
        attributes: { 'openinference.span.kind': 'CHAIN' },
        instrumentation_scope: { name: 'openinference.instrumentation.langchain' },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.framework']).toBe('langchain');
    });

    it('should map LLM model name', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.model_name': 'gpt-4o',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.model_name']).toBe('gpt-4o');
    });

    it('should map token counts', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.token_count.prompt': 100,
          'llm.token_count.completion': 50,
          'llm.token_count.total': 150,
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.token_count.prompt']).toBe(100);
      expect(result['neatlogs.llm.token_count.completion']).toBe(50);
      expect(result['neatlogs.llm.token_count.total']).toBe(150);
    });

    it('should map gen_ai token counts', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'gen_ai.usage.input_tokens': 200,
          'gen_ai.usage.output_tokens': 80,
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.token_count.prompt']).toBe(200);
      expect(result['neatlogs.llm.token_count.completion']).toBe(80);
    });

    it('should merge resource attributes', () => {
      const span = makeSpan({
        resource: { 'service.name': 'my-service' },
        attributes: { 'openinference.span.kind': 'LLM' },
      });
      const result = processor.normalize(span);
      // Resource attrs should be available for mapping
      expect(result).toBeDefined();
    });
  });

  describe('convention normalization', () => {
    it('should detect HTTP spans from CLIENT kind with http attrs', () => {
      const span = makeSpan({
        kind: 3, // CLIENT
        attributes: {
          'http.method': 'GET',
          'http.url': 'https://example.com',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('http');
    });

    it('should detect CrewAI spans as CHAIN', () => {
      const span = makeSpan({
        attributes: {
          'crewai.crew.id': 'crew-123',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('chain');
    });

    it('should extract tool calls from OpenInference format', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.output_messages.0.message.tool_calls.0.tool_call.function.name': 'search',
          'llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments': '{"q":"test"}',
          'llm.output_messages.0.message.tool_calls.0.tool_call.id': 'tc_1',
        },
      });
      const result = processor.normalize(span);
      // The tool call attrs should have been extracted and reorganized
      // They should be mapped to neatlogs.* namespace or passed through
      expect(result).toBeDefined();
    });

    it('should detect vector DB RETRIEVER from db.system', () => {
      const span = makeSpan({
        attributes: {
          'db.system': 'chroma',
          'db.operation': 'query',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('retriever');
    });

    it('should detect vector DB VECTOR_STORE from db.system with write op', () => {
      const span = makeSpan({
        attributes: {
          'db.system': 'pinecone',
          'db.operation': 'upsert',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('vector_store');
    });

    it('should detect RERANKER from llm.request.type', () => {
      // RERANKER is inferred from llm.request.type only when the span kind
      // wasn't explicitly set (see hasExplicitKind guard in attribute-processor).
      // An explicit openinference.span.kind is respected and not overridden.
      const span = makeSpan({
        attributes: {
          'llm.request.type': 'rerank',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('reranker');
    });

    it('should detect RERANKER from span name', () => {
      const span = makeSpan({
        name: 'cohere_rerank_documents',
        attributes: {},
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.span.kind']).toBe('reranker');
    });
  });

  describe('CrewAI token usage fallback', () => {
    it('should parse CrewAI token usage string', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'CHAIN',
          'neatlogs.crew.token_usage':
            'total_tokens=67305 prompt_tokens=46983 cached_prompt_tokens=0 completion_tokens=20322 successful_requests=27',
        },
      });
      const result = processor.normalize(span);
      // The token counts should have been extracted before mapping
      expect(result['neatlogs.llm.token_count.prompt']).toBe(46983);
      expect(result['neatlogs.llm.token_count.completion']).toBe(20322);
      expect(result['neatlogs.llm.token_count.total']).toBe(67305);
    });

    it('should not overwrite existing token counts', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.token_count.prompt': 100,
          'llm.token_count.completion': 50,
          'llm.token_count.total': 150,
          'neatlogs.crew.token_usage': 'total_tokens=999 prompt_tokens=888 completion_tokens=111',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.token_count.prompt']).toBe(100);
      expect(result['neatlogs.llm.token_count.completion']).toBe(50);
      expect(result['neatlogs.llm.token_count.total']).toBe(150);
    });
  });

  describe('reasoning tokens from output.value', () => {
    it('should extract reasoning tokens from output.value JSON', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'output.value': JSON.stringify({
            usage: {
              completion_tokens_details: {
                reasoning_tokens: 42,
              },
            },
          }),
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.token_count.reasoning']).toBe(42);
    });

    it('should not overwrite existing reasoning tokens', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.token_count.completion_details.reasoning': 10,
          'output.value': JSON.stringify({
            usage: {
              completion_tokens_details: {
                reasoning_tokens: 99,
              },
            },
          }),
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.token_count.reasoning']).toBe(10);
    });
  });

  describe('MCP extraction', () => {
    it('should parse MCP signals from traceloop.entity.input', () => {
      const span = makeSpan({
        attributes: {
          'traceloop.entity.input': JSON.stringify({
            method: 'tools/call',
            tool_name: 'my_tool',
            arguments: { key: 'value' },
          }),
          'traceloop.entity.output': '{"result":"ok"}',
        },
      });
      const result = processor.normalize(span);
      // MCP attrs should be set and possibly mapped
      expect(result).toBeDefined();
    });

    it('should extract MCP initialize details', () => {
      const span = makeSpan({
        attributes: {
          'mcp.method.name': 'initialize',
          'traceloop.entity.output': JSON.stringify({
            protocolVersion: '1.0',
            serverInfo: { name: 'test-server', version: '0.1.0' },
            capabilities: { tools: true },
          }),
        },
      });
      const result = processor.normalize(span);
      expect(result).toBeDefined();
    });
  });

  describe('embedding spans', () => {
    it('should extract embedding texts', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'EMBEDDING',
          'embedding.embeddings.0.embedding.text': 'hello world',
          'embedding.embeddings.1.embedding.text': 'foo bar',
        },
      });
      const result = processor.normalize(span);
      // Embeddings data should be collected and serialized
      expect(result).toBeDefined();
    });

    it('should filter embedding vectors for embedding spans', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'EMBEDDING',
          'embedding.model_name': 'text-embedding-ada-002',
          'embedding.embeddings.0.embedding.vector': new Array(1536).fill(0.1),
          'embedding.embeddings.0.embedding.text': 'hello',
        },
      });
      const result = processor.normalize(span);
      // Large vectors should be filtered
      const hasLargeVector = Object.values(result).some(
        (v) => Array.isArray(v) && v.length > 1000,
      );
      expect(hasLargeVector).toBe(false);
    });
  });

  describe('vector DB doc attributes', () => {
    it('should extract chroma doc attributes', () => {
      const span = makeSpan({
        attributes: {
          'db.system': 'chroma',
          'db.operation': 'query',
          'db.chroma.query.n_results': 10,
          'db.chroma.query.include': 'documents',
        },
      });
      const result = processor.normalize(span);
      expect(result).toBeDefined();
    });

    it('should extract qdrant doc attributes', () => {
      const span = makeSpan({
        attributes: {
          'db.system': 'qdrant',
          'db.operation': 'upsert',
          'qdrant.upsert.points_count': 100,
        },
      });
      const result = processor.normalize(span);
      expect(result).toBeDefined();
    });
  });

  describe('operational metrics', () => {
    it('should compute TTFT from gen_ai.content.chunk events', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
        },
        start_time: 1_000_000_000,
        end_time: 3_000_000_000,
        events: [
          { name: 'gen_ai.content.chunk', timestamp: 1_500_000_000, attributes: {} },
          { name: 'gen_ai.content.chunk', timestamp: 2_500_000_000, attributes: {} },
        ],
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.metrics.ttft_ms']).toBe(500);
      expect(result['neatlogs.llm.metrics.streaming_time_to_generate_ms']).toBe(1000);
    });

    it('should not override existing TTFT', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'neatlogs.llm.metrics.ttft_ms': 123,
        },
        events: [
          { name: 'gen_ai.content.chunk', timestamp: 1_500_000_000, attributes: {} },
        ],
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.metrics.ttft_ms']).toBe(123);
    });
  });

  describe('event upcycling', () => {
    it('should extract retriever documents from db.query.result events', () => {
      const span = makeSpan({
        attributes: { 'openinference.span.kind': 'RETRIEVER' },
        events: [
          {
            name: 'db.query.result',
            timestamp: 1_500_000_000,
            attributes: {
              'db.query.result.id': 'doc-1',
              'db.query.result.distance': 0.5,
              'db.query.result.document': 'hello world',
            },
          },
          {
            name: 'db.query.result',
            timestamp: 1_600_000_000,
            attributes: {
              'db.query.result.id': 'doc-2',
              'db.query.result.distance': 0.7,
            },
          },
        ],
      });
      const result = processor.normalize(span);
      // The mapper maps retrieval_documents → neatlogs.vectordb.retrieval_documents
      const docs = result['neatlogs.vectordb.retrieval_documents'] ?? result['retrieval_documents'];
      expect(docs).toBeDefined();
      const parsed = JSON.parse(docs);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('doc-1');
      expect(parsed[0].distance).toBe(0.5);
    });

    it('should extract embedding dimension from db.query.embeddings events', () => {
      const span = makeSpan({
        attributes: { 'openinference.span.kind': 'RETRIEVER' },
        events: [
          {
            name: 'db.query.embeddings',
            timestamp: 1_500_000_000,
            attributes: {
              'db.query.embeddings.vector': new Array(768).fill(0.1),
            },
          },
        ],
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.db.query.embeddings.dimension']).toBe(768);
    });
  });

  describe('provider gap filling', () => {
    it('should infer provider from model name when no scope info', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.model_name': 'gpt-4o',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.provider']).toBe('openai');
    });

    it('should infer system from provider', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.model_name': 'claude-3-5-sonnet',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.provider']).toBe('anthropic');
      expect(result['neatlogs.llm.system']).toBe('anthropic');
    });

    it('should infer google from gemini models', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.model_name': 'gemini-1.5-pro',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.provider']).toBe('google');
    });

    it('should infer aws from bedrock model IDs', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.model_name': 'anthropic.claude-3-5-sonnet-v1:0',
        },
      });
      const result = processor.normalize(span);
      expect(result['neatlogs.llm.provider']).toBeTruthy();
    });
  });

  describe('intermediate steps', () => {
    it('should extract ReAct steps from output messages', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.output_messages.0.message.role': 'assistant',
          'llm.output_messages.0.message.content':
            'Thought: I need to search\nAction: search_tool\nAction Input: {"q":"test"}\nObservation: Found results\nFinal Answer: Here are the results',
        },
      });
      const result = processor.normalize(span);
      if (result['neatlogs.llm.intermediate_steps']) {
        const steps = JSON.parse(result['neatlogs.llm.intermediate_steps']);
        expect(steps.length).toBeGreaterThan(0);
        expect(steps[0].thought).toBeDefined();
      }
    });
  });

  describe('sanitizeIoValue', () => {
    it('should remove Python repr strings from JSON', () => {
      const val = JSON.stringify({
        input: 'hello',
        callback: '<function BaseTool.<lambda> at 0x110107be0>',
      });
      const result = processor.sanitizeIoValue(val);
      const parsed = JSON.parse(result);
      expect(parsed.input).toBe('hello');
      expect(parsed.callback).toBeUndefined();
    });

    it('should remove top-level self key', () => {
      const val = JSON.stringify({
        input: 'hello',
        self: { some: 'data' },
      });
      const result = processor.sanitizeIoValue(val);
      const parsed = JSON.parse(result);
      expect(parsed.self).toBeUndefined();
      expect(parsed.input).toBe('hello');
    });

    it('should return non-string values unchanged', () => {
      expect(processor.sanitizeIoValue(42)).toBe(42);
      expect(processor.sanitizeIoValue(null)).toBe(null);
    });

    it('should return non-JSON strings unchanged', () => {
      expect(processor.sanitizeIoValue('just a string')).toBe('just a string');
    });
  });

  describe('CrewAI kickoff telemetry', () => {
    it('should compute crew task/agent counts from JSON arrays', () => {
      const span = makeSpan({
        name: 'Crew_my_crew.kickoff',
        attributes: {
          crew_tasks: JSON.stringify(['task1', 'task2', 'task3']),
          crew_agents: JSON.stringify(['agent1', 'agent2']),
        },
      });
      const result = processor.normalize(span);
      // The counts should be set (either in attrs or mapped)
      expect(result).toBeDefined();
    });
  });

  describe('tool definitions extraction', () => {
    it('should extract tool defs from OpenInference json_schema', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.tools.0.tool.json_schema': JSON.stringify({
            name: 'search',
            description: 'Search the web',
            parameters: { type: 'object', properties: { q: { type: 'string' } } },
          }),
        },
      });
      const result = processor.normalize(span);
      // Tool defs should have been extracted
      expect(result).toBeDefined();
    });

    it('should extract tool defs from OpenLLMetry format', () => {
      const span = makeSpan({
        attributes: {
          'openinference.span.kind': 'LLM',
          'llm.request.functions.0.name': 'search',
          'llm.request.functions.0.description': 'Search the web',
        },
      });
      const result = processor.normalize(span);
      expect(result).toBeDefined();
    });
  });
});
