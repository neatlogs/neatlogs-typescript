/**
 * GobbleCube Multi-Agent E-Commerce Copilot — TypeScript port
 * Original Python: examples/sdk_examples/gobblecube/
 *
 * GobbsGPT: AI CXO copilot for quick-commerce brands.
 * Routes queries to specialized sub-agents (Analytics, Ads, Inventory, Market Intel),
 * then synthesizes a CXO-grade response.
 *
 * This TypeScript port replaces LangGraph with pure TypeScript orchestration.
 * All span types: WORKFLOW, AGENT, CHAIN, TOOL, LLM.
 *
 * Usage:
 *   npx tsx --env-file=.env examples/gobblecube/main.ts
 *   npx tsx --env-file=.env examples/gobblecube/main.ts --scenario 1
 *   npx tsx --env-file=.env examples/gobblecube/main.ts --query "Your custom query"
 *
 * Required env vars:
 *   NEATLOGS_API_KEY, NEATLOGS_ENDPOINT
 *   AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
 *   AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_VERSION
 */

import * as dotenv from "dotenv";
dotenv.config();

import OpenAI, { AzureOpenAI } from "openai";
import * as neatlogs from "../../src/neatlogs";

// ---------------------------------------------------------------------------
// Initialize NeatLogs SDK
// ---------------------------------------------------------------------------

neatlogs.init({
  apiKey: process.env.NEATLOGS_API_KEY,
  endpoint: process.env.NEATLOGS_ENDPOINT || "https://staging-cloud.neatlogs.com",
  workflowName: "gobbsgpt-ecommerce-copilot",
  tags: ["gobblecube", "ecommerce", "multi-agent", "typescript"],
  debug: true,
});

// ---------------------------------------------------------------------------
// Azure OpenAI client
// ---------------------------------------------------------------------------

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview",
});

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;
const BRAND = "GobbleCube Nutrition";
const CATEGORY = "Health Snacks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubAgentResult {
  [key: string]: unknown;
}

interface QueryResult {
  delegatedTo: string;
  subAgentResult: SubAgentResult;
  finalResponse: string;
  followUpSuggestions: string[];
}

type QueryClassification = "ANALYTICS" | "ADS" | "INVENTORY" | "MARKET_INTEL";

// ---------------------------------------------------------------------------
// Simulated data for tools
// ---------------------------------------------------------------------------

const SIMULATED_ANALYTICS = {
  total_revenue: 2_450_000,
  revenue_change_pct: -12.3,
  period: "last_week",
  top_declining_cities: ["Mumbai", "Delhi", "Bangalore"],
  top_declining_skus: ["SKU-1234", "SKU-5678"],
};

const SIMULATED_CAMPAIGNS = {
  active_campaigns: 12,
  total_spend_today: 45_000,
  avg_roas: 3.2,
  top_keywords: [
    { keyword: "protein bar", spend: 8_000, roas: 4.1, rank: 2 },
    { keyword: "healthy snacks", spend: 6_000, roas: 2.8, rank: 5 },
    { keyword: "keto bar", spend: 2_000, roas: 5.2, rank: 1 },
  ],
};

const SIMULATED_INVENTORY = {
  overall_availability: 78.5,
  oos_dark_stores: 42,
  critical_skus_oos: ["SKU-1234", "SKU-9012"],
  cities_below_threshold: ["Pune", "Hyderabad"],
  sku_details: [
    { sku: "SKU-001", name: "Protein Bar 60g", availability_pct: 85 },
    { sku: "SKU-002", name: "Oat Granola 200g", availability_pct: 42 },
    { sku: "SKU-003", name: "Keto Bar 50g", availability_pct: 95 },
  ],
};

const SIMULATED_MARKET = {
  brand_sov: 23.5,
  competitor_sov: { "Competitor A": 28.5, "Competitor B": 22.1 },
  emerging_keywords: ["keto bar", "plant protein", "sugar free snack"],
  fastest_growing_subcategories: ["keto snacks", "plant-based protein", "low-sugar bars"],
  market_size_growth_pct: 18.5,
};

// ---------------------------------------------------------------------------
// Classifier agent
// ---------------------------------------------------------------------------

const classifyQuery = neatlogs.spanWrap(
  { kind: "AGENT", name: "gobbs_gpt_classifier", role: "GobbsGPT Router", goal: "Classify query and route to correct sub-agent" },
  async (userQuery: string): Promise<QueryClassification> => {
    const classifierTpl = new neatlogs.PromptTemplate([{
      role: "system",
      content:
        "You are GobbsGPT, an AI CXO copilot for e-commerce and quick-commerce brands.\n" +
        "Classify the user query into EXACTLY one category:\n\n" +
        "  ANALYTICS    — revenue, sales, SOV, pricing analysis, 'why did X happen'\n" +
        "  ADS          — ad campaigns, ROAS, bidding, marketing spend, optimisation\n" +
        "  INVENTORY    — stock levels, availability, stockouts, purchase orders, supply chain\n" +
        "  MARKET_INTEL — market trends, competition, new opportunities, white space, NPD\n\n" +
        "Query: {{user_query}}\n\n" +
        "Return ONLY the category name: ANALYTICS, ADS, INVENTORY, or MARKET_INTEL.",
    }]);

    let classification: string = "ANALYTICS";
    await neatlogs.withTrace({ name: "gobbs_router_prompt", kind: "LLM", promptTemplate: classifierTpl }, async () => {
      const prompt = classifierTpl.compile({ user_query: userQuery })[0].content;
      const response = await client.chat.completions.create({
        model: DEPLOYMENT,
        messages: [{ role: "user", content: prompt }],
      });
      classification = (response.choices[0].message.content ?? "ANALYTICS").trim().toUpperCase().split(/\s+/)[0];
      return classification;
    });

    const valid: QueryClassification[] = ["ANALYTICS", "ADS", "INVENTORY", "MARKET_INTEL"];
    if (!valid.includes(classification as QueryClassification)) {
      classification = "ANALYTICS";
    }

    console.log(`\n  GobbsGPT classified query -> ${classification}`);
    return classification as QueryClassification;
  }
);

// ---------------------------------------------------------------------------
// Analytics sub-agent (WORKFLOW → AGENT → CHAIN → TOOL)
// ---------------------------------------------------------------------------

const analyticsDataFetch = neatlogs.spanWrap(
  { kind: "TOOL", name: "antman_analytics_engine", toolName: "antman_analytics_engine" },
  async (intent: string, _sql: string): Promise<SubAgentResult> => {
    // Simulated Antman query engine response
    neatlogs.log("antman engine executed query for intent: {intent}", { intent });
    return SIMULATED_ANALYTICS;
  }
);

const analyticsAgent = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "run_analytics_agent" },
  async (userQuery: string): Promise<SubAgentResult> => {
    console.log("  Delegating to Gobbs Edge (Analytics)...");

    // Intent recognition (AGENT)
    let intent = "revenue_analysis";
    let sql = "";
    await neatlogs.withTrace({ name: "analytics_intent_sql", kind: "CHAIN" }, async () => {
      const intentTpl = new neatlogs.PromptTemplate([{
        role: "system",
        content:
          "Classify analytics query intent. Return JSON with 'intent' and 'sql' fields.\n" +
          "Intent options: revenue_analysis, share_of_search, pricing_analysis, availability_check\n" +
          "Query: {{user_query}}\n\nReturn ONLY valid JSON.",
      }]);
      await neatlogs.withTrace({ name: "analytics_intent_prompt", kind: "LLM", promptTemplate: intentTpl }, async () => {
        const prompt = intentTpl.compile({ user_query: userQuery })[0].content;
        const response = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: [{ role: "user", content: prompt }],
        });
        try {
          const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { intent?: string; sql?: string };
          intent = parsed.intent ?? "revenue_analysis";
          sql = parsed.sql ?? `SELECT * FROM orders WHERE brand = '${BRAND}'`;
        } catch {
          sql = `SELECT * FROM orders WHERE brand = '${BRAND}'`;
        }
        return response.choices[0].message.content ?? "";
      });
    });

    // Execute query via tool
    const queryResults = await analyticsDataFetch(intent, sql);

    // Root cause analysis if anomaly detected
    let rootCause = null;
    if ((queryResults.revenue_change_pct as number) < -5) {
      const rootCauseTpl = new neatlogs.PromptTemplate([{
        role: "system",
        content:
          "You are a root-cause analysis engine. Use decision-tree frameworks.\n" +
          "Query: {{user_query}}\nData: {{data}}\n\nReturn JSON with: framework, root_cause, confidence.",
      }]);
      await neatlogs.withTrace({ name: "analytics_root_cause_prompt", kind: "LLM", promptTemplate: rootCauseTpl }, async () => {
        const prompt = rootCauseTpl.compile({ user_query: userQuery, data: JSON.stringify(queryResults) })[0].content;
        const response = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: [{ role: "user", content: prompt }],
        });
        rootCause = response.choices[0].message.content;
        return rootCause;
      });
    }

    return { ...queryResults, root_cause: rootCause, intent, sql };
  }
);

// ---------------------------------------------------------------------------
// Ads sub-agent
// ---------------------------------------------------------------------------

const adsCampaignFetch = neatlogs.spanWrap(
  { kind: "TOOL", name: "digital_shelf_data_api", toolName: "digital_shelf_data_api" },
  async (): Promise<SubAgentResult> => {
    neatlogs.log("fetched campaign performance data from digital shelf API", {});
    return SIMULATED_CAMPAIGNS;
  }
);

const adsAgent = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "run_ad_automation_agent" },
  async (userQuery: string): Promise<SubAgentResult> => {
    console.log("  Delegating to Gobbs Boost (Ad Automation)...");
    const campaignData = await adsCampaignFetch();

    const bidTpl = new neatlogs.PromptTemplate([{
      role: "system",
      content:
        "You are Gobbs Boost, an AI ad optimization engine.\n" +
        "Analyze campaign performance and provide bid/budget recommendations.\n" +
        "Brand: {{brand}}, Query: {{query}}\nCurrent Performance: {{data}}\n\n" +
        "Return JSON with: bid_recommendations (array), budget_allocation (object), execution_plan (string).",
    }]);

    let recommendations: SubAgentResult = {};
    await neatlogs.withTrace({ name: "gobbs_boost_prompt", kind: "LLM", promptTemplate: bidTpl }, async () => {
      const prompt = bidTpl.compile({ brand: BRAND, query: userQuery, data: JSON.stringify(campaignData) })[0].content;
      const response = await client.chat.completions.create({
        model: DEPLOYMENT,
        messages: [{ role: "user", content: prompt }],
      });
      try {
        recommendations = JSON.parse(response.choices[0].message.content ?? "{}") as SubAgentResult;
      } catch {
        recommendations = { execution_plan: response.choices[0].message.content };
      }
      return response.choices[0].message.content ?? "";
    });

    return { ...recommendations, current_performance: campaignData };
  }
);

// ---------------------------------------------------------------------------
// Inventory sub-agent
// ---------------------------------------------------------------------------

const inventoryFetch = neatlogs.spanWrap(
  { kind: "TOOL", name: "inventory_management_api", toolName: "inventory_management_api" },
  async (): Promise<SubAgentResult> => {
    neatlogs.log("fetched inventory snapshot from warehouse management system", {});
    return SIMULATED_INVENTORY;
  }
);

const inventoryAgent = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "run_inventory_agent" },
  async (userQuery: string): Promise<SubAgentResult> => {
    console.log("  Delegating to Gobbs Flow (Inventory)...");
    const inventoryData = await inventoryFetch();

    const inventoryTpl = new neatlogs.PromptTemplate([{
      role: "system",
      content:
        "You are Gobbs Flow, an inventory optimization AI.\n" +
        "Analyze inventory data and provide reorder recommendations.\n" +
        "Brand: {{brand}}, Query: {{query}}\nInventory Snapshot: {{data}}\n\n" +
        "Return JSON with: stockout_alerts (array), po_recommendations (array), forecast (string).",
    }]);

    let analysis: SubAgentResult = {};
    await neatlogs.withTrace({ name: "gobbs_flow_prompt", kind: "LLM", promptTemplate: inventoryTpl }, async () => {
      const prompt = inventoryTpl.compile({ brand: BRAND, query: userQuery, data: JSON.stringify(inventoryData) })[0].content;
      const response = await client.chat.completions.create({
        model: DEPLOYMENT,
        messages: [{ role: "user", content: prompt }],
      });
      try {
        analysis = JSON.parse(response.choices[0].message.content ?? "{}") as SubAgentResult;
      } catch {
        analysis = { forecast: response.choices[0].message.content };
      }
      return response.choices[0].message.content ?? "";
    });

    return { ...analysis, inventory_snapshot: inventoryData };
  }
);

// ---------------------------------------------------------------------------
// Market Intel sub-agent
// ---------------------------------------------------------------------------

const marketFetch = neatlogs.spanWrap(
  { kind: "TOOL", name: "market_intelligence_api", toolName: "market_intelligence_api" },
  async (): Promise<SubAgentResult> => {
    neatlogs.log("fetched market intelligence data", {});
    return SIMULATED_MARKET;
  }
);

const marketIntelAgent = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "run_market_intel_agent" },
  async (userQuery: string): Promise<SubAgentResult> => {
    console.log("  Delegating to Gobbs Discover (Market Intelligence)...");
    const marketData = await marketFetch();

    const marketTpl = new neatlogs.PromptTemplate([{
      role: "system",
      content:
        "You are Gobbs Discover, a market intelligence AI.\n" +
        "Analyze market data and identify opportunities.\n" +
        "Brand: {{brand}}, Category: {{category}}, Query: {{query}}\nMarket Data: {{data}}\n\n" +
        "Return JSON with: trends (array), opportunities (array), strategic_recommendations (string).",
    }]);

    let insights: SubAgentResult = {};
    await neatlogs.withTrace({ name: "gobbs_discover_prompt", kind: "LLM", promptTemplate: marketTpl }, async () => {
      const prompt = marketTpl.compile({ brand: BRAND, category: CATEGORY, query: userQuery, data: JSON.stringify(marketData) })[0].content;
      const response = await client.chat.completions.create({
        model: DEPLOYMENT,
        messages: [{ role: "user", content: prompt }],
      });
      try {
        insights = JSON.parse(response.choices[0].message.content ?? "{}") as SubAgentResult;
      } catch {
        insights = { strategic_recommendations: response.choices[0].message.content };
      }
      return response.choices[0].message.content ?? "";
    });

    return { ...insights, market_data: marketData };
  }
);

// ---------------------------------------------------------------------------
// Synthesizer agent
// ---------------------------------------------------------------------------

const synthesizeResponse = neatlogs.spanWrap(
  { kind: "AGENT", name: "gobbs_gpt_synthesiser", role: "GobbsGPT CXO Advisor", goal: "Synthesise sub-agent findings into executive brief" },
  async (userQuery: string, analysisSource: string, subAgentResult: SubAgentResult): Promise<{ finalResponse: string; followUpSuggestions: string[] }> => {
    const synthTpl = new neatlogs.PromptTemplate([{
      role: "system",
      content:
        "You are GobbsGPT, an AI CXO copilot for a quick-commerce brand.\n" +
        "Synthesise the analysis below into a clear, executive-level response.\n\n" +
        "Original question:   {{user_query}}\n" +
        "Analysis source:     {{analysis_source}}\n" +
        "Analysis results:    {{analysis_results}}\n\n" +
        "Structure your response as:\n" +
        "  1. **TL;DR** — one-sentence answer\n" +
        "  2. **Key Insights** — 3-5 bullet points with specific numbers\n" +
        "  3. **Recommended Actions** — prioritised list (label P0/P1/P2)\n" +
        "  4. **Follow-up Questions** — 3 questions the CXO should ask next\n\n" +
        "Be specific, reference actual numbers from the data.",
    }]);

    let finalResponse = "";
    await neatlogs.withTrace({ name: "gobbs_synth_prompt", kind: "LLM", promptTemplate: synthTpl }, async () => {
      const prompt = synthTpl.compile({
        user_query: userQuery,
        analysis_source: analysisSource,
        analysis_results: JSON.stringify(subAgentResult, null, 2),
      })[0].content;
      const response = await client.chat.completions.create({
        model: DEPLOYMENT,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        stream_options: { include_usage: true },
      });
      const chunks: string[] = [];
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) chunks.push(delta);
      }
      finalResponse = chunks.join("");
      return finalResponse;
    });

    return {
      finalResponse,
      followUpSuggestions: [
        "What is the city-level breakdown of this impact?",
        "How does this compare to the same period last month?",
        "What budget or resource reallocation would you recommend?",
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// GobbsGPT top-level query runner
// ---------------------------------------------------------------------------

async function runQuery(userQuery: string, sessionId: string, useCase = "general"): Promise<QueryResult> {
  return neatlogs.spanWrap(
    { kind: "WORKFLOW", name: "gobbs_gpt_query", tags: [useCase, sessionId] },
    async (): Promise<QueryResult> => {
      // Step 1: Classify
      const classification = await classifyQuery(userQuery);

      // Step 2: Route to sub-agent
      let subAgentResult: SubAgentResult = {};
      let delegatedTo = "";

      switch (classification) {
        case "ANALYTICS":
          subAgentResult = await analyticsAgent(userQuery);
          delegatedTo = "Gobbs Edge (Analytics)";
          break;
        case "ADS":
          subAgentResult = await adsAgent(userQuery);
          delegatedTo = "Gobbs Boost (Ads)";
          break;
        case "INVENTORY":
          subAgentResult = await inventoryAgent(userQuery);
          delegatedTo = "Gobbs Flow (Inventory)";
          break;
        case "MARKET_INTEL":
          subAgentResult = await marketIntelAgent(userQuery);
          delegatedTo = "Gobbs Discover (Market Intel)";
          break;
      }

      // Step 3: Synthesize
      const { finalResponse, followUpSuggestions } = await synthesizeResponse(userQuery, delegatedTo, subAgentResult);

      return { delegatedTo, subAgentResult, finalResponse, followUpSuggestions };
    }
  )();
}

// ---------------------------------------------------------------------------
// Demo scenarios (mirrors Python original)
// ---------------------------------------------------------------------------

const DEMO_QUERIES = [
  {
    scenarioId: 1,
    title: "Revenue Diagnostic",
    query: "Why did our revenue drop 15% in Mumbai last week?",
    expectedAgent: "Gobbs Edge (Analytics)",
    useCase: "revenue_diagnostic",
    sessionId: "demo-revenue-diagnostic",
  },
  {
    scenarioId: 2,
    title: "Ad Campaign Optimisation",
    query: "Our ROAS on Blinkit dropped below 2. What should we change in our ad campaigns?",
    expectedAgent: "Gobbs Boost (Ads)",
    useCase: "ad_optimisation",
    sessionId: "demo-ad-optimisation",
  },
  {
    scenarioId: 3,
    title: "Stockout Emergency",
    query: "Which SKUs are at risk of stocking out in the next 48 hours, and what should we order?",
    expectedAgent: "Gobbs Flow (Inventory)",
    useCase: "stockout_emergency",
    sessionId: "demo-stockout-emergency",
  },
  {
    scenarioId: 4,
    title: "Market Opportunity Discovery",
    query: "What are the fastest growing subcategories in health snacks that we should enter?",
    expectedAgent: "Gobbs Discover (Market Intel)",
    useCase: "market_opportunity",
    sessionId: "demo-market-opportunity",
  },
];

function printResult(title: string, query: string, result: QueryResult): void {
  const width = 70;
  console.log(`\n${"=".repeat(width)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(width));
  console.log(`  Query:       ${query}`);
  console.log(`  Routed to:   ${result.delegatedTo}`);
  console.log(`\n${"-".repeat(width)}`);
  console.log("  GobbsGPT Response:\n");
  for (const line of result.finalResponse.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log(`\n${"-".repeat(width)}`);
  if (result.followUpSuggestions.length > 0) {
    console.log("  Suggested follow-ups:");
    for (const fu of result.followUpSuggestions) {
      console.log(`     * ${fu}`);
    }
  }
  console.log("=".repeat(width));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let scenarioId: number | null = null;
  let customQuery: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--scenario" || args[i] === "-s") && args[i + 1]) {
      scenarioId = parseInt(args[i + 1], 10);
    } else if ((args[i] === "--query" || args[i] === "-q") && args[i + 1]) {
      customQuery = args[i + 1];
    }
  }

  console.log("\nGobbleCube AI Agent — Powered by Azure OpenAI");
  console.log("  Observability: NeatLogs SDK\n");

  try {
    if (customQuery) {
      const result = await runQuery(customQuery, "custom-query", "custom");
      printResult("Custom Query", customQuery, result);
    } else if (scenarioId !== null) {
      const scenario = DEMO_QUERIES.find((q) => q.scenarioId === scenarioId);
      if (!scenario) {
        console.error(`Unknown scenario ${scenarioId}. Valid: 1, 2, 3, 4`);
        process.exitCode = 1;
        return;
      }
      const result = await runQuery(scenario.query, scenario.sessionId, scenario.useCase);
      printResult(scenario.title, scenario.query, result);
    } else {
      // Run first scenario by default (avoids running all 4 in one go for testing)
      const scenario = DEMO_QUERIES[0];
      console.log(`Running demo scenario 1: ${scenario.title}...`);
      const result = await runQuery(scenario.query, scenario.sessionId, scenario.useCase);
      printResult(scenario.title, scenario.query, result);
      console.log("\n(Tip: use --scenario 1|2|3|4 or --query '...' for specific scenarios)");
    }
  } catch (err) {
    console.error("Workflow failed:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[neatlogs] Flushing spans...");
    await neatlogs.flush();
    await new Promise((r) => setTimeout(r, 500));
    await neatlogs.flush();
    await neatlogs.shutdown();
    console.log("[neatlogs] Done.");
  }
}

main();
