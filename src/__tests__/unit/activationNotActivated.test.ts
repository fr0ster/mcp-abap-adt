/**
 * An activation SAP answered without activating is an error, with what it
 * left inactive (fr0ster/mcp-abap-adt#351).
 *
 * Two recorded answers, each replayed over a connection that answers by
 * request — real adt-clients code, no SAP:
 *
 * - SAP_BASIS 751: `POST /activation` answered `ioc:inactiveObjects` and
 *   activated nothing (`activation-preaudit-still-inactive-751`);
 * - S/4HANA 2025: the silent checklist (`activationExecuted="false"`, no
 *   message) and the inactive list read after it still naming the group
 *   (`activation-group-alone-s4-2025` 04 and 05).
 *
 * `analyseActivation` (adt-strategies 0.22.0) reads both as a failure before
 * any projection runs; the answer renders its `stillInactive` as
 * `still_inactive`, field by field.
 */
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleActivateClass } from '../../handlers/class/low/handleActivateClass';
import { handleActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { LOCK_SUCCESS_XML } from '../helpers/recordingConnection';

const IOC_751 = corpusBody(
  'activation-preaudit-still-inactive-751--01-activation',
);
const SILENT = corpusBody('activation-group-alone-s4-2025--04-activation');
const LISTED = corpusBody('activation-group-alone-s4-2025--05-inactiveobjects');

/** What the connection answers: by the request, not by its order. */
type Route = (options: IAbapRequestOptions) => string | undefined;

/** A connection answering `200` with what `route` gives, recording each request. */
function answering(route: Route) {
  const requests: string[] = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      requests.push(`${options.method} ${options.url}`);
      const data = route(options) ?? '';
      // A recorded body is text; `T` is the caller's view of it, which a
      // replay does not narrow — the assertion every fake connection makes.
      return { data: data as T, status: 200, statusText: 'OK', headers: {} };
    },
  };
  return { connection, requests };
}

const activationAnswer =
  (activation: string, inactive?: string): Route =>
  (options) => {
    if (options.url.includes('_action=LOCK')) return LOCK_SUCCESS_XML;
    if (options.url.startsWith('/sap/bc/adt/activation/inactiveobjects'))
      return inactive;
    if (options.url.startsWith('/sap/bc/adt/activation?')) return activation;
    return undefined;
  };

function contextOver(connection: IAbapConnection): HandlerContext {
  declareSystemKind(connection, 'onprem');
  return { connection, logger: undefined };
}

/** Whether a tool's answer is an error. */
function isError(result: object): boolean {
  return 'isError' in result && result.isError === true;
}

/** The JSON payload a tool answered. */
function payloadOf(result: object): Record<string, unknown> {
  const content = 'content' in result ? result.content : undefined;
  const first = Array.isArray(content) ? content[0] : undefined;
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '{}';
  return JSON.parse(text);
}

beforeAll(() => {
  setSystemContext({ masterSystem: 'SID', responsible: 'SAPUSER01' });
});
afterAll(() => resetSystemContextCache());

describe('ActivateClassLow', () => {
  it('an ioc:inactiveObjects answer (751) is an error, its objects in still_inactive', async () => {
    const { connection } = answering(activationAnswer(IOC_751));
    const result = await handleActivateClass(contextOver(connection), {
      class_name: 'ZCL_AI_ACT_PROBE',
    });
    expect(isError(result)).toBe(true);
    const payload = payloadOf(result);
    expect(payload.message).toContain(
      'SAP answered the objects still inactive',
    );
    expect(payload.still_inactive).toHaveLength(8);
    expect(payload.still_inactive).toContainEqual({
      name: 'ZCL_AI_ACT_PROBE',
      type: 'CLAS/OCN/definitions',
      uri: '/sap/bc/adt/oo/classes/zcl_ai_act_probe/includes/definitions',
      parent_uri: '/sap/bc/adt/oo/classes/zcl_ai_act_probe',
    });
    expect(payload).not.toHaveProperty('activation_not_stated');
  });
});

describe('ActivateObjects, one object', () => {
  it('an ioc:inactiveObjects answer (751) is an error, its objects in still_inactive', async () => {
    const { connection } = answering(activationAnswer(IOC_751));
    const result = await handleActivateObjects(contextOver(connection), {
      objects: [{ name: 'ZCL_AI_ACT_PROBE', type: 'CLAS/OC' }],
    });
    expect(isError(result)).toBe(true);
    const payload = payloadOf(result);
    expect(payload.still_inactive).toContainEqual({
      name: 'ZCL_AI_ACT_PROBE',
      type: 'CLAS/OC',
      uri: '/sap/bc/adt/oo/classes/zcl_ai_act_probe',
    });
  });

  it('a silent checklist with the group still listed (S/4HANA 2025) is an error, the group in still_inactive', async () => {
    const { connection, requests } = answering(
      activationAnswer(SILENT, LISTED),
    );
    const result = await handleActivateObjects(contextOver(connection), {
      objects: [{ name: 'ZACT751P9325', type: 'FUGR/F' }],
    });
    expect(isError(result)).toBe(true);
    const payload = payloadOf(result);
    expect(payload.message).toContain('the inactive list still names');
    expect(payload.still_inactive).toEqual([
      {
        name: 'ZACT751P9325',
        type: 'FUGR/F',
        uri: '/sap/bc/adt/functions/groups/zact751p9325',
      },
      {
        name: 'SAPLZACT751P9325',
        type: 'FUGR/I',
        uri: '/sap/bc/adt/functions/groups/zact751p9325/source/main',
        parent_uri: '/sap/bc/adt/functions/groups/zact751p9325',
      },
    ]);
    expect(requests).toContain('GET /sap/bc/adt/activation/inactiveobjects');
  });
});

describe('UpdateClass with activate: true', () => {
  it('a write whose activation answered ioc:inactiveObjects (751) is an error, step activate, with still_inactive', async () => {
    const { connection } = answering(activationAnswer(IOC_751));
    const result = await handleUpdateClass(contextOver(connection), {
      class_name: 'ZCL_AI_ACT_PROBE',
      source_code: 'CLASS zcl_ai_act_probe DEFINITION. ENDCLASS.',
      activate: true,
    });
    expect(isError(result)).toBe(true);
    const payload = payloadOf(result);
    expect(payload.step).toBe('activate');
    expect(payload.still_inactive).toHaveLength(8);
  });
});
