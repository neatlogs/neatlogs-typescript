/**
 * Agent functions for the OpenAI investment research workflow.
 * TypeScript port of: examples/sdk_examples/openai_multiagent/agents.py
 *
 * Agents:
 *   - plannerAgent    (Azure OpenAI, non-streaming) — generates 3 research questions
 *   - researcherAgent (Azure OpenAI, tool-calling)  — LLM calls web_search tool
 *   - analystAgent    (Azure OpenAI, streaming)     — identifies investment themes
 *   - reporterAgent   (Azure OpenAI, streaming)     — writes final investment brief
 */

import OpenAI, { AzureOpenAI } from "openai";
import {
  spanWrap,
  withTrace,
  log,
  PromptTemplate,
  UserPromptTemplate,
} from "../../src/neatlogs";

// ---------------------------------------------------------------------------
// Azure OpenAI client
// Using AzureOpenAI class specifically so the OpenAI instrumentation
// correctly identifies this as an Azure endpoint.
// ---------------------------------------------------------------------------

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview",
});

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const _plannerSys = new PromptTemplate([
  {
    role: "system",
    content:
      "You are a financial research planner. Given a company or stock, return exactly 3 research questions as a JSON array of strings. No other text.",
  },
]);

const _plannerUser = new UserPromptTemplate([
  { role: "user", content: "Company: {{company}}" },
]);

const _researcherSys = new PromptTemplate([
  {
    role: "system",
    content:
      "You are a web research assistant. Use the web_search tool to find information for the given question, then summarize the findings as concise bullet points relevant to investment analysis.",
  },
]);

const _researcherUser = new UserPromptTemplate([
  { role: "user", content: "Research question: {{question}}" },
]);

const _analystSys = new PromptTemplate([
  {
    role: "system",
    content:
      "You are a senior investment analyst. Identify key investment themes, risks, and opportunities from the research findings.",
  },
]);

const _analystUser = new UserPromptTemplate([
  {
    role: "user",
    content:
      "Company: {{company}}\n\nResearch findings:\n{{findings}}\n\nProvide a structured analysis.",
  },
]);

const _reporterSys = new PromptTemplate([
  {
    role: "system",
    content:
      "You are an investment report writer. Write a clear, professional investment brief with an executive summary, key findings, risks, and recommendation. Use markdown.",
  },
]);

const _reporterUser = new UserPromptTemplate([
  {
    role: "user",
    content:
      "Company: {{company}}\n\nAnalysis:\n{{analysis}}\n\nWrite a complete investment brief.",
  },
]);

// ---------------------------------------------------------------------------
// Tool definition (passed to the LLM)
// ---------------------------------------------------------------------------

const WEB_SEARCH_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information on a topic.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
      },
      required: ["query"],
    },
  },
};

// ---------------------------------------------------------------------------
// Tool implementation (mocked) — wrapped with a TOOL span
// ---------------------------------------------------------------------------

const webSearch = spanWrap(
  { kind: "TOOL", name: "web_search", toolName: "web_search" },
  async (query: string): Promise<string> => {
    // Mocked search results — mirrors the Python example
    return (
      `- Mock result 1 for '${query}': Strong revenue growth and expanding market share.\n` +
      `- Mock result 2 for '${query}': Recent product launches receiving positive analyst coverage.\n` +
      `- Mock result 3 for '${query}': Management reaffirmed full-year guidance above consensus.`
    );
  }
);

// ---------------------------------------------------------------------------
// Planner agent — non-streaming, returns JSON array of 3 questions
// ---------------------------------------------------------------------------

export const plannerAgent = spanWrap(
  {
    kind: "AGENT",
    name: "planner",
    role: "Research Planner",
    goal: "Generate targeted research questions",
  },
  async (company: string): Promise<string[]> => {
    const msgs = [
      ..._plannerSys.compile({}),
      ..._plannerUser.compile({ company }),
    ];

    const response = await withTrace(
      {
        name: "plan_questions",
        kind: "LLM",
        promptTemplate: _plannerSys,
        userPromptTemplate: _plannerUser,
      },
      async () =>
        client.chat.completions.create({
          model: DEPLOYMENT,
          messages: msgs as OpenAI.ChatCompletionMessageParam[],
        })
    );

    const raw = response.choices[0].message.content?.trim() ?? "";

    let questions: string[];
    try {
      questions = JSON.parse(raw) as string[];
    } catch {
      questions = raw
        .split("\n")
        .map((q) => q.replace(/^[-\d.)\s]+/, "").trim())
        .filter((q) => q.length > 0);
    }

    questions = questions.slice(0, 3);
    log("planner generated {count} questions for {company}", {
      count: questions.length,
      company,
    });

    return questions;
  }
);

// ---------------------------------------------------------------------------
// Researcher agent — tool-calling
// ---------------------------------------------------------------------------

export const researcherAgent = spanWrap(
  {
    kind: "AGENT",
    name: "researcher",
    role: "Web Researcher",
    goal: "Find current information on each question",
  },
  async (questions: string[]): Promise<string> => {
    const allSummaries: string[] = [];

    for (const question of questions) {
      log("researching question: {question}", { question });

      const summary = await withTrace(
        {
          name: "research_question",
          kind: "LLM",
          promptTemplate: _researcherSys,
          userPromptTemplate: _researcherUser,
        },
        async () => {
          const msgs: OpenAI.ChatCompletionMessageParam[] = [
            ..._researcherSys.compile({}),
            ..._researcherUser.compile({ question }),
          ] as OpenAI.ChatCompletionMessageParam[];

          // First LLM call — model may request the web_search tool
          const response = await client.chat.completions.create({
            model: DEPLOYMENT,
            messages: msgs,
            tools: [WEB_SEARCH_TOOL],
            tool_choice: "auto",
          });

          const aiMsg = response.choices[0].message;
          msgs.push(aiMsg as OpenAI.ChatCompletionMessageParam);

          // Execute any tool calls the model requested
          if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
            for (const tc of aiMsg.tool_calls) {
              if (tc.type !== "function") continue;
              const args = JSON.parse(tc.function.arguments) as {
                query: string;
              };
              log("tool call: web_search query={query}", {
                query: args.query,
              });
              const result = await webSearch(args.query);
              log("web_search returned {chars} chars", {
                chars: result.length,
              });
              msgs.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              });
            }

            // Second LLM call — model summarizes the tool results
            const final = await client.chat.completions.create({
              model: DEPLOYMENT,
              messages: msgs,
            });
            return final.choices[0].message.content ?? "";
          } else {
            return aiMsg.content ?? "";
          }
        }
      );

      allSummaries.push(`Q: ${question}\n${summary}`);
    }

    return allSummaries.join("\n\n");
  }
);

// ---------------------------------------------------------------------------
// Analyst agent — streaming
// ---------------------------------------------------------------------------

export const analystAgent = spanWrap(
  {
    kind: "AGENT",
    name: "analyst",
    role: "Investment Analyst",
    goal: "Identify investment themes and risks",
  },
  async (company: string, findings: string): Promise<string> => {
    const msgs = [
      ..._analystSys.compile({}),
      ..._analystUser.compile({ company, findings }),
    ];

    const full = await withTrace(
      {
        name: "analyze_findings",
        kind: "LLM",
        promptTemplate: _analystSys,
        userPromptTemplate: _analystUser,
      },
      async () => {
        const stream = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: msgs as OpenAI.ChatCompletionMessageParam[],
          stream: true,
          stream_options: { include_usage: true },
        });

        console.log("\n--- Analyst (streaming) ---");
        let accumulated = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            process.stdout.write(delta);
            accumulated += delta;
          }
        }
        console.log("\n---------------------------\n");
        return accumulated;
      }
    );

    return full;
  }
);

// ---------------------------------------------------------------------------
// Reporter agent — streaming
// ---------------------------------------------------------------------------

export const reporterAgent = spanWrap(
  {
    kind: "AGENT",
    name: "reporter",
    role: "Report Writer",
    goal: "Write the final investment brief",
  },
  async (company: string, analysis: string): Promise<string> => {
    const msgs = [
      ..._reporterSys.compile({}),
      ..._reporterUser.compile({ company, analysis }),
    ];

    const full = await withTrace(
      {
        name: "write_report",
        kind: "LLM",
        promptTemplate: _reporterSys,
        userPromptTemplate: _reporterUser,
      },
      async () => {
        const stream = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: msgs as OpenAI.ChatCompletionMessageParam[],
          stream: true,
          stream_options: { include_usage: true },
        });

        console.log("\n--- Investment Brief (streaming) ---");
        let accumulated = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            process.stdout.write(delta);
            accumulated += delta;
          }
        }
        console.log("\n------------------------------------\n");
        return accumulated;
      }
    );

    return full;
  }
);
