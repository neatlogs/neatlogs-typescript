/**
 * All Span Kinds Demo — TypeScript port
 * Original Python: examples/sdk_examples/47_all_span_kinds.py
 *
 * Production-realistic support workflow emitting all span kinds:
 * WORKFLOW, CHAIN, AGENT, RETRIEVER, EMBEDDING, TOOL, LLM.
 *
 * Note: This TypeScript port uses in-memory vector search (cosine similarity)
 * instead of ChromaDB, and Azure OpenAI text-embedding-ada-002 for embeddings.
 *
 * Usage:
 *   npx tsx --env-file=.env examples/all_span_kinds/main.ts
 *
 * Required env vars:
 *   NEATLOGS_API_KEY, NEATLOGS_ENDPOINT
 *   AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
 *   AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_VERSION
 *   AZURE_OPENAI_EMBEDDING_DEPLOYMENT (optional, defaults to "text-embedding-ada-002")
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
  workflowName: "production-support-all-span-kinds",
  tags: ["support", "all-span-kinds", "typescript"],
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

// Embedding deployment (optional — falls back to mock embeddings if not set).
// In Azure OpenAI, embedding models live in a separate deployment from chat models.
// Set AZURE_OPENAI_EMBEDDING_DEPLOYMENT to the name of your text-embedding-ada-002
// or text-embedding-3-small deployment to use real embeddings.
const EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;

// Embedding client — hoisted to module scope so it's created once, not per-call.
const embClient = EMBEDDING_DEPLOYMENT
  ? new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: EMBEDDING_DEPLOYMENT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview",
    })
  : null;

// ---------------------------------------------------------------------------
// Embedding helper — uses real Azure embeddings when EMBEDDING_DEPLOYMENT is set,
// falls back to deterministic mock vectors otherwise (for demo / no-embedding-key setups).
// ---------------------------------------------------------------------------

function mockEmbedding(text: string, dims = 8): number[] {
  // Deterministic hash-based mock so similar texts get similar vectors
  const vec = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i) / 1000;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (embClient && EMBEDDING_DEPLOYMENT) {
    const response = await embClient.embeddings.create({
      model: EMBEDDING_DEPLOYMENT,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
  // Mock fallback — still demonstrates EMBEDDING span kind without a real embedding model
  return texts.map((t) => mockEmbedding(t));
}

// ---------------------------------------------------------------------------
// In-memory vector store
// ---------------------------------------------------------------------------

interface Document {
  id: string;
  content: string;
  embedding?: number[];
  score?: number;
  metadata?: Record<string, string>;
}

const _knowledgeBase: Document[] = [];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1e-12;
  return dot / denom;
}

// ---------------------------------------------------------------------------
// TOOL spans — product info and order status
// ---------------------------------------------------------------------------

const getProductInfo = neatlogs.spanWrap(
  { kind: "TOOL", name: "get_product_info", toolName: "get_product_info" },
  async (productId: string): Promise<Record<string, unknown>> => {
    // Mock product data (mirrors dummyjson.com pattern)
    const products: Record<string, Record<string, unknown>> = {
      "3": { product_id: "3", title: "Samsung Universe 9", price: 1249.99, stock: 36 },
      "1": { product_id: "1", title: "iPhone 9", price: 549.99, stock: 94 },
    };
    return products[productId] ?? { product_id: productId, title: "Unknown", price: 0, stock: 0 };
  }
);

const checkOrderStatus = neatlogs.spanWrap(
  { kind: "TOOL", name: "check_order_status", toolName: "check_order_status" },
  async (orderId: string): Promise<Record<string, unknown>> => {
    // Mock order data
    return {
      order_id: orderId,
      total: 124.99,
      items_count: 3,
      status: "processing",
    };
  }
);

// ---------------------------------------------------------------------------
// CHAIN — setup knowledge base (with EMBEDDING span inside)
// ---------------------------------------------------------------------------

const setupKnowledgeBase = neatlogs.spanWrap(
  { kind: "CHAIN", name: "setup_knowledge_base" },
  async (): Promise<void> => {
    const docs = [
      "Return policy: returns within 30 days for a full refund.",
      "Shipping: free shipping for orders over $50 in the continental US.",
      "Support: 24/7 support via chat, email, or phone.",
    ];

    // EMBEDDING span — get embeddings for knowledge base docs
    await neatlogs.withTrace({ name: "embed_knowledge_base", kind: "EMBEDDING" }, async () => {
      const embeddings = await getEmbeddings(docs);
      for (let i = 0; i < docs.length; i++) {
        _knowledgeBase.push({
          id: `doc_${i}`,
          content: docs[i],
          embedding: embeddings[i],
          metadata: { source: "policy" },
        });
      }
      neatlogs.log("embedded {count} knowledge base documents", { count: docs.length });
    });
  }
);

// ---------------------------------------------------------------------------
// RETRIEVER span — similarity search over knowledge base
// ---------------------------------------------------------------------------

const retrieveDocuments = neatlogs.spanWrap(
  { kind: "RETRIEVER", name: "retrieve_documents" },
  async (query: string): Promise<Document[]> => {
    // EMBEDDING span — embed the query
    let queryEmbedding: number[] = [];
    await neatlogs.withTrace({ name: "embed_query", kind: "EMBEDDING" }, async () => {
      const embeddings = await getEmbeddings([query]);
      queryEmbedding = embeddings[0];
    });

    // Score and rank documents
    const scored = _knowledgeBase.map((doc) => ({
      ...doc,
      score: doc.embedding ? cosineSimilarity(queryEmbedding, doc.embedding) : 0,
    }));
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const topDocs = scored.slice(0, 3);
    neatlogs.log("retrieved {count} documents for query", { count: topDocs.length });
    return topDocs;
  }
);

// ---------------------------------------------------------------------------
// CHAIN — rerank documents using cosine similarity
// ---------------------------------------------------------------------------

const rerankDocuments = neatlogs.spanWrap(
  { kind: "CHAIN", name: "rerank_documents" },
  async (query: string, documents: Document[], topK = 2): Promise<Document[]> => {
    // Re-score using query string overlap as a simple reranker
    const reranked = documents.map((doc) => {
      const queryWords = new Set(query.toLowerCase().split(/\s+/));
      const docWords = doc.content.toLowerCase().split(/\s+/);
      const overlap = docWords.filter((w) => queryWords.has(w)).length;
      return { ...doc, score: (doc.score ?? 0) * 0.7 + overlap * 0.1 };
    });
    reranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return reranked.slice(0, topK);
  }
);

// ---------------------------------------------------------------------------
// AGENT — routing agent (calls tools based on query intent)
// ---------------------------------------------------------------------------

const routingAgent = neatlogs.spanWrap(
  { kind: "AGENT", name: "routing_agent", role: "Router", goal: "Route to appropriate tools" },
  async (query: string): Promise<Record<string, unknown>> => {
    const toolOut: Record<string, unknown> = {};
    const qLower = query.toLowerCase();
    if (qLower.includes("order") || qLower.includes("status")) {
      toolOut["order"] = await checkOrderStatus("5");
    }
    if (qLower.includes("product")) {
      toolOut["product"] = await getProductInfo("3");
    }
    return toolOut;
  }
);

// ---------------------------------------------------------------------------
// AGENT — generate answer using LLM
// ---------------------------------------------------------------------------

const _answerSys = new neatlogs.PromptTemplate([{
  role: "system",
  content:
    "You are customer support. Use context and tool outputs.\n\nContext:\n{{context}}\n\nTools:\n{{tools}}",
}]);

const _answerUser = new neatlogs.UserPromptTemplate([{
  role: "user",
  content: "{{query}}",
}]);

const generateAnswer = neatlogs.spanWrap(
  { kind: "AGENT", name: "generate_answer" },
  async (query: string, context: string, tools: string): Promise<string> => {
    const systemMsg = _answerSys.compile({ context, tools })[0].content;
    const userMsg = _answerUser.compile({ query })[0].content;

    let result = "";
    await neatlogs.withTrace(
      { name: "stream_llm_response", kind: "LLM", promptTemplate: _answerSys, userPromptTemplate: _answerUser },
      async () => {
        const stream = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          stream: true,
          stream_options: { include_usage: true },
        });
        const chunks: string[] = [];
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            chunks.push(delta);
          }
        }
        result = chunks.join("").trim();
        return result;
      }
    );

    return result;
  }
);

// ---------------------------------------------------------------------------
// WORKFLOW — full support workflow
// ---------------------------------------------------------------------------

const runSupportWorkflow = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "support_workflow" },
  async (query: string): Promise<string> => {
    neatlogs.log("support workflow started for query: {query}", { query });

    // Setup knowledge base (CHAIN with EMBEDDING inside)
    await setupKnowledgeBase();

    // Retrieve relevant documents (RETRIEVER with EMBEDDING inside)
    const retrievedDocs = await retrieveDocuments(query);

    // Rerank documents (CHAIN)
    const rankedDocs = await rerankDocuments(query, retrievedDocs, 2);

    // Route to tools (AGENT with TOOL children)
    const toolResults = await routingAgent(query);

    // Build context
    const context = rankedDocs.map((d) => d.content).join("\n");

    // Generate answer (AGENT with LLM child)
    const answer = await generateAnswer(
      query,
      context,
      JSON.stringify(toolResults)
    );

    return answer;
  }
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const query = "What is your return policy and can you check my order status?";

  try {
    const answer = await runSupportWorkflow(query);
    console.log(`\nQuery: ${query}\nAnswer: ${answer}\n`);
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
