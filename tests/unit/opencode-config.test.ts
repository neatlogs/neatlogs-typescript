import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/opencode-plugin.ts'),
  'utf8',
);

describe('OpenCode capture configuration', () => {
  it('does not expose content or workflow environment toggles', () => {
    expect(source).not.toContain('NEATLOGS_CAPTURE_SYSTEM_PROMPT');
    expect(source).not.toContain('NEATLOGS_WORKFLOW_NAME');
    expect(source).toContain("const workflowName = 'opencode';");
  });

  it('captures system prompts without an opt-in guard', () => {
    const hook = source.slice(source.indexOf("'experimental.chat.system.transform'"));
    expect(hook).toContain('stateFor(sessionID).systemPrompt = joined');
    expect(hook).not.toContain('captureSystemPrompt');
  });
});
