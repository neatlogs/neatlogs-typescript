/**
 * LangGraph StateGraph definition for the multi-provider research workflow.
 *
 * Topology:
 *   START → supervisor
 *             ↓              ↓             ↓          (parallel fan-out)
 *     web_researcher    wiki_researcher  arxiv_researcher
 *          ⇅ web_tools       ⇅ wiki_tools     ⇅ arxiv_tools   (LLM↔tools loops)
 *     web_done          wiki_done        arxiv_done
 *             ↓              ↓             ↓          (fan-in — waits for all three)
 *                       synthesizer
 *                           ↓
 *                     report_writer → END
 *
 * Adaptation note:
 *   The Python version uses ToolNode(tools, messages_key=...) for per-branch
 *   message isolation. The TypeScript @langchain/langgraph ToolNode does not
 *   support the messages_key option. Instead, we implement explicit tool-execution
 *   nodes (webToolsNode, wikiToolsNode, arxivToolsNode) that read/write their
 *   branch-specific message keys, preserving the same observable topology.
 *   Conditional routing checks tool_calls on the last message of each branch's
 *   message array via the hasToolCalls helper.
 */

import { StateGraph, Annotation, START, END, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import {
  supervisorNode,
  webResearcherNode,
  webToolsNode,
  webDoneNode,
  wikiResearcherNode,
  wikiToolsNode,
  wikiDoneNode,
  arxivResearcherNode,
  arxivToolsNode,
  arxivDoneNode,
  synthesizerNode,
  reportWriterNode,
  hasToolCalls,
} from './agents.js';

// ---------------------------------------------------------------------------
// State definition using LangGraph Annotation
// ---------------------------------------------------------------------------

export const ResearchAnnotation = Annotation.Root({
  query: Annotation<string>(),
  plan: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  web_messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  wiki_messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  arxiv_messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  web_results: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  wiki_results: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  arxiv_results: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  synthesis: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  final_report: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
});

export type ResearchState = typeof ResearchAnnotation.State;

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

export function buildGraph() {
  // Use `any` graph reference for edge wiring — LangGraph's TypeScript
  // generics track node names cumulatively through chained `.addNode()` calls,
  // but that makes incremental `.addEdge()` calls hard to type when many nodes
  // exist. Casting here is the pragmatic pattern used in LangGraph TS examples.
  const g: any = new StateGraph(ResearchAnnotation);

  // Core nodes
  g.addNode('supervisor', supervisorNode);
  g.addNode('synthesizer', synthesizerNode);
  g.addNode('report_writer', reportWriterNode);

  // Per-branch LLM nodes
  g.addNode('web_researcher', webResearcherNode);
  g.addNode('wiki_researcher', wikiResearcherNode);
  g.addNode('arxiv_researcher', arxivResearcherNode);

  // Per-branch explicit tool-execution nodes
  g.addNode('web_tools', webToolsNode);
  g.addNode('wiki_tools', wikiToolsNode);
  g.addNode('arxiv_tools', arxivToolsNode);

  // Per-branch "done" nodes — extract final text result
  g.addNode('web_done', webDoneNode);
  g.addNode('wiki_done', wikiDoneNode);
  g.addNode('arxiv_done', arxivDoneNode);

  // Entry
  g.addEdge(START, 'supervisor');

  // Parallel fan-out after supervisor
  g.addEdge('supervisor', 'web_researcher');
  g.addEdge('supervisor', 'wiki_researcher');
  g.addEdge('supervisor', 'arxiv_researcher');

  // Web researcher loop: if last msg has tool_calls → web_tools, else → web_done
  g.addConditionalEdges(
    'web_researcher',
    (s: ResearchState) => hasToolCalls(s.web_messages) ? 'web_tools' : 'web_done',
    { web_tools: 'web_tools', web_done: 'web_done' },
  );
  g.addEdge('web_tools', 'web_researcher');

  // Wiki researcher loop
  g.addConditionalEdges(
    'wiki_researcher',
    (s: ResearchState) => hasToolCalls(s.wiki_messages) ? 'wiki_tools' : 'wiki_done',
    { wiki_tools: 'wiki_tools', wiki_done: 'wiki_done' },
  );
  g.addEdge('wiki_tools', 'wiki_researcher');

  // ArXiv researcher loop
  g.addConditionalEdges(
    'arxiv_researcher',
    (s: ResearchState) => hasToolCalls(s.arxiv_messages) ? 'arxiv_tools' : 'arxiv_done',
    { arxiv_tools: 'arxiv_tools', arxiv_done: 'arxiv_done' },
  );
  g.addEdge('arxiv_tools', 'arxiv_researcher');

  // Fan-in — synthesizer waits for all three branches to complete
  g.addEdge('web_done', 'synthesizer');
  g.addEdge('wiki_done', 'synthesizer');
  g.addEdge('arxiv_done', 'synthesizer');

  g.addEdge('synthesizer', 'report_writer');
  g.addEdge('report_writer', END);

  return g.compile();
}
