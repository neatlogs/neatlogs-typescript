import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { createHash } from "node:crypto";
import { captureMediaWithIndex, sanitizeMediaPayload } from "./media.js";
import {
  DEFAULT_MAX_SEMANTIC_STREAM_EVENTS,
  DEFAULT_MAX_STREAM_CAPTURE_BYTES,
  DEFAULT_MAX_STREAM_CAPTURE_ITEMS,
  utf8ByteLength,
} from "../constants.js";

interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  type: string;
  details: string;
  synthetic: boolean;
  incomplete: boolean;
}

interface ChoiceState {
  role: string;
  content: string[];
  reasoning: string[];
  mediaCount: number;
  finishReason: string | null;
  toolCalls: Map<number, ToolCallState>;
}

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

/** Incremental OpenAI-compatible choice/tool-fragment accumulator. */
export class ChoiceAccumulator {
  private readonly choices = new Map<number, ChoiceState>();
  private usage: any = null;
  private model = "";
  private responseId = "";
  private chunkCount = 0;
  private finalized = false;
  private capturedBytes = 0;
  private capturedItems = 0;
  private droppedBytes = 0;
  private droppedItems = 0;
  private toolCallCount = 0;
  private readonly incompleteReasons = new Set<string>();

  constructor(
    private readonly captureFidelity:
      | "native"
      | "normalized"
      | "flattened"
      | "unknown" = "native",
  ) {}

  addResponse(response: any, span?: Span): void {
    this.captureEnvelope(response);
    for (
      let position = 0;
      position < (response?.choices?.length ?? 0);
      position += 1
    ) {
      const choice = response.choices[position];
      const index = Number.isInteger(choice?.index) ? choice.index : position;
      if (!this.canRetainChoice(index)) continue;
      const message = choice?.message ?? {};
      const state = this.choice(index);
      if (message.role && String(message.role) !== state.role) {
        this.retainString(String(message.role), (value) => (state.role = value));
      }
      if (message.content != null) {
        const captured = span
          ? captureMediaWithIndex(
              span,
              `neatlogs.llm.output_messages.${index}`,
              message.content,
              "output",
              state.mediaCount,
            )
          : {
              value: sanitizeMediaPayload(message.content, "output"),
              count: 0,
            };
        state.mediaCount += captured.count;
        this.retainString(stringify(captured.value), (value) => state.content.push(value));
      }
      if (message.reasoning_content != null) {
        this.retainString(stringify(message.reasoning_content), (value) =>
          state.reasoning.push(value),
        );
      }
      this.addToolFragments(index, message.tool_calls);
      if (choice?.finish_reason != null) {
        this.retainString(String(choice.finish_reason), (value) => (state.finishReason = value));
      }
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
      if (!this.canRetainChoice(index)) continue;
      const delta = choice?.delta ?? {};
      const state = this.choice(index);
      if (delta.role && String(delta.role) !== state.role) {
        this.retainString(String(delta.role), (value) => (state.role = value));
      }
      const captured =
        delta.content == null
          ? { value: "", count: 0 }
          : captureMediaWithIndex(
              span,
              `neatlogs.llm.output_messages.${index}`,
              delta.content,
              "output",
              state.mediaCount,
            );
      state.mediaCount += captured.count;
      const content = delta.content == null ? "" : stringify(captured.value);
      const reasoning =
        delta.reasoning_content == null
          ? ""
          : stringify(delta.reasoning_content);
      const contentBytes = content
        ? this.retainString(content, (value) => state.content.push(value))
        : 0;
      const reasoningBytes = reasoning
        ? this.retainString(reasoning, (value) => state.reasoning.push(value))
        : 0;
      this.addToolFragments(index, delta.tool_calls);
      if (choice?.finish_reason != null) {
        this.retainString(String(choice.finish_reason), (value) => (state.finishReason = value));
      }
      summary.push({
        choice_index: index,
        content_bytes: contentBytes,
        reasoning_bytes: reasoningBytes,
        tool_fragments: Array.isArray(delta.tool_calls)
          ? delta.tool_calls.length
          : 0,
        finish_reason: choice?.finish_reason ?? null,
      });
    }
    if (
      chunkIndex < DEFAULT_MAX_SEMANTIC_STREAM_EVENTS &&
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
      if (reasoning) span.setAttribute(`${prefix}.thinking`, reasoning);
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
        span.setAttribute(
          `${toolPrefix}.arguments`,
          tool.incomplete
            ? "[incomplete: stream capture limit reached]"
            : tool.arguments,
        );
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
    span.setAttribute(
      "neatlogs.capture_fidelity",
      this.incompleteReasons.size > 0 ? "truncated" : this.captureFidelity,
    );
    if (this.chunkCount > 0 || this.incompleteReasons.size > 0) {
      span.setAttribute("neatlogs.stream.capture_bytes", this.capturedBytes);
      span.setAttribute("neatlogs.stream.capture_items", this.capturedItems);
    }
    if (this.incompleteReasons.size > 0) {
      span.setAttribute("neatlogs.stream.incomplete", true);
      span.setAttribute(
        "neatlogs.stream.incomplete_reason",
        [...this.incompleteReasons].sort().join(","),
      );
      span.setAttribute("neatlogs.stream.dropped_bytes", this.droppedBytes);
      span.setAttribute("neatlogs.stream.dropped_bytes_is_lower_bound", true);
      span.setAttribute("neatlogs.stream.dropped_items", this.droppedItems);
    }
    if (this.chunkCount > 0) {
      span.setAttribute("neatlogs.stream.chunk_count", this.chunkCount);
      if (this.chunkCount > DEFAULT_MAX_SEMANTIC_STREAM_EVENTS) {
        span.setAttribute(
          "neatlogs.stream.events_dropped",
          this.chunkCount - DEFAULT_MAX_SEMANTIC_STREAM_EVENTS,
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

  private canRetainChoice(index: number): boolean {
    if (this.choices.has(index)) return true;
    if (this.choices.size < DEFAULT_MAX_STREAM_CAPTURE_ITEMS) return true;
    this.markDropped("item_limit_exceeded", 0);
    return false;
  }

  private retainString(value: string, retain: (value: string) => void): number {
    const remaining = Math.max(0, DEFAULT_MAX_STREAM_CAPTURE_BYTES - this.capturedBytes);
    const bytes = utf8ByteLength(value, remaining);
    if (this.capturedItems >= DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
      this.markDropped("item_limit_exceeded", bytes);
      return 0;
    }
    if (bytes > remaining) {
      this.markDropped("byte_limit_exceeded", bytes);
      return 0;
    }
    retain(value);
    this.capturedItems += 1;
    this.capturedBytes += bytes;
    return bytes;
  }

  private markDropped(reason: string, bytes: number): void {
    this.droppedItems += 1;
    this.droppedBytes += bytes;
    this.incompleteReasons.add(reason);
  }

  private choice(index: number): ChoiceState {
    let choice = this.choices.get(index);
    if (!choice) {
      choice = {
        role: "assistant",
        content: [],
        reasoning: [],
        mediaCount: 0,
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
        if (this.toolCallCount >= DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
          this.markDropped("item_limit_exceeded", 0);
          continue;
        }
        tool = {
          id: "",
          name: "",
          arguments: "",
          type: "",
          details: "",
          synthetic: false,
          incomplete: false,
        };
        tools.set(index, tool);
        this.toolCallCount += 1;
      }
      if (fragment?.id && String(fragment.id) !== tool.id) {
        this.retainString(String(fragment.id), (value) => (tool!.id = value));
      }
      if (fragment?.type && String(fragment.type) !== tool.type) {
        this.retainString(String(fragment.type), (value) => (tool!.type = value));
      }
      if (fragment?.function?.name && String(fragment.function.name) !== tool.name) {
        this.retainString(String(fragment.function.name), (value) => (tool!.name = value));
      }
      if (fragment?.function?.arguments != null) {
        const retained = this.retainString(
          stringify(fragment.function.arguments),
          (value) => (tool!.arguments += value),
        );
        if (retained === 0) tool.incomplete = true;
      }
      if (fragment && !fragment.function) {
        const retained = this.retainString(
          stringify(fragment),
          (value) => (tool!.details = value),
        );
        if (retained === 0) tool.incomplete = true;
      }
    }
  }

  private captureEnvelope(value: any): void {
    if (value?.usage) {
      const safeUsage = sanitizeMediaPayload(value.usage, "output");
      this.retainString(stringify(safeUsage), () => (this.usage = safeUsage));
    }
    if (value?.model && String(value.model) !== this.model) {
      this.retainString(String(value.model), (model) => (this.model = model));
    }
    if (value?.id && String(value.id) !== this.responseId) {
      this.retainString(String(value.id), (id) => (this.responseId = id));
    }
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
