import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Neatlogs } from "../../src/browser.js";

// Capture fetch calls without hitting the network.
let calls: Array<{ url: string; init: any }>;

beforeEach(() => {
  calls = [];
  // @ts-expect-error - install a fake fetch
  globalThis.fetch = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, trace_id: "abc123", spans: 1 }),
      text: async () => "",
    } as any;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function bodyOf(i = 0): any {
  return JSON.parse(calls[i].init.body);
}

describe("Neatlogs browser SDK — construction", () => {
  it("requires an apiKey", () => {
    // @ts-expect-error intentionally missing
    expect(() => new Neatlogs({})).toThrow(/apiKey/);
  });

  it("defaults the endpoint to staging and posts to /v1/trace with bearer auth", async () => {
    const nl = new Neatlogs({ apiKey: "nl_test" });
    await nl.trackAI({ name: "chat", input: "hi", output: "yo" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://staging-cloud.neatlogs.com/v1/trace");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer nl_test");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
  });

  it("honors a custom endpoint (using its origin)", async () => {
    const nl = new Neatlogs({ apiKey: "k", endpoint: "http://localhost:4100/v1/traces" });
    await nl.trackAI({ name: "x" });
    expect(calls[0].url).toBe("http://localhost:4100/v1/trace");
  });
});

describe("Neatlogs browser SDK — trackAI", () => {
  it("sends a one-span trace with kind LLM by default + model/tokens", async () => {
    const nl = new Neatlogs({ apiKey: "k" });
    const res = await nl.trackAI({
      name: "chat",
      model: "gpt-4o",
      input: "q",
      output: "a",
      tokens: { prompt: 10, completion: 5 },
    });
    const body = bodyOf();
    expect(body.name).toBe("chat");
    expect(body.kind).toBe("LLM");
    expect(body.model).toBe("gpt-4o");
    expect(body.tokens).toEqual({ prompt: 10, completion: 5 });
    expect(res).toEqual({ ok: true, trace_id: "abc123", spans: 1 });
  });
});

describe("Neatlogs browser SDK — trace (nested)", () => {
  it("sends the full nested tree verbatim (backend builds the hierarchy)", async () => {
    const nl = new Neatlogs({ apiKey: "k" });
    await nl.trace({
      name: "support-chat",
      children: [
        { name: "retrieve", query: "reset", documents: ["d1"] },
        { name: "answer", model: "gpt-4o", input: "ctx", output: "ans" },
      ],
    });
    const body = bodyOf();
    expect(body.name).toBe("support-chat");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("retrieve");
    expect(body.children[1].model).toBe("gpt-4o");
  });
});

describe("Neatlogs browser SDK — project (for write keys)", () => {
  it("injects the configured project into the trace root", async () => {
    const nl = new Neatlogs({ apiKey: "nlw_test", project: "My App" });
    await nl.trackAI({ name: "chat", input: "hi", output: "yo" });
    expect(bodyOf().project).toBe("My App");
  });

  it("a project on the call wins over the constructor default", async () => {
    const nl = new Neatlogs({ apiKey: "nlw_test", project: "Default" });
    await nl.trace({ name: "t", project: "Override" } as any);
    expect(bodyOf().project).toBe("Override");
  });

  it("omits project when none configured (full project key case)", async () => {
    const nl = new Neatlogs({ apiKey: "proj_key" });
    await nl.trackAI({ name: "chat" });
    expect(bodyOf().project).toBeUndefined();
  });
});

describe("Neatlogs browser SDK — canonical attributes + kinds", () => {
  it("forwards arbitrary canonical neatlogs.* attributes on trackAI", async () => {
    const nl = new Neatlogs({ apiKey: "k" });
    await nl.trackAI({
      name: "gen",
      model: "gpt-4o",
      attributes: {
        "neatlogs.llm.temperature": 0.7,
        "neatlogs.llm.top_p": 0.9,
      },
    });
    const body = bodyOf();
    expect(body.attributes["neatlogs.llm.temperature"]).toBe(0.7);
    expect(body.attributes["neatlogs.llm.top_p"]).toBe(0.9);
  });

  it("supports all kinds incl. VECTOR_STORE / EVALUATOR / HTTP via trace()", async () => {
    const nl = new Neatlogs({ apiKey: "k" });
    await nl.trace({
      name: "root",
      children: [
        { name: "vs", kind: "VECTOR_STORE", input: "q" },
        { name: "ev", kind: "EVALUATOR", attributes: { "neatlogs.evaluator.input": "x" } },
        { name: "h", kind: "HTTP", input: "GET /x" },
      ],
    });
    const body = bodyOf();
    expect(body.children.map((c: any) => c.kind)).toEqual(["VECTOR_STORE", "EVALUATOR", "HTTP"]);
  });
});

describe("Neatlogs browser SDK — startTrace/finish (streaming)", () => {
  it("sends nothing until finish(), then posts merged input+output with timestamps", async () => {
    const nl = new Neatlogs({ apiKey: "k" });
    const t = nl.startTrace({ name: "chat", model: "gpt-4o", input: "q" });
    expect(calls).toHaveLength(0); // nothing sent yet
    await t.finish({ output: "final answer", tokens: { prompt: 3, completion: 9 } });
    expect(calls).toHaveLength(1);
    const body = bodyOf();
    expect(body.name).toBe("chat");
    expect(body.input).toBe("q");
    expect(body.output).toBe("final answer");
    expect(body.kind).toBe("LLM");
    expect(typeof body.start).toBe("string");
    expect(typeof body.end).toBe("string");
  });
});

describe("Neatlogs browser SDK — resilience", () => {
  it("never throws on a transport error; routes to onError and returns ok:false", async () => {
    const onError = vi.fn();
    // @ts-expect-error force a rejection
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const nl = new Neatlogs({ apiKey: "k", onError });
    const res = await nl.trackAI({ name: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/network down/);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("enabled:false validates but sends nothing", async () => {
    const nl = new Neatlogs({ apiKey: "k", enabled: false });
    const res = await nl.trackAI({ name: "x" });
    expect(res).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });
});
