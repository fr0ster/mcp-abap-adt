/**
 * Probe the MCP wire format of a failing tool call.
 *
 * Spawns the real MCP server over stdio (hard mode) and dumps the raw
 * CallToolResult — or the JSON-RPC error, if one actually propagates.
 * Used to establish what a client/LLM really observes when a tool fails.
 *
 * Usage:
 *   npx tsx scripts/probe-tool-error.ts --tool GetWhereUsed --args '{"object_name":"CL_NOPE"}'
 *   npx tsx scripts/probe-tool-error.ts --case all
 */
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Self-contained stdio client. Deliberately does not reuse the integration
 * hard-mode helper: that one passes `--exposition=readonly,high,low`, which
 * validateExposition rejects (high and low are mutually exclusive).
 */
async function connect(destination: string, exposition: string) {
  const client = new Client(
    { name: 'probe-tool-error', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        path.resolve(process.cwd(), 'dist/server/launcher.js'),
        '--transport=stdio',
        `--exposition=${exposition}`,
        '--unsafe',
        `--mcp=${destination}`,
      ],
      cwd: process.cwd(),
      stderr: 'inherit',
    }),
  );
  const listed = await client.listTools();
  const toolNames = new Set((listed?.tools || []).map((t) => t.name));
  return { client, toolNames, close: () => client.close() };
}

interface ProbeCase {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

// Built-in cases, one per error path we want to observe.
const BUILTIN_CASES: ProbeCase[] = [
  {
    label: 'schema rejection (SDK validateToolInput -> McpError InvalidParams)',
    tool: 'GetWhereUsed',
    args: {},
  },
  {
    label: 'handler throws McpError directly (InvalidParams)',
    tool: 'GetWhereUsed',
    args: {
      object_name: 'CL_ABAP_CHAR_UTILITIES',
      object_type: 'CLAS/OC',
      enable_only_types: ['THIS_TYPE_DOES_NOT_EXIST'],
    },
  },
  {
    label: 'handler returns isError -> BaseMcpServer throws InternalError',
    tool: 'GetInclude',
    args: { include_name: 'ZZ_NO_SUCH_INCLUDE_155' },
  },
  {
    label: 'not-found on a read path',
    tool: 'GetClass',
    args: { class_name: 'ZZ_NO_SUCH_CLASS_155' },
  },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    tool: get('--tool'),
    args: get('--args'),
    caseName: get('--case') ?? 'all',
    destination: get('--mcp') ?? 'trial',
    exposition: get('--exposition') ?? 'readonly,high',
  };
}

function dump(label: string, value: unknown) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(label);
  console.log('='.repeat(72));
  console.log(JSON.stringify(value, null, 2));
}

async function probe(
  client: Client,
  toolNames: Set<string>,
  probeCase: ProbeCase,
) {
  const header = `${probeCase.tool}  —  ${probeCase.label}`;

  if (!toolNames.has(probeCase.tool)) {
    dump(header, { skipped: `tool ${probeCase.tool} not registered` });
    return;
  }

  try {
    const result = await client.callTool({
      name: probeCase.tool,
      arguments: probeCase.args,
    });
    dump(header, {
      outcome: 'CallToolResult returned (no protocol error)',
      isError: (result as { isError?: boolean })?.isError,
      raw: result,
    });
  } catch (e: unknown) {
    // Reaching here means the failure escaped as a JSON-RPC protocol error.
    const err = e as { code?: number; message?: string; data?: unknown };
    dump(header, {
      outcome: 'THREW — propagated as a JSON-RPC protocol error',
      code: err?.code,
      message: err?.message,
      data: err?.data,
    });
  }
}

async function main() {
  const { tool, args, caseName, destination, exposition } = parseArgs();

  let cases: ProbeCase[];
  if (tool) {
    cases = [
      {
        label: 'ad-hoc',
        tool,
        args: args ? JSON.parse(args) : {},
      },
    ];
  } else if (caseName === 'all') {
    cases = BUILTIN_CASES;
  } else {
    const idx = Number(caseName);
    if (!Number.isInteger(idx) || !BUILTIN_CASES[idx]) {
      throw new Error(
        `--case must be "all" or 0..${BUILTIN_CASES.length - 1}, got ${caseName}`,
      );
    }
    cases = [BUILTIN_CASES[idx]];
  }

  console.log(`Connecting to MCP server (stdio, --mcp=${destination})...`);
  const { client, toolNames, close } = await connect(destination, exposition);
  console.log(`Connected. ${toolNames.size} tools registered.`);

  try {
    for (const probeCase of cases) {
      await probe(client, toolNames, probeCase);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error('probe failed:', e);
  process.exit(1);
});
