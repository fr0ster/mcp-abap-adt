import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { fetchFunctionGroupChildren } from '../../../lib/strategies/functionGroupChildren';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
export const TOOL_DEFINITION = {
  name: 'GetIncludesList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Recursively discover and list ALL include files within an ABAP program or include.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: 'Name of the ABAP program or include',
      },
      object_type: {
        type: 'string',
        enum: ['PROG/P', 'PROG/I', 'FUGR', 'CLAS/OC'],
        description:
          "[read-only] ADT object type of the parent. Only these four values are supported: 'PROG/P' (program), 'PROG/I' (include), 'FUGR' (function group), 'CLAS/OC' (class). Any other value is rejected by the schema.",
      },
      detailed: {
        type: 'boolean',
        description:
          '[read-only] If true, returns structured JSON with metadata and raw XML.',
        default: false,
      },
      timeout: {
        type: 'number',
        description: '[read-only] Timeout in ms for each ADT request.',
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface IncludeNode {
  name: string;
  type?: string;
  children: IncludeNode[];
  cyclic?: boolean;
  truncated?: boolean;
}

const MAX_INCLUDE_DEPTH = 20;

type ParentKind = 'PROG/P' | 'PROG/I' | 'FUGR/F' | 'CLAS/OC';

/**
 * What the caller asked for, in the four kinds this tool walks. A function
 * group's main program `SAPL<fg>` is not readable as a program — on E19 its
 * program and include URIs both answer 404 — so it is walked as the group.
 */
function resolveParent(
  objectType: string,
  objectName: string,
): { kind: ParentKind; name: string } | undefined {
  const t = objectType.trim().toUpperCase();
  const name = objectName.trim().toUpperCase();
  const kind: ParentKind | undefined =
    t === 'PROG/P' || t === 'PROGRAM'
      ? 'PROG/P'
      : t === 'PROG/I' || t === 'INCLUDE'
        ? 'PROG/I'
        : t === 'FUGR' ||
            t === 'FUGR/F' ||
            t === 'FUNCTION_GROUP' ||
            t === 'FUNCTIONGROUP'
          ? 'FUGR/F'
          : t === 'CLAS/OC' || t === 'CLAS' || t === 'CLASS'
            ? 'CLAS/OC'
            : undefined;
  if (!kind) return undefined;
  if (kind === 'PROG/P' && name.startsWith('SAPL') && name.length > 4) {
    return { kind: 'FUGR/F', name: name.slice(4) };
  }
  return { kind, name };
}

/**
 * The includes a piece of ABAP source names, in order. A full-line comment
 * (`*`) and a trailing one (`"`) are not code; `INCLUDE STRUCTURE` and
 * `INCLUDE TYPE` embed a type, not a program include.
 */
export function includeStatementsOf(source: string): string[] {
  const found: string[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    if (rawLine.startsWith('*')) continue;
    const line = rawLine.replace(/".*$/, '');
    const m = line.match(/^\s*INCLUDE\s+([A-Z0-9_/]+)\s*(?:IF\s+FOUND\s*)?\./i);
    if (!m) continue;
    const name = m[1].toUpperCase();
    if (name === 'STRUCTURE' || name === 'TYPE') continue;
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/** The text inside a source reading — a string, or `{value, raw}`. */
function textOf(response: any): string {
  if (!response?.ok) return '';
  const v = response.getResult?.().value;
  if (typeof v === 'string') return v;
  return String(v?.value ?? v?.raw ?? '');
}

export async function handleGetIncludesList(
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, timeout } = args;

    if (
      !object_name ||
      typeof object_name !== 'string' ||
      object_name.trim() === ''
    ) {
      return return_error(
        'Parameter "object_name" (string) is required and cannot be empty.',
      );
    }
    if (!object_type || typeof object_type !== 'string') {
      return return_error('Parameter "object_type" (string) is required.');
    }

    const parent = resolveParent(object_type, object_name);
    if (!parent) {
      return return_error(
        `Unsupported object_type "${object_type}": use PROG/P, PROG/I, FUGR or CLAS/OC.`,
      );
    }

    // Default timeout: 30 seconds per request
    const requestTimeout =
      timeout && typeof timeout === 'number' ? timeout : 30000;
    const withTimeout = <T>(p: Promise<T>, what: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Timeout after ${requestTimeout}ms while ${what}`),
              ),
            requestTimeout,
          ),
        ),
      ]);

    logger?.info(
      `Starting includes tree discovery for ${parent.name} (${parent.kind})`,
    );

    const utils = createAdtClient(connection, logger).getUtils(ourUtils) as any;
    const readInclude = async (name: string) =>
      textOf(await withTimeout(utils.getInclude(name), `reading ${name}`));

    const visited = new Set<string>([parent.name]);
    const expand = async (
      names: string[],
      depth: number,
    ): Promise<IncludeNode[]> => {
      const children: IncludeNode[] = [];
      for (const name of names) {
        const node: IncludeNode = { name, children: [] };
        if (visited.has(name)) {
          node.cyclic = true;
        } else if (depth >= MAX_INCLUDE_DEPTH) {
          node.truncated = true;
        } else {
          visited.add(name);
          node.children = await expand(
            includeStatementsOf(await readInclude(name)),
            depth + 1,
          );
        }
        children.push(node);
      }
      return children;
    };

    let children: IncludeNode[];
    if (parent.kind === 'CLAS/OC') {
      // A class has sections, not program includes: its metadata lists them
      // by `includeType` (definitions, implementations, macros, testclasses,
      // main), with no name of their own.
      const meta = textOf(
        await withTimeout(
          utils.readObjectMetadata('class', parent.name),
          `reading class ${parent.name}`,
        ),
      );
      children = [...meta.matchAll(/class:includeType="([^"]+)"/g)].map(
        (m) => ({ name: m[1], type: 'CLAS/I', children: [] }),
      );
    } else if (parent.kind === 'FUGR/F') {
      // The group's main program cannot be read, so which includes it names
      // directly is worked out from the rest: every include of the group,
      // less those another include of the group names.
      const listed = await withTimeout(
        fetchFunctionGroupChildren(utils, parent.name, 'FUGR/I'),
        `listing the includes of ${parent.name}`,
      );
      if (!listed.ok) throw new Error(listed.getError().message);
      const all: string[] = listed
        .getResult()
        .value.map((o: { name: string }) => o.name.toUpperCase());
      const nested = new Set<string>();
      for (const name of all) {
        for (const inc of includeStatementsOf(await readInclude(name))) {
          nested.add(inc);
        }
      }
      children = await expand(
        all.filter((name) => !nested.has(name)),
        0,
      );
    } else {
      const rootSource =
        parent.kind === 'PROG/P'
          ? textOf(
              await withTimeout(
                utils.readObjectSource('program', parent.name),
                `reading program ${parent.name}`,
              ),
            )
          : await readInclude(parent.name);
      children = await expand(includeStatementsOf(rootSource), 0);
    }

    const tree: IncludeNode = { name: parent.name, children };

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              object_name: parent.name,
              object_type: parent.kind,
              tree,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
    );
    return return_error(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
