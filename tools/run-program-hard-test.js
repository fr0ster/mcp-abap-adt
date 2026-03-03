#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {
    transport: 'http',
    httpUrl: 'http://127.0.0.1:3000/mcp/stream/http',
    sseUrl: 'http://127.0.0.1:3001/sse',
    envPath: '',
    suffix: '',
    pattern: 'integration/high/program/ProgramHighHandlers.test.ts',
  };

  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const idx = item.indexOf('=');
    const key = idx >= 0 ? item.slice(2, idx) : item.slice(2);
    const value = idx >= 0 ? item.slice(idx + 1) : '';

    if (key === 'transport' && value) args.transport = value.toLowerCase();
    else if (key === 'http-url' && value) args.httpUrl = value;
    else if (key === 'sse-url' && value) args.sseUrl = value;
    else if (key === 'env-path' && value) args.envPath = value;
    else if (key === 'suffix' && value) args.suffix = value;
    else if (key === 'pattern' && value) args.pattern = value;
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const env = {
    ...process.env,
    INTEGRATION_HARD_MODE: 'true',
    INTEGRATION_HARD_TRANSPORT: args.transport,
  };

  if (args.transport === 'http') {
    env.INTEGRATION_HARD_HTTP_URL = args.httpUrl;
  } else if (args.transport === 'sse') {
    env.INTEGRATION_HARD_SSE_URL = args.sseUrl;
  }
  if (args.envPath) {
    env.MCP_ENV_PATH = args.envPath;
  }
  if (args.suffix) {
    env.INTEGRATION_HARD_NAME_SUFFIX = args.suffix;
  }

  const jestArgs = ['test', '--', `--testPathPattern=${args.pattern}`];
  const result = spawnSync(npmCmd, jestArgs, {
    stdio: 'inherit',
    env,
    shell: false,
  });

  process.exit(result.status == null ? 1 : result.status);
}

main();
