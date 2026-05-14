import { XMLParser } from 'fast-xml-parser';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import { encodeSapObjectName, makeAdtRequestWithTimeout } from '../utils';
import type { EnumeratedObject, ScanObjectType } from './packageEnumerator';

export type SourceVersion = 'active' | 'inactive';

export interface SourceUnit {
  include: string;
  lines: string[];
}

export interface FugrChild {
  objecttype: string;
  objectname: string;
}

export interface ReadSourceUnitsDeps {
  readProgram(
    programName: string,
    version: SourceVersion,
  ): Promise<string | null>;
  readInclude(includeName: string): Promise<string | null>;
  readClassMain(
    className: string,
    version: SourceVersion,
  ): Promise<string | null>;
  fetchFugrStructure(fugrName: string): Promise<FugrChild[]>;
  readFugrFm(fugrName: string, fmName: string): Promise<string | null>;
  logger?: { debug?: (msg: string) => void; warn?: (msg: string) => void };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

async function safe<T>(
  op: () => Promise<T>,
  logger: ReadSourceUnitsDeps['logger'],
  desc: string,
): Promise<T | null> {
  try {
    return await op();
  } catch (e: any) {
    logger?.debug?.(`[search-source] ${desc} failed: ${e?.message ?? e}`);
    return null;
  }
}

function isViewFm(name: string): boolean {
  return name.length >= 4 && name.slice(0, 4).toUpperCase() === 'VIEW';
}

function sortFugrChildren(children: FugrChild[]): FugrChild[] {
  return [...children].sort((a, b) => {
    if (a.objecttype !== b.objecttype)
      return a.objecttype < b.objecttype ? -1 : 1;
    return a.objectname < b.objectname ? -1 : 1;
  });
}

export async function* readSourceUnits(
  deps: ReadSourceUnitsDeps,
  target: EnumeratedObject,
  version: SourceVersion = 'active',
): AsyncGenerator<SourceUnit> {
  const logger = deps.logger;
  switch (target.object_type as ScanObjectType) {
    case 'PROG': {
      const src = await safe(
        () => deps.readProgram(target.object_name, version),
        logger,
        `read PROG ${target.object_name}`,
      );
      if (src !== null && src !== undefined) {
        yield { include: target.object_name, lines: splitLines(src) };
      }
      return;
    }
    case 'CLAS': {
      const src = await safe(
        () => deps.readClassMain(target.object_name, version),
        logger,
        `read CLAS ${target.object_name}`,
      );
      if (src !== null && src !== undefined) {
        yield { include: target.object_name, lines: splitLines(src) };
      }
      return;
    }
    case 'FUGR': {
      const children = await safe(
        () => deps.fetchFugrStructure(target.object_name),
        logger,
        `fetch FUGR structure ${target.object_name}`,
      );
      if (!children) return;
      const seen = new Set<string>();
      const filtered: FugrChild[] = [];
      for (const c of children) {
        if (c.objecttype === 'FUGR/FF' && isViewFm(c.objectname)) continue;
        if (!c.objecttype.startsWith('FUGR/')) continue;
        const key = `${c.objecttype}|${c.objectname}`;
        if (seen.has(key)) continue;
        seen.add(key);
        filtered.push(c);
      }
      const ordered = sortFugrChildren(filtered);
      for (const c of ordered) {
        const src =
          c.objecttype === 'FUGR/FF'
            ? await safe(
                () => deps.readFugrFm(target.object_name, c.objectname),
                logger,
                `read FUGR/FF ${target.object_name}/${c.objectname}`,
              )
            : await safe(
                () => deps.readInclude(c.objectname),
                logger,
                `read FUGR include ${c.objectname}`,
              );
        if (src !== null && src !== undefined) {
          yield { include: c.objectname, lines: splitLines(src) };
        }
      }
      return;
    }
  }
}

interface FlatStructureNode {
  nodeid?: string;
  parentid?: string;
  objecttype?: string;
  objectname?: string;
}

function parseFugrChildrenFromXml(xml: string): FugrChild[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  const parsed = parser.parse(xml);
  let nodes = parsed?.['projectexplorer:objectstructure']?.[
    'projectexplorer:node'
  ] as FlatStructureNode | FlatStructureNode[] | undefined;
  if (!nodes) return [];
  if (!Array.isArray(nodes)) nodes = [nodes];
  const out: FugrChild[] = [];
  for (const node of nodes) {
    if (!node.objecttype || !node.objectname) continue;
    if (!node.objecttype.startsWith('FUGR/')) continue;
    out.push({ objecttype: node.objecttype, objectname: node.objectname });
  }
  return out;
}

export function createSourceReaderDeps(
  ctx: HandlerContext,
): ReadSourceUnitsDeps {
  const client = createAdtClient(ctx.connection, ctx.logger);
  return {
    async readProgram(programName, version) {
      const r = await client.getProgram().read({ programName }, version);
      const data = r?.readResult?.data;
      return typeof data === 'string' ? data : null;
    },
    async readInclude(includeName) {
      const r = await makeAdtRequestWithTimeout(
        ctx.connection,
        `/sap/bc/adt/programs/includes/${encodeSapObjectName(includeName)}/source/main`,
        'GET',
        'default',
      );
      return typeof r?.data === 'string' ? r.data : null;
    },
    async readClassMain(className, version) {
      const r = await client.getClass().read({ className }, version);
      const data = r?.readResult?.data;
      return typeof data === 'string' ? data : null;
    },
    async fetchFugrStructure(fugrName) {
      const r = await client.getUtils().getObjectStructure('FUGR/F', fugrName);
      return typeof r?.data === 'string'
        ? parseFugrChildrenFromXml(r.data)
        : [];
    },
    async readFugrFm(fugrName, fmName) {
      const r = await makeAdtRequestWithTimeout(
        ctx.connection,
        `/sap/bc/adt/functions/groups/${encodeSapObjectName(fugrName.toLowerCase())}/fmodules/${encodeSapObjectName(fmName.toLowerCase())}/source/main`,
        'GET',
        'default',
      );
      return typeof r?.data === 'string' ? r.data : null;
    },
    logger: ctx.logger,
  };
}
