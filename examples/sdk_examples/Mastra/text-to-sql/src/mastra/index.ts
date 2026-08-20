import { init, getMastraObservability } from 'neatlogs';

await init({
  apiKey: process.env.NEATLOGS_API_KEY ?? '',
  endpoint: "http://localhost:4100",
  workflowName: 'text-to-sql',
  debug: true,
});

import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { sqlAgent } from './agents/sql-agent';

export const mastra = new Mastra({
  agents: { sqlAgent },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra Text-to-SQL',
    level: 'info',
  }),
  observability: await getMastraObservability(),
});
