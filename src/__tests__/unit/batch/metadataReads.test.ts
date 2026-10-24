/**
 * One metadata read per type, shared by the type's `Get<Type>` handler and
 * the batched walks' metadata phase (`lib/strategies/metadataReads.ts`):
 * - every `handleGet*` handler that reads metadata does it through that
 *   module, or is named here with why it does not;
 * - every type the batch reads has its handler here, and the batch part is
 *   the handler's request whole: method, URL with its query, headers, body;
 *   a type with no `Get<Type>` handler is named with the request its part
 *   sends.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetBehaviorDefinition } from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleGetDataElement } from '../../../handlers/data_element/high/handleGetDataElement';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
import { handleGetDomain } from '../../../handlers/domain/high/handleGetDomain';
import { handleGetEnhancementSpot } from '../../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import { handleGetFunctionGroup } from '../../../handlers/function_group/high/handleGetFunctionGroup';
import { handleGetFunctionInclude } from '../../../handlers/function_include/readonly/handleGetFunctionInclude';
import { handleGetFunctionModule } from '../../../handlers/function_module/high/handleGetFunctionModule';
import { handleGetInterface } from '../../../handlers/interface/high/handleGetInterface';
import type { HandlerContext } from '../../../handlers/interfaces';
import { handleGetMessageClass } from '../../../handlers/message_class/high/handleGetMessageClass';
import { handleGetMetadataExtension } from '../../../handlers/metadata_extension/high/handleGetMetadataExtension';
import { handleGetPackage } from '../../../handlers/package/high/handleGetPackage';
import { handleGetProgram } from '../../../handlers/program/high/handleGetProgram';
import { handleGetServiceBinding } from '../../../handlers/service_binding/high/handleGetServiceBinding';
import { handleGetServiceDefinition } from '../../../handlers/service_definition/high/handleGetServiceDefinition';
import { handleGetStructure } from '../../../handlers/structure/high/handleGetStructure';
import { handleGetTable } from '../../../handlers/table/high/handleGetTable';
import { createBatchAvailability } from '../../../lib/batch/availability';
import {
  METADATA_READ_TYPES,
  type MetadataTarget,
} from '../../../lib/strategies/metadataReads';
import { metadataDescriptions } from '../../../lib/strategies/packageWalk';
import {
  envelopeConnection,
  envelopeResponse,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const DOC =
  '<?xml version="1.0" encoding="utf-8"?><adtcore:mainObject xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="Placeholder"/>';

const NAME = 'ZOBJ_X';
const GROUP = 'ZGRP_X';
const part = 'metadata';

type Handler = (context: HandlerContext) => Promise<unknown>;

/** Each type the batch reads: its `Get<Type>` handler, and how it is asked. */
const HANDLERS: Record<string, { file: string; call: Handler }> = {
  'CLAS/OC': {
    file: 'class/high/handleGetClass.ts',
    call: (c) => handleGetClass(c, { class_name: NAME, part } as never),
  },
  'INTF/OI': {
    file: 'interface/high/handleGetInterface.ts',
    call: (c) => handleGetInterface(c, { interface_name: NAME, part } as never),
  },
  'PROG/P': {
    file: 'program/high/handleGetProgram.ts',
    call: (c) => handleGetProgram(c, { program_name: NAME, part } as never),
  },
  'DDLS/DF': {
    file: 'ddl/high/handleGetDdl.ts',
    call: (c) => handleGetDdl(c, { ddl_name: NAME, part } as never),
  },
  'DDLX/EX': {
    file: 'metadata_extension/high/handleGetMetadataExtension.ts',
    call: (c) =>
      handleGetMetadataExtension(c, {
        metadata_extension_name: NAME,
        part,
      } as never),
  },
  'DOMA/DD': {
    file: 'domain/high/handleGetDomain.ts',
    call: (c) => handleGetDomain(c, { domain_name: NAME } as never),
  },
  'DTEL/DE': {
    file: 'data_element/high/handleGetDataElement.ts',
    call: (c) => handleGetDataElement(c, { data_element_name: NAME } as never),
  },
  'TABL/DT': {
    file: 'table/high/handleGetTable.ts',
    call: (c) => handleGetTable(c, { table_name: NAME, part } as never),
  },
  'TABL/DS': {
    file: 'structure/high/handleGetStructure.ts',
    call: (c) => handleGetStructure(c, { structure_name: NAME, part } as never),
  },
  'FUGR/F': {
    file: 'function_group/high/handleGetFunctionGroup.ts',
    call: (c) =>
      handleGetFunctionGroup(c, { function_group_name: NAME } as never),
  },
  'FUGR/FF': {
    file: 'function_module/high/handleGetFunctionModule.ts',
    call: (c) =>
      handleGetFunctionModule(c, {
        function_module_name: NAME,
        function_group_name: GROUP,
        part,
      } as never),
  },
  'FUGR/I': {
    file: 'function_include/readonly/handleGetFunctionInclude.ts',
    call: (c) =>
      handleGetFunctionInclude(c, {
        function_group_name: GROUP,
        include_name: NAME,
        part,
      } as never),
  },
  'SRVD/SRV': {
    file: 'service_definition/high/handleGetServiceDefinition.ts',
    call: (c) =>
      handleGetServiceDefinition(c, {
        service_definition_name: NAME,
        part,
      } as never),
  },
  'SRVB/SVB': {
    file: 'service_binding/high/handleGetServiceBinding.ts',
    call: (c) =>
      handleGetServiceBinding(c, {
        service_binding_name: NAME,
        part,
      } as never),
  },
  'BDEF/BDO': {
    file: 'behavior_definition/high/handleGetBehaviorDefinition.ts',
    call: (c) =>
      handleGetBehaviorDefinition(c, {
        behavior_definition_name: NAME,
        part,
      } as never),
  },
  'DEVC/K': {
    file: 'package/high/handleGetPackage.ts',
    call: (c) => handleGetPackage(c, { package_name: NAME } as never),
  },
  'MSAG/N': {
    file: 'message_class/high/handleGetMessageClass.ts',
    call: (c) =>
      handleGetMessageClass(c, { message_class_name: NAME } as never),
  },
  'ENHS/XSB': {
    file: 'enhancement/readonly/handleGetEnhancementSpot.ts',
    call: (c) =>
      handleGetEnhancementSpot(c, { enhancement_spot: NAME } as never),
  },
};

/**
 * Types the batch reads that have no `Get<Type>` handler: the request their
 * part sends (the adt-clients `readMetadata` of the type), measured on
 * premise with the same bytes alone and inside an envelope.
 */
const WITHOUT_HANDLER: Record<
  string,
  { method: string; url: string; accept: string }
> = {
  'DCLS/DL': {
    method: 'GET',
    url: `/sap/bc/adt/acm/dcl/sources/${NAME.toLowerCase()}?version=active`,
    accept: 'application/vnd.sap.adt.dclSource+xml',
  },
};

/** Handlers that read a type above through the shared read, besides its own. */
const ALSO_SHARED: Record<string, string> = {
  'system/high/handleGetPackageTree.ts': 'DEVC/K',
  'system/low/handleGetNodeStructure.ts': 'DEVC/K',
};

/** `handleGet*` handlers with a metadata read the batch does not use, and why. */
const EXCLUDED: Record<string, string> = {
  'behavior_implementation/high/handleGetBehaviorImplementation.ts':
    "the behavior pool's class metadata; the walks list it as its class",
  'enhancement/readonly/handleGetEnhancements.ts':
    "a probe of an include's metadata to tell an include from a program",
  'include/readonly/handleGetIncludesList.ts':
    "a class's metadata, read to find its includes",
  'system/readonly/handleGetTypeInfo.ts':
    'a type name tried as a data element, a table type and a structure in turn; the table type has no Get handler, so its read is its own',
};

const HANDLERS_DIR = join(__dirname, '../../../handlers');

/** A call of one of the shared reads (`read<Type>Metadata(`). */
const SHARED_CALL = /\bread[A-Z]\w*Metadata\(/;

function getHandlerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return getHandlerFiles(path);
    return /^handleGet\w*\.ts$/.test(entry) ? [path] : [];
  });
}

/** The code of a file without its comment lines. */
const codeOf = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const lowerHeaders = (headers: Record<string, unknown> | undefined) =>
  Object.fromEntries(
    Object.entries(headers ?? {})
      .filter(([key]) => key.toLowerCase() !== 'content-length')
      .map(([key, value]) => [key.toLowerCase(), String(value)]),
  );

const targetOf = (type: string): MetadataTarget => ({
  type,
  name: NAME,
  ...(type === 'FUGR/FF' || type === 'FUGR/I' ? { functionGroup: GROUP } : {}),
});

/** The request the type's `Get<Type>` handler sends, on a plain connection. */
async function handlerRequest(type: string) {
  const fake = envelopeConnection(
    () => envelopeResponse([]),
    async (): Promise<IAdtWireResponse> =>
      ({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/xml' },
        data: DOC,
      }) as IAdtWireResponse,
  );
  const handler = HANDLERS[type];
  if (handler === undefined) throw new Error(`no handler for ${type}`);
  await withinTurns(
    handler.call({
      connection: fake.connection,
      logger: undefined,
    } as unknown as HandlerContext),
  );
  expect(fake.directs).toHaveLength(1);
  const request = fake.directs[0] as IAbapRequestOptions;
  return {
    method: request.method,
    url: request.url,
    headers: lowerHeaders(request.headers),
    body: request.data === undefined ? '' : String(request.data),
  };
}

describe('one metadata read per type, shared by handler and batch', () => {
  it('every handleGet* metadata read goes through the shared reads, or is named with its reason', () => {
    const reading = getHandlerFiles(HANDLERS_DIR)
      .filter((path) => {
        const code = codeOf(path);
        return code.includes('.readMetadata(') || SHARED_CALL.test(code);
      })
      .map((path) => relative(HANDLERS_DIR, path).split(sep).join('/'))
      .sort();
    expect(reading).toEqual(
      [
        ...Object.values(HANDLERS).map((h) => h.file),
        ...Object.keys(ALSO_SHARED),
        ...Object.keys(EXCLUDED),
      ].sort(),
    );
    // Every other one reads through the shared reads, never a client's own
    // metadata member.
    const direct = reading.filter(
      (file) =>
        !(file in EXCLUDED) &&
        /\.read(Object)?Metadata\(/.test(codeOf(join(HANDLERS_DIR, file))),
    );
    expect(direct).toEqual([]);
  });

  it('the batch reads exactly the types of those handlers, and the types named without one', () => {
    expect([...METADATA_READ_TYPES].sort()).toEqual(
      [...Object.keys(HANDLERS), ...Object.keys(WITHOUT_HANDLER)].sort(),
    );
  });

  it.each(Object.keys(WITHOUT_HANDLER))(
    "%s: the batch part is the type's metadata request",
    async (type) => {
      const expected = WITHOUT_HANDLER[type];
      const fake = envelopeConnection((parts) =>
        envelopeResponse(
          parts.map(() => ({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/xml' },
            body: DOC,
          })),
        ),
      );
      const context = {
        connection: fake.connection,
        logger: undefined,
        batchAvailability: createBatchAvailability(),
      } as unknown as HandlerContext;
      const { descriptions } = await withinTurns(
        metadataDescriptions(context, [targetOf(type)]),
      );
      expect(fake.envelopes).toHaveLength(1);
      const parts = fake.envelopes[0]?.parts ?? [];
      expect(parts).toHaveLength(1);
      const inner = parts[0];
      expect({
        method: inner?.method,
        url: inner?.url,
        accept: lowerHeaders(inner?.headers).accept,
        body: (inner?.body ?? '').trim(),
      }).toEqual({ ...expected, body: '' });
      expect([...descriptions.values()]).toEqual(['Placeholder']);
    },
  );

  it.each(Object.keys(HANDLERS))(
    "%s: the batch part is the handler's request whole",
    async (type) => {
      const direct = await handlerRequest(type);
      const fake = envelopeConnection((parts) =>
        envelopeResponse(
          parts.map(() => ({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/xml' },
            body: DOC,
          })),
        ),
      );
      const context = {
        connection: fake.connection,
        logger: undefined,
        batchAvailability: createBatchAvailability(),
      } as unknown as HandlerContext;
      const { descriptions } = await withinTurns(
        metadataDescriptions(context, [targetOf(type)]),
      );
      expect(fake.envelopes).toHaveLength(1);
      const parts = fake.envelopes[0]?.parts ?? [];
      expect(parts).toHaveLength(1);
      const inner = parts[0];
      expect({
        method: inner?.method,
        url: inner?.url,
        headers: lowerHeaders(inner?.headers),
        // The envelope frames an empty body with its line break.
        body: (inner?.body ?? '').trim(),
      }).toEqual(direct);
      expect(direct.headers.accept).toBeTruthy();
      expect([...descriptions.values()]).toEqual(['Placeholder']);
    },
  );
});
