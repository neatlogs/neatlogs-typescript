import { describe, it, expect } from 'vitest';
import {
  VALID_SPAN_KINDS,
  ALL_SPAN_KINDS,
  inferSpanKindFromName,
} from '../../src/span-kinds/index.js';

describe('span-kinds', () => {
  describe('VALID_SPAN_KINDS', () => {
    it('should contain all decorator span kinds', () => {
      expect(VALID_SPAN_KINDS.has('WORKFLOW')).toBe(true);
      expect(VALID_SPAN_KINDS.has('AGENT')).toBe(true);
      expect(VALID_SPAN_KINDS.has('CHAIN')).toBe(true);
      expect(VALID_SPAN_KINDS.has('TOOL')).toBe(true);
      expect(VALID_SPAN_KINDS.has('RETRIEVER')).toBe(true);
      expect(VALID_SPAN_KINDS.has('EMBEDDING')).toBe(true);
      expect(VALID_SPAN_KINDS.has('MCP_TOOL')).toBe(true);
      expect(VALID_SPAN_KINDS.has('GUARDRAIL')).toBe(true);
    });

    it('should have exactly 8 kinds', () => {
      expect(VALID_SPAN_KINDS.size).toBe(8);
    });
  });

  describe('ALL_SPAN_KINDS', () => {
    it('should include all VALID_SPAN_KINDS', () => {
      for (const kind of VALID_SPAN_KINDS) {
        expect(ALL_SPAN_KINDS.has(kind)).toBe(true);
      }
    });

    it('should include extended kinds', () => {
      expect(ALL_SPAN_KINDS.has('LLM')).toBe(true);
      expect(ALL_SPAN_KINDS.has('RERANKER')).toBe(true);
      expect(ALL_SPAN_KINDS.has('EVALUATOR')).toBe(true);
      expect(ALL_SPAN_KINDS.has('VECTOR_STORE')).toBe(true);
    });

    it('should have 12 total kinds', () => {
      expect(ALL_SPAN_KINDS.size).toBe(12);
    });
  });

  describe('inferSpanKindFromName', () => {
    it('should infer LLM for OpenAI spans', () => {
      expect(inferSpanKindFromName('openai.chat.completions')).toBe('LLM');
    });

    it('should infer LLM for Anthropic spans', () => {
      expect(inferSpanKindFromName('Anthropic.messages.create')).toBe('LLM');
    });

    it('should infer LLM for chat spans', () => {
      expect(inferSpanKindFromName('chat_request')).toBe('LLM');
    });

    it('should infer LLM for completion spans', () => {
      expect(inferSpanKindFromName('text_completion')).toBe('LLM');
    });

    it('should infer LLM for Gemini spans', () => {
      expect(inferSpanKindFromName('gemini_generate')).toBe('LLM');
    });

    it('should infer LLM for google_genai spans', () => {
      expect(inferSpanKindFromName('google_genai_call')).toBe('LLM');
    });

    it('should infer EMBEDDING for embed spans', () => {
      expect(inferSpanKindFromName('create_embedding')).toBe('EMBEDDING');
    });

    it('should infer RETRIEVER for vector DB query', () => {
      expect(inferSpanKindFromName('pinecone_query')).toBe('RETRIEVER');
    });

    it('should infer VECTOR_STORE for vector DB write', () => {
      expect(inferSpanKindFromName('pinecone_upsert')).toBe('VECTOR_STORE');
    });

    it('should infer RETRIEVER for chroma search', () => {
      expect(inferSpanKindFromName('chroma_search')).toBe('RETRIEVER');
    });

    it('should infer VECTOR_STORE for chroma insert', () => {
      expect(inferSpanKindFromName('chroma_add')).toBe('VECTOR_STORE');
    });

    it('should infer RETRIEVER for generic search', () => {
      expect(inferSpanKindFromName('document_search')).toBe('RETRIEVER');
    });

    it('should infer RETRIEVER for generic retrieval', () => {
      expect(inferSpanKindFromName('retrieve_documents')).toBe('RETRIEVER');
    });

    it('should infer RERANKER for rerank spans', () => {
      expect(inferSpanKindFromName('cohere_rerank')).toBe('LLM'); // cohere matches LLM first
      expect(inferSpanKindFromName('rerank_results')).toBe('RERANKER');
    });

    it('should infer AGENT for agent spans', () => {
      expect(inferSpanKindFromName('planning_agent')).toBe('AGENT');
    });

    it('should infer TOOL for tool spans', () => {
      expect(inferSpanKindFromName('web_scraper_tool')).toBe('TOOL');
    });

    it('should infer TOOL for function spans', () => {
      expect(inferSpanKindFromName('function_call')).toBe('TOOL');
    });

    it('should infer GUARDRAIL for guardrail spans', () => {
      expect(inferSpanKindFromName('input_guardrail')).toBe('GUARDRAIL');
    });

    it('should infer GUARDRAIL for validate spans', () => {
      expect(inferSpanKindFromName('validate_output')).toBe('GUARDRAIL');
    });

    it('should infer GUARDRAIL for moderate spans', () => {
      expect(inferSpanKindFromName('content_moderate')).toBe('GUARDRAIL');
    });

    it('should infer EVALUATOR for evaluate spans', () => {
      expect(inferSpanKindFromName('evaluate_response')).toBe('EVALUATOR');
    });

    it('should infer EVALUATOR for score spans', () => {
      expect(inferSpanKindFromName('score_relevance')).toBe('EVALUATOR');
    });

    it('should default to CHAIN for unknown spans', () => {
      expect(inferSpanKindFromName('my_custom_step')).toBe('CHAIN');
    });

    it('should be case-insensitive', () => {
      expect(inferSpanKindFromName('OPENAI_CALL')).toBe('LLM');
      expect(inferSpanKindFromName('My_Agent')).toBe('AGENT');
    });
  });
});
