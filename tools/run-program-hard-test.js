#!/usr/bin/env node
// Runs one high-handler integration suite in hard mode (against a running
// MCP server over HTTP or SSE):
//
//   node tools/run-program-hard-test.js [--transport=http|sse] [--http-url=…]
//     [--sse-url=…] [--env-path=…] [--suffix=…]
//     [--file=src/__tests__/integration/high/<area>/<Suite>.test.ts]
//
// `--file` names the suite's source; it must be an existing file under
// `src/__tests__/integration/high/` (default: the program suite). The run is
// `npm run test:high -- <file>`, a live npm script.

const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const HIGH = path.join(REPO, 'src', '__tests__', 'integration', 'high');

function parseArgs(argv) {
  const args = {
    transport: 'http',
    httpUrl: 'http://127.0.0.1:3000/mcp/stream/http',
    sseUrl: 'http://127.0.0.1:3001/sse',
    envPath: '',
    suffix: '',
    file: 'src/__tests__/integration/high/program/ProgramHighHandlers.test.ts',
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
    else if (key === 'file' && value) args.file = value;
  }

  return args;
}

/** `file` as a path under the high suites, or the run is refused. */
function highSuite(file) {
  const absolute = path.resolve(REPO, file);
  const rel = path.relative(HIGH, absolute);
  if (
    rel === '' ||
    rel.startsWith('..') ||
    path.isAbsolute(rel) ||
    !absolute.endsWith('.test.ts') ||
    !existsSync(absolute) ||
    !statSync(absolute).isFile()
  ) {
    console.error(
      `run-program-hard-test: --file must name an existing .test.ts under src/__tests__/integration/high/: ${file}`,
    );
    process.exit(1);
  }
  return path.relative(REPO, absolute).split(path.sep).join('/');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = highSuite(args.file);
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

  const result = spawnSync(npmCmd, ['run', 'test:high', '--', file], {
    cwd: REPO,
    stdio: 'inherit',
    env,
    shell: false,
  });

  process.exit(result.status == null ? 1 : result.status);
}

main();
