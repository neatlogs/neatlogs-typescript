import { init } from '../../dist/index.mjs';

async function main() {
  const mode = process.argv[2];
  let hostCalls = 0;

  if (mode === 'host') {
    process.on('SIGTERM', () => {
      hostCalls += 1;
      process.stdout.write(`host:${hostCalls}\n`);
    });
  }

  await init({
    apiKey: 'unused',
    disableExport: true,
    registerShutdownHandlers: true,
  });

  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 10);

  if (mode === 'host') {
    setTimeout(() => {
      process.stdout.write(`done:${hostCalls}\n`);
      process.exit(hostCalls === 1 ? 0 : 2);
    }, 250);
  } else {
    setTimeout(() => {
      process.stderr.write('process survived SDK-owned SIGTERM\n');
      process.exit(3);
    }, 2_000);
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
