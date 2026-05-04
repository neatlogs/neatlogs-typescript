/**
 * Entry point for the Google GenAI blog post creation workflow.
 *
 * Custom TypeScript orchestration with span() wrappers.
 * Uses @google/genai for Gemini calls with generateContent / generateContentStream.
 *
 * Usage:
 *     npx tsx examples/google_genai_multiagent/main.ts
 *     npx tsx examples/google_genai_multiagent/main.ts "The future of renewable energy"
 *
 * Required env vars:
 *     NEATLOGS_API_KEY
 *     GOOGLE_API_KEY (or GEMINI_API_KEY as alias)
 */

import 'dotenv/config';

// Deterministic log env vars — set before init
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/google_genai_multiagent_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/google_genai_multiagent_processed_spans.jsonl';

import { init, span, trace, log, flush, shutdown, SystemPromptTemplate, UserPromptTemplate } from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';
import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, GenerateContentConfig } from '@google/genai';

// ---------------------------------------------------------------------------
// Lazy client factory — created after init() so instrumentation is active
// ---------------------------------------------------------------------------

let _client: GoogleGenAI | null = null;

function getGeminiApiKey(): string {
  return process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
}

function getClient(): GoogleGenAI {
  if (!_client) {
    // Support both GOOGLE_API_KEY and GEMINI_API_KEY as aliases
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Google GenAI API key is not configured');
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

function describeProviderError(err: unknown): string {
  const e = err as { name?: string; status?: number; code?: string; constructor?: { name?: string } };
  const name = e?.name ?? e?.constructor?.name ?? 'ProviderError';
  const status = typeof e?.status === 'number' ? ` status=${e.status}` : '';
  const code = typeof e?.code === 'string' ? ` code=${e.code}` : '';
  return `${name}${status}${code}`.trim();
}

async function withProviderFallback<T>(
  step: string,
  run: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const reason = describeProviderError(err);
    log('Provider fallback in {step}: {reason}', { step, reason, level: 'warning' });
    console.warn(`[${step}] Provider unavailable; using deterministic fallback (${reason}).`);
    return fallback();
  }
}

function fallbackIdea(topic: string): { title: string; hook: string } {
  return {
    title: `Practical ${topic} Strategies for 2026`,
    hook: 'A pragmatic look at the trends, risks, and adoption patterns that matter most.',
  };
}

function fallbackDraft(topic: string, idea: { title: string; hook: string }, facts: string): string {
  return `# ${idea.title}\n\n${idea.hook}\n\n## Why it matters\n${topic} is moving from experimentation into operational planning. Teams need clear governance, measurable outcomes, and realistic adoption timelines.\n\n## Supporting facts\n${facts}\n\n## Practical next steps\n1. Identify one high-value workflow.\n2. Define success metrics before adopting tools.\n3. Review privacy, reliability, and compliance risks early.\n\n## Conclusion\nThe winners will pair technical capability with disciplined rollout plans.`;
}

function fallbackEditedDraft(topic: string, draft: string): string {
  return `${draft}\n\n## Editorial improvements\nFor ${topic}, the strongest message is to balance optimism with measurable governance. Add customer examples, clear KPIs, and risk controls before scaling.`;
}

function fallbackFinalPost(topic: string, edited: string): string {
  return `Meta description: A concise, practical guide to ${topic}, including trends, evidence, and adoption steps.\n\n${edited}\n\nSEO title: ${topic}: Practical Strategies, Risks, and Next Steps`;
}

const MODEL = 'gemini-2.5-flash';

// ---------------------------------------------------------------------------
// Tool implementation — mock DuckDuckGo since no credentials available
// ---------------------------------------------------------------------------

const webSearch = span(
  { kind: 'TOOL', name: 'web_search', description: 'Mock DuckDuckGo web search for supporting facts' },
  async (query: string): Promise<string> => {
    // Deterministic mock output — no live DuckDuckGo credential available
    return (
      `- ${query} — Key finding 1: Recent studies show significant progress in this area with 35% growth year-over-year.\n` +
      `- ${query} — Key finding 2: Industry analysts project continued expansion through 2030.\n` +
      `- ${query} — Key finding 3: Major players are investing heavily in R&D with $4.2B allocated in 2024.`
    );
  },
);

// Google GenAI function declaration (passed to the LLM)
const SEARCH_TOOL_DEF: FunctionDeclaration = {
  name: 'web_search',
  description: 'Search the web for current facts, statistics, and examples to support the blog post.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query.' },
    },
    required: ['query'],
  },
};

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const ideationSys = new SystemPromptTemplate([{
  role: 'system',
  content: "You are a creative content strategist. Return exactly 5 blog post ideas as a JSON array of objects with 'title' and 'hook' fields. No other text.",
}]);
const ideationUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

const researchSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a research assistant. Use the web_search tool to find 2-3 relevant facts or statistics for the blog post topic. Call the tool, then summarize the findings.',
}]);
const researchUser = new UserPromptTemplate([{
  role: 'user',
  content: "Find supporting facts for a blog post titled '{{title}}' about {{topic}}.",
}]);

const writerSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are an expert blog writer. Write an engaging, well-structured blog post with an introduction, 3-4 main sections, and a conclusion. Use markdown.',
}]);
const writerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\nTitle: {{title}}\nHook: {{hook}}\n\nSupporting facts:\n{{facts}}\n\nWrite a complete blog post.',
}]);

const editorSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a sharp content editor. Improve the draft by strengthening weak sections, adding concrete examples, and improving clarity. Return the full revised post in markdown.',
}]);
const editorUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\n\nDraft:\n{{draft}}\n\nRevise and improve this post.',
}]);

const finalizerSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are an SEO and content specialist. Polish the post: add a meta description, improve headings for SEO, ensure consistent tone, and format cleanly in markdown.',
}]);
const finalizerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\n\nEdited post:\n{{edited}}\n\nProduce the final polished version.',
}]);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const ideationAgent = span(
  { kind: 'AGENT', name: 'ideation', role: 'Content Strategist', goal: 'Generate blog post ideas' },
  async (topic: string): Promise<{ title: string; hook: string }> => {
    return trace(
      { name: 'generate_ideas', kind: 'CHAIN', promptTemplate: ideationSys, userPromptTemplate: ideationUser },
      async () => {
        const client = getClient();
        const systemPrompt = (ideationSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userPrompt = (ideationUser.compile({ topic }) as Array<{ role: string; content: string }>)[0].content;
        const response = await client.models.generateContent({
          model: MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.8,
          },
        });
        const raw = response.text?.trim() ?? '[]';
        let ideas: Array<{ title: string; hook: string }>;
        try {
          ideas = JSON.parse(raw);
        } catch {
          ideas = [{ title: topic, hook: 'Explore this topic in depth.' }];
        }
        return ideas[0] ?? { title: topic, hook: '' };
      },
    );
  },
);

const writerAgent = span(
  { kind: 'AGENT', name: 'writer', role: 'Blog Writer', goal: 'Research facts and draft the full blog post' },
  async (topic: string, idea: { title: string; hook: string }): Promise<string> => {
    const title = idea.title ?? topic;
    const hook = idea.hook ?? '';

    // Step 1: Research step — LLM calls web_search via function calling
    const facts = await trace(
      { name: 'research_facts', kind: 'CHAIN', promptTemplate: researchSys, userPromptTemplate: researchUser },
      async () => {
        const client = getClient();
        const systemPrompt = (researchSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userPrompt = (researchUser.compile({ title, topic }) as Array<{ role: string; content: string }>)[0].content;
        const response = await client.models.generateContent({
          model: MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: [SEARCH_TOOL_DEF] }],
            temperature: 0,
          },
        });

        // Execute any tool calls the model requested
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.functionCall) {
            const searchResult = await webSearch(
              (part.functionCall.args as Record<string, string>)?.query ?? topic,
            );
            // Second call — model summarizes tool results
            const contents: Content[] = [
              { role: 'user', parts: [{ text: userPrompt }] },
              response.candidates![0].content!,
              {
                role: 'user',
                parts: [{
                  functionResponse: {
                    name: 'web_search',
                    response: { result: searchResult },
                  },
                }],
              },
            ];
            const summaryResp = await client.models.generateContent({
              model: MODEL,
              contents,
              config: {
                systemInstruction: systemPrompt,
                temperature: 0,
              },
            });
            return summaryResp.text ?? '';
          }
        }
        return response.text ?? '';
      },
    );

    // Step 2: Write the draft using the researched facts (streaming)
    return trace(
      { name: 'write_draft', kind: 'CHAIN', promptTemplate: writerSys, userPromptTemplate: writerUser },
      async () => {
        const client = getClient();
        const systemPrompt = (writerSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userPrompt = (writerUser.compile({ topic, title, hook, facts }) as Array<{ role: string; content: string }>)[0].content;
        process.stdout.write('\n--- Writer (streaming) ---\n');
        let full = '';
        const stream = await client.models.generateContentStream({
          model: MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          },
        });
        for await (const chunk of stream) {
          if (chunk.text) {
            process.stdout.write(chunk.text);
            full += chunk.text;
          }
        }
        process.stdout.write('\n-------------------------\n\n');
        return full;
      },
    );
  },
);

const editorAgent = span(
  { kind: 'AGENT', name: 'editor', role: 'Content Editor', goal: 'Improve and enrich the draft' },
  async (topic: string, draft: string): Promise<string> => {
    return trace(
      { name: 'edit_draft', kind: 'CHAIN', promptTemplate: editorSys, userPromptTemplate: editorUser },
      async () => {
        const client = getClient();
        const systemPrompt = (editorSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userPrompt = (editorUser.compile({ topic, draft }) as Array<{ role: string; content: string }>)[0].content;
        process.stdout.write('\n--- Editor (streaming) ---\n');
        let full = '';
        const stream = await client.models.generateContentStream({
          model: MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.5,
          },
        });
        for await (const chunk of stream) {
          if (chunk.text) {
            process.stdout.write(chunk.text);
            full += chunk.text;
          }
        }
        process.stdout.write('\n--------------------------\n\n');
        return full;
      },
    );
  },
);

const finalizerAgent = span(
  { kind: 'AGENT', name: 'finalizer', role: 'SEO Specialist', goal: 'Polish and format the final post' },
  async (topic: string, edited: string): Promise<string> => {
    return trace(
      { name: 'finalize_post', kind: 'CHAIN', promptTemplate: finalizerSys, userPromptTemplate: finalizerUser },
      async () => {
        const client = getClient();
        const systemPrompt = (finalizerSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userPrompt = (finalizerUser.compile({ topic, edited }) as Array<{ role: string; content: string }>)[0].content;
        const response = await client.models.generateContent({
          model: MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.3,
          },
        });
        return response.text ?? '';
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Main workflow
// ---------------------------------------------------------------------------

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: `${workflowPrefix}google-genai-content-creation`,
    tags: ['google-genai', 'content', 'blog'],
    instrumentations: ['google_genai'],
    debug: true,
  });

  const blogCreationWorkflow = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}blog_creation_workflow` },
    async (topic: string): Promise<string> => {
      console.log(`\n=== Blog Creation: ${topic} ===\n`);

      console.log('--- Ideation: generating content ideas ---');
      const idea = await withProviderFallback(
        'ideation',
        () => ideationAgent(topic),
        () => fallbackIdea(topic),
      );
      console.log(`  Selected idea: ${idea.title}`);

      console.log('\n--- Writer: drafting post ---');
      const draft = await withProviderFallback(
        'writer',
        () => writerAgent(topic, idea),
        async () => fallbackDraft(topic, idea, await webSearch(`${topic} ${idea.title}`)),
      );

      console.log('\n--- Editor: improving draft ---');
      const edited = await withProviderFallback(
        'editor',
        () => editorAgent(topic, draft),
        () => fallbackEditedDraft(topic, draft),
      );

      console.log('\n--- Finalizer: polishing post ---');
      const final = await withProviderFallback(
        'finalizer',
        () => finalizerAgent(topic, edited),
        () => fallbackFinalPost(topic, edited),
      );
      console.log('\n--- Final Post ---');
      console.log(final);

      return final;
    },
  );

  const topic = process.argv.slice(2).join(' ') || 'The future of AI in healthcare';
  await blogCreationWorkflow(topic);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
