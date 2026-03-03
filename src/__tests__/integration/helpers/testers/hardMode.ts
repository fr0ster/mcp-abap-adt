import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadTestConfig } from '../configHelpers';

export interface HardModeConfig {
  enabled: boolean;
  transport: 'http' | 'sse' | 'stdio';
  http_url?: string;
  sse_url?: string;
  stdio_command?: string;
  env_path?: string;
}

function toPascalCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join('');
}

export function getHardModeConfig(): HardModeConfig {
  const cfg = loadTestConfig();
  const hard =
    cfg?.environment?.integration_hard_mode || cfg?.integration_hard_mode || {};

  const transport = String(hard.transport || 'http').toLowerCase();
  const normalizedTransport =
    transport === 'sse' || transport === 'stdio' ? transport : 'http';

  return {
    enabled: hard.enabled === true,
    transport: normalizedTransport,
    http_url: hard.http_url || 'http://127.0.0.1:3000/mcp/stream/http',
    sse_url: hard.sse_url || 'http://127.0.0.1:3001/sse',
    stdio_command: hard.stdio_command || process.execPath,
    env_path: hard.env_path || '.env',
  };
}

export function isHardModeEnabled(): boolean {
  return getHardModeConfig().enabled;
}

export function resolveEntityFromHandlerName(handlerName: string): string {
  let normalized = handlerName.toLowerCase();
  normalized = normalized.replace(/^create_/, '');
  normalized = normalized.replace(/^update_/, '');
  normalized = normalized.replace(/^delete_/, '');
  normalized = normalized.replace(/_low$/, '');
  return toPascalCase(normalized);
}

export async function createHardModeClient(): Promise<{
  client: Client;
  toolNames: Set<string>;
  close: () => Promise<void>;
}> {
  const hard = getHardModeConfig();
  const client = new Client(
    { name: 'integration-hard-tester', version: '1.0.0' },
    { capabilities: {} },
  );

  if (hard.transport === 'http') {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(hard.http_url!)),
    );
  } else if (hard.transport === 'sse') {
    await client.connect(new SSEClientTransport(new URL(hard.sse_url!)));
  } else {
    const launcherPath = path.resolve(process.cwd(), 'dist/server/launcher.js');
    const envPath = path.resolve(
      process.cwd(),
      String(hard.env_path || '.env'),
    );
    const args = [
      launcherPath,
      '--transport=stdio',
      '--exposition=readonly,high,low',
      `--env-path=${envPath}`,
    ];
    await client.connect(
      new StdioClientTransport({
        command: String(hard.stdio_command || process.execPath),
        args,
        cwd: process.cwd(),
        stderr: 'inherit',
      }),
    );
  }

  const listed = await client.listTools();
  const toolNames = new Set((listed?.tools || []).map((t) => t.name));

  return {
    client,
    toolNames,
    close: async () => {
      await client.close();
    },
  };
}

export function toolCandidates(
  step:
    | 'validate'
    | 'create'
    | 'lock'
    | 'update'
    | 'unlock'
    | 'activate'
    | 'delete',
  entity: string,
  mode: 'high' | 'low',
  handlerName: string,
): string[] {
  const cap = step[0].toUpperCase() + step.slice(1);
  const low = `${cap}${entity}Low`;
  const high = `${cap}${entity}`;

  if (step === 'delete' && handlerName.includes('behavior_implementation')) {
    return ['DeleteClass', 'DeleteClassLow', high, low];
  }

  if (mode === 'high') {
    return [high, low];
  }
  return [low, high];
}

export async function callTool(
  client: Client,
  toolNames: Set<string>,
  candidates: string[],
  args: Record<string, unknown>,
) {
  const selected = candidates.find((name) => toolNames.has(name));
  if (!selected) {
    throw new Error(
      `No matching tool found. Candidates: ${candidates.join(', ')}`,
    );
  }
  const result = await client.callTool({ name: selected, arguments: args });
  if (result?.isError) {
    const text = (result.content || [])
      .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
      .join('\n');
    throw new Error(text || `${selected} returned MCP error`);
  }
  return result;
}

export function parseToolText(result: any): string {
  return (result?.content || [])
    .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
    .join('\n')
    .trim();
}
