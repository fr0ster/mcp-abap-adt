/**
 * The batched walks' metadata phase sends each object's read exactly as the
 * repository's `Get<Type>` handler sends its metadata read (`part:
 * 'metadata'`): the same URL and the same Accept header, per type (the
 * measured reads went through those members).
 */
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetBehaviorDefinition } from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleGetDataElement } from '../../../handlers/data_element/high/handleGetDataElement';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
import { handleGetDomain } from '../../../handlers/domain/high/handleGetDomain';
import { handleGetFunctionGroup } from '../../../handlers/function_group/high/handleGetFunctionGroup';
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

const targetOf = (type: string): MetadataTarget => ({
  type,
  name: NAME,
  ...(type === 'FUGR/FF' ? { functionGroup: 'ZGRP_X' } : {}),
});

const acceptOf = (headers: Record<string, string> | undefined) => {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === 'accept') return value;
  }
  return undefined;
};

type Handler = (context: HandlerContext) => Promise<unknown>;

const NAME = 'ZOBJ_X';
const part = 'metadata';

/** Each type's `Get<Type>` handler, asked for the metadata part. */
const HANDLERS: Record<string, Handler> = {
  'CLAS/OC': (c) => handleGetClass(c, { class_name: NAME, part } as never),
  'INTF/OI': (c) =>
    handleGetInterface(c, { interface_name: NAME, part } as never),
  'PROG/P': (c) => handleGetProgram(c, { program_name: NAME, part } as never),
  'DDLS/DF': (c) => handleGetDdl(c, { ddl_name: NAME, part } as never),
  'DDLX/EX': (c) =>
    handleGetMetadataExtension(c, {
      metadata_extension_name: NAME,
      part,
    } as never),
  'DOMA/DD': (c) => handleGetDomain(c, { domain_name: NAME } as never),
  'DTEL/DE': (c) =>
    handleGetDataElement(c, { data_element_name: NAME } as never),
  'TABL/DT': (c) => handleGetTable(c, { table_name: NAME, part } as never),
  'TABL/DS': (c) =>
    handleGetStructure(c, { structure_name: NAME, part } as never),
  'FUGR/F': (c) =>
    handleGetFunctionGroup(c, { function_group_name: NAME } as never),
  'FUGR/FF': (c) =>
    handleGetFunctionModule(c, {
      function_module_name: NAME,
      function_group_name: 'ZGRP_X',
      part,
    } as never),
  'SRVD/SRV': (c) =>
    handleGetServiceDefinition(c, {
      service_definition_name: NAME,
      part,
    } as never),
  'SRVB/SVB': (c) =>
    handleGetServiceBinding(c, { service_binding_name: NAME, part } as never),
  'BDEF/BDO': (c) =>
    handleGetBehaviorDefinition(c, {
      behavior_definition_name: NAME,
      part,
    } as never),
  'DEVC/K': (c) => handleGetPackage(c, { package_name: NAME } as never),
  'MSAG/N': (c) =>
    handleGetMessageClass(c, { message_class_name: NAME } as never),
};

/** The metadata request the type's `Get<Type>` handler sends, on a plain connection. */
async function directRequest(
  type: string,
): Promise<{ url: string; accept: string | undefined }> {
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
  const handler = HANDLERS[type] as Handler;
  await withinTurns(
    handler({
      connection: fake.connection,
      logger: undefined,
    } as unknown as HandlerContext),
  );
  expect(fake.directs).toHaveLength(1);
  const request = fake.directs[0] as IAbapRequestOptions;
  return { url: request.url, accept: acceptOf(request.headers) };
}

describe('the batched metadata reads', () => {
  it("every type with a metadata read has its Get<Type> handler's read here", () => {
    expect([...METADATA_READ_TYPES].sort()).toEqual(
      Object.keys(HANDLERS).sort(),
    );
  });

  it.each(METADATA_READ_TYPES)(
    '%s: the part is the readMetadata request — same URL, same Accept',
    async (type) => {
      const target = targetOf(type);
      const direct = await directRequest(type);
      expect(direct.accept).toBeTruthy();
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
      const described = await withinTurns(
        metadataDescriptions(context, [target]),
      );
      expect(fake.envelopes).toHaveLength(1);
      const parts = fake.envelopes[0]?.parts ?? [];
      expect(parts).toHaveLength(1);
      const part = parts[0];
      expect({
        method: part?.method,
        url: part?.url,
        accept: part?.headers.accept,
      }).toEqual({ method: 'GET', url: direct.url, accept: direct.accept });
      expect([...described.values()]).toEqual(['Placeholder']);
    },
  );
});
