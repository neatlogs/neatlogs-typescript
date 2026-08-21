/**
 * Complex Mastra workflow example: Customer Health Pipeline
 *
 * Demonstrates:
 *   - Mastra Agent (with createTool, agent.generate())
 *   - Mastra createTool wrapping MCP tool calls
 *   - MCP Server (separate file, in-process via InMemoryTransport)
 *   - Parallel steps (sentiment + risk run concurrently)
 *   - Branching (intervention vs. expansion based on health)
 *   - Foreach (iterate over multiple accounts)
 *   - LangGraph sub-graph (risk assessment inside a Mastra step)
 *   - Google GenAI for sentiment analysis + summarization
 *   - Azure OpenAI for LangGraph nodes + Mastra Agent
 *   - OpenAI for embeddings
 *   - Knowledge base with EMBEDDING, RETRIEVER, RERANKER spans
 *   - neatlogs trace() + log() for observability
 *
 * Span kinds: WORKFLOW, AGENT, TOOL, RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Usage:
 *     npx tsx examples/sdk_examples/mastra_complex/main.ts
 *
 * Required env vars:
 *     GOOGLE_API_KEY (or GEMINI_API_KEY)
 *     OPENAI_API_KEY (for embeddings)
 *     AZURE_OPENAI_API_KEY
 *     AZURE_OPENAI_ENDPOINT (e.g. https://myinstance.openai.azure.com/)
 *     AZURE_OPENAI_DEPLOYMENT (e.g. gpt-4o-mini)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'mastra_complex_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'mastra_complex_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'mastra_complex_logs.log';

import { init, trace, log, span, flush, shutdown, getMastraObservability } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'mastra-customer-health',
    tags: ['mastra', 'workflow', 'complex', 'mcp', 'langgraph'],
    instrumentations: ['mastra', 'google_genai', 'openai', 'langchain', 'mcp'],
    captureLogs: true,
    disableExport: false,
    debug: true,
  });

  const { Mastra } = await import('@mastra/core');
  const { Agent } = await import('@mastra/core/agent');
  const { createTool } = await import('@mastra/core/tools');
  const { createStep, createWorkflow } = await import('@mastra/core/workflows');
  const { z } = await import('zod');
  const { GoogleGenAI } = await import('@google/genai');
  const OpenAI = (await import('openai')).default;
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { AzureChatOpenAI } = await import('@langchain/openai');
  const { StateGraph, START, END, Annotation } = await import('@langchain/langgraph');
  const { createAzure } = await import('@ai-sdk/azure');
  const { createCrmMcpServer, TOOL_NAMES } = await import('./mcp-server.js');

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  const geminiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
  if (!geminiKey) throw new Error('Set GOOGLE_API_KEY or GEMINI_API_KEY');
  if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY');
  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error('Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
  }

  const genai = new GoogleGenAI({ apiKey: geminiKey });
  const openaiClient = new OpenAI(); // for embeddings
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';

  const langchainLlm = new AzureChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_ENDPOINT!.replace(/^https?:\/\//, '').replace(/\.openai\.azure\.com\/?$/, ''),
    azureOpenAIApiDeploymentName: azureDeployment,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview',
  });

  // ---------------------------------------------------------------------------
  // MCP: Connect in-process CRM server
  // ---------------------------------------------------------------------------

  const mcpServer = createCrmMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: 'health-pipeline', version: '1.0.0' });
  await mcpServer.connect(serverTransport);
  await mcpClient.connect(clientTransport);
  log('MCP connected: {tools}', { tools: TOOL_NAMES.join(', ') });

  const callMcpTool = (name: string, args: Record<string, unknown>) =>
    span({ kind: 'MCP_TOOL', name: `mcp_tool:${name}`, toolName: name }, async (toolArgs: Record<string, unknown>) => {
      const result = await mcpClient.callTool({ name, arguments: toolArgs });
      const text = (result.content as any[])?.[0]?.text ?? '{}';
      return JSON.parse(text);
    })(args);

  // ---------------------------------------------------------------------------
  // Mastra Tools: native wrappers around MCP calls (for Agent tool-use)
  // ---------------------------------------------------------------------------

  const getTicketsTool = createTool({
    id: 'get-tickets',
    description: 'Fetch support tickets for an account from the CRM',
    inputSchema: z.object({ account_id: z.string() }),
    outputSchema: z.object({ tickets: z.array(z.object({ id: z.string(), subject: z.string(), priority: z.string(), status: z.string() })) }),
    execute: async ({ context: _ctx, ...input }: any) => {
      const tickets = await callMcpTool('get_tickets', { account_id: input.account_id });
      return { tickets };
    },
  });

  const getUsageTool = createTool({
    id: 'get-usage-metrics',
    description: 'Fetch product usage metrics for an account',
    inputSchema: z.object({ account_id: z.string() }),
    outputSchema: z.object({ dau: z.number(), mau: z.number(), apiCalls: z.number(), featuresUsed: z.number(), totalFeatures: z.number(), lastActive: z.string() }),
    execute: async ({ context: _ctx, ...input }: any) => {
      return await callMcpTool('get_usage_metrics', { account_id: input.account_id });
    },
  });

  const getCrmTool = createTool({
    id: 'get-crm-data',
    description: 'Fetch CRM data (NPS, contract, CSM) for an account',
    inputSchema: z.object({ account_id: z.string() }),
    outputSchema: z.object({ nps: z.number(), contractEnd: z.string(), tier: z.string(), csm: z.string(), lastQbr: z.string(), mrr: z.number() }),
    execute: async ({ context: _ctx, ...input }: any) => {
      return await callMcpTool('get_crm_data', { account_id: input.account_id });
    },
  });

  const createAlertTool = createTool({
    id: 'create-alert',
    description: 'Create an alert/escalation for an at-risk account',
    inputSchema: z.object({ account_id: z.string(), severity: z.enum(['info', 'warning', 'critical']), message: z.string() }),
    outputSchema: z.object({ alertId: z.string(), account_id: z.string(), severity: z.string(), message: z.string(), created: z.string() }),
    execute: async ({ context: _ctx, ...input }: any) => {
      return await callMcpTool('create_alert', input);
    },
  });

  // ---------------------------------------------------------------------------
  // Mastra Agent: Action Planner (OpenAI + tools)
  // ---------------------------------------------------------------------------

  const actionPlannerAgent = new Agent({
    id: 'action-planner',
    name: 'Action Planner Agent',
    description: 'Plans customer success actions based on health data and playbook context',
    instructions: 'You are a customer success action planner. Given account health data and recommended playbooks, create a concise 3-step action plan. Be specific and actionable. Keep response under 100 words. If instructed to create an alert, use the create-alert tool.',
    model: createAzure({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      resourceName: process.env.AZURE_OPENAI_ENDPOINT!.replace(/^https?:\/\//, '').replace(/\.openai\.azure\.com\/?$/, ''),
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview',
      useDeploymentBasedUrls: true,
    }).chat(azureDeployment) as any,
    tools: { 'create-alert': createAlertTool },
  });

  // ---------------------------------------------------------------------------
  // Knowledge Base: playbook strategies
  // ---------------------------------------------------------------------------

  const PLAYBOOKS = [
    { id: 'pb-001', title: 'High-touch intervention', content: 'Schedule exec sponsor call within 48h. Assign dedicated CSM. Offer professional services credits. Goal: re-engagement within 2 weeks.' },
    { id: 'pb-002', title: 'Feature adoption acceleration', content: 'Identify top 3 unused features matching use case. Create personalized onboarding sequence. Offer live training session.' },
    { id: 'pb-003', title: 'Expansion opportunity', content: 'When health score >80 and usage >90%, propose tier upgrade. Present ROI analysis. Offer pilot of premium features.' },
    { id: 'pb-004', title: 'Churn prevention - billing', content: 'Flag accounts with failed payments or downgrade requests. Offer flexible payment terms. Connect with finance for custom pricing.' },
    { id: 'pb-005', title: 'Product feedback loop', content: 'Collect NPS detractor feedback. Route to PM for feature requests. Schedule follow-up call to close the loop.' },
    { id: 'pb-006', title: 'Automated re-engagement', content: 'Trigger email drip campaign for dormant accounts (7+ days inactive). Include product updates and success stories.' },
    { id: 'pb-007', title: 'Health score recovery', content: 'For scores 40-60: weekly check-ins, usage tips, feature highlights. For scores <40: escalate to manager, prepare save offer.' },
    { id: 'pb-008', title: 'Champion identification', content: 'Track power users within account. Invite to beta programs and advisory board. Use as internal advocates for expansion.' },
  ];

  let playbookEmbeddings: number[][] | null = null;

  function cosine(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-12);
  }

  async function indexPlaybooks(): Promise<void> {
    if (playbookEmbeddings) return;
    await trace({ name: 'index_playbooks', kind: 'EMBEDDING' as any }, async (s) => {
      const texts = PLAYBOOKS.map(p => `${p.title}\n${p.content}`);
      s.setAttribute('neatlogs.embedding.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.embedding.text', JSON.stringify(texts.map(t => t.slice(0, 80))));
      const resp = await openaiClient.embeddings.create({ model: 'text-embedding-3-small', input: texts });
      playbookEmbeddings = resp.data.map(d => d.embedding);
      s.setAttribute('neatlogs.embedding.token_count', resp.usage.total_tokens);
      log('indexed {count} playbooks ({tokens} tokens)', { count: PLAYBOOKS.length, tokens: resp.usage.total_tokens });
    });
  }

  async function retrievePlaybooks(query: string, topK: number = 4): Promise<Array<{ id: string; title: string; content: string; score: number }>> {
    return trace({ name: 'playbook_search', kind: 'RETRIEVER' as any }, async (s) => {
      s.setAttribute('neatlogs.retriever.query', query);
      s.setAttribute('neatlogs.retriever.top_k', topK);
      const qResp = await openaiClient.embeddings.create({ model: 'text-embedding-3-small', input: [query] });
      const qVec = qResp.data[0].embedding;
      const scores = playbookEmbeddings!.map((emb, i) => ({ idx: i, score: cosine(qVec, emb) }));
      scores.sort((a, b) => b.score - a.score);
      const docs = scores.slice(0, topK).map(r => ({ id: PLAYBOOKS[r.idx].id, title: PLAYBOOKS[r.idx].title, content: PLAYBOOKS[r.idx].content, score: Math.round(r.score * 10000) / 10000 }));
      s.setAttribute('neatlogs.retriever.documents', JSON.stringify(docs));
      log('retrieved {count} playbooks for: {query}', { count: docs.length, query });
      return docs;
    });
  }

  async function rerankPlaybooks(query: string, docs: Array<{ id: string; title: string; content: string; score: number }>, topK: number = 2): Promise<typeof docs> {
    return trace({ name: 'playbook_reranker', kind: 'RERANKER' as any }, async (s) => {
      s.setAttribute('neatlogs.reranker.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.reranker.query', query);
      s.setAttribute('neatlogs.reranker.top_k', topK);
      s.setAttribute('neatlogs.reranker.input_documents', JSON.stringify(docs.map(d => ({ id: d.id, content: d.content }))));
      const texts = [query, ...docs.map(d => d.content)];
      const resp = await openaiClient.embeddings.create({ model: 'text-embedding-3-small', input: texts });
      const vectors = resp.data.map(d => d.embedding);
      const qVec = vectors[0];
      const scored = docs.map((doc, i) => ({ doc, score: cosine(qVec, vectors[i + 1]) }));
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, topK);
      s.setAttribute('neatlogs.reranker.output_documents', JSON.stringify(topResults.map(r => ({ id: r.doc.id, content: r.doc.content, score: Math.round(r.score * 10000) / 10000 }))));
      log('reranked {input} playbooks → top {output}', { input: docs.length, output: topResults.length });
      return topResults.map(r => ({ ...r.doc, score: Math.round(r.score * 10000) / 10000 }));
    });
  }

  // ---------------------------------------------------------------------------
  // LangGraph: Risk Assessment sub-graph (OpenAI via LangChain)
  // ---------------------------------------------------------------------------

  const RiskState = Annotation.Root({
    company: Annotation<string>(),
    tickets: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    usage: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    crm: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    riskFactors: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    riskScore: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    riskLevel: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  });

  async function identifyRiskFactors(state: typeof RiskState.State) {
    log('langgraph: identifying risk factors for {company}', { company: state.company });
    const msg = await langchainLlm.invoke([
      { role: 'system', content: 'You are a risk analyst. Identify key risk factors from the data. List 3-5 factors, each on its own line starting with "- ".' },
      { role: 'user', content: `Company: ${state.company}\n\nTickets:\n${state.tickets}\n\nUsage:\n${state.usage}\n\nCRM:\n${state.crm}` },
    ]);
    return { riskFactors: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) };
  }

  async function scoreRisk(state: typeof RiskState.State) {
    log('langgraph: scoring risk for {company}', { company: state.company });
    const msg = await langchainLlm.invoke([
      { role: 'system', content: 'You are a risk scorer. Given risk factors, assign a score 0-100 (0=no risk, 100=critical). Respond with ONLY the number.' },
      { role: 'user', content: `Company: ${state.company}\nRisk factors:\n${state.riskFactors}` },
    ]);
    const text = typeof msg.content === 'string' ? msg.content : '';
    const score = parseInt(text.match(/\d+/)?.[0] ?? '50', 10);
    const riskLevel = score >= 70 ? 'critical' : score >= 45 ? 'elevated' : 'low';
    return { riskScore: score, riskLevel };
  }

  const riskGraph = new StateGraph(RiskState)
    .addNode('identify_risks', identifyRiskFactors)
    .addNode('score_risk', scoreRisk)
    .addEdge(START, 'identify_risks')
    .addEdge('identify_risks', 'score_risk')
    .addEdge('score_risk', END)
    .compile();

  // ---------------------------------------------------------------------------
  // Accounts
  // ---------------------------------------------------------------------------

  const ACCOUNTS = [
    { accountId: 'acct-101', company: 'Nexus Analytics' },
    { accountId: 'acct-202', company: 'Petal Health' },
    { accountId: 'acct-303', company: 'Volt Robotics' },
  ];

  // ---------------------------------------------------------------------------
  // Schemas
  // ---------------------------------------------------------------------------

  const accountSchema = z.object({ accountId: z.string(), company: z.string() });

  const enrichedSchema = z.object({
    accountId: z.string(), company: z.string(),
    tickets: z.string(), usage: z.string(), crm: z.string(),
  });

  const sentimentResultSchema = z.object({
    accountId: z.string(), company: z.string(),
    sentimentScore: z.number(), sentimentSummary: z.string(),
  });

  const riskResultSchema = z.object({
    accountId: z.string(), company: z.string(),
    riskScore: z.number(), riskLevel: z.string(), riskFactors: z.string(),
  });

  const healthSchema = z.object({
    accountId: z.string(), company: z.string(),
    sentimentScore: z.number(), sentimentSummary: z.string(),
    riskScore: z.number(), riskLevel: z.string(), riskFactors: z.string(),
    healthScore: z.number(),
    healthCategory: z.enum(['critical', 'at-risk', 'healthy', 'champion']),
  });

  const actionSchema = z.object({
    accountId: z.string(), company: z.string(),
    healthCategory: z.string(),
    recommendedPlaybooks: z.array(z.string()),
    actionPlan: z.string(),
    alertCreated: z.boolean(),
  });

  // ---------------------------------------------------------------------------
  // Workflow steps
  // ---------------------------------------------------------------------------

  // Step 1: Enrich account via MCP tools
  const enrichAccountStep = createStep({
    id: 'enrich-account',
    inputSchema: accountSchema,
    outputSchema: enrichedSchema,
    execute: async ({ inputData }: any) => {
      log('enriching {accountId} via MCP', { accountId: inputData.accountId });
      const [tickets, usage, crm] = await Promise.all([
        callMcpTool('get_tickets', { account_id: inputData.accountId }),
        callMcpTool('get_usage_metrics', { account_id: inputData.accountId }),
        callMcpTool('get_crm_data', { account_id: inputData.accountId }),
      ]);
      return {
        accountId: inputData.accountId, company: inputData.company,
        tickets: JSON.stringify(tickets), usage: JSON.stringify(usage), crm: JSON.stringify(crm),
      };
    },
  });

  // Step 2a: Sentiment analysis (Google GenAI)
  const analyzeSentimentStep = createStep({
    id: 'analyze-sentiment',
    inputSchema: enrichedSchema,
    outputSchema: sentimentResultSchema,
    execute: async ({ inputData }: any) => {
      const tickets = JSON.parse(inputData.tickets);
      log('sentiment for {company} ({count} tickets)', { company: inputData.company, count: tickets.length });

      if (tickets.length === 0) {
        return { accountId: inputData.accountId, company: inputData.company, sentimentScore: 75, sentimentSummary: 'No tickets — neutral.' };
      }

      const result = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze support ticket sentiment for ${inputData.company}:\n\n${tickets.map((t: any) => `- [${t.priority}/${t.status}] ${t.subject}`).join('\n')}\n\nRespond:\nScore: [0-100]\nSummary: [one sentence]`,
        config: { temperature: 0.2, maxOutputTokens: 256 },
      });

      const text = result.text ?? '';
      const score = parseInt(text.match(/Score:\s*(\d+)/i)?.[1] ?? '50', 10);
      const summary = text.match(/Summary:\s*(.+)/i)?.[1] ?? text.slice(0, 100);
      return { accountId: inputData.accountId, company: inputData.company, sentimentScore: score, sentimentSummary: summary };
    },
  });

  // Step 2b: Risk assessment via LangGraph (OpenAI)
  const assessRiskStep = createStep({
    id: 'assess-risk',
    inputSchema: enrichedSchema,
    outputSchema: riskResultSchema,
    execute: async ({ inputData }: any) => {
      log('LangGraph risk assessment for {company}', { company: inputData.company });
      const graphResult = await riskGraph.invoke({
        company: inputData.company,
        tickets: inputData.tickets, usage: inputData.usage, crm: inputData.crm,
      });
      return {
        accountId: inputData.accountId, company: inputData.company,
        riskScore: graphResult.riskScore, riskLevel: graphResult.riskLevel, riskFactors: graphResult.riskFactors,
      };
    },
  });

  // Step 3: Compute health from parallel results
  const computeHealthStep = createStep({
    id: 'compute-health',
    inputSchema: z.object({ 'analyze-sentiment': sentimentResultSchema, 'assess-risk': riskResultSchema }),
    outputSchema: healthSchema,
    execute: async ({ inputData }: any) => {
      const sentiment = inputData['analyze-sentiment'];
      const risk = inputData['assess-risk'];
      const healthScore = Math.round(sentiment.sentimentScore * 0.4 + (100 - risk.riskScore) * 0.6);
      let healthCategory: 'critical' | 'at-risk' | 'healthy' | 'champion';
      if (healthScore < 30) healthCategory = 'critical';
      else if (healthScore < 55) healthCategory = 'at-risk';
      else if (healthScore < 80) healthCategory = 'healthy';
      else healthCategory = 'champion';
      log('health: {company} = {score} ({category})', { company: sentiment.company, score: healthScore, category: healthCategory });
      return {
        accountId: sentiment.accountId, company: sentiment.company,
        sentimentScore: sentiment.sentimentScore, sentimentSummary: sentiment.sentimentSummary,
        riskScore: risk.riskScore, riskLevel: risk.riskLevel, riskFactors: risk.riskFactors,
        healthScore, healthCategory,
      };
    },
  });

  // Step 4a: Intervention — playbooks + Mastra Agent for planning + alert
  const interventionStep = createStep({
    id: 'intervention-plan',
    inputSchema: healthSchema,
    outputSchema: actionSchema,
    execute: async ({ inputData }: any) => {
      log('intervention for {company} ({category})', { company: inputData.company, category: inputData.healthCategory });

      await indexPlaybooks();
      const query = `${inputData.healthCategory} churn risk ${inputData.riskFactors}`;
      const retrieved = await retrievePlaybooks(query);
      const reranked = await rerankPlaybooks(query, retrieved);
      const playbookContext = reranked.map(p => `[${p.title}] ${p.content}`).join('\n');

      const agentResult = await actionPlannerAgent.generate(
        `Account: ${inputData.company} (health: ${inputData.healthScore}/100, category: ${inputData.healthCategory})\n\nRisk factors:\n${inputData.riskFactors}\n\nRecommended playbooks:\n${playbookContext}\n\nCreate a 3-step action plan. Also create an alert for account_id="${inputData.accountId}" with severity="${inputData.healthCategory === 'critical' ? 'critical' : 'warning'}" and message="Health score ${inputData.healthScore}/100 — intervention required".`,
      );

      return {
        accountId: inputData.accountId, company: inputData.company,
        healthCategory: inputData.healthCategory,
        recommendedPlaybooks: reranked.map(p => p.title),
        actionPlan: agentResult.text,
        alertCreated: true,
      };
    },
  });

  // Step 4b: Expansion — playbooks + GenAI summary
  const expansionStep = createStep({
    id: 'expansion-analysis',
    inputSchema: healthSchema,
    outputSchema: actionSchema,
    execute: async ({ inputData }: any) => {
      log('expansion for {company} ({category})', { company: inputData.company, category: inputData.healthCategory });

      await indexPlaybooks();
      const query = `expansion opportunity champion high usage ${inputData.company}`;
      const retrieved = await retrievePlaybooks(query, 3);
      const reranked = await rerankPlaybooks(query, retrieved);
      const playbookContext = reranked.map(p => `[${p.title}] ${p.content}`).join('\n');

      const result = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Expansion opportunities for ${inputData.healthCategory} account ${inputData.company} (health: ${inputData.healthScore}/100).\n\nPlaybooks:\n${playbookContext}\n\n2-3 actions in under 60 words.`,
        config: { temperature: 0.4, maxOutputTokens: 512 },
      });

      return {
        accountId: inputData.accountId, company: inputData.company,
        healthCategory: inputData.healthCategory,
        recommendedPlaybooks: reranked.map(p => p.title),
        actionPlan: result.text ?? 'No expansion plan generated',
        alertCreated: false,
      };
    },
  });

  // ---------------------------------------------------------------------------
  // Per-account workflow: enrich → parallel(sentiment, risk) → health → branch
  // ---------------------------------------------------------------------------

  const accountHealthWorkflow = createWorkflow({
    id: 'account-health-check',
    inputSchema: accountSchema,
    outputSchema: actionSchema,
  })
    .then(enrichAccountStep)
    .parallel([analyzeSentimentStep, assessRiskStep])
    .then(computeHealthStep)
    .branch([
      [async ({ inputData }: any) => inputData.healthCategory === 'critical' || inputData.healthCategory === 'at-risk', interventionStep],
      [async ({ inputData }: any) => inputData.healthCategory === 'healthy' || inputData.healthCategory === 'champion', expansionStep],
    ])
    .commit();

  // ---------------------------------------------------------------------------
  // Outer pipeline: load → foreach → summarize
  // ---------------------------------------------------------------------------

  const loadAccountsStep = createStep({
    id: 'load-accounts',
    inputSchema: z.object({ batchId: z.string() }),
    outputSchema: z.array(accountSchema),
    execute: async ({ inputData }: any) => {
      log('loading accounts for batch {batchId}', { batchId: inputData.batchId });
      return ACCOUNTS;
    },
  });

  const summarizeStep = createStep({
    id: 'summarize-results',
    inputSchema: z.any(),
    outputSchema: z.object({
      batchId: z.string(), totalAccounts: z.number(), summary: z.string(),
      results: z.array(z.object({ company: z.string(), healthCategory: z.string(), topAction: z.string() })),
    }),
    execute: async ({ inputData }: any) => {
      const items = Array.isArray(inputData) ? inputData.map((r: any) => {
        if (r && typeof r === 'object' && !r.accountId) {
          const vals = Object.values(r);
          if (vals.length === 1 && vals[0] && typeof vals[0] === 'object') return vals[0] as any;
        }
        return r?.output ?? r;
      }) : [];
      log('summarizing {count} account results', { count: items.length });
      const results = items.map((r: any) => ({
        company: r?.company ?? 'Unknown', healthCategory: r?.healthCategory ?? 'unknown',
        topAction: r?.actionPlan?.split('\n')[0]?.slice(0, 120) ?? 'N/A',
      }));

      const result = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize this customer health batch in 2 sentences:\n\n${results.map((r: any) => `- ${r.company}: ${r.healthCategory} → ${r.topAction}`).join('\n')}`,
        config: { temperature: 0.3, maxOutputTokens: 512 },
      });

      return { batchId: `batch-${Date.now()}`, totalAccounts: items.length, summary: result.text ?? '', results };
    },
  });

  const customerHealthPipeline = createWorkflow({
    id: 'customer-health-pipeline',
    inputSchema: z.object({ batchId: z.string() }),
    outputSchema: z.object({
      batchId: z.string(), totalAccounts: z.number(), summary: z.string(),
      results: z.array(z.object({ company: z.string(), healthCategory: z.string(), topAction: z.string() })),
    }),
  })
    .then(loadAccountsStep)
    .foreach(accountHealthWorkflow)
    .then(summarizeStep)
    .commit();

  // ---------------------------------------------------------------------------
  // Register and run
  // ---------------------------------------------------------------------------

  const mastra = new Mastra({
    observability: await getMastraObservability(),
    workflows: { customerHealthPipeline },
    agents: { actionPlannerAgent },
    tools: { getTicketsTool, getUsageTool, getCrmTool, createAlertTool },
  });

  log('starting customer health pipeline');
  console.log('\n=== Customer Health Pipeline (Mastra + MCP + LangGraph + OpenAI) ===\n');

  const workflow = mastra.getWorkflow('customerHealthPipeline');
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { batchId: 'weekly-2026-05-06' } });

  log('pipeline complete, status: {status}', { status: result?.status ?? 'done' });
  console.log('\n[result]', JSON.stringify(result, null, 2));

  await mcpClient.close();
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[mastra-complex] failed', err);
  process.exitCode = 1;
});
