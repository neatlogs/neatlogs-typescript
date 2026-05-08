/**
 * Agent functions for the OpenAI investment research workflow.
 *
 * Agents:
 *   - Planner       (Azure OpenAI AZURE_LLM_DEPLOYMENT, non-streaming) — generates 3 research questions
 *   - Researcher    (Azure OpenAI AZURE_LLM_DEPLOYMENT, tool-calling)  — LLM calls web_search tool
 *   - Analyst       (Azure OpenAI AZURE_LLM_DEPLOYMENT, streaming)     — identifies investment themes
 *   - Reporter      (Azure OpenAI AZURE_LLM_DEPLOYMENT, streaming)     — writes final investment brief
 */

import { AzureOpenAI } from 'openai';
import { span, trace, log, PromptTemplate, UserPromptTemplate } from 'neatlogs';

// ---------------------------------------------------------------------------
// Lazy client factory — client is created after init() has been called
// ---------------------------------------------------------------------------

let _client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (!_client) {
    _client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview',
    });
  }
  return _client;
}

function getDeployment(): string {
  return (
    process.env.AZURE_LLM_DEPLOYMENT ??
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME ??
    'gpt-4o'
  );
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const plannerSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a financial research planner. Given a company or stock, return exactly 3 research questions as a JSON array of strings. No other text.',
}]);
const plannerUser = new UserPromptTemplate([{ role: 'user', content: 'Company: {{company}}' }]);

const researcherSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a web research assistant. Use the web_search tool to find information for the given question, then summarize the findings as concise bullet points relevant to investment analysis.',
}]);
const researcherUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Research question: {{question}}',
}]);

const analystSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a senior investment analyst. Identify key investment themes, risks, and opportunities from the research findings.',
}]);
const analystUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Company: {{company}}\n\nResearch findings:\n{{findings}}\n\nProvide a structured analysis.',
}]);

const reporterSys = new PromptTemplate([{
  role: 'system',
  content: 'You are an investment report writer. Write a clear, professional investment brief with an executive summary, key findings, risks, and recommendation. Use markdown.',
}]);
const reporterUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Company: {{company}}\n\nAnalysis:\n{{analysis}}\n\nWrite a complete investment brief.',
}]);

// ---------------------------------------------------------------------------
// Tool definition (passed to the LLM)
// ---------------------------------------------------------------------------

const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Search the web for current information on a topic.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
      },
      required: ['query'],
    },
  },
};

// ---------------------------------------------------------------------------
// Tool implementation — called only when the LLM requests it
// ---------------------------------------------------------------------------

const webSearch = span(
  { kind: 'TOOL', name: 'web_search' },
  async (query: string): Promise<string> => {
    return (
      `- Mock result 1 for '${query}': Strong revenue growth and expanding market share.\n` +
      `- Mock result 2 for '${query}': Recent product launches receiving positive analyst coverage.\n` +
      `- Mock result 3 for '${query}': Management reaffirmed full-year guidance above consensus.`
    );
  },
);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const plannerAgent = span(
  { kind: 'AGENT', name: 'planner', role: 'Research Planner', goal: 'Generate targeted research questions' },
  async (company: string): Promise<string[]> => {
    return trace(
      { name: 'plan_questions', kind: 'CHAIN', promptTemplate: plannerSys, userPromptTemplate: plannerUser },
      async () => {
        const client = getClient();
        const deployment = getDeployment();
        const sysMsgs = plannerSys.compile() as Array<{ role: string; content: string }>;
        const userMsgs = plannerUser.compile({ company }) as Array<{ role: string; content: string }>;
        const response = await client.chat.completions.create({
          model: deployment,
          messages: [...sysMsgs, ...userMsgs] as any,
        });
        const raw = response.choices[0].message.content?.trim() ?? '[]';
        let questions: string[];
        try {
          questions = JSON.parse(raw);
        } catch {
          questions = raw.split('\n').filter(Boolean).map((q: string) => q.replace(/^[-\d. ]+/, '').trim());
        }
        questions = questions.slice(0, 3);
        log('planner generated {count} questions for {company}', { count: questions.length, company });
        return questions;
      },
    );
  },
);

export const researcherAgent = span(
  { kind: 'AGENT', name: 'researcher', role: 'Web Researcher', goal: 'Find current information on each question' },
  async (questions: string[]): Promise<string> => {
    const allSummaries: string[] = [];
    for (const question of questions) {
      log('researching question: {question}', { question });
      const summary = await trace(
        { name: 'research_question', kind: 'CHAIN', promptTemplate: researcherSys, userPromptTemplate: researcherUser },
        async () => {
          const client = getClient();
          const deployment = getDeployment();
          const sysMsgs = researcherSys.compile() as Array<{ role: string; content: string }>;
          const userMsgs = researcherUser.compile({ question }) as Array<{ role: string; content: string }>;
          const msgs: any[] = [...sysMsgs, ...userMsgs];

          // First LLM call — model may request the web_search tool
          const response = await client.chat.completions.create({
            model: deployment,
            messages: msgs,
            tools: [WEB_SEARCH_TOOL],
            tool_choice: 'auto',
          });
          const aiMsg = response.choices[0].message;
          msgs.push(aiMsg);

          // Execute any tool calls the model requested
          if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
            for (const tc of aiMsg.tool_calls) {
              if (!('function' in tc)) continue;
              const args = JSON.parse(tc.function.arguments);
              log('tool call: web_search query={query}', { query: args.query });
              const result = await webSearch(args.query);
              log('web_search returned {chars} chars', { chars: result.length });
              msgs.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: result,
              });
            }

            // Second LLM call — model summarizes the tool results
            const finalResp = await client.chat.completions.create({
              model: deployment,
              messages: msgs,
            });
            return finalResp.choices[0].message.content ?? '';
          }
          return aiMsg.content ?? '';
        },
      );
      allSummaries.push(`Q: ${question}\n${summary}`);
    }
    return allSummaries.join('\n\n');
  },
);

export const analystAgent = span(
  { kind: 'AGENT', name: 'analyst', role: 'Investment Analyst', goal: 'Identify investment themes and risks' },
  async (company: string, findings: string): Promise<string> => {
    return trace(
      { name: 'analyze_findings', kind: 'CHAIN', promptTemplate: analystSys, userPromptTemplate: analystUser },
      async () => {
        const client = getClient();
        const deployment = getDeployment();
        const sysMsgs = analystSys.compile() as Array<{ role: string; content: string }>;
        const userMsgs = analystUser.compile({ company, findings }) as Array<{ role: string; content: string }>;
        const stream = await client.chat.completions.create({
          model: deployment,
          messages: [...sysMsgs, ...userMsgs] as any,
          stream: true,
        });
        process.stdout.write('\n--- Analyst (streaming) ---\n');
        let full = '';
        for await (const chunk of stream) {
          if (chunk.choices?.[0]?.delta?.content) {
            const text = chunk.choices[0].delta.content;
            process.stdout.write(text);
            full += text;
          }
        }
        process.stdout.write('\n---------------------------\n\n');
        return full;
      },
    );
  },
);

export const reporterAgent = span(
  { kind: 'AGENT', name: 'reporter', role: 'Report Writer', goal: 'Write the final investment brief' },
  async (company: string, analysis: string): Promise<string> => {
    return trace(
      { name: 'write_report', kind: 'CHAIN', promptTemplate: reporterSys, userPromptTemplate: reporterUser },
      async () => {
        const client = getClient();
        const deployment = getDeployment();
        const sysMsgs = reporterSys.compile() as Array<{ role: string; content: string }>;
        const userMsgs = reporterUser.compile({ company, analysis }) as Array<{ role: string; content: string }>;
        const stream = await client.chat.completions.create({
          model: deployment,
          messages: [...sysMsgs, ...userMsgs] as any,
          stream: true,
        });
        process.stdout.write('\n--- Investment Brief (streaming) ---\n');
        let full = '';
        for await (const chunk of stream) {
          if (chunk.choices?.[0]?.delta?.content) {
            const text = chunk.choices[0].delta.content;
            process.stdout.write(text);
            full += text;
          }
        }
        process.stdout.write('\n------------------------------------\n\n');
        return full;
      },
    );
  },
);
