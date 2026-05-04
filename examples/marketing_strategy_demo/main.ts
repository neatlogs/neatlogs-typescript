/**
 * Marketing Strategy Demo — TypeScript sequential pipeline.
 *
 * Reimplements the Python CrewAI marketing example as an explicit TypeScript
 * sequential pipeline. CrewAI is Python-only, so we do NOT use it here.
 *
 * Pipeline topology:
 *   Marketing Strategy Workflow (WORKFLOW)
 *     ├── Lead Market Analyst (AGENT)
 *     │     ├── research_task (CHAIN)
 *     │     │     ├── Web Search Google (TOOL)
 *     │     │     └── Analyze Website Content (TOOL)
 *     │     └── project_understanding_task (CHAIN)
 *     ├── Chief Marketing Strategist (AGENT)
 *     │     └── marketing_strategy_task (CHAIN)
 *     └── Creative Content Creator (AGENT)
 *           ├── campaign_idea_task (CHAIN)
 *           └── copy_creation_task (CHAIN)
 *
 * Uses Azure OpenAI for text-generation and Google GenAI for web-search tools.
 * Set MARKETING_MOCK_MODE=true for a fast deterministic run without API calls.
 *
 * Usage:
 *   npx tsx examples/marketing_strategy_demo/main.ts
 *   MARKETING_MOCK_MODE=true npx tsx examples/marketing_strategy_demo/main.ts
 *
 * Required env vars (live mode):
 *   NEATLOGS_API_KEY
 *   AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
 *   AZURE_LLM_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT_NAME
 *   GOOGLE_API_KEY
 */

import 'dotenv/config';

// ---------------------------------------------------------------------------
// Deterministic log env vars — must be set before init
// ---------------------------------------------------------------------------
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/marketing_strategy_demo_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/marketing_strategy_demo_processed_spans.jsonl';

import {
  init,
  span,
  trace,
  flush,
  shutdown,
  SystemPromptTemplate,
  UserPromptTemplate,
} from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';

// ---------------------------------------------------------------------------
// Mock mode toggle
// ---------------------------------------------------------------------------
const MOCK_MODE = process.env.MARKETING_MOCK_MODE === 'true';

// Real output from trace d021f6e44c40b01ee0d0687678594a0a (2026-04-02)
const MOCK_RESULT = {
  title: 'FlowForge: Enterprise AI Crews, Orchestrated at Scale',
  body:
    "In large organizations, automation isn't single-task — it's a "
    + "coordinated crew of intelligent agents. FlowForge merges Studio's no-code/low-code "
    + "crew orchestration with AMP's production-grade governance and AMP Factory's "
    + 'on-prem/hybrid deployment to deliver scalable, auditable multi-agent workflows across '
    + 'finance, IT, and operations.',
};

// ---------------------------------------------------------------------------
// Demo inputs
// ---------------------------------------------------------------------------
const DEMO_INPUTS = {
  customer_domain: 'crewai.com',
  project_description:
    'CrewAI, a leading provider of multi-agent AI systems, wants to '
    + 'boost adoption of its platform among enterprise engineering teams. '
    + 'The campaign should highlight ease of use, production-readiness, '
    + 'and the ability to orchestrate complex AI workflows. Target audience: '
    + 'CTOs, VP Engineering, and senior developers at mid-to-large companies.',
};

// ---------------------------------------------------------------------------
// Structured output types
// ---------------------------------------------------------------------------
interface MarketStrategy {
  name: string;
  tactics: string[];
  channels: string[];
  kpis: string[];
}

interface CampaignIdea {
  name: string;
  description: string;
  audience: string;
  channel: string;
}

interface AdCopy {
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Agent backstories / system prompts
// ---------------------------------------------------------------------------
const ANALYST_BACKSTORY = new SystemPromptTemplate(
  'You are a Lead Market Analyst at a premier digital marketing firm. '
  + 'You specialise in dissecting online business landscapes, identifying '
  + 'competitor positioning, and uncovering audience demographics. '
  + 'You always ground your analysis in data and cite your sources. '
  + 'Think step-by-step through your research process. '
  + 'Be efficient: use at most 3 web searches total — each search should be '
  + 'targeted and purposeful. Do not repeat similar queries.',
);

const STRATEGIST_BACKSTORY = new SystemPromptTemplate(
  'You are the Chief Marketing Strategist at a leading digital marketing '
  + 'agency, known for crafting bespoke strategies that drive measurable '
  + 'results. You synthesise market research into actionable plans with '
  + 'clear KPIs. Think carefully about which channels and tactics will '
  + 'have the highest ROI for the target audience. '
  + 'Be efficient: use at most 2 web searches — only search when the research '
  + 'context is insufficient. Prioritise synthesis over additional lookups.',
);

const CREATOR_BACKSTORY = new SystemPromptTemplate(
  'You are a Creative Content Creator at a top-tier digital marketing '
  + 'agency. You excel at turning marketing strategies into engaging '
  + 'stories and compelling ad copy that captures attention and inspires '
  + 'action. You think about what will resonate emotionally with the '
  + 'target audience and always provide multiple creative options.',
);

// ---------------------------------------------------------------------------
// Task prompt templates
// ---------------------------------------------------------------------------
const researchTaskTpl = new UserPromptTemplate(
  'Conduct thorough research about the customer and their competitors '
  + 'in the context of {{customer_domain}}.\n\n'
  + 'We are working on this project: {{project_description}}\n\n'
  + 'Find and analyse:\n'
  + '- What the company does, their products/services\n'
  + '- Target audience demographics and preferences\n'
  + '- Top 3 competitors and their market positioning\n'
  + '- Current industry trends and opportunities\n\n'
  + 'Use the search and website analysis tools to gather real data. '
  + 'Make sure your findings are current and well-sourced.',
);

const understandingTaskTpl = new UserPromptTemplate(
  'Review the research findings and develop a deep understanding of '
  + 'the project and target audience for {{project_description}}.\n\n'
  + 'Synthesise the research into:\n'
  + '- A clear project summary with goals\n'
  + '- Detailed target audience profile (demographics, pain points, '
  + '  motivations, preferred channels)\n'
  + '- Key insights that should shape the marketing strategy',
);

const strategyTaskTpl = new UserPromptTemplate(
  'Formulate a comprehensive marketing strategy for '
  + '{{customer_domain}} based on all research and audience insights.\n\n'
  + 'Project: {{project_description}}\n\n'
  + 'Your strategy must include:\n'
  + '- A memorable strategy name\n'
  + '- At least 3 specific, actionable tactics\n'
  + '- Recommended marketing channels (e.g. LinkedIn, Twitter, '
  + '  content marketing, webinars, email)\n'
  + '- Measurable KPIs for each tactic\n\n'
  + 'Think step-by-step about what will have the highest impact '
  + 'for the target audience identified in previous research.\n\n'
  + 'Return your response as valid JSON with keys: name, tactics (array), channels (array), kpis (array).',
);

const campaignTaskTpl = new UserPromptTemplate(
  'Develop a creative marketing campaign idea for '
  + '{{project_description}}.\n\n'
  + 'The campaign should:\n'
  + '- Be innovative and attention-grabbing\n'
  + '- Align with the marketing strategy\n'
  + '- Speak directly to the target audience\n'
  + '- Be feasible to execute on the recommended channels\n\n'
  + 'Provide a campaign name, description, target audience, '
  + 'and primary channel.\n\n'
  + 'Return your response as valid JSON with keys: name, description, audience, channel.',
);

const copyTaskTpl = new UserPromptTemplate(
  'Write compelling marketing copy for the campaign.\n\n'
  + 'The copy must:\n'
  + '- Have a powerful, attention-grabbing headline\n'
  + '- Include persuasive body text that drives action\n'
  + '- Align with both the marketing strategy and campaign idea\n'
  + "- Speak to the identified target audience's pain points\n"
  + '- Include a clear call-to-action\n\n'
  + 'Return your response as valid JSON with keys: title, body.',
);

// ---------------------------------------------------------------------------
// Mock tool results
// ---------------------------------------------------------------------------
const MOCK_WEB_SEARCH_RESULT = (query: string) =>
  `Web search results for '${query}':\n`
  + '- CrewAI is an open-source multi-agent orchestration framework.\n'
  + '- Competitors include AutoGen, LangGraph, and Camel.\n'
  + '- Enterprise adoption of AI agent frameworks grew 340% in 2024.\n'
  + '- Target audience is primarily engineering leadership at mid-to-large companies.';

const MOCK_ANALYZE_WEBSITE_RESULT = (url: string) =>
  `Website analysis for '${url}':\n`
  + '- CrewAI provides a platform for building collaborative AI agents.\n'
  + '- Key features: role-based agents, task delegation, tool integration.\n'
  + '- Value propositions: ease of use, production-readiness, orchestration.\n'
  + '- Target audience signals: developers, engineering managers, CTOs.';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: `${workflowPrefix}Marketing Strategy Demo`,
    tags: ['demo', 'marketing-strategy'],
    instrumentations: ['openai'],
    debug: true,
  });

  // Lazy imports after init for instrumentation
  const { AzureOpenAI } = await import('openai');
  const { GoogleGenAI } = await import('@google/genai');

  // ---------------------------------------------------------------------------
  // LLM clients — created lazily after init()
  // ---------------------------------------------------------------------------
  function createAzureClient(): InstanceType<typeof AzureOpenAI> {
    return new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
    });
  }

  function getDeployment(): string {
    return process.env.AZURE_LLM_DEPLOYMENT
      ?? process.env.AZURE_OPENAI_DEPLOYMENT_NAME
      ?? 'gpt-5-nano';
  }

  let _geminiClient: InstanceType<typeof GoogleGenAI> | null = null;
  function getGeminiClient(): InstanceType<typeof GoogleGenAI> {
    if (!_geminiClient) {
      _geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? '' });
    }
    return _geminiClient;
  }

  // ---------------------------------------------------------------------------
  // Tool implementations
  // ---------------------------------------------------------------------------

  const searchWeb = span(
    { kind: 'TOOL', name: 'Web Search Google', toolName: 'Web Search Google' },
    async (query: string): Promise<string> => {
      if (MOCK_MODE) return MOCK_WEB_SEARCH_RESULT(query);
      try {
        const client = getGeminiClient();
        const response = await client.models.generateContent({
          model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
          contents: `Search and provide a detailed factual summary for: ${query}`,
          config: { temperature: 0.2 },
        });
        return response.text ?? 'No results found.';
      } catch (e) {
        console.warn(`[Web Search] Falling back to mock: ${e}`);
        return MOCK_WEB_SEARCH_RESULT(query);
      }
    },
  );

  const analyzeWebsite = span(
    { kind: 'TOOL', name: 'Analyze Website Content', toolName: 'Analyze Website Content' },
    async (url: string): Promise<string> => {
      if (MOCK_MODE) return MOCK_ANALYZE_WEBSITE_RESULT(url);
      try {
        const client = getGeminiClient();
        const response = await client.models.generateContent({
          model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
          contents:
            `Visit and analyze this website: ${url}\n\n`
            + 'Provide a detailed summary covering:\n'
            + '1. What the company/product does\n'
            + '2. Their main value propositions\n'
            + '3. Target audience signals\n'
            + '4. Key messaging and tone\n'
            + '5. Notable features or differentiators',
          config: { temperature: 0.2 },
        });
        return response.text ?? 'Unable to analyze the website.';
      } catch (e) {
        console.warn(`[Analyze Website] Falling back to mock: ${e}`);
        return MOCK_ANALYZE_WEBSITE_RESULT(url);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Helper: call Azure OpenAI, with deterministic fallback when live providers
  // reject optional credentials/parameters in local verification environments.
  // ---------------------------------------------------------------------------
  async function callAzure(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const fallback = `[MOCK] Response to: ${userPrompt.slice(0, 80)}...`;
    if (MOCK_MODE) return fallback;

    try {
      const client = createAzureClient();
      const response = await client.chat.completions.create({
        model: getDeployment(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[Azure OpenAI] Falling back to mock: ${reason}`);
      return fallback;
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: try to parse JSON from LLM response
  // ---------------------------------------------------------------------------
  function tryParseJson<T>(text: string, fallback: T): T {
    try {
      // Try to find JSON in the response (may be wrapped in markdown)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
    } catch {
      // ignore parse errors
    }
    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Pipeline: Marketing Strategy Workflow
  // ---------------------------------------------------------------------------
  const runMarketingPipeline = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}Marketing Strategy Workflow` },
    async (inputs: typeof DEMO_INPUTS): Promise<AdCopy> => {
      const { customer_domain, project_description } = inputs;

      // ===================================================================
      // AGENT 1: Lead Market Analyst
      // ===================================================================
      const analystResult = await trace(
        { name: 'Lead Market Analyst', kind: 'AGENT' },
        async () => {
          // Task 1: Research
          const researchResult = await trace(
            {
              name: 'research_task',
              kind: 'CHAIN',
              promptTemplate: ANALYST_BACKSTORY,
              userPromptTemplate: researchTaskTpl,
            },
            async () => {
              ANALYST_BACKSTORY.compile();
              const taskPrompt = researchTaskTpl.compile({
                customer_domain,
                project_description,
              }) as string;

              // Use tools to gather information
              const webResults = await searchWeb(`${customer_domain} company overview products`);
              const siteAnalysis = await analyzeWebsite(`https://${customer_domain}`);
              const competitorResults = await searchWeb(`${customer_domain} competitors market analysis`);

              // Synthesize with LLM
              const combinedContext = [
                `Web search results:\n${webResults}`,
                `Website analysis:\n${siteAnalysis}`,
                `Competitor research:\n${competitorResults}`,
              ].join('\n\n');

              return callAzure(
                ANALYST_BACKSTORY.template as string,
                `${taskPrompt}\n\nResearch data collected:\n${combinedContext}`,
              );
            },
          );

          // Task 2: Project understanding
          const understandingResult = await trace(
            {
              name: 'project_understanding_task',
              kind: 'CHAIN',
              promptTemplate: ANALYST_BACKSTORY,
              userPromptTemplate: understandingTaskTpl,
            },
            async () => {
              ANALYST_BACKSTORY.compile();
              const taskPrompt = understandingTaskTpl.compile({
                project_description,
              }) as string;

              return callAzure(
                ANALYST_BACKSTORY.template as string,
                `${taskPrompt}\n\nPrevious research:\n${researchResult}`,
              );
            },
          );

          return { research: researchResult, understanding: understandingResult };
        },
      );

      // ===================================================================
      // AGENT 2: Chief Marketing Strategist
      // ===================================================================
      const strategyResult = await trace(
        { name: 'Chief Marketing Strategist', kind: 'AGENT' },
        async () => {
          // Task 3: Marketing strategy
          const strategyRaw = await trace(
            {
              name: 'marketing_strategy_task',
              kind: 'CHAIN',
              promptTemplate: STRATEGIST_BACKSTORY,
              userPromptTemplate: strategyTaskTpl,
            },
            async () => {
              STRATEGIST_BACKSTORY.compile();
              const taskPrompt = strategyTaskTpl.compile({
                customer_domain,
                project_description,
              }) as string;

              return callAzure(
                STRATEGIST_BACKSTORY.template as string,
                `${taskPrompt}\n\nResearch context:\n${analystResult.research}\n\nAudience insights:\n${analystResult.understanding}`,
              );
            },
          );

          return tryParseJson<MarketStrategy>(strategyRaw, {
            name: 'AI Crew Revolution',
            tactics: ['Developer advocacy', 'Enterprise webinars', 'Case study campaign'],
            channels: ['LinkedIn', 'Twitter', 'Content marketing', 'Email'],
            kpis: ['Lead generation +50%', 'Developer signups +100%', 'Enterprise demos +30%'],
          });
        },
      );

      // ===================================================================
      // AGENT 3: Creative Content Creator
      // ===================================================================
      const adCopy = await trace(
        { name: 'Creative Content Creator', kind: 'AGENT' },
        async () => {
          // Task 4: Campaign idea
          const campaignRaw = await trace(
            {
              name: 'campaign_idea_task',
              kind: 'CHAIN',
              promptTemplate: CREATOR_BACKSTORY,
              userPromptTemplate: campaignTaskTpl,
            },
            async () => {
              CREATOR_BACKSTORY.compile();
              const taskPrompt = campaignTaskTpl.compile({
                project_description,
              }) as string;

              return callAzure(
                CREATOR_BACKSTORY.template as string,
                `${taskPrompt}\n\nMarketing strategy:\n${JSON.stringify(strategyResult, null, 2)}`,
              );
            },
          );

          const campaign = tryParseJson<CampaignIdea>(campaignRaw, {
            name: 'AI Crews in Action',
            description: 'Showcase real-world multi-agent workflows solving enterprise problems.',
            audience: 'CTOs and VP Engineering at mid-to-large companies',
            channel: 'LinkedIn',
          });

          // Task 5: Copy creation
          const copyRaw = await trace(
            {
              name: 'copy_creation_task',
              kind: 'CHAIN',
              promptTemplate: CREATOR_BACKSTORY,
              userPromptTemplate: copyTaskTpl,
            },
            async () => {
              CREATOR_BACKSTORY.compile();
              const taskPrompt = copyTaskTpl.compile() as string;

              return callAzure(
                CREATOR_BACKSTORY.template as string,
                `${taskPrompt}\n\nMarketing strategy:\n${JSON.stringify(strategyResult, null, 2)}\n\nCampaign idea:\n${JSON.stringify(campaign, null, 2)}`,
              );
            },
          );

          return tryParseJson<AdCopy>(copyRaw, MOCK_RESULT);
        },
      );

      return adCopy;
    },
  );

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log('  MARKETING STRATEGY DEMO  --  Neatlogs + TypeScript Pipeline');
  if (MOCK_MODE) {
    console.log('  MODE: MOCK (deterministic, no API calls)');
  }
  console.log('='.repeat(70));
  console.log(`  Company : ${DEMO_INPUTS.customer_domain}`);
  console.log(`  Project : ${DEMO_INPUTS.project_description.slice(0, 80)}...`);
  console.log('='.repeat(70) + '\n');

  try {
    let result: AdCopy;
    if (MOCK_MODE) {
      // Even in mock mode, run the full pipeline to generate spans
      result = await runMarketingPipeline(DEMO_INPUTS);
    } else {
      result = await runMarketingPipeline(DEMO_INPUTS);
    }

    console.log('\n' + '='.repeat(70));
    console.log('  FINAL RESULT');
    console.log('='.repeat(70));
    console.log(`title='${result.title}'`);
    console.log(`body="${result.body}"`);
  } finally {
    await flush();
    await shutdown();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
