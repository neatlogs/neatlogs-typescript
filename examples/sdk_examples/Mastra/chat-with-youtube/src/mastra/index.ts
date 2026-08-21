import { init, getMastraObservability } from 'neatlogs';

await init({
  apiKey: process.env.NEATLOGS_API_KEY ?? '',
  endpoint: "http://localhost:4100",
  workflowName: 'chat-with-youtube',
  debug: true,
});

import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { youtubeAgent } from './agents/youtube-agent';

export const mastra = new Mastra({
  agents: { youtubeAgent },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: await getMastraObservability(),
});
