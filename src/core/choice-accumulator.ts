import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { createHash } from "node:crypto";
import { setMediaAttributes } from "./media.js";

interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  type: string;
  details: string;
  synthetic: boolean;
}

interface ChoiceState {
  role: string;
  content: string[];
  reasoning: string[];
  mediaValues: unknown[];
  finishReason: string | null;
  toolCalls: Map<number, ToolCallState>;
}

const MAX_SEMANTIC_STREAM_EVENTS = 128;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Incremental OpenAI-compatible choice/tool-fragment accumulator. */
export class ChoiceAccumulator {
  private readonly choices = new Map<number, ChoiceState>();
  private usage: any = null;
  private model = "";
  private responseId = "";
  private chunkCount = 0;
  private finalized = false;

  constructor(
    private readonly captureFidelity:
      | "native"
      | "normalized"
      | "flattened"
      | "unknown" = "native",
  ) {}

  addResponse(response: any): void {
    this.captureEnvelope(response);
    for (
      let position = 0;
      position < (response?.choices?.length ?? 0);
      position += 1
    ) {
      const choice = response.choices[position];
      const index = Number.isInteger(choice?.index) ? choice.index : position;
      const message = choice?.message ?? {};
      const state = this.choice(index);
      state.role = message.role || "assistant";
      if (message.content != null)
        state.content.push(stringify(message.content));
      if (message.content != null && typeof message.content !== "string") {
        state.mediaValues.push(message.content);
      }
      if (message.reasoning_content != null)
        state.reasoning.push(stringify(message.reasoning_content));
      this.addToolFragments(index, message.tool_calls);
      if (choice?.finish_reason != null)
        state.finishReason = String(choice.finish_reason);
    }
  }

  addChunk(span: Span, chunk: any): void {
    const chunkIndex = this.chunkCount++;
    this.captureEnvelope(chunk);
    const summary: Array<Record<string, unknown>> = [];
    for (
      let position = 0;
      position < (chunk?.choices?.length ?? 0);
      position += 1
    ) {
      const choice = chunk.choices[position];
      const index = Number.isInteger(choice?.index) ? choice.index : position;
      const delta = choice?.delta ?? {};
      const state = this.choice(index);
      if (delta.role) state.role = String(delta.role);
      const content = delta.content == null ? "" : stringify(delta.content);
      const reasoning =
        delta.reasoning_content == null
          ? ""
          : stringify(delta.reasoning_content);
      if (content) state.content.push(content);
      if (delta.content != null && typeof delta.content !== "string") {
        state.mediaValues.push(delta.content);
      }
      if (reasoning) state.reasoning.push(reasoning);
      this.addToolFragments(index, delta.tool_calls);
      if (choice?.finish_reason != null)
        state.finishReason = String(choice.finish_reason);
      summary.push({
        choice_index: index,
        content_bytes: byteLength(content),
        reasoning_bytes: byteLength(reasoning),
        tool_fragments: Array.isArray(delta.tool_calls)
          ? delta.tool_calls.length
          : 0,
        finish_reason: choice?.finish_reason ?? null,
      });
    }
    if (
      chunkIndex < MAX_SEMANTIC_STREAM_EVENTS &&
      (summary.length > 0 || chunk?.usage)
    ) {
      span.addEvent("neatlogs.stream.chunk", {
        "neatlogs.stream.chunk.index": chunkIndex,
        "neatlogs.stream.chunk.summary": stringify({
          choices: summary,
          usage: !!chunk?.usage,
        }),
      });
    }
  }

  apply(span: Span): void {
    let flattenedToolIndex = 0;
    const indexes = [...this.choices.keys()].sort(
      (left, right) => left - right,
    );
    for (const choiceIndex of indexes) {
      const choice = this.choices.get(choiceIndex)!;
      const prefix = `neatlogs.llm.output_messages.${choiceIndex}`;
      span.setAttribute(`${prefix}.role`, choice.role || "assistant");
      const content = choice.content.join("");
      if (content) span.setAttribute(`${prefix}.content`, content);
      const reasoning = choice.reasoning.join("");
      if (reasoning) span.setAttribute(`${prefix}.reasoning`, reasoning);
      if (choice.mediaValues.length > 0) {
        setMediaAttributes(span, prefix, choice.mediaValues, "output");
      }
      if (choice.finishReason !== null) {
        span.setAttribute(
          `neatlogs.llm.choices.${choiceIndex}.finish_reason`,
          choice.finishReason,
        );
        if (choiceIndex === indexes[0]) {
          span.setAttribute("neatlogs.llm.finish_reason", choice.finishReason);
        }
      }
      for (const toolIndex of [...choice.toolCalls.keys()].sort(
        (left, right) => left - right,
      )) {
        const tool = choice.toolCalls.get(toolIndex)!;
        if (!tool.id) {
          const context = span.spanContext();
          tool.id = `nl_${hash(
            `${context.traceId}:${context.spanId}:${choiceIndex}:${toolIndex}:${tool.name}:${hash(tool.arguments)}`,
          ).slice(0, 24)}`;
          tool.synthetic = true;
        }
        const toolPrefix = `neatlogs.llm.tool_calls.${flattenedToolIndex}`;
        span.setAttribute(`${toolPrefix}.id`, tool.id);
        if (tool.type) span.setAttribute(`${toolPrefix}.type`, tool.type);
        span.setAttribute(`${toolPrefix}.name`, tool.name);
        span.setAttribute(`${toolPrefix}.arguments`, tool.arguments);
        if (tool.details)
          span.setAttribute(`${toolPrefix}.details`, tool.details);
        span.setAttribute(`${toolPrefix}.choice_index`, choiceIndex);
        span.setAttribute(`${toolPrefix}.tool_call_index`, toolIndex);
        if (tool.synthetic)
          span.setAttribute(`${toolPrefix}.id_synthetic`, true);
        flattenedToolIndex += 1;
      }
    }
    if (this.model) span.setAttribute("neatlogs.llm.model_name", this.model);
    if (this.responseId)
      span.setAttribute("neatlogs.llm.response_id", this.responseId);
    this.applyUsage(span);
    span.setAttribute("neatlogs.capture_fidelity", this.captureFidelity);
    if (this.chunkCount > 0) {
      span.setAttribute("neatlogs.stream.chunk_count", this.chunkCount);
      if (this.chunkCount > MAX_SEMANTIC_STREAM_EVENTS) {
        span.setAttribute(
          "neatlogs.stream.events_dropped",
          this.chunkCount - MAX_SEMANTIC_STREAM_EVENTS,
        );
      }
    }
  }

  finish(span: Span, interrupted = false): void {
    if (this.finalized) return;
    this.finalized = true;
    this.apply(span);
    if (interrupted) {
      span.setAttribute("neatlogs.stream.cancelled", true);
      span.setStatus({ code: SpanStatusCode.UNSET });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
  }

  fail(span: Span, error: unknown): void {
    if (this.finalized) return;
    this.finalized = true;
    this.apply(span);
    if ((error as any)?.name === "AbortError") {
      span.setAttribute("neatlogs.stream.cancelled", true);
      span.setStatus({ code: SpanStatusCode.UNSET });
    } else {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      if (error instanceof Error) span.recordException(error);
    }
    span.end();
  }

  private choice(index: number): ChoiceState {
    let choice = this.choices.get(index);
    if (!choice) {
      choice = {
        role: "assistant",
        content: [],
        reasoning: [],
        mediaValues: [],
        finishReason: null,
        toolCalls: new Map(),
      };
      this.choices.set(index, choice);
    }
    return choice;
  }

  private addToolFragments(choiceIndex: number, fragments: any): void {
    if (!Array.isArray(fragments)) return;
    for (let position = 0; position < fragments.length; position += 1) {
      const fragment = fragments[position];
      const index = Number.isInteger(fragment?.index)
        ? fragment.index
        : position;
      const tools = this.choice(choiceIndex).toolCalls;
      let tool = tools.get(index);
      if (!tool) {
        tool = {
          id: "",
          name: "",
          arguments: "",
          type: "",
          details: "",
          synthetic: false,
        };
        tools.set(index, tool);
      }
      if (fragment?.id) tool.id = String(fragment.id);
      if (fragment?.type) tool.type = String(fragment.type);
      if (fragment?.function?.name) tool.name = String(fragment.function.name);
      if (fragment?.function?.arguments != null) {
        tool.arguments += stringify(fragment.function.arguments);
      }
      if (fragment && !fragment.function) tool.details = stringify(fragment);
    }
  }

  private captureEnvelope(value: any): void {
    if (value?.usage) this.usage = value.usage;
    if (value?.model) this.model = String(value.model);
    if (value?.id) this.responseId = String(value.id);
  }

  private applyUsage(span: Span): void {
    const usage = this.usage;
    if (!usage) return;
    span.setAttribute("neatlogs.llm.usage", stringify(usage));
    if (usage.prompt_tokens != null)
      span.setAttribute("neatlogs.llm.token_count.prompt", usage.prompt_tokens);
    if (usage.completion_tokens != null)
      span.setAttribute(
        "neatlogs.llm.token_count.completion",
        usage.completion_tokens,
      );
    if (usage.total_tokens != null)
      span.setAttribute("neatlogs.llm.token_count.total", usage.total_tokens);
    if (usage.prompt_tokens_details?.cached_tokens != null) {
      span.setAttribute(
        "neatlogs.llm.token_count.cache_read",
        usage.prompt_tokens_details.cached_tokens,
      );
    }
    if (usage.completion_tokens_details?.reasoning_tokens != null) {
      span.setAttribute(
        "neatlogs.llm.token_count.reasoning",
        usage.completion_tokens_details.reasoning_tokens,
      );
    }
  }
}
