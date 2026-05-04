/**
 * Agent node functions for the LangGraph multi-provider research workflow.
 *
 * Providers:
 *   - Azure OpenAI (AZURE_LLM_DEPLOYMENT) : supervisor, web researcher, report writer (streaming)
 *   - Google GenAI (gemini-2.5-flash)     : wiki researcher, arxiv researcher, synthesizer
 *
 * Adaptation note:
 *   The Python version uses ToolNode(tools, messages_key=...) for per-branch
 *   message isolation. The TypeScript @langchain/langgraph ToolNode does not
 *   support messages_key. Instead, we implement explicit tool-execution nodes
 *   that read/write their branch-specific message keys, preserving the same
 *   observable WORKFLOW/CHAIN/AGENT/TOOL topology.
 *
 * Graph topology per researcher branch:
 *   supervisor → web_researcher ⇄ web_tools (loop until no tool_calls) → web_done
 *              → wiki_researcher ⇄ wiki_tools (loop)                   → wiki_done
 *              → arxiv_researcher ⇄ arxiv_tools (loop)                 → arxiv_done
 *   web_done + wiki_done + arxiv_done → synthesizer → report_writer → END
 */

import {
  span,
  trace,
  SystemPromptTemplate,
  UserPromptTemplate,
} from 'neatlogs';
import { AzureChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { tool as lcTool } from '@langchain/core/tools';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { ResearchState } from './graph.js';

// ---------------------------------------------------------------------------
// Tool definitions (mocked — no real HTTP calls)
// ---------------------------------------------------------------------------

export const webSearchTool = lcTool(
  async (input): Promise<string> => {
    const query = (input as { query: string }).query;
    return (
      `Web search results for '${query}':\n`
      + '- Recent developments show significant progress in this area.\n'
      + '- Industry experts highlight growing investment and adoption.\n'
      + '- Key players are actively publishing findings and case studies.\n'
      + '- Multiple startups and research groups are advancing the field.'
    );
  },
  {
    name: 'web_search',
    description: 'Search the web for current news and information on a topic.',
    schema: z.object({ query: z.string().describe('The search query') }),
  },
);

export const wikiSearchTool = lcTool(
  async (input): Promise<string> => {
    const query = (input as { query: string }).query;
    return (
      `Wikipedia summary for '${query}':\n`
      + '- The field originated in the mid-20th century with foundational theoretical work.\n'
      + '- Core principles include superposition, entanglement, and interference.\n'
      + '- Applications span medicine, finance, logistics, and materials science.\n'
      + '- Leading research institutions include MIT, Google, IBM, and national labs.'
    );
  },
  {
    name: 'wiki_search',
    description: 'Search for encyclopedic background and foundational definitions on a topic.',
    schema: z.object({ query: z.string().describe('The search query') }),
  },
);

export const arxivSearchTool = lcTool(
  async (input): Promise<string> => {
    const query = (input as { query: string }).query;
    return (
      `ArXiv papers for '${query}':\n`
      + `- [2024] 'Advances in ${query}: A Systematic Review' — 94% accuracy improvement.\n`
      + `- [2024] 'Benchmarking Methods for ${query}' — new state-of-the-art baselines.\n`
      + `- [2025] 'Scaling ${query} to Production' — practical deployment framework.\n`
      + `- [2025] 'Hybrid Approaches in ${query}' — combines classical and quantum methods.`
    );
  },
  {
    name: 'arxiv_search',
    description: 'Search for recent academic papers and research findings on a topic.',
    schema: z.object({ query: z.string().describe('The search query') }),
  },
);

// Tool lists by branch
export const WEB_TOOLS = [webSearchTool];
export const WIKI_TOOLS = [wikiSearchTool];
export const ARXIV_TOOLS = [arxivSearchTool];

// Tool map for tool execution
const ALL_TOOLS_MAP = new Map([
  ['web_search', webSearchTool],
  ['wiki_search', wikiSearchTool],
  ['arxiv_search', arxivSearchTool],
]);

// ---------------------------------------------------------------------------
// LLM clients — lazy construction after init()
// ---------------------------------------------------------------------------

function getAzureKwargs() {
  return {
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAIApiDeploymentName:
      process.env.AZURE_LLM_DEPLOYMENT
      ?? process.env.AZURE_OPENAI_DEPLOYMENT_NAME
      ?? 'gpt-5-nano',
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
  };
}

let _supervisorLlm: AzureChatOpenAI | null = null;
let _webLlm: AzureChatOpenAI | null = null;
let _wikiLlm: ChatGoogleGenerativeAI | null = null;
let _arxivLlm: ChatGoogleGenerativeAI | null = null;
let _synthLlm: ChatGoogleGenerativeAI | null = null;
let _writerLlm: AzureChatOpenAI | null = null;

function getSupervisorLlm() {
  if (!_supervisorLlm) _supervisorLlm = new AzureChatOpenAI(getAzureKwargs());
  return _supervisorLlm;
}
function getWebLlm() {
  if (!_webLlm) _webLlm = new AzureChatOpenAI(getAzureKwargs());
  return _webLlm;
}
function getWikiLlm() {
  if (!_wikiLlm) _wikiLlm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0 });
  return _wikiLlm;
}
function getArxivLlm() {
  if (!_arxivLlm) _arxivLlm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0 });
  return _arxivLlm;
}
function getSynthLlm() {
  if (!_synthLlm) _synthLlm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0 });
  return _synthLlm;
}
function getWriterLlm() {
  if (!_writerLlm) _writerLlm = new AzureChatOpenAI(getAzureKwargs());
  return _writerLlm;
}

function describeProviderError(err: unknown): string {
  const e = err as { name?: string; status?: number; code?: string; constructor?: { name?: string } };
  const name = e?.name ?? e?.constructor?.name ?? 'ProviderError';
  const status = typeof e?.status === 'number' ? ` status=${e.status}` : '';
  const code = typeof e?.code === 'string' ? ` code=${e.code}` : '';
  return `${name}${status}${code}`.trim();
}

const LIVE_MODE = process.env.LANGGRAPH_LIVE_MODE === 'true';

async function withProviderFallback<T>(
  step: string,
  run: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  if (!LIVE_MODE) {
    console.warn(`[${step}] Using deterministic fallback (set LANGGRAPH_LIVE_MODE=true for live providers).`);
    return fallback();
  }

  try {
    return await run();
  } catch (err) {
    const reason = describeProviderError(err);
    console.warn(`[${step}] Provider unavailable; using deterministic fallback (${reason}).`);
    return fallback();
  }
}

function aiMessage(content: string): AIMessage {
  return new AIMessage(content);
}

function fallbackSupervisorPlan(topic: string): string {
  return `Fallback plan: compare recent web updates, encyclopedic background, and academic findings for ${topic}; then synthesize themes, risks, and practical implications.`;
}

function fallbackResearchResult(source: string, topic: string): string {
  return `${source} fallback findings for ${topic}: adoption is accelerating, governance and safety remain important, and research momentum continues across clinical, commercial, and academic settings.`;
}

function fallbackSynthesis(state: ResearchState): string {
  return `Fallback synthesis for ${state.query}: ${state.web_results || 'web findings unavailable'} ${state.wiki_results || 'wiki findings unavailable'} ${state.arxiv_results || 'academic findings unavailable'} Common themes include rapid experimentation, careful validation, and the need for transparent evaluation before deployment.`;
}

function fallbackReport(state: ResearchState): string {
  return `# Research Report: ${state.query}

## Executive summary
${state.synthesis || fallbackSynthesis(state)}

## Key findings
- Current activity is strong across research and applied teams.
- Practical adoption depends on validation, safety, cost, and workflow fit.
- Cross-source synthesis is useful for separating hype from evidence.

## Conclusion
A staged rollout with measurable checkpoints is the most reliable path forward.`;
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const supervisorSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a research supervisor. Given a topic, write a concise 1-2 sentence research plan.',
}]);
const supervisorUser = new UserPromptTemplate([{ role: 'user', content: 'Research topic: {{topic}}' }]);

const webSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a web research specialist. Use the search tool to find current information. Return findings as bullet points.',
}]);
const webUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}\nPlan: {{plan}}' }]);

const wikiSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a Wikipedia specialist. Use the search tool to find encyclopedic background. Return key facts as bullet points.',
}]);
const wikiUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

const arxivSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are an academic research specialist. Use the search tool to find recent papers. Summarize key findings as bullet points.',
}]);
const arxivUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

const synthSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a research synthesizer. Combine findings from multiple sources into a coherent summary. Identify common themes.',
}]);
const synthUser = new UserPromptTemplate([{
  role: 'user',
  content:
    'Topic: {{topic}}\n\n'
    + 'Web findings:\n{{web_results}}\n\n'
    + 'Wikipedia findings:\n{{wiki_results}}\n\n'
    + 'Academic findings:\n{{arxiv_results}}\n\n'
    + 'Synthesize these into a unified summary.',
}]);

const writerSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a research report writer. Write a clear, structured report with executive summary, key findings, and conclusion. Use markdown.',
}]);
const writerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\n\nSynthesis:\n{{synthesis}}\n\nWrite a complete research report.',
}]);

// ---------------------------------------------------------------------------
// Helper: execute tool calls from an AI message
// ---------------------------------------------------------------------------

async function executeToolCalls(aiMsg: AIMessage): Promise<ToolMessage[]> {
  const toolCalls = aiMsg.tool_calls ?? [];
  const results: ToolMessage[] = [];
  for (const tc of toolCalls) {
    const tool = ALL_TOOLS_MAP.get(tc.name);
    if (!tool) continue;

    try {
      const output = await tool.invoke(tc.args);
      results.push(new ToolMessage({
        content: typeof output === 'string' ? output : JSON.stringify(output),
        tool_call_id: tc.id ?? tc.name,
      }));
    } catch (err) {
      const reason = describeProviderError(err);
      results.push(new ToolMessage({
        content: `${tc.name} fallback result: the tool call arguments were invalid, so deterministic research findings were returned (${reason}).`,
        tool_call_id: tc.id ?? tc.name,
      }));
    }
  }
  return results;
}

/** Check if the last message in a list has tool_calls. */
export function hasToolCalls(messages: BaseMessage[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  const tc = (last as any).tool_calls;
  return Array.isArray(tc) && tc.length > 0;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------

export async function supervisorNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const topic = state.query;
  const plan = await trace(
    { name: 'supervisor', kind: 'CHAIN', promptTemplate: supervisorSys, userPromptTemplate: supervisorUser },
    async () => {
      const msgs = [
        ...(supervisorSys.compile() as Array<{ role: string; content: string }>),
        ...(supervisorUser.compile({ topic }) as Array<{ role: string; content: string }>),
      ];
      return withProviderFallback(
        'langgraph.supervisor',
        async () => {
          const response = await getSupervisorLlm().invoke(msgs);
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        },
        () => fallbackSupervisorPlan(topic),
      );
    },
  );
  return { plan };
}

export async function webResearcherNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const topic = state.query;
  const plan = state.plan ?? '';
  const messages = state.web_messages ?? [];
  const newMessages = await trace(
    { name: 'web_researcher', kind: 'CHAIN', promptTemplate: webSys, userPromptTemplate: webUser },
    async () => {
      let msgs: any[];
      let initial: any[] | null = null;
      if (messages.length === 0) {
        initial = [
          ...(webSys.compile() as Array<{ role: string; content: string }>),
          ...(webUser.compile({ topic, plan }) as Array<{ role: string; content: string }>),
        ];
        msgs = initial;
      } else {
        msgs = messages;
      }
      return withProviderFallback(
        'langgraph.web_researcher',
        async () => {
          const llmWithTools = getWebLlm().bindTools(WEB_TOOLS);
          const aiMsg = await llmWithTools.invoke(msgs);
          if (initial) return [...initial, aiMsg];
          return [aiMsg];
        },
        () => [aiMessage(fallbackResearchResult('Web', topic))],
      );
    },
  );
  return { web_messages: newMessages };
}

/** Execute tool calls from the last web_messages AI message. */
export async function webToolsNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const messages = state.web_messages ?? [];
  const lastMsg = messages[messages.length - 1] as AIMessage;
  const toolResults = await executeToolCalls(lastMsg);
  return { web_messages: toolResults };
}

export function webDoneNode(state: ResearchState): Partial<ResearchState> {
  const lastMsg = state.web_messages?.[state.web_messages.length - 1];
  const content = lastMsg?.content ?? '';
  return { web_results: typeof content === 'string' ? content : JSON.stringify(content) };
}

export async function wikiResearcherNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const topic = state.query;
  const messages = state.wiki_messages ?? [];
  const newMessages = await trace(
    { name: 'wiki_researcher', kind: 'CHAIN', promptTemplate: wikiSys, userPromptTemplate: wikiUser },
    async () => {
      let msgs: any[];
      let initial: any[] | null = null;
      if (messages.length === 0) {
        initial = [
          ...(wikiSys.compile() as Array<{ role: string; content: string }>),
          ...(wikiUser.compile({ topic }) as Array<{ role: string; content: string }>),
        ];
        msgs = initial;
      } else {
        msgs = messages;
      }
      return withProviderFallback(
        'langgraph.wiki_researcher',
        async () => {
          const llmWithTools = getWikiLlm().bindTools(WIKI_TOOLS);
          const aiMsg = await llmWithTools.invoke(msgs);
          if (initial) return [...initial, aiMsg];
          return [aiMsg];
        },
        () => [aiMessage(fallbackResearchResult('Wikipedia', topic))],
      );
    },
  );
  return { wiki_messages: newMessages };
}

/** Execute tool calls from the last wiki_messages AI message. */
export async function wikiToolsNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const messages = state.wiki_messages ?? [];
  const lastMsg = messages[messages.length - 1] as AIMessage;
  const toolResults = await executeToolCalls(lastMsg);
  return { wiki_messages: toolResults };
}

export function wikiDoneNode(state: ResearchState): Partial<ResearchState> {
  const lastMsg = state.wiki_messages?.[state.wiki_messages.length - 1];
  const content = lastMsg?.content ?? '';
  return { wiki_results: typeof content === 'string' ? content : JSON.stringify(content) };
}

export async function arxivResearcherNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const topic = state.query;
  const messages = state.arxiv_messages ?? [];
  const newMessages = await trace(
    { name: 'arxiv_researcher', kind: 'CHAIN', promptTemplate: arxivSys, userPromptTemplate: arxivUser },
    async () => {
      let msgs: any[];
      let initial: any[] | null = null;
      if (messages.length === 0) {
        initial = [
          ...(arxivSys.compile() as Array<{ role: string; content: string }>),
          ...(arxivUser.compile({ topic }) as Array<{ role: string; content: string }>),
        ];
        msgs = initial;
      } else {
        msgs = messages;
      }
      return withProviderFallback(
        'langgraph.arxiv_researcher',
        async () => {
          const llmWithTools = getArxivLlm().bindTools(ARXIV_TOOLS);
          const aiMsg = await llmWithTools.invoke(msgs);
          if (initial) return [...initial, aiMsg];
          return [aiMsg];
        },
        () => [aiMessage(fallbackResearchResult('ArXiv', topic))],
      );
    },
  );
  return { arxiv_messages: newMessages };
}

/** Execute tool calls from the last arxiv_messages AI message. */
export async function arxivToolsNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const messages = state.arxiv_messages ?? [];
  const lastMsg = messages[messages.length - 1] as AIMessage;
  const toolResults = await executeToolCalls(lastMsg);
  return { arxiv_messages: toolResults };
}

export function arxivDoneNode(state: ResearchState): Partial<ResearchState> {
  const lastMsg = state.arxiv_messages?.[state.arxiv_messages.length - 1];
  const content = lastMsg?.content ?? '';
  return { arxiv_results: typeof content === 'string' ? content : JSON.stringify(content) };
}

export async function synthesizerNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const synthesis = await trace(
    { name: 'synthesizer', kind: 'CHAIN', promptTemplate: synthSys, userPromptTemplate: synthUser },
    async () => {
      const msgs = [
        ...(synthSys.compile() as Array<{ role: string; content: string }>),
        ...(synthUser.compile({
          topic: state.query,
          web_results: state.web_results ?? 'N/A',
          wiki_results: state.wiki_results ?? 'N/A',
          arxiv_results: state.arxiv_results ?? 'N/A',
        }) as Array<{ role: string; content: string }>),
      ];
      return withProviderFallback(
        'langgraph.synthesizer',
        async () => {
          const response = await getSynthLlm().invoke(msgs);
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        },
        () => fallbackSynthesis(state),
      );
    },
  );
  return { synthesis };
}

export async function reportWriterNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const finalReport = await trace(
    { name: 'report_writer', kind: 'CHAIN', promptTemplate: writerSys, userPromptTemplate: writerUser },
    async () => {
      const msgs = [
        ...(writerSys.compile() as Array<{ role: string; content: string }>),
        ...(writerUser.compile({
          topic: state.query,
          synthesis: state.synthesis ?? '',
        }) as Array<{ role: string; content: string }>),
      ];
      return withProviderFallback(
        'langgraph.report_writer',
        async () => {
          console.log('\n--- Final Report (streaming) ---');
          let full = '';
          for await (const chunk of await getWriterLlm().stream(msgs)) {
            const text = typeof chunk.content === 'string' ? chunk.content : '';
            process.stdout.write(text);
            full += text;
          }
          console.log('\n--------------------------------\n');
          return full;
        },
        () => fallbackReport(state),
      );
    },
  );
  return { final_report: finalReport };
}
