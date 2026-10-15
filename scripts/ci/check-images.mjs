#!/usr/bin/env node
// Builds the Docker image of each server variant from the checkout's `npm pack`
// tarballs and checks it — in CI (ci.yml, release.yml) and by hand:
//
//   npm pack --pack-destination <dir> . ./background-runs-memory ./responsible-rules … (every package)
//   node scripts/ci/check-images.mjs --tarballs <dir> [--tag <tag>] [--keep-images] [variant …]
//
// Every image: its binary answers --version with its package's version (this
// checkout's). stdio images: a tools/list over stdin (`docker run -i`) answers.
// Streamable HTTP and SSE images: /mcp/health answers 200 and the image's own
// HEALTHCHECK passes; a tools/list and a tools/call with x-sap-* basic
// credentials answer, and the call reaches an ADT stand-in
// (scripts/ci/adt-stand-in.mjs) with exactly that credential. A -ro image
// lists no write tool, and its write sibling does (the rule bites).
//
// Images are tagged mcp-abap-adt-test/<variant>:<tag> (tag `check` unless
// given) and removed at the end unless --keep-images; every container and the
// network the checks start are removed whatever happens. Docker is driven
// through its CLI; nothing is published.
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** variant → the checkout directory of its package, its transport. */
const VARIANTS = {
  core: { dir: 'server', transport: 'stdio' },
  compact: { dir: 'compact', transport: 'stdio' },
  'core-ro': { dir: 'core-ro', transport: 'stdio' },
  'compact-ro': { dir: 'compact-ro', transport: 'stdio' },
  http: { dir: 'http', transport: 'http' },
  'compact-http': { dir: 'compact-http', transport: 'http' },
  'http-ro': { dir: 'http-ro', transport: 'http' },
  'compact-http-ro': { dir: 'compact-http-ro', transport: 'http' },
  sse: { dir: 'sse', transport: 'sse' },
  'compact-sse': { dir: 'compact-sse', transport: 'sse' },
  'sse-ro': { dir: 'sse-ro', transport: 'sse' },
  'compact-sse-ro': { dir: 'compact-sse-ro', transport: 'sse' },
};

// ---- arguments ----
let tarballs;
let tag = 'check';
let keepImages = false;
const chosen = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--tarballs') tarballs = argv[++i];
  else if (arg === '--tag') tag = argv[++i];
  else if (arg === '--keep-images') keepImages = true;
  else if (Object.hasOwn(VARIANTS, arg)) chosen.push(arg);
  else {
    console.error(`unknown argument ${arg}; variants: ${Object.keys(VARIANTS).join(', ')}`);
    process.exit(2);
  }
}
if (tarballs === undefined || !fs.existsSync(tarballs)) {
  console.error('--tarballs <directory of the npm pack tarballs> is required');
  process.exit(2);
}
tarballs = path.resolve(tarballs);
const variants = chosen.length > 0 ? chosen : Object.keys(VARIANTS);

// ---- docker ----
const docker = (args, options = {}) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const containers = new Set();
const network = `mcp-abap-adt-check-${process.pid}`;
let networkMade = false;

function cleanup() {
  for (const name of containers) {
    try {
      docker(['rm', '-f', name]);
    } catch {}
  }
  containers.clear();
  if (networkMade) {
    try {
      docker(['network', 'rm', network]);
    } catch {}
    networkMade = false;
  }
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

// ---- checks ----
let failed = 0;
const results = [];
function check(variant, label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${variant}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
  results.push({ variant, label, ok });
}

/** Writes tools: change an object, a transport or a variable (the -ro sets serve none). */
const WRITE_VERBS = ['Create', 'Update', 'Delete', 'Activate', 'Lock', 'Unlock', 'Add', 'Remove', 'Move', 'SortAndCompress'];
function isWriteTool(name) {
  let rest = name.startsWith('Handler') ? name.slice('Handler'.length) : name;
  if (rest.startsWith('Transport')) rest = rest.slice('Transport'.length);
  return WRITE_VERBS.some((verb) => rest.startsWith(verb)) || rest === 'DebugSetVariable';
}

function checkToolList(variant, names) {
  check(variant, 'tools/list answers', names.length > 0, `${names.length} tools`);
  const writes = names.filter(isWriteTool);
  if (variant.endsWith('-ro')) check(variant, 'lists no write tool', writes.length === 0, writes.join(' '));
  else check(variant, 'lists write tools (the -ro check bites)', writes.length > 0, `${writes.length}`);
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'image-check', version: '0' } },
};
const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
const toolsList = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
const callOf = (variant) => ({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: variant.startsWith('compact')
    ? { name: 'HandlerSearch', arguments: { query: 'ZIMAGE_CHECK*' } }
    : { name: 'SearchObject', arguments: { object_name: 'ZIMAGE_CHECK*' } },
});
const USER = 'IMAGE_CHECK';
const PASSWORD = 'image-check-password';
const BASIC = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

/** stdio: initialize, then tools/list, over `docker run -i`. */
function stdioToolList(image, name) {
  return new Promise((resolve, reject) => {
    containers.add(name);
    const child = spawn('docker', ['run', '-i', '--rm', '--name', name, '-e', 'SAP_SYSTEM_TYPE=onprem', image], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no tools/list answer in 60 s; stderr: ${err.slice(-400)}`));
    }, 60_000);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      for (let at = out.indexOf('\n'); at >= 0; at = out.indexOf('\n')) {
        const line = out.slice(0, at);
        out = out.slice(at + 1);
        if (line.trim() === '') continue;
        const message = JSON.parse(line);
        if (message.id === 1) {
          child.stdin.write(`${JSON.stringify(initialized)}\n${JSON.stringify(toolsList)}\n`);
        } else if (message.id === 2) {
          clearTimeout(timer);
          child.stdin.end();
          resolve(message.result.tools.map((tool) => tool.name));
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('error', reject);
    child.stdin.write(`${JSON.stringify(initialize)}\n`);
  });
}

/** The JSON-RPC message of `id` in a response: JSON, or an SSE stream of them. */
async function rpcAnswer(res, id) {
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const message = JSON.parse(line.slice('data:'.length).trim());
      if (message.id === id) return message;
    }
    throw new Error(`no answer to ${id} in the stream`);
  }
  return JSON.parse(text);
}

/** Reads `event: <name>` blocks of an SSE stream. */
function eventReader(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return async () => {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
          else if (line.startsWith('data:')) data += line.slice('data:'.length).trim();
        }
        return { event, data };
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('the SSE stream ended');
      buffer += decoder.decode(value, { stream: true }).split('\r').join('');
    }
  };
}

async function untilHealthy(url) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return res.status;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function publishedPort(name, port) {
  const line = docker(['port', name, `${port}/tcp`]).split('\n')[0];
  return Number(line.slice(line.lastIndexOf(':') + 1));
}

/** Streamable HTTP and SSE: health, the image's HEALTHCHECK, tools/list and a call against the stand-in. */
async function checkListener(variant, image, transport) {
  if (!networkMade) {
    docker(['network', 'create', network]);
    networkMade = true;
  }
  const adt = `${network}-adt-${variant}`;
  const server = `${network}-${variant}`;
  containers.add(adt);
  docker([
    'run', '-d', '--rm', '--name', adt, '--network', network, '-p', '127.0.0.1::8080',
    '-v', `${path.join(repo, 'scripts/ci/adt-stand-in.mjs')}:/stand-in.mjs:ro`,
    '--entrypoint', 'node', image, '/stand-in.mjs', '8080',
  ]);
  const inner = transport === 'http' ? 3000 : 3001;
  containers.add(server);
  docker([
    'run', '-d', '--rm', '--name', server, '--network', network, '-e', 'SAP_SYSTEM_TYPE=onprem',
    '-p', `127.0.0.1::${inner}`, image,
  ]);
  const base = `http://127.0.0.1:${publishedPort(server, inner)}`;
  const adtBase = `http://127.0.0.1:${publishedPort(adt, 8080)}`;

  check(variant, `/mcp/health on ${inner} answers 200`, (await untilHealthy(`${base}/mcp/health`)) === 200);
  const test = JSON.parse(docker(['image', 'inspect', '--format', '{{json .Config.Healthcheck.Test}}', image]));
  let healthy = false;
  try {
    if (test?.[0] === 'CMD') {
      docker(['exec', server, ...test.slice(1)]);
      healthy = true;
    }
  } catch {}
  check(variant, "the image's HEALTHCHECK passes", healthy, JSON.stringify(test?.[0]));

  await untilHealthy(`${adtBase}/__requests`);
  const headers = {
    'x-sap-url': `http://${adt}:8080`,
    'x-sap-client': '100',
    'x-sap-login': USER,
    'x-sap-password': PASSWORD,
  };
  let list;
  let call;
  if (transport === 'http') {
    const post = (body) =>
      fetch(`${base}/mcp/stream/http`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    list = await rpcAnswer(await post(toolsList), 2);
    const res = await post(callOf(variant));
    check(variant, 'tools/call with x-sap-* answers 200', res.status === 200, `${res.status}`);
    call = await rpcAnswer(res, 3);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(`${base}/sse`, { headers, signal: controller.signal });
      check(variant, 'GET /sse with x-sap-* opens the stream', res.status === 200, `${res.status}`);
      const next = eventReader(res.body);
      let opened = await next();
      while (opened.event !== 'endpoint') opened = await next();
      const endpoint = new URL(opened.data, base);
      const answers = new Map();
      const answer = async (id) => {
        while (!answers.has(id)) {
          const { event, data } = await next();
          if (event !== 'message') continue;
          const message = JSON.parse(data);
          if (message.id !== undefined) answers.set(message.id, message);
        }
        return answers.get(id);
      };
      const post = (body) =>
        fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await post(initialize);
      await answer(1);
      await post(initialized);
      await post(toolsList);
      list = await answer(2);
      const accepted = await post(callOf(variant));
      check(variant, 'tools/call is accepted (202)', accepted.status === 202, `${accepted.status}`);
      call = await answer(3);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  checkToolList(variant, (list?.result?.tools ?? []).map((tool) => tool.name));
  check(variant, `tools/call ${callOf(variant).params.name} answers`, call?.result !== undefined, call?.error ? JSON.stringify(call.error) : undefined);
  const seen = await (await fetch(`${adtBase}/__requests`)).json();
  // Every ADT request carries the headers' credential, the search among them;
  // the logoff goes with the session cookie alone. No other credential at all.
  const adtRequests = seen.filter((request) => request.url.startsWith('/sap/bc/adt/'));
  check(
    variant,
    'the call reached the ADT stand-in with the x-sap-* credential',
    adtRequests.some((request) => request.url.startsWith('/sap/bc/adt/repository/informationsystem/search')) &&
      adtRequests.every((request) => request.authorization === BASIC) &&
      seen.every((request) => request.authorization === null || request.authorization === BASIC),
    seen
      .map((r) => `${r.method} ${r.url.split('?')[0]} ${r.authorization === BASIC ? 'basic' : r.authorization === null ? 'none' : 'OTHER'}`)
      .join(', '),
  );
  for (const name of [server, adt]) {
    docker(['rm', '-f', name]);
    containers.delete(name);
  }
}

const images = [];
try {
  for (const variant of variants) {
    const { dir, transport } = VARIANTS[variant];
    const version = JSON.parse(fs.readFileSync(path.join(repo, dir, 'package.json'), 'utf8')).version;
    const image = `mcp-abap-adt-test/${variant}:${tag}`;
    console.log(`\n== ${variant} (${transport}) → ${image}`);
    try {
      execFileSync(
        'docker',
        [
          'build', '--quiet', '--build-arg', `VARIANT=${variant}`, '--build-arg', 'PACKAGE_SOURCE=tarballs',
          '--build-context', `tarballs=${tarballs}`, '-t', image, path.join(repo, 'docker'),
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] },
      );
      images.push(image);
      check(variant, 'image builds from the tarballs', true);
    } catch {
      check(variant, 'image builds from the tarballs', false);
      continue;
    }
    try {
      const answered = docker(['run', '--rm', image, '--version']);
      check(variant, `--version answers ${version}`, answered === version, answered);
      if (transport === 'stdio') {
        checkToolList(variant, await stdioToolList(image, `${network}-${variant}`));
      } else {
        await checkListener(variant, image, transport);
      }
    } catch (error) {
      check(variant, 'the checks ran to their end', false, String(error?.message ?? error).split('\n')[0]);
    }
    cleanup();
  }
} finally {
  cleanup();
  if (!keepImages) {
    for (const image of images) {
      try {
        docker(['image', 'rm', image]);
      } catch {}
    }
  }
}

console.log('\n== summary');
for (const variant of variants) {
  const own = results.filter((result) => result.variant === variant);
  const bad = own.filter((result) => !result.ok);
  console.log(`${bad.length === 0 ? 'ok  ' : 'FAIL'} ${variant}: ${own.length - bad.length}/${own.length} checks${bad.length ? ` — failed: ${bad.map((r) => r.label).join('; ')}` : ''}`);
}
process.exit(failed === 0 ? 0 : 1);
