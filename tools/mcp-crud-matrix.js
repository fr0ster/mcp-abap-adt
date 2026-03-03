#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

function parseArgs(argv) {
  const args = {
    config: 'tests/test-config.yaml',
    suite: 'create_program',
    caseName: '',
    includeDisabled: false,
    failFast: false,
    suffix: '',
    httpUrl: 'http://127.0.0.1:3000/mcp/stream/http',
    sseUrl: 'http://127.0.0.1:3001/sse',
    protocol: '',
    protocols: [],
  };

  for (const item of argv) {
    if (item === '--include-disabled') {
      args.includeDisabled = true;
      continue;
    }
    if (item === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (!item.startsWith('--')) continue;
    const idx = item.indexOf('=');
    const key = idx >= 0 ? item.slice(2, idx) : item.slice(2);
    const value = idx >= 0 ? item.slice(idx + 1) : '';

    if (key === 'config' && value) args.config = value;
    else if (key === 'suite' && value) args.suite = value;
    else if (key === 'case' && value) args.caseName = value;
    else if (key === 'suffix' && value) args.suffix = value;
    else if (key === 'http-url' && value) args.httpUrl = value;
    else if (key === 'sse-url' && value) args.sseUrl = value;
    else if (key === 'protocol' && value) args.protocol = value.toLowerCase();
    else if (key === 'protocols' && value) {
      args.protocols = value
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  return args;
}

function runOne(protocol, args) {
  const smokeScript = path.resolve(process.cwd(), 'tools/mcp-crud-smoke.js');
  const cmdArgs = [
    smokeScript,
    `--transport=${protocol}`,
    `--config=${args.config}`,
    `--suite=${args.suite}`,
  ];

  if (args.caseName) cmdArgs.push(`--case=${args.caseName}`);
  if (args.includeDisabled) cmdArgs.push('--include-disabled');
  if (args.failFast) cmdArgs.push('--fail-fast');
  if (args.suffix) cmdArgs.push(`--suffix=${args.suffix}_${protocol.toUpperCase()}`);

  if (protocol === 'http') cmdArgs.push(`--url=${args.httpUrl}`);
  if (protocol === 'sse') cmdArgs.push(`--url=${args.sseUrl}`);

  console.log(`\n=== ${protocol.toUpperCase()} ===`);
  console.log(`node ${cmdArgs.join(' ')}`);
  const result = spawnSync('node', cmdArgs, {
    stdio: 'inherit',
    shell: false,
  });
  return result.status === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let yamlTransport = 'http';
  const configPath = path.resolve(process.cwd(), args.config);
  if (fs.existsSync(configPath)) {
    try {
      const cfg = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
      const hard =
        cfg?.environment?.integration_hard_mode ||
        cfg?.integration_hard_mode ||
        {};
      if (hard.transport) {
        yamlTransport = String(hard.transport).toLowerCase();
      }
      if (hard.http_url && args.httpUrl === 'http://127.0.0.1:3000/mcp/stream/http') {
        args.httpUrl = String(hard.http_url);
      }
      if (hard.sse_url && args.sseUrl === 'http://127.0.0.1:3001/sse') {
        args.sseUrl = String(hard.sse_url);
      }
    } catch {
      // ignore YAML parse issues; runner will use CLI defaults
    }
  }

  const supported = new Set(['http', 'sse', 'stdio']);

  let protocols = args.protocols.filter((p) => supported.has(p));
  if (protocols.length === 0) {
    const selected = args.protocol || yamlTransport || 'http';
    protocols = [selected].filter((p) => supported.has(p));
  }

  if (protocols.length === 0) {
    console.error(
      'No valid protocol selected. Use --protocol=http|sse|stdio or set environment.integration_hard_mode.transport',
    );
    process.exit(2);
  }

  const summary = [];
  for (const protocol of protocols) {
    const ok = runOne(protocol, args);
    summary.push({ protocol, ok });
    if (!ok && args.failFast) break;
  }

  console.log('\n=== SUMMARY ===');
  let failed = 0;
  for (const row of summary) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.protocol.toUpperCase()}`);
    if (!row.ok) failed++;
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();
