/**
 * Neatlogs trace doctor — type definitions.
 *
 * The doctor is a local, read-only linter for span log files. It reads a
 * JSONL file written by the Neatlogs log exporter and surfaces common
 * instrumentation problems. It is offline-only (no network, no SDK
 * initialization, no span emission).
 *
 * Every finding is a `DoctorFinding`; the full per-file report is a
 * `DoctorReport`. Both are immutable so reports can be hashed / diffed in
 * tests. The `toDict()` method follows the "absent when unset" rule —
 * optional fields (fix_class, automated_fix_available, doc_url,
 * related_codes) are OMITTED from the JSON output when their default value
 * is used, so the JSON shape stays backward-compatible with older doctor
 * versions that did not yet populate the LLM-actionability surface.
 */

/** Span kinds that count as orchestration roots. */
export const ROOT_KINDS = new Set<string>(['workflow', 'chain', 'agent', 'mcp_tool']);

/** Span kinds where input + output attributes are expected. */
export const IO_KINDS = new Set<string>(['llm', 'tool', 'retriever', 'embedding']);

/** Scope-name prefix that identifies Neatlogs' own instrumentation. */
export const NEATLOGS_SCOPE_PREFIX = 'neatlogs';

/** Default value for missing session.id when grouping spans by run. */
export const DEFAULT_SESSION_ID = '<no-session>';

/** Evidence-string truncation (matches the Python reference). */
export const MAX_EVIDENCE_LEN = 200;

/**
 * Attribute keys the SDK checks before claiming init succeeded. If a span is
 * present but none of these are set, the most likely cause is a wrapper that
 * was created BEFORE `neatlogs.init()` was called.
 */
export const INIT_MARKER_KEYS = [
  'neatlogs.instrumentation.name',
  'neatlogs.span.kind',
  'neatlogs.workflow_name',
] as const;

/** A severity tag for a finding. */
export type DoctorSeverity = 'error' | 'warning' | 'info';

/** A fix-class tag for a finding. Used by LLM/coding-agent consumers. */
export type FixClass =
  | 'init_order'
  | 'config'
  | 'pipeline'
  | 'instrumentation'
  | 'capture'
  | 'attribute'
  | 'hierarchy'
  | 'data_integrity';

/**
 * A single diagnostic finding emitted by the doctor.
 *
 * Immutable. The optional LLM-actionability fields (`fix_class`,
 * `automated_fix_available`, `doc_url`, `related_codes`) are absent from
 * `toDict()` when unset so the JSON output stays backward-compatible.
 */
export interface DoctorFindingInit {
  severity: DoctorSeverity;
  code: string;
  title: string;
  evidence: string;
  suggestion: string;
  traceId?: string | null;
  runId?: string | null;
  fixClass?: FixClass | null;
  automatedFixAvailable?: boolean;
  docUrl?: string | null;
  relatedCodes?: readonly string[];
}

export class DoctorFinding {
  readonly severity: DoctorSeverity;
  readonly code: string;
  readonly title: string;
  readonly evidence: string;
  readonly suggestion: string;
  readonly traceId: string | null;
  readonly runId: string | null;
  readonly fixClass: FixClass | null;
  readonly automatedFixAvailable: boolean;
  readonly docUrl: string | null;
  readonly relatedCodes: readonly string[];

  constructor(init: DoctorFindingInit) {
    this.severity = init.severity;
    this.code = init.code;
    this.title = init.title;
    this.evidence = init.evidence;
    this.suggestion = init.suggestion;
    this.traceId = init.traceId ?? null;
    this.runId = init.runId ?? null;
    this.fixClass = init.fixClass ?? null;
    this.automatedFixAvailable = init.automatedFixAvailable ?? false;
    this.docUrl = init.docUrl ?? null;
    this.relatedCodes = init.relatedCodes ?? [];
    Object.freeze(this);
    Object.freeze(this.relatedCodes);
  }

  /**
   * Serialize the finding. Optional LLM-actionability fields are OMITTED
   * when unset, not set to `null`, so older consumers see the same shape
   * they did before the actionability surface was added.
   */
  toDict(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      severity: this.severity,
      code: this.code,
      title: this.title,
      evidence: this.evidence,
      suggestion: this.suggestion,
    };
    if (this.traceId) data['trace_id'] = this.traceId;
    if (this.runId) data['run_id'] = this.runId;
    if (this.fixClass) data['fix_class'] = this.fixClass;
    if (this.automatedFixAvailable) data['automated_fix_available'] = true;
    if (this.docUrl) data['doc_url'] = this.docUrl;
    if (this.relatedCodes.length > 0) data['related_codes'] = [...this.relatedCodes];
    return data;
  }
}

/** A span dict read from a JSONL log file. Tolerant of missing keys. */
export interface SpanDict {
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string | null;
  name?: string;
  kind?: string;
  start_time?: number;
  end_time?: number;
  duration_ns?: number;
  status?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  attributes?: Record<string, unknown>;
  instrumentation_scope?: string | { name?: string; version?: string } | null;
  // The `session.id` attribute lives under `attributes`, not at the top level.
  [key: string]: unknown;
}

/** Full diagnostic report for one span log file. */
export class DoctorReport {
  readonly path: string;
  readonly spansRead: number;
  readonly traceCount: number;
  readonly runCount: number;
  readonly invalidLines: readonly number[];
  readonly findings: readonly DoctorFinding[];

  constructor(init: {
    path: string;
    spansRead: number;
    traceCount: number;
    runCount: number;
    invalidLines?: readonly number[];
    findings?: readonly DoctorFinding[];
  }) {
    this.path = init.path;
    this.spansRead = init.spansRead;
    this.traceCount = init.traceCount;
    this.runCount = init.runCount;
    this.invalidLines = init.invalidLines ?? [];
    this.findings = init.findings ?? [];
    Object.freeze(this);
    Object.freeze(this.invalidLines);
    Object.freeze(this.findings);
  }

  get hasErrors(): boolean {
    return this.findings.some((f) => f.severity === 'error');
  }

  /** Group findings by `fix_class`. Findings without a fix_class are dropped. */
  findingsByFixClass(): Map<FixClass, DoctorFinding[]> {
    const out = new Map<FixClass, DoctorFinding[]>();
    for (const f of this.findings) {
      if (f.fixClass === null) continue;
      const arr = out.get(f.fixClass);
      if (arr) arr.push(f);
      else out.set(f.fixClass, [f]);
    }
    return out;
  }

  /** Group findings by the inferred SDK pipeline stage they relate to. */
  findingsByPipelineStage(): Map<string, DoctorFinding[]> {
    const stageMap: Record<FixClass, string> = {
      init_order: 'init',
      config: 'init',
      pipeline: 'init',
      instrumentation: 'instrument',
      capture: 'instrument',
      data_integrity: 'span',
      attribute: 'span',
      hierarchy: 'hierarchy',
    };
    const out = new Map<string, DoctorFinding[]>();
    for (const f of this.findings) {
      if (f.fixClass === null) continue;
      const stage = stageMap[f.fixClass];
      const arr = out.get(stage);
      if (arr) arr.push(f);
      else out.set(stage, [f]);
    }
    return out;
  }

  toDict(): Record<string, unknown> {
    return {
      path: this.path,
      spans_read: this.spansRead,
      trace_count: this.traceCount,
      run_count: this.runCount,
      invalid_lines: [...this.invalidLines],
      findings: this.findings.map((f) => f.toDict()),
    };
  }
}
