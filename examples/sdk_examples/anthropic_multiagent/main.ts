/**
 * Anthropic SDK multi-agent code review workflow with all span kinds.
 *
 * Custom orchestration (no framework) — uses neatlogs span() + trace() directly.
 *
 * Span kinds demonstrated:
 *   WORKFLOW, AGENT, TOOL, RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Providers:
 *   - Anthropic (claude-haiku) — reviewer, fixer, tester, documenter
 *   - OpenAI (text-embedding-3-small) — embeddings for knowledge base
 *
 * Usage:
 *     npx tsx examples/sdk_examples/anthropic_multiagent/main.ts
 *
 * Required env vars:
 *     ANTHROPIC_API_KEY
 *     OPENAI_API_KEY (for embeddings)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'anthropic_multiagent_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'anthropic_multiagent_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'anthropic_multiagent_logs.log';

import { init, span, trace, log, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'anthropic-code-review',
    tags: ['anthropic', 'code-review', 'python'],
    instrumentations: ['anthropic', 'openai'],
    captureLogs: true,
    disableExport: true,
    debug: true,
  });

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const OpenAI = (await import('openai')).default;

  const anthropicClient = new Anthropic();
  const openaiClient = new OpenAI();
  const MODEL = 'claude-haiku-4-5-20251001';

  // ---------------------------------------------------------------------------
  // Knowledge Base (code patterns & best practices)
  // ---------------------------------------------------------------------------

  const CODE_PATTERNS = [
    { id: 'pat-001', title: 'Division by zero guard', content: 'Always check for empty collections or zero denominators before division. Use early return or default values.' },
    { id: 'pat-002', title: 'O(n^2) loop detection', content: 'Nested loops over the same collection indicate O(n^2) complexity. Use sets or dictionaries for O(n) lookups.' },
    { id: 'pat-003', title: 'String splitting safety', content: 'String.split() may return fewer parts than expected. Always validate array length before indexing.' },
    { id: 'pat-004', title: 'Type annotation best practices', content: 'Use explicit return type annotations. Prefer Optional[T] over T | None for clarity. Use TypedDict for structured returns.' },
    { id: 'pat-005', title: 'Error handling patterns', content: 'Catch specific exceptions, not bare except. Log errors with context. Use custom exception classes for domain errors.' },
    { id: 'pat-006', title: 'Docstring conventions', content: 'Use Google-style docstrings. Include Args, Returns, Raises sections. Add usage examples for public APIs.' },
  ];

  let patternEmbeddings: number[][] | null = null;

  function cosine(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-12);
  }

  // ---------------------------------------------------------------------------
  // EMBEDDING: index patterns
  // ---------------------------------------------------------------------------

  async function indexPatterns(): Promise<void> {
    if (patternEmbeddings) return;
    await trace({ name: 'index_code_patterns', kind: 'EMBEDDING' as any }, async (s) => {
      const texts = CODE_PATTERNS.map(p => `${p.title}\n${p.content}`);
      s.setAttribute('neatlogs.embedding.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.embedding.text', JSON.stringify(texts.map(t => t.slice(0, 60))));

      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      patternEmbeddings = resp.data.map(d => d.embedding);
      s.setAttribute('neatlogs.embedding.token_count', resp.usage.total_tokens);
      log('indexed {count} code patterns ({tokens} tokens)', { count: CODE_PATTERNS.length, tokens: resp.usage.total_tokens });
    });
  }

  // ---------------------------------------------------------------------------
  // RETRIEVER: search patterns
  // ---------------------------------------------------------------------------

  async function retrievePatterns(query: string, topK: number = 3): Promise<Array<{ id: string; title: string; content: string; score: number }>> {
    return trace({ name: 'pattern_search', kind: 'RETRIEVER' as any }, async (s) => {
      s.setAttribute('neatlogs.retrieval.query', query);
      s.setAttribute('neatlogs.retrieval.top_k', topK);

      const qResp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: [query],
      });
      const qVec = qResp.data[0].embedding;

      const scores = patternEmbeddings!.map((emb, i) => ({ idx: i, score: cosine(qVec, emb) }));
      scores.sort((a, b) => b.score - a.score);
      const results = scores.slice(0, topK);

      const docs = results.map(r => ({
        id: CODE_PATTERNS[r.idx].id,
        title: CODE_PATTERNS[r.idx].title,
        content: CODE_PATTERNS[r.idx].content,
        score: Math.round(r.score * 10000) / 10000,
      }));
      s.setAttribute('neatlogs.retrieval.documents', JSON.stringify(docs));

      log('retrieved {count} patterns for: {query}', { count: results.length, query });
      return docs;
    });
  }

  // ---------------------------------------------------------------------------
  // RERANKER: re-rank patterns
  // ---------------------------------------------------------------------------

  async function rerankPatterns(query: string, docs: Array<{ id: string; title: string; content: string; score: number }>, topK: number = 2): Promise<typeof docs> {
    return trace({ name: 'pattern_reranker', kind: 'RERANKER' as any }, async (s) => {
      s.setAttribute('neatlogs.reranker.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.reranker.query', query);
      s.setAttribute('neatlogs.reranker.top_k', topK);
      s.setAttribute('neatlogs.reranker.input_documents', JSON.stringify(
        docs.map(d => ({ id: d.id, content: d.content })),
      ));

      const texts = [query, ...docs.map(d => d.content)];
      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      const vectors = resp.data.map(d => d.embedding);
      const qVec = vectors[0];

      const scored = docs.map((doc, i) => ({
        doc,
        score: cosine(qVec, vectors[i + 1]),
      }));
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, topK);

      s.setAttribute('neatlogs.reranker.output_documents', JSON.stringify(
        topResults.map(r => ({
          id: r.doc.id,
          content: r.doc.content,
          score: Math.round(r.score * 10000) / 10000,
        })),
      ));

      log('reranked {input} patterns → top {output}', { input: docs.length, output: topResults.length });
      return topResults.map(r => ({ ...r.doc, score: Math.round(r.score * 10000) / 10000 }));
    });
  }

  // ---------------------------------------------------------------------------
  // TOOL: check_syntax
  // ---------------------------------------------------------------------------

  const checkSyntax = span(
    { kind: 'TOOL', name: 'check_syntax', toolName: 'check_syntax' },
    async (code: string): Promise<string> => {
      log('check_syntax: {chars} chars', { chars: code.length });
      const issues: string[] = [];
      if (code.includes('/ len(') || code.includes('/ 0')) {
        issues.push('Potential division by zero detected');
      }
      if (/for .+ in range\(len\(.+\)\)[\s\S]*?for .+ in range\(len\(.+\)\)/.test(code)) {
        issues.push('Nested loops over same collection — O(n^2) complexity');
      }
      if (code.includes('.split(') && !code.includes('if len(')) {
        issues.push('String split without length validation');
      }
      return issues.length > 0 ? `Issues found:\n${issues.map(i => `- ${i}`).join('\n')}` : 'No syntax issues found.';
    },
  );

  // Anthropic tool definition
  const CHECK_SYNTAX_TOOL = {
    name: 'check_syntax',
    description: 'Check code for syntax errors and common anti-patterns.',
    input_schema: {
      type: 'object' as const,
      properties: { code: { type: 'string', description: 'The code to check.' } },
      required: ['code'],
    },
  };

  // ---------------------------------------------------------------------------
  // Prompt Templates
  // ---------------------------------------------------------------------------

  const reviewerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are an expert code reviewer. Analyze the code and return a JSON array of issue objects with "severity" (high/medium/low), "line" (approximate), and "description" fields. Use the check_syntax tool first. No other text besides the JSON.',
  }]);
  const reviewerUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Review this Python code:\n\n```python\n{{code}}\n```\n\nRelevant patterns:\n{{patterns}}',
  }]);

  const fixerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a Python expert. Fix all identified issues in the code. Return only the corrected code in a python code block, no explanations.',
  }]);
  const fixerUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Original code:\n```python\n{{code}}\n```\n\nIssues to fix:\n{{issues}}\n\nReturn the fixed code.',
  }]);

  const testerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a Python testing expert. Write pytest test cases for the provided code. Include edge cases.',
  }]);
  const testerUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Write pytest tests for:\n\n```python\n{{code}}\n```',
  }]);

  const documenterSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a documentation specialist. Add clear docstrings to all functions. Return only the documented code.',
  }]);
  const documenterUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Add documentation to:\n\n```python\n{{code}}\n```',
  }]);

  // ---------------------------------------------------------------------------
  // Sample code for review
  // ---------------------------------------------------------------------------

  const SAMPLE_CODE = `def calculate_average(numbers):
    total = 0
    for n in numbers:
        total = total + n
    avg = total / len(numbers)
    return avg

def find_duplicates(lst):
    duplicates = []
    for i in range(len(lst)):
        for j in range(len(lst)):
            if i != j and lst[i] == lst[j]:
                if lst[i] not in duplicates:
                    duplicates.append(lst[i])
    return duplicates

def parse_config(config_str):
    parts = config_str.split("=")
    key = parts[0]
    value = parts[1]
    return {key: value}`;

  // ---------------------------------------------------------------------------
  // AGENT: Reviewer (with tool calling)
  // ---------------------------------------------------------------------------

  const reviewerAgent = span(
    { kind: 'AGENT', name: 'reviewer', role: 'Code Reviewer', goal: 'Identify code issues' },
    async (code: string, patterns: string): Promise<Array<{ severity: string; line: number; description: string }>> => {
      return trace(
        { name: 'review_code', kind: 'LLM' as any, promptTemplate: reviewerSys, userPromptTemplate: reviewerUser },
        async () => {
          const systemMsg = (reviewerSys.compile() as any[])[0].content;
          const userMsg = (reviewerUser.compile({ code, patterns }) as any[])[0].content;
          const messages: any[] = [{ role: 'user', content: userMsg }];

          let response = await anthropicClient.messages.create({
            model: MODEL,
            max_tokens: 2048,
            temperature: 0,
            system: systemMsg,
            messages,
            tools: [CHECK_SYNTAX_TOOL],
            tool_choice: { type: 'auto' },
          });

          while (response.stop_reason === 'tool_use') {
            messages.push({ role: 'assistant', content: response.content });
            const toolResults: any[] = [];
            for (const block of response.content) {
              if (block.type === 'tool_use') {
                const result = await checkSyntax((block.input as any).code);
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
              }
            }
            messages.push({ role: 'user', content: toolResults });
            response = await anthropicClient.messages.create({
              model: MODEL,
              max_tokens: 2048,
              system: systemMsg,
              messages,
              tools: [CHECK_SYNTAX_TOOL],
              tool_choice: { type: 'auto' },
            });
          }

          const raw = (response.content.find((b: any) => b.type === 'text') as any)?.text?.trim() ?? '[]';
          try { return JSON.parse(raw); } catch { return [{ severity: 'medium', line: 0, description: raw }]; }
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Fixer (streaming)
  // ---------------------------------------------------------------------------

  const fixerAgent = span(
    { kind: 'AGENT', name: 'fixer', role: 'Code Fixer', goal: 'Fix identified code issues' },
    async (code: string, issues: Array<{ severity: string; line: number; description: string }>): Promise<string> => {
      const issuesText = issues.map(i => `- [${i.severity.toUpperCase()}] line ${i.line}: ${i.description}`).join('\n');
      return trace(
        { name: 'fix_code', kind: 'LLM' as any, promptTemplate: fixerSys, userPromptTemplate: fixerUser },
        async () => {
          const systemMsg = (fixerSys.compile() as any[])[0].content;
          const userMsg = (fixerUser.compile({ code, issues: issuesText }) as any[])[0].content;
          process.stdout.write('\n--- Fixer (streaming) ---\n');
          let full = '';
          const stream = await anthropicClient.messages.create({
            model: MODEL,
            max_tokens: 4096,
            temperature: 0.3,
            system: systemMsg,
            messages: [{ role: 'user', content: userMsg }],
            stream: true,
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
              const text = (event.delta as any).text;
              process.stdout.write(text);
              full += text;
            }
          }
          process.stdout.write('\n------------------------\n\n');
          return full;
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Tester (streaming)
  // ---------------------------------------------------------------------------

  const testerAgent = span(
    { kind: 'AGENT', name: 'tester', role: 'Test Writer', goal: 'Write pytest test cases' },
    async (code: string): Promise<string> => {
      return trace(
        { name: 'write_tests', kind: 'LLM' as any, promptTemplate: testerSys, userPromptTemplate: testerUser },
        async () => {
          const systemMsg = (testerSys.compile() as any[])[0].content;
          const userMsg = (testerUser.compile({ code }) as any[])[0].content;
          process.stdout.write('\n--- Tester (streaming) ---\n');
          let full = '';
          const stream = await anthropicClient.messages.create({
            model: MODEL,
            max_tokens: 4096,
            temperature: 0.3,
            system: systemMsg,
            messages: [{ role: 'user', content: userMsg }],
            stream: true,
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
              const text = (event.delta as any).text;
              process.stdout.write(text);
              full += text;
            }
          }
          process.stdout.write('\n-------------------------\n\n');
          return full;
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Documenter (non-streaming)
  // ---------------------------------------------------------------------------

  const documenterAgent = span(
    { kind: 'AGENT', name: 'documenter', role: 'Documentation Writer', goal: 'Add docstrings and docs' },
    async (code: string): Promise<string> => {
      return trace(
        { name: 'add_docs', kind: 'LLM' as any, promptTemplate: documenterSys, userPromptTemplate: documenterUser },
        async () => {
          const systemMsg = (documenterSys.compile() as any[])[0].content;
          const userMsg = (documenterUser.compile({ code }) as any[])[0].content;
          const response = await anthropicClient.messages.create({
            model: MODEL,
            max_tokens: 4096,
            temperature: 0,
            system: systemMsg,
            messages: [{ role: 'user', content: userMsg }],
          });
          return (response.content.find((b: any) => b.type === 'text') as any)?.text ?? '';
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // TOOL: validate_code_format (demonstrates error spans)
  // ---------------------------------------------------------------------------

  const validateCodeFormat = span(
    { kind: 'TOOL', name: 'validate_code_format', toolName: 'validate_code_format' },
    async (code: string): Promise<string> => {
      log('validating code format: {chars} chars', { chars: code.length });
      if (!code.trim()) {
        throw new Error('Empty code input — nothing to review');
      }
      if (code.length > 50000) {
        throw new Error(`Code too large (${code.length} chars) — max 50000 chars`);
      }
      return `Code format valid: ${code.split('\n').length} lines`;
    },
  );

  // ---------------------------------------------------------------------------
  // WORKFLOW
  // ---------------------------------------------------------------------------

  const codeReviewWorkflow = span(
    { kind: 'WORKFLOW', name: 'code_review_workflow' },
    async (code: string): Promise<{ issues: any[]; fixedCode: string; tests: string; documentedCode: string }> => {
      log('starting code review pipeline');
      console.log('\n=== Code Review Pipeline ===\n');

      // Demonstrate error span — validate empty code
      console.log('--- Validating code format (error demo) ---');
      try {
        await validateCodeFormat('');
      } catch (e) {
        console.log(`  [expected error] ${(e as Error).message}`);
      }

      // Validate actual code (succeeds)
      await validateCodeFormat(code);

      await indexPatterns();

      console.log('--- Retrieving relevant patterns ---');
      const retrieved = await retrievePatterns('python code review division zero loops split');
      const reranked = await rerankPatterns('python code issues', retrieved);
      const patternsContext = reranked.map(p => `[${p.title}] ${p.content}`).join('\n');

      console.log('--- Reviewer: identifying issues ---');
      const issues = await reviewerAgent(code, patternsContext);
      console.log(`  Found ${issues.length} issue(s):`);
      for (const issue of issues) {
        console.log(`  [${issue.severity?.toUpperCase()}] ${issue.description}`);
      }

      console.log('\n--- Fixer: applying fixes ---');
      const fixedCode = await fixerAgent(code, issues);

      console.log('\n--- Tester: writing tests ---');
      const tests = await testerAgent(fixedCode);

      console.log('\n--- Documenter: adding documentation ---');
      const documentedCode = await documenterAgent(fixedCode);
      console.log('\n--- Documented Code ---');
      console.log(documentedCode);

      log('workflow complete');
      return { issues, fixedCode, tests, documentedCode };
    },
  );

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  await codeReviewWorkflow(SAMPLE_CODE);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[anthropic] failed', err);
  process.exitCode = 1;
});
