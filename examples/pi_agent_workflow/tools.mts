import type { AgentHarnessTool, AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { Type, createModels } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';

export const models = createModels();
models.setProvider(openaiProvider());

const resolvedModel = models.getModel('openai', 'gpt-4o-mini');
if (!resolvedModel) throw new Error('Pi model catalog does not contain openai/gpt-4o-mini');
export const model = resolvedModel;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const citySchema = Type.Object({ city: Type.String({ description: 'City name' }) });

function result(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return { content: [{ type: 'text', text }], details };
}

export const getWeather = {
  name: 'get_weather',
  label: 'Get weather',
  description: 'Return the current weather for a city.',
  parameters: citySchema,
  prepareArguments(value: unknown) {
    const candidate = value as { city?: unknown; location?: unknown };
    return { city: String(candidate?.city ?? candidate?.location ?? 'unknown') };
  },
  async execute(_id: string, params: { city: string }) {
    await sleep(100);
    return result(`19C with light rain in ${params.city}.`, { city: params.city, tempC: 19 });
  },
} as AgentTool<typeof citySchema>;

export const getAirQuality = {
  name: 'get_air_quality',
  label: 'Get air quality',
  description: 'Return the air-quality index for a city.',
  parameters: citySchema,
  executionMode: 'sequential',
  async execute(_id: string, params: { city: string }) {
    await sleep(120);
    return result(`AQI 42 in ${params.city}.`, { city: params.city, aqi: 42 });
  },
} as AgentTool<typeof citySchema>;

export const slowIncidentLookup = {
  name: 'slow_incident_lookup',
  label: 'Look up incident',
  description: 'Look up an incident and stream progress updates.',
  parameters: Type.Object({ incidentId: Type.String() }),
  async execute(
    _id: string,
    params: { incidentId: string },
    signal?: AbortSignal,
    onUpdate?: (partial: AgentToolResult<Record<string, unknown>>) => void,
  ) {
    for (let step = 1; step <= 4; step += 1) {
      if (signal?.aborted) throw new Error('incident lookup aborted');
      await sleep(150);
      onUpdate?.(result(`lookup step ${step}/4`, { step }));
    }
    return result(`Incident ${params.incidentId} is mitigated.`, {
      incidentId: params.incidentId,
      status: 'mitigated',
    });
  },
} as AgentTool;

export const failingTool = {
  name: 'failing_tool',
  label: 'Fail intentionally',
  description: 'Fail intentionally when error handling is being verified.',
  parameters: Type.Object({ reason: Type.String() }),
  async execute() {
    throw new Error('intentional tool failure');
  },
} as AgentTool;

export const allTools = [getWeather, getAirQuality, slowIncidentLookup, failingTool];

// AgentHarness adds an application context as the final execute argument. The
// same tool definitions are compatible; this cast only widens that signature.
export const harnessTools = allTools as unknown as AgentHarnessTool<undefined>[];

export function userMessage(text: string) {
  return { role: 'user' as const, content: [{ type: 'text' as const, text }], timestamp: Date.now() };
}
