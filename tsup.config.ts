import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/ai-sdk.ts', 'src/openai.ts', 'src/anthropic.ts', 'src/langchain.ts', 'src/strands.ts', 'src/openai-agents.ts', 'src/mastra-wrap.ts', 'src/pi-agent.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.mjs',
    };
  },
});
