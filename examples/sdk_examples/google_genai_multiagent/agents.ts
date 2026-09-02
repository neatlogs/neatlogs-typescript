/**
 * Agent functions for the Google GenAI blog post creation workflow.
 *
 * Agents:
 *   - Ideation   (gemini-2.5-flash, non-streaming)           — returns 5 content ideas as JSON
 *   - Writer     (gemini-2.5-flash, tool-calling + streaming) — researches facts via web_search,
 *                                                                then drafts the full post
 *   - Editor     (gemini-2.5-flash, streaming)               — rewrites weak sections, adds examples
 *   - Finalizer  (gemini-2.5-flash, non-streaming)           — SEO polish and final formatting
 */

import { span, trace, PromptTemplate, UserPromptTemplate } from 'neatlogs';
import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration } from '@google/genai';

// ---------------------------------------------------------------------------
// Lazy client factory — created after init() so instrumentation is active
// ---------------------------------------------------------------------------

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error('Google GenAI API key is not configured. Set GOOGLE_API_KEY or GEMINI_API_KEY.');
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

const MODEL = 'gemini-2.5-flash';

// ---------------------------------------------------------------------------
// Tool implementation — called only when the LLM requests it
// ---------------------------------------------------------------------------

const webSearch = span(
  { kind: 'TOOL', name: 'web_search', description: 'DuckDuckGo web search for supporting facts' },
  async (query: string): Promise<string> => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; neatlogs-example/1.0)' },
    });
    const html = await res.text();
    const results: string[] = [];
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const titleRegex = /<a class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
    let snippetMatch: RegExpExecArray | null;
    let titleMatch: RegExpExecArray | null;
    while (
      (snippetMatch = snippetRegex.exec(html)) !== null &&
      (titleMatch = titleRegex.exec(html)) !== null &&
      results.length < 3
    ) {
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      const snippet = snippetMatch[1].replace(/<[^>]+>/g, '').trim();
      if (title && snippet) {
        results.push(`- ${title}: ${snippet}`);
      }
    }
    return results.length > 0 ? results.join('\n') : 'No results found.';
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

const ideationSys = new PromptTemplate([{
  role: 'system',
  content: "You are a creative content strategist. Return exactly 3 blog post ideas as a JSON array of objects with 'title' and 'hook' (1 sentence each). No other text.",
}]);
const ideationUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

const researchSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a research assistant. Use the web_search tool to find 1-2 relevant facts for the topic. Call the tool once, then return a 2-3 bullet summary.',
}]);
const researchUser = new UserPromptTemplate([{
  role: 'user',
  content: "Find supporting facts for '{{title}}' about {{topic}}. Be brief.",
}]);

const writerSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a blog writer. Write a short post (150-250 words max) with a brief intro, 2 key points, and a one-sentence conclusion. Markdown format.',
}]);
const writerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\nTitle: {{title}}\nHook: {{hook}}\nFacts: {{facts}}\n\nWrite a short blog post (250 words max).',
}]);

const editorSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a content editor. Tighten the draft: fix weak phrasing, add one concrete example. Keep it under 250 words. Return revised post in markdown.',
}]);
const editorUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\n\nDraft:\n{{draft}}\n\nRevise briefly.',
}]);

const finalizerSys = new PromptTemplate([{
  role: 'system',
  content: 'You are an SEO specialist. Add a one-line meta description and clean up headings. Keep the post under 250 words. Return final markdown.',
}]);
const finalizerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\n\nEdited post:\n{{edited}}\n\nFinalize (keep it short).',
}]);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const ideationAgent = span(
  { kind: 'AGENT', name: 'ideation', role: 'Content Strategist', goal: 'Generate blog post ideas' },
  async (topic: string): Promise<{ title: string; hook: string }> => {
    return trace(
      { name: 'generate_ideas', kind: 'LLM' as any, promptTemplate: ideationSys, userPromptTemplate: ideationUser },
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

export const writerAgent = span(
  { kind: 'AGENT', name: 'writer', role: 'Blog Writer', goal: 'Research facts and draft the full blog post' },
  async (topic: string, idea: { title: string; hook: string }): Promise<string> => {
    const title = idea.title ?? topic;
    const hook = idea.hook ?? '';

    // Step 1: Research — LLM calls web_search via function calling
    const facts = await trace(
      { name: 'research_facts', kind: 'LLM' as any, promptTemplate: researchSys, userPromptTemplate: researchUser },
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

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.functionCall) {
            const searchResult = await webSearch(
              (part.functionCall.args as Record<string, string>)?.query ?? topic,
            );
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

    // Step 2: Write the draft using researched facts (streaming)
    return trace(
      { name: 'write_draft', kind: 'LLM' as any, promptTemplate: writerSys, userPromptTemplate: writerUser },
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

export const editorAgent = span(
  { kind: 'AGENT', name: 'editor', role: 'Content Editor', goal: 'Improve and enrich the draft' },
  async (topic: string, draft: string): Promise<string> => {
    return trace(
      { name: 'edit_draft', kind: 'LLM' as any, promptTemplate: editorSys, userPromptTemplate: editorUser },
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

export const finalizerAgent = span(
  { kind: 'AGENT', name: 'finalizer', role: 'SEO Specialist', goal: 'Polish and format the final post' },
  async (topic: string, edited: string): Promise<string> => {
    return trace(
      { name: 'finalize_post', kind: 'LLM' as any, promptTemplate: finalizerSys, userPromptTemplate: finalizerUser },
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
