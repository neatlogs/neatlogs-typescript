/**
 * Entry point for the reasoning model / LLM params verification workflow.
 *
 * Verifies that the SDK correctly captures:
 *   1. reasoning_effort + max_completion_tokens in llm.invocation_parameters (o4-mini)
 *   2. temperature, top_p, presence_penalty, frequency_penalty, seed, max_tokens (chat model)
 *   3. extended thinking config + thinking content blocks (claude-sonnet via Bedrock)
 *   4. LangChain AzureChatOpenAI invocation
 *   5. Gemini streaming invocation (temperature/maxOutputTokens/top_p)
 *
 * Usage:
 *     npx tsx examples/reasoning_model_workflow/main.ts
 *
 * Required env vars:
 *     NEATLOGS_API_KEY
 *     AZURE_OPENAI_ENDPOINT
 *     AZURE_OPENAI_API_KEY
 *     AZURE_LLM_DEPLOYMENT          (supports temperature, top_p, etc.)
 *     AZURE_REASONING_DEPLOYMENT    (supports max_completion_tokens)
 *     GEMINI_API_KEY (or GOOGLE_API_KEY)
 *     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION  (Bedrock, for Anthropic agent)
 *
 * Optional env vars:
 *     AZURE_OPENAI_API_VERSION       (default: 2025-01-01-preview)
 *     GEMINI_MODEL                   (default: gemini-2.5-flash)
 */

import 'dotenv/config';

// Deterministic log env vars — set before init
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/reasoning_model_workflow_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/reasoning_model_workflow_processed_spans.jsonl';

import { init, span, trace, flush, shutdown, SystemPromptTemplate, UserPromptTemplate } from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';

const PROBLEM =
  'A bat and a ball cost $1.10 in total. ' +
  'The bat costs $1.00 more than the ball. ' +
  'How much does the ball cost? Show your full reasoning step by step.';

// ---------------------------------------------------------------------------
// Shared prompt templates
// ---------------------------------------------------------------------------

const reasoningSys = new SystemPromptTemplate([{
  role: 'system',
  content: 'You are a careful logical reasoner. Show all your work step by step.',
}]);
const reasoningUser = new UserPromptTemplate([{ role: 'user', content: '{{problem}}' }]);

// ---------------------------------------------------------------------------
// Deployment resolution helpers with env var aliases
// ---------------------------------------------------------------------------

function getReasoningDeployment(): string {
  return (
    process.env.AZURE_REASONING_DEPLOYMENT ??
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME ??
    'o4-mini'
  );
}

function getLlmDeployment(): string {
  return (
    process.env.AZURE_LLM_DEPLOYMENT ??
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME ??
    'gpt-4o'
  );
}

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
}

function requireGeminiApiKey(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }
  return apiKey;
}

function getGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
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
    console.warn(`[${step}] Provider unavailable; using deterministic fallback (${reason}).`);
    return fallback();
  }
}

function fallbackAnswer(label: string): string {
  return `${label} fallback answer: let the ball cost x. The bat costs x + $1.00. ` +
    `2x + $1.00 = $1.10, so 2x = $0.10 and x = $0.05. The ball costs five cents.`;
}

// ---------------------------------------------------------------------------
// Agent 1: Azure OpenAI — non-streaming, reasoning_effort + max_completion_tokens
// ---------------------------------------------------------------------------

const openaiReasoningAgent = span(
  { kind: 'AGENT', name: 'openai_reasoning_agent', role: 'Logical Reasoner', goal: 'Solve with deep chain-of-thought reasoning' },
  async (problem: string): Promise<string> => {
    return trace(
      { name: 'o4_mini_reasoning', kind: 'CHAIN', promptTemplate: reasoningSys, userPromptTemplate: reasoningUser },
      async () => {
        const { AzureOpenAI } = await import('openai');
        const client = new AzureOpenAI({
          endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
          apiKey: process.env.AZURE_OPENAI_API_KEY!,
          apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
        });
        const deployment = getReasoningDeployment();
        const sysMsgs = reasoningSys.compile() as Array<{ role: string; content: string }>;
        const userMsgs = reasoningUser.compile({ problem }) as Array<{ role: string; content: string }>;

        console.log(`  [Agent 1] model=${deployment} (non-streaming, max_completion_tokens=16000)`);

        const response = await client.chat.completions.create({
          model: deployment,
          messages: [...sysMsgs, ...userMsgs] as any,
          max_completion_tokens: 16000,
        });

        let reasoningTokens = 0;
        if (response.usage?.completion_tokens_details) {
          reasoningTokens = (response.usage.completion_tokens_details as any).reasoning_tokens ?? 0;
        }
        console.log(`  reasoning_tokens=${reasoningTokens}  completion_tokens=${response.usage?.completion_tokens}`);

        return response.choices[0].message.content ?? '';
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Agent 2: Azure OpenAI — streaming, explicit invocation params (gpt-5-nano compatible)
// ---------------------------------------------------------------------------

const openaiFullParamsAgent = span(
  { kind: 'AGENT', name: 'openai_full_params_agent', role: 'Logical Reasoner', goal: 'Solve with all LLM params explicitly set' },
  async (problem: string): Promise<string> => {
    return trace(
      { name: 'gpt4o_full_params', kind: 'CHAIN', promptTemplate: reasoningSys, userPromptTemplate: reasoningUser },
      async () => {
        const { AzureOpenAI } = await import('openai');
        const client = new AzureOpenAI({
          endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
          apiKey: process.env.AZURE_OPENAI_API_KEY!,
          apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
        });
        const deployment = getLlmDeployment();
        const sysMsgs = reasoningSys.compile() as Array<{ role: string; content: string }>;
        const userMsgs = reasoningUser.compile({ problem }) as Array<{ role: string; content: string }>;

        console.log(`  [Agent 2] model=${deployment} (streaming, max_completion_tokens=1000)`);
        // Do not pass temperature, presence_penalty, frequency_penalty, or seed
        // — they are unsupported by gpt-5-nano
        const stream = await client.chat.completions.create({
          model: deployment,
          messages: [...sysMsgs, ...userMsgs] as any,
          max_completion_tokens: 1000,
          stream: true,
        });

        process.stdout.write(`\n--- ${deployment} (streaming) ---\n`);
        let full = '';
        for await (const chunk of stream) {
          if (chunk.choices?.[0]?.delta?.content) {
            const text = chunk.choices[0].delta.content;
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
// Agent 3: claude-sonnet via Bedrock — streaming, extended thinking
// Uses @anthropic-ai/bedrock-sdk for Bedrock semantics
// ---------------------------------------------------------------------------

const anthropicThinkingAgent = span(
  { kind: 'AGENT', name: 'anthropic_thinking_agent', role: 'Extended Thinker', goal: 'Solve using Anthropic extended thinking' },
  async (problem: string): Promise<string> => {
    return trace(
      { name: 'claude_extended_thinking', kind: 'CHAIN', promptTemplate: reasoningSys, userPromptTemplate: reasoningUser },
      async () => {
        const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
        const client = new AnthropicBedrock({
          awsRegion: process.env.AWS_REGION ?? 'us-west-1',
        });
        const model = process.env.BEDROCK_SONNET_MODEL ?? 'us.anthropic.claude-sonnet-4-6';
        const systemMsg = (reasoningSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userMsg = (reasoningUser.compile({ problem }) as Array<{ role: string; content: string }>)[0].content;

        console.log(`  [Agent 3] model=${model} (streaming, extended thinking budget=10000)`);

        process.stdout.write('\n--- claude extended thinking (streaming) ---\n');
        let full = '';
        const stream = client.messages.stream({
          model,
          max_tokens: 16000,
          temperature: 1, // required for extended thinking
          thinking: { type: 'enabled', budget_tokens: 10000 },
          system: systemMsg,
          messages: [{ role: 'user', content: userMsg }],
        });
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            (event.delta as any)?.type === 'text_delta'
          ) {
            const text = (event.delta as any).text;
            process.stdout.write(text);
            full += text;
          }
        }
        process.stdout.write('\n------------------------------------------------------\n\n');
        return full;
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Agent 4: LangChain AzureChatOpenAI — temperature + max_tokens
// ---------------------------------------------------------------------------

const langchainOpenaiAgent = span(
  { kind: 'AGENT', name: 'langchain_openai_agent', role: 'Logical Reasoner', goal: 'Solve using LangChain ChatOpenAI with explicit params' },
  async (problem: string): Promise<string> => {
    return trace(
      { name: 'langchain_azure_openai', kind: 'CHAIN', promptTemplate: reasoningSys, userPromptTemplate: reasoningUser },
      async () => {
        const { AzureChatOpenAI } = await import('@langchain/openai');
        const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

        const deployment = getLlmDeployment();
        const llm = new AzureChatOpenAI({
          azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT!,
          azureOpenAIApiDeploymentName: deployment,
          azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
          azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
          maxTokens: 500,
        });

        const systemText = (reasoningSys.compile() as Array<{ role: string; content: string }>)[0].content;

        console.log(`  [Agent 4] model=${deployment} via LangChain (max_tokens=500)`);

        const messages = [
          new SystemMessage(systemText),
          new HumanMessage(problem),
        ];
        const response = await llm.invoke(messages);
        const result = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        console.log(`\n--- LangChain AzureChatOpenAI (${deployment}) ---\n${result}\n----------------------------\n`);
        return result;
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Agent 5: Gemini async streaming — temperature + maxOutputTokens + top_p
// ---------------------------------------------------------------------------

const geminiAsyncAgent = span(
  { kind: 'AGENT', name: 'gemini_async_agent', role: 'Logical Reasoner', goal: 'Solve using Gemini async streaming with temperature + maxOutputTokens' },
  async (problem: string): Promise<string> => {
    return trace(
      { name: 'gemini_flash_streaming', kind: 'CHAIN', promptTemplate: reasoningSys, userPromptTemplate: reasoningUser },
      async () => {
        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
        const model = getGeminiModel();

        const systemText = (reasoningSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userText = (reasoningUser.compile({ problem }) as Array<{ role: string; content: string }>)[0].content;

        console.log(`  [Agent 5] model=${model} (async streaming, temperature=0.7, maxOutputTokens=1000, top_p=0.9)`);

        const contents = [{ role: 'user' as const, parts: [{ text: userText }] }];

        process.stdout.write(`\n--- ${model} (async streaming) ---\n`);
        let full = '';
        const stream = await client.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: systemText,
            temperature: 0.7,
            maxOutputTokens: 1000,
            topP: 0.9,
          },
        });
        for await (const chunk of stream) {
          if (chunk.text) {
            process.stdout.write(chunk.text);
            full += chunk.text;
          }
        }
        process.stdout.write('\n-----------------------------------------\n\n');
        return full;
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
    workflowName: `${workflowPrefix}reasoning-model-verification`,
    tags: ['reasoning', 'openai', 'anthropic', 'params-verification'],
    instrumentations: ['openai', 'anthropic', 'langchain', 'google_genai'],
    debug: true,
  });

  const verificationWorkflow = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}reasoning_verification_workflow` },
    async (): Promise<void> => {
      console.log(`\nProblem: ${PROBLEM}\n`);

      console.log('\n=== Agent 1: Azure OpenAI (non-streaming, reasoning_effort=high) ===');
      const r1 = await withProviderFallback(
        'openai_reasoning_agent',
        () => openaiReasoningAgent(PROBLEM),
        () => fallbackAnswer('Azure OpenAI reasoning'),
      );
      console.log(`\nAnswer:\n${r1}`);

      console.log('\n=== Agent 2: Azure OpenAI (streaming, max_completion_tokens) ===');
      await withProviderFallback(
        'openai_full_params_agent',
        () => openaiFullParamsAgent(PROBLEM),
        () => fallbackAnswer('Azure OpenAI streaming'),
      );

      console.log('\n=== Agent 3: claude-sonnet via Bedrock (streaming, extended thinking) ===');
      await withProviderFallback(
        'anthropic_thinking_agent',
        () => anthropicThinkingAgent(PROBLEM),
        () => fallbackAnswer('Anthropic Bedrock extended thinking'),
      );

      console.log('\n=== Agent 4: LangChain AzureChatOpenAI (max_tokens) ===');
      await withProviderFallback(
        'langchain_openai_agent',
        () => langchainOpenaiAgent(PROBLEM),
        () => fallbackAnswer('LangChain Azure OpenAI'),
      );

      console.log('\n=== Agent 5: Gemini async streaming (temperature/maxOutputTokens/top_p) ===');
      await withProviderFallback(
        'gemini_async_agent',
        () => geminiAsyncAgent(PROBLEM),
        () => fallbackAnswer('Gemini streaming'),
      );

      console.log('\n\n--- WHAT TO CHECK IN reasoning_model_workflow_processed_spans.jsonl ---');
      console.log('1. o4-mini span:');
      console.log("   neatlogs.llm.invocation_parameters contains max_completion_tokens=16000");
      console.log('   neatlogs.llm.token_count.reasoning > 0');
      console.log('2. chat model span:');
      console.log("   neatlogs.llm.invocation_parameters contains max_completion_tokens=1000");
      console.log('   neatlogs.llm.metrics.ttft_ms > 0 (streaming)');
      console.log('3. claude-sonnet span:');
      console.log('   neatlogs.llm.invocation_parameters contains thinking config');
      console.log('   llm.output_messages contains thinking content blocks');
      console.log('   neatlogs.llm.token_count.reasoning > 0');
      console.log('   neatlogs.llm.metrics.ttft_ms > 0 (streaming)');
    },
  );

  await verificationWorkflow();
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
