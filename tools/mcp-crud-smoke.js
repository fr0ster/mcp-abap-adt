#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

function printHelp() {
  console.log(`
MCP CRUD smoke test runner (real MCP client over transport).

Usage:
  node tools/mcp-crud-smoke.js [options]

Options:
  --transport=<http|sse|stdio>   Transport type (default: http)
  --url=<url>                    MCP URL for http/sse
                                 defaults:
                                   http -> http://127.0.0.1:3000/mcp/stream/http
                                   sse  -> http://127.0.0.1:3001/sse
  --config=<path>                YAML config path (default: tests/test-config.yaml)
  --suite=<name>                 YAML suite name (default: create_program)
  --case=<name>                  Run only one test case from suite
  --include-disabled             Include disabled test cases
  --fail-fast                    Stop on first failed case
  --suffix=<text>                Suffix for object names to avoid collisions
  --delete-tool=<name>           Delete tool name (default: DeleteProgramLow)

Stdio options:
  --stdio-command=<cmd>          Command to spawn (default: node)
  --stdio-arg=<arg>              Repeat for each arg
                                 default args:
                                   dist/server/launcher.js
                                   --transport=stdio
                                   --env=.env
                                   --exposition=readonly,high,low

Examples:
  node tools/mcp-crud-smoke.js --transport=http
  node tools/mcp-crud-smoke.js --transport=sse --url=http://127.0.0.1:3001/sse
  node tools/mcp-crud-smoke.js --transport=stdio --suffix=SMOKE01
  node tools/mcp-crud-smoke.js --case=builder_program --fail-fast
`);
}

function parseArgs(argv) {
  const args = {
    transport: 'http',
    transportExplicit: false,
    url: '',
    urlExplicit: false,
    config: 'tests/test-config.yaml',
    suite: 'create_program',
    caseName: '',
    includeDisabled: false,
    failFast: false,
    suffix: '',
    deleteTool: 'DeleteProgramLow',
    stdioCommand: process.execPath,
    stdioCommandExplicit: false,
    stdioArgs: [],
    stdioArgsExplicit: false,
    help: false,
  };

  for (const item of argv) {
    if (item === '--help' || item === '-h') {
      args.help = true;
      continue;
    }
    if (item === '--include-disabled') {
      args.includeDisabled = true;
      continue;
    }
    if (item === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (!item.startsWith('--')) {
      continue;
    }
    const idx = item.indexOf('=');
    const key = idx >= 0 ? item.slice(2, idx) : item.slice(2);
    const value = idx >= 0 ? item.slice(idx + 1) : '';

    if (key === 'transport' && value) {
      args.transport = value;
      args.transportExplicit = true;
    } else if (key === 'url') {
      args.url = value;
      args.urlExplicit = true;
    }
    else if (key === 'config' && value) args.config = value;
    else if (key === 'suite' && value) args.suite = value;
    else if (key === 'case' && value) args.caseName = value;
    else if (key === 'suffix' && value) args.suffix = value;
    else if (key === 'delete-tool' && value) args.deleteTool = value;
    else if (key === 'stdio-command' && value) {
      args.stdioCommand = value;
      args.stdioCommandExplicit = true;
    } else if (key === 'stdio-arg') {
      args.stdioArgs.push(value);
      args.stdioArgsExplicit = true;
    }
  }

  return args;
}

function resolveTransportRequest(params, config) {
  const hasOwn = Object.prototype.hasOwnProperty.call(params, 'transport_request');
  if (hasOwn) {
    const raw = params.transport_request;
    const value = raw === undefined || raw === null ? '' : String(raw).trim();
    return value.length > 0 ? value : undefined;
  }
  const def = config?.environment?.default_transport;
  if (!def) return undefined;
  const normalized = String(def).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolvePackageName(params, config) {
  const own = params.package_name;
  if (own !== undefined && own !== null && String(own).trim()) {
    return String(own).trim();
  }
  const def = config?.environment?.default_package;
  if (!def || !String(def).trim()) {
    throw new Error('package_name missing and environment.default_package is not set');
  }
  return String(def).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceProgramNameInSource(sourceCode, oldName, newName) {
  if (!sourceCode || oldName === newName) return sourceCode;
  let updated = String(sourceCode);
  const variants = [
    [oldName, newName],
    [oldName.toUpperCase(), newName.toUpperCase()],
    [oldName.toLowerCase(), newName.toLowerCase()],
  ];
  for (const [from, to] of variants) {
    updated = updated.replace(new RegExp(escapeRegExp(from), 'g'), to);
  }
  return updated;
}

function withSuffix(name, suffix, maxLen = 30) {
  if (!suffix) return name.toUpperCase();
  const base = name.toUpperCase();
  const normalizedSuffix = suffix.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  let result = `${base}_${normalizedSuffix}`;
  if (result.length <= maxLen) return result;
  const prefixMax = maxLen - normalizedSuffix.length - 1;
  if (prefixMax > 0) {
    result = `${base.slice(0, prefixMax)}_${normalizedSuffix}`;
  }
  return result.slice(0, maxLen);
}

function normalizeProgramType(value) {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;
  const map = {
    '1': 'executable',
    i: 'include',
    m: 'module_pool',
    f: 'function_group',
    k: 'class_pool',
    j: 'interface_pool',
  };
  if (map[raw]) return map[raw];
  const allowed = new Set([
    'executable',
    'include',
    'module_pool',
    'function_group',
    'class_pool',
    'interface_pool',
  ]);
  return allowed.has(raw) ? raw : undefined;
}

function extractText(result) {
  const parts = [];
  for (const item of result?.content || []) {
    if (typeof item?.text === 'string') parts.push(item.text);
  }
  return parts.join('\n').trim();
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result?.isError) {
    const text = extractText(result) || `Tool ${name} returned error`;
    throw new Error(text);
  }
  return result;
}

async function createTransport(args) {
  const transportType = String(args.transport || 'http').toLowerCase();
  if (transportType === 'http' || transportType === 'streamable-http') {
    const url =
      args.url && args.url.trim()
        ? args.url.trim()
        : 'http://127.0.0.1:3000/mcp/stream/http';
    return new StreamableHTTPClientTransport(new URL(url));
  }
  if (transportType === 'sse') {
    const url =
      args.url && args.url.trim() ? args.url.trim() : 'http://127.0.0.1:3001/sse';
    return new SSEClientTransport(new URL(url));
  }
  if (transportType === 'stdio') {
    const stdioArgs =
      args.stdioArgs.length > 0
        ? args.stdioArgs
        : [
            'dist/server/launcher.js',
            '--transport=stdio',
            '--env=.env',
            '--exposition=readonly,high,low',
          ];
    return new StdioClientTransport({
      command: args.stdioCommand || 'node',
      args: stdioArgs,
      cwd: process.cwd(),
      stderr: 'inherit',
    });
  }
  throw new Error(`Unsupported transport: ${args.transport}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const yamlPath = path.resolve(process.cwd(), args.config);
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`YAML file not found: ${yamlPath}`);
  }
  const config = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  const hard =
    config?.environment?.integration_hard_mode ||
    config?.integration_hard_mode ||
    {};
  if (!args.transportExplicit && hard.transport) {
    args.transport = String(hard.transport).toLowerCase();
  }
  if (!args.urlExplicit) {
    if (
      (args.transport === 'http' || args.transport === 'streamable-http') &&
      hard.http_url
    ) {
      args.url = String(hard.http_url);
    } else if (args.transport === 'sse' && hard.sse_url) {
      args.url = String(hard.sse_url);
    }
  }
  if (!args.stdioCommandExplicit && hard.stdio_command) {
    args.stdioCommand = String(hard.stdio_command);
  }
  if (!args.stdioArgsExplicit && hard.env_path) {
    const envPath = String(hard.env_path);
    if (envPath.trim()) {
      args.stdioArgs = [
        'dist/server/launcher.js',
        '--transport=stdio',
        `--env-path=${envPath}`,
        '--exposition=readonly,high,low',
      ];
    }
  }

  const suite = config?.[args.suite];
  if (!suite || !Array.isArray(suite.test_cases)) {
    throw new Error(`Suite "${args.suite}" not found or has no test_cases in ${yamlPath}`);
  }

  let testCases = suite.test_cases.filter((tc) => {
    if (args.caseName && tc.name !== args.caseName) return false;
    if (!args.includeDisabled && tc.enabled === false) return false;
    return true;
  });

  if (testCases.length === 0) {
    throw new Error(`No test cases selected for suite "${args.suite}"`);
  }

  const client = new Client(
    { name: 'mcp-crud-smoke', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = await createTransport(args);
  await client.connect(transport);

  const listed = await client.listTools();
  const toolNames = new Set((listed?.tools || []).map((t) => t.name));
  const requiredTools = ['CreateProgram', 'GetProgram', 'UpdateProgram', args.deleteTool];
  for (const tool of requiredTools) {
    if (!toolNames.has(tool)) {
      throw new Error(
        `Required tool "${tool}" is not exposed by server. Available tools: ${Array.from(toolNames).slice(0, 30).join(', ')}`,
      );
    }
  }

  console.log(`Connected. Selected ${testCases.length} case(s) from suite "${args.suite}".`);
  console.log(`Transport: ${args.transport}`);

  const failures = [];

  for (const testCase of testCases) {
    const params = testCase.params || {};
    const originalProgramName = String(params.program_name || '').trim();
    if (!originalProgramName) {
      failures.push({
        caseName: testCase.name,
        step: 'prepare',
        error: 'program_name is required in YAML params',
      });
      if (args.failFast) break;
      continue;
    }

    const programName = withSuffix(originalProgramName, args.suffix);
    const packageName = resolvePackageName(params, config);
    const transportRequest = resolveTransportRequest(params, config);
    const createSource = replaceProgramNameInSource(
      params.source_code,
      originalProgramName,
      programName,
    );
    const updateSource = replaceProgramNameInSource(
      params.update_source_code || params.source_code,
      originalProgramName,
      programName,
    );

    console.log(`\n[${testCase.name}] program=${programName} package=${packageName}`);

    const createArgs = {
      program_name: programName,
      description: params.description || programName,
      package_name: packageName,
      source_code: createSource,
    };
    const normalizedProgramType = normalizeProgramType(params.program_type);
    if (normalizedProgramType) createArgs.program_type = normalizedProgramType;
    if (params.application !== undefined) createArgs.application = params.application;
    if (transportRequest) createArgs.transport_request = transportRequest;
    if (params.activate !== undefined) createArgs.activate = params.activate;

    const updateArgs = {
      program_name: programName,
      source_code: updateSource,
    };
    if (transportRequest) updateArgs.transport_request = transportRequest;

    const readArgs = { program_name: programName };
    const deleteArgs = { program_name: programName };
    if (transportRequest) deleteArgs.transport_request = transportRequest;

    let caseFailed = false;
    const steps = [
      { name: 'CreateProgram', args: createArgs },
      { name: 'GetProgram', args: readArgs },
      { name: 'UpdateProgram', args: updateArgs },
      { name: 'GetProgram', args: readArgs },
      { name: args.deleteTool, args: deleteArgs },
    ];

    for (const step of steps) {
      try {
        const result = await callTool(client, step.name, step.args);
        const text = extractText(result);
        console.log(`  ✓ ${step.name}${text ? ` -> ${text.slice(0, 120).replace(/\s+/g, ' ')}` : ''}`);
      } catch (error) {
        caseFailed = true;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ✗ ${step.name} -> ${message}`);
        failures.push({
          caseName: testCase.name,
          step: step.name,
          error: message,
        });
        break;
      }
    }

    if (!caseFailed) {
      console.log(`  ✓ CRUD flow passed`);
    } else if (args.failFast) {
      break;
    }
  }

  try {
    await client.close();
  } catch {
    // Ignore close errors on shutdown.
  }

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`- [${f.caseName}] ${f.step}: ${f.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nAll selected CRUD cases passed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
