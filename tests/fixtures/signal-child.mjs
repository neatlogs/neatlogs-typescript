import { init } from '../../dist/index.mjs';

async function main() {
  const mode = process.argv[2];
  let hostCalls = 0;

  if (mode === 'host' || mode === 'host-once' || mode === 'host-once-removed') {
    const hostHandler = () => {
      hostCalls += 1;
      process.stdout.write(`host:${hostCalls}\n`);
    };
    if (mode === 'host-once-removed') {
      process.once('SIGTERM', hostHandler);
      process.removeListener('SIGTERM', hostHandler);
    } else {
      const register = mode === 'host-once' ? process.once.bind(process) : process.on.bind(process);
      register('SIGTERM', hostHandler);
    }
  }

  await init({
    apiKey: 'unused',
    disableExport: true,
    registerShutdownHandlers: true,
  });

  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 10);

  if (mode === 'host' || mode === 'host-once') {
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
