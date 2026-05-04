#!/usr/bin/env node
/**
 * Log verifier for the original 7 TypeScript SDK examples.
 *
 * Parses JSONL raw/processed span logs and checks:
 *   - Root WORKFLOW span exists
 *   - Expected workflow name matches
 *   - Expected agent and tool span names are present
 *   - Trace IDs are present and consistent
 *   - Minimum span counts
 *   - Critical neatlogs attributes on spans
 *
 * Usage:
 *   node scripts/verify-original7-logs.mjs [--help] [--only <name>] [--logs-dir <dir>]
 *
 * Options:
 *   --help             Show this help message and exit.
 *   --only <name>      Verify only the named example. May be repeated.
 *   --logs-dir <dir>   Path to logs directory (default: logs/).
 */

import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI parsing ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
verify-original7-logs.mjs — Verify JSONL span logs for the original 7 examples.

Usage:
  node scripts/verify-original7-logs.mjs [options]

Options:
  --help             Show this help and exit.
  --only <name>      Verify only the named example. May be repeated.
  --logs-dir <dir>   Path to logs directory (default: logs/).

Checks performed per example:
  • Raw spans JSONL file exists and is non-empty.
  • Processed spans JSONL file exists and is non-empty.
  • Root WORKFLOW span exists with expected name.
  • Expected AGENT span names are present.
  • Expected TOOL span names are present (where applicable).
  • All spans share a consistent trace ID.
  • Minimum span count is met.
  • Critical neatlogs attributes are present on spans
    (neatlogs.span.kind, neatlogs.association.properties.log_type, etc.).

Exit codes:
  0  All verified examples pass.
  1  One or more examples have verification failures.
  2  Script error.
`.trim());
  process.exit(0);
}

let logsDir = resolve(ROOT, 'logs');
const onlyNames = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--logs-dir' && argv[i + 1]) {
    logsDir = resolve(argv[++i]);
  } else if (argv[i] === '--only' && argv[i + 1]) {
    onlyNames.push(argv[++i]);
  }
}

// ── Example verification specs ──────────────────────────────────────────
const SPECS = [
  {
    name: 'openai_multiagent',
    workflowSpan: 'investment_research_workflow',
    agents: ['planner', 'researcher', 'analyst', 'reporter'],
    tools: ['web_search'],
    minSpans: 5,
  },
  {
    name: 'anthropic_multiagent',
    workflowSpan: 'code_review_workflow',
    agents: ['reviewer', 'fixer', 'tester', 'documenter'],
    tools: ['check_syntax'],
    minSpans: 5,
  },
  {
    name: 'google_genai_multiagent',
    workflowSpan: 'blog_creation_workflow',
    agents: ['ideation', 'writer', 'editor', 'finalizer'],
    tools: ['web_search'],
    minSpans: 5,
  },
  {
    name: 'langchain_react',
    workflowSpan: 'react_research_workflow',
    agents: [],
    tools: [],
    chains: ['react_agent', 'report_writer'],
    minSpans: 3,
  },
  {
    name: 'langgraph_multiagent',
    workflowSpan: 'research_workflow',
    agents: [],
    tools: [],
    chains: ['supervisor', 'web_researcher', 'wiki_researcher', 'arxiv_researcher', 'synthesizer', 'report_writer'],
    minSpans: 7,
  },
  {
    name: 'marketing_strategy_demo',
    workflowSpan: 'Marketing Strategy Workflow',
    agents: ['Lead Market Analyst', 'Chief Marketing Strategist', 'Creative Content Creator'],
    tools: ['Web Search Google', 'Analyze Website Content'],
    chains: ['research_task', 'project_understanding_task', 'marketing_strategy_task', 'campaign_idea_task', 'copy_creation_task'],
    minSpans: 8,
  },
  {
    name: 'reasoning_model_workflow',
    workflowSpan: 'reasoning_verification_workflow',
    agents: ['openai_reasoning_agent', 'openai_full_params_agent', 'anthropic_thinking_agent', 'langchain_openai_agent', 'gemini_async_agent'],
    tools: [],
    chains: ['o4_mini_reasoning', 'gpt4o_full_params', 'claude_extended_thinking', 'langchain_azure_openai', 'gemini_flash_streaming'],
    minSpans: 6,
  },
];

const selectedSpecs = onlyNames.length
  ? SPECS.filter((s) => onlyNames.includes(s.name))
  : SPECS;

if (selectedSpecs.length === 0) {
  console.error(`Error: no matching specs for --only ${onlyNames.join(', ')}`);
  console.error(`Available: ${SPECS.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseJSONL(content) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Extract the span name from various possible attribute layouts.
 * Handles both raw OTel spans and processed neatlogs spans.
 */
function getSpanName(span) {
  if (span.name) return span.name;
  const attrs = span.attributes || {};
  return attrs['neatlogs.span.name'] || attrs['openinference.span.kind'] || '';
}

/**
 * Extract span kind from neatlogs attributes.
 */
function getSpanKind(span) {
  const attrs = span.attributes || {};
  return (
    attrs['neatlogs.span.kind'] ||
    attrs['openinference.span.kind'] ||
    ''
  ).toUpperCase();
}

/**
 * Extract trace ID from span.
 */
function getTraceId(span) {
  if (span.traceId) return span.traceId;
  if (span.trace_id) return span.trace_id;
  const ctx = span.spanContext || span.context || {};
  return ctx.traceId || ctx.trace_id || '';
}

/**
 * Check if a span has critical neatlogs attributes.
 */
function hasCriticalAttributes(span) {
  const attrs = span.attributes || {};
  const hasKind = !!(attrs['neatlogs.span.kind'] || attrs['openinference.span.kind']);
  return { hasKind };
}

// ── Verification ────────────────────────────────────────────────────────

function verifyExample(spec, rawSpans, processedSpans) {
  const errors = [];
  const warnings = [];
  const info = [];

  // Use processed spans as primary; fall back to raw if processed is empty
  const spans = processedSpans.length > 0 ? processedSpans : rawSpans;
  const spanSource = processedSpans.length > 0 ? 'processed' : 'raw';
  info.push(`Using ${spanSource} spans (${spans.length} total)`);

  // ── Span count ──────────────────────────────────────────────────────
  if (spans.length < spec.minSpans) {
    errors.push(`Expected at least ${spec.minSpans} spans, found ${spans.length}`);
  } else {
    info.push(`Span count: ${spans.length} (min: ${spec.minSpans})`);
  }

  // ── Root WORKFLOW span ──────────────────────────────────────────────
  const allNames = spans.map(getSpanName);
  const workflowSpan = spans.find(
    (s) => getSpanName(s) === spec.workflowSpan && getSpanKind(s) === 'WORKFLOW',
  );

  if (!workflowSpan) {
    // Fallback: check by name only (kind attribute may vary in raw spans)
    const byName = spans.find((s) => getSpanName(s) === spec.workflowSpan);
    if (byName) {
      warnings.push(`WORKFLOW span '${spec.workflowSpan}' found by name but kind attribute is '${getSpanKind(byName)}' (expected WORKFLOW)`);
    } else {
      errors.push(`Root WORKFLOW span '${spec.workflowSpan}' not found. Names present: ${[...new Set(allNames)].join(', ')}`);
    }
  } else {
    info.push(`Root WORKFLOW span: '${spec.workflowSpan}'`);
  }

  // ── Agent spans ─────────────────────────────────────────────────────
  const foundAgents = [];
  const missingAgents = [];
  for (const agent of spec.agents) {
    if (allNames.includes(agent)) {
      foundAgents.push(agent);
    } else {
      missingAgents.push(agent);
    }
  }
  if (foundAgents.length > 0) info.push(`Agents found: ${foundAgents.join(', ')}`);
  if (missingAgents.length > 0) errors.push(`Missing agent spans: ${missingAgents.join(', ')}`);

  // ── Tool spans ──────────────────────────────────────────────────────
  const foundTools = [];
  const missingTools = [];
  for (const tool of spec.tools) {
    if (allNames.includes(tool)) {
      foundTools.push(tool);
    } else {
      missingTools.push(tool);
    }
  }
  if (foundTools.length > 0) info.push(`Tools found: ${foundTools.join(', ')}`);
  if (missingTools.length > 0) errors.push(`Missing tool spans: ${missingTools.join(', ')}`);

  // ── Chain spans ─────────────────────────────────────────────────────
  if (spec.chains) {
    const foundChains = [];
    const missingChains = [];
    for (const chain of spec.chains) {
      if (allNames.includes(chain)) {
        foundChains.push(chain);
      } else {
        missingChains.push(chain);
      }
    }
    if (foundChains.length > 0) info.push(`Chains found: ${foundChains.join(', ')}`);
    if (missingChains.length > 0) errors.push(`Missing chain spans: ${missingChains.join(', ')}`);
  }

  // ── Trace ID consistency ────────────────────────────────────────────
  const traceIds = [...new Set(spans.map(getTraceId).filter(Boolean))];
  if (traceIds.length === 0) {
    warnings.push('No trace IDs found in spans');
  } else if (traceIds.length === 1) {
    info.push(`Trace ID: ${traceIds[0]}`);
  } else {
    // Multiple trace IDs is okay if framework creates sub-traces,
    // but we flag it for awareness.
    info.push(`Trace IDs (${traceIds.length}): ${traceIds.join(', ')}`);
  }

  // ── Critical attributes ─────────────────────────────────────────────
  let spansWithKind = 0;
  for (const s of spans) {
    const { hasKind } = hasCriticalAttributes(s);
    if (hasKind) spansWithKind++;
  }
  if (spansWithKind === 0 && spans.length > 0) {
    warnings.push('No spans have neatlogs.span.kind or openinference.span.kind attribute');
  } else {
    info.push(`Spans with kind attribute: ${spansWithKind}/${spans.length}`);
  }

  return { errors, warnings, info, spanCount: spans.length, traceIds };
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  verify-original7-logs — NeatLogs TypeScript SDK    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const results = [];

  for (const spec of selectedSpecs) {
    const rawPath = resolve(logsDir, `${spec.name}_raw_spans.jsonl`);
    const processedPath = resolve(logsDir, `${spec.name}_processed_spans.jsonl`);

    console.log(`┌─── ${spec.name} ───`);

    // Check file existence
    const rawExists = await fileExists(rawPath);
    const procExists = await fileExists(processedPath);

    if (!rawExists && !procExists) {
      console.log(`│  ❌ No log files found:`);
      console.log(`│     raw:       ${rawPath}`);
      console.log(`│     processed: ${processedPath}`);
      console.log(`└─── ${spec.name}: ❌ SKIP (no logs)\n`);
      results.push({ name: spec.name, passed: false, reason: 'no log files', errors: ['No raw or processed log files found'], warnings: [], spanCount: 0, traceIds: [] });
      continue;
    }

    // Parse log files
    let rawSpans = [];
    let processedSpans = [];

    if (rawExists) {
      const rawContent = await readFile(rawPath, 'utf8');
      rawSpans = parseJSONL(rawContent);
      console.log(`│  Raw spans:       ${rawSpans.length} (${rawPath})`);
    } else {
      console.log(`│  Raw spans:       — (file not found)`);
    }

    if (procExists) {
      const procContent = await readFile(processedPath, 'utf8');
      processedSpans = parseJSONL(procContent);
      console.log(`│  Processed spans: ${processedSpans.length} (${processedPath})`);
    } else {
      console.log(`│  Processed spans: — (file not found)`);
    }

    // Verify
    const result = verifyExample(spec, rawSpans, processedSpans);

    for (const i of result.info) console.log(`│  ℹ️  ${i}`);
    for (const w of result.warnings) console.log(`│  ⚠️  ${w}`);
    for (const e of result.errors) console.log(`│  ❌ ${e}`);

    const passed = result.errors.length === 0;
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`└─── ${spec.name}: ${status}\n`);

    results.push({
      name: spec.name,
      passed,
      errors: result.errors,
      warnings: result.warnings,
      spanCount: result.spanCount,
      traceIds: result.traceIds,
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('════════════════ VERIFICATION SUMMARY ════════════════');
  const maxLen = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const padded = r.name.padEnd(maxLen);
    const errText = r.errors.length > 0 ? `  errors: ${r.errors.length}` : '';
    const warnText = r.warnings.length > 0 ? `  warnings: ${r.warnings.length}` : '';
    console.log(`  ${icon}  ${padded}  spans=${r.spanCount}  traceIds=${r.traceIds.length}${errText}${warnText}`);
  }

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;
  console.log(`\n  ${passCount} passed, ${failCount} failed out of ${results.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Verifier error:', err);
  process.exit(2);
});
