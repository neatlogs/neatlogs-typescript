/**
 * Additional edge-case tests for span-kinds/mapping.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  VALID_SPAN_KINDS,
  ALL_SPAN_KINDS,
  inferSpanKindFromName,
} from '../../src/span-kinds/mapping.js';

describe('VALID_SPAN_KINDS', () => {
  it('should contain all 8 valid span kinds', () => {
    expect(VALID_SPAN_KINDS.size).toBe(8);
    expect(VALID_SPAN_KINDS.has('WORKFLOW')).toBe(true);
    expect(VALID_SPAN_KINDS.has('AGENT')).toBe(true);
    expect(VALID_SPAN_KINDS.has('CHAIN')).toBe(true);
    expect(VALID_SPAN_KINDS.has('TOOL')).toBe(true);
    expect(VALID_SPAN_KINDS.has('RETRIEVER')).toBe(true);
    expect(VALID_SPAN_KINDS.has('EMBEDDING')).toBe(true);
    expect(VALID_SPAN_KINDS.has('MCP_TOOL')).toBe(true);
    expect(VALID_SPAN_KINDS.has('GUARDRAIL')).toBe(true);
  });

  it('should not contain extended kinds', () => {
    expect(VALID_SPAN_KINDS.has('LLM' as any)).toBe(false);
    expect(VALID_SPAN_KINDS.has('RERANKER' as any)).toBe(false);
  });
});

describe('ALL_SPAN_KINDS', () => {
  it('should be a superset of VALID_SPAN_KINDS', () => {
    for (const kind of VALID_SPAN_KINDS) {
      expect(ALL_SPAN_KINDS.has(kind)).toBe(true);
    }
  });

  it('should contain extended kinds', () => {
    expect(ALL_SPAN_KINDS.has('LLM')).toBe(true);
    expect(ALL_SPAN_KINDS.has('RERANKER')).toBe(true);
    expect(ALL_SPAN_KINDS.has('EVALUATOR')).toBe(true);
    expect(ALL_SPAN_KINDS.has('VECTOR_STORE')).toBe(true);
  });
});

describe('inferSpanKindFromName edge cases', () => {
  it('should return LLM for gemini spans', () => {
    expect(inferSpanKindFromName('gemini.generate')).toBe('LLM');
  });

  it('should return LLM for google_genai spans', () => {
    expect(inferSpanKindFromName('google_genai.chat')).toBe('LLM');
  });

  it('should return LLM for bedrock spans', () => {
    expect(inferSpanKindFromName('bedrock.invoke_model')).toBe('LLM');
  });

  it('should return EMBEDDING for embed-containing names', () => {
    expect(inferSpanKindFromName('text-embedding-3-large')).toBe('EMBEDDING');
    expect(inferSpanKindFromName('create_embeddings')).toBe('EMBEDDING');
  });

  it('should return RETRIEVER for vector DB query operations', () => {
    expect(inferSpanKindFromName('chroma.query')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('pinecone.search')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('qdrant.hybrid_search')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('weaviate.get')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('milvus.fetch')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('lancedb.find')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('marqo.retrieve')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('astra.discover')).toBe('RETRIEVER');
  });

  it('should return VECTOR_STORE for vector DB write operations', () => {
    expect(inferSpanKindFromName('chroma.add')).toBe('VECTOR_STORE');
    expect(inferSpanKindFromName('pinecone.upsert')).toBe('VECTOR_STORE');
    expect(inferSpanKindFromName('qdrant.insert')).toBe('VECTOR_STORE');
  });

  it('should return RETRIEVER for generic retrieval operations', () => {
    expect(inferSpanKindFromName('document.retrieve')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('search_documents')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('query_database')).toBe('RETRIEVER');
  });

  it('should return RERANKER for reranking operations', () => {
    // 'cohere.rerank' matches 'cohere' => LLM first (LLM has higher priority)
    expect(inferSpanKindFromName('cohere.rerank')).toBe('LLM');
    // A name without LLM keywords should match rerank
    expect(inferSpanKindFromName('reranker_step')).toBe('RERANKER');
    expect(inferSpanKindFromName('rerank_results')).toBe('RERANKER');
  });

  it('should return AGENT for agent spans', () => {
    // 'research_agent' contains 'search' => matches RETRIEVER first
    expect(inferSpanKindFromName('research_agent')).toBe('RETRIEVER');
    // A name with only 'agent' should match AGENT
    expect(inferSpanKindFromName('AgentExecutor')).toBe('AGENT');
    expect(inferSpanKindFromName('my_agent')).toBe('AGENT');
  });

  it('should return TOOL for tool/function spans', () => {
    // 'web_search_tool' contains 'search' => matches RETRIEVER first
    expect(inferSpanKindFromName('web_search_tool')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('function_call')).toBe('TOOL');
    expect(inferSpanKindFromName('calculator_tool')).toBe('TOOL');
  });

  it('should return GUARDRAIL for guardrail/safety spans', () => {
    expect(inferSpanKindFromName('content_guardrail')).toBe('GUARDRAIL');
    expect(inferSpanKindFromName('validate_output')).toBe('GUARDRAIL');
    expect(inferSpanKindFromName('moderate_content')).toBe('GUARDRAIL');
    expect(inferSpanKindFromName('safety_check')).toBe('GUARDRAIL');
  });

  it('should return EVALUATOR for evaluator spans', () => {
    expect(inferSpanKindFromName('evaluate_response')).toBe('EVALUATOR');
    expect(inferSpanKindFromName('score_relevance')).toBe('EVALUATOR');
    expect(inferSpanKindFromName('metric_calculation')).toBe('EVALUATOR');
  });

  it('should return CHAIN as default for unknown names', () => {
    expect(inferSpanKindFromName('my_custom_step')).toBe('CHAIN');
    expect(inferSpanKindFromName('process_data')).toBe('CHAIN');
    expect(inferSpanKindFromName('')).toBe('CHAIN');
  });

  it('should be case-insensitive', () => {
    expect(inferSpanKindFromName('OPENAI.CHAT')).toBe('LLM');
    expect(inferSpanKindFromName('Anthropic.Complete')).toBe('LLM');
    expect(inferSpanKindFromName('CHROMA.QUERY')).toBe('RETRIEVER');
  });

  it('should prioritize LLM over other patterns when multiple match', () => {
    // "openai" matches LLM, not agent/tool
    expect(inferSpanKindFromName('openai.chat.completions')).toBe('LLM');
  });

  it('should handle vector DB scroll and peek operations', () => {
    expect(inferSpanKindFromName('qdrant.scroll')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('qdrant.peek')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('qdrant.recommend')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('qdrant.aggregate')).toBe('RETRIEVER');
  });
});
