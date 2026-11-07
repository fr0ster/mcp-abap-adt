/**
 * `GetObjectOutline` (plan D5): an object's components as SAP's object
 * structure states them — one `GET <object uri>/objectstructure` (Accept
 * `application/vnd.sap.adt.objectstructure.v2+xml`), read by
 * adt-strategies' `readObjectOutline`.
 *
 * The answers are the documents D1 captured on premise and on the trial
 * (`tests/fixtures/adt/read-outline-*`): a class with its components, a
 * class with a local class and type, an interface, a program (on premise:
 * no positions, each link names its target) and a function group (source
 * URIs only). Each case runs the served entry on `recordingConnection`, so
 * the schema parse and the real adt-clients request are part of it.
 */

import { corpusBody } from '../../../lib/adtCorpus';
import { type PinCase, recordCase } from '../../helpers/pinCases';

/** A corpus document as SAP's `200` answer. */
const answered = (name: string) => [{ status: 200, data: corpusBody(name) }];

/** The case's one answer, parsed; the case fails when there is none. */
async function run(c: PinCase): Promise<{
  isError: boolean;
  payload: unknown;
  text: string;
  urls: string[];
}> {
  const recorded = await recordCase(c);
  if (recorded.thrown !== undefined) throw recorded.thrown;
  const answer = recorded.answer;
  if (answer === undefined) throw new Error('the call answered nothing');
  const first = answer.content[0];
  const text = first === undefined ? '' : first.text;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  return {
    isError: answer.isError,
    payload,
    text,
    urls: recorded.requests.map((request) => request.url),
  };
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The child of `component` named `name`. */
function childNamed(component: unknown, name: string): unknown {
  const children = member(component, 'children');
  if (!Array.isArray(children)) return undefined;
  return children.find((each) => member(each, 'name') === name);
}

/** The link of `component` whose `rel` is `rel`. */
function linkOf(component: unknown, rel: string): unknown {
  const links = member(component, 'links');
  if (!Array.isArray(links)) return undefined;
  return links.find((each) => member(each, 'rel') === rel);
}

describe('GetObjectOutline', () => {
  it('a class: one GET of its objectstructure, its components with visibility, level and source positions', async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'CLAS/OC', object_name: 'ZMCP_D1_9E25_CL' },
      answers: answered('read-outline-class--01-objectstructure'),
      expected: 'none',
    });
    expect(result.isError).toBe(false);
    expect(result.urls).toEqual([
      '/sap/bc/adt/oo/classes/zmcp_d1_9e25_cl/objectstructure?version=active',
    ]);
    const outline = member(result.payload, 'outline');
    expect(member(outline, 'name')).toBe('ZMCP_D1_9E25_CL');
    expect(member(outline, 'type')).toBe('CLAS/OC');
    expect(member(outline, 'final')).toBe(true);

    const pub = childNamed(outline, 'PUB');
    expect({
      type: member(pub, 'type'),
      visibility: member(pub, 'visibility'),
      level: member(pub, 'level'),
      clif_name: member(pub, 'clif_name'),
    }).toEqual({
      type: 'CLAS/OM',
      visibility: 'public',
      level: 'instance',
      clif_name: 'ZMCP_D1_9E25_CL',
    });
    expect(linkOf(pub, 'definitionIdentifier')).toEqual({
      rel: 'definitionIdentifier',
      source: '/sap/bc/adt/oo/classes/zmcp_d1_9e25_cl/source/main',
      start: { line: 12, column: 12 },
      end: { line: 12, column: 15 },
      type: 'CLAS/OM',
    });
    expect(linkOf(pub, 'implementationBlock')).toEqual({
      rel: 'implementationBlock',
      source: '/sap/bc/adt/oo/classes/zmcp_d1_9e25_cl/source/main',
      start: { line: 25, column: 2 },
      end: { line: 28, column: 11 },
    });
    expect(member(childNamed(outline, 'PROT'), 'visibility')).toBe('protected');
    expect(member(childNamed(outline, 'PRIV'), 'visibility')).toBe('private');
    const constant = childNamed(outline, 'C_MAX');
    expect({
      constant: member(constant, 'constant'),
      read_only: member(constant, 'read_only'),
      level: member(constant, 'level'),
    }).toEqual({ constant: true, read_only: true, level: 'static' });
  });

  it("a class's local components point into its local includes", async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'cloud',
      stand: 'recording',
      args: { object_type: 'CLAS/OC', object_name: 'ZMCP_D1_276D_CL' },
      answers: answered('read-outline-local-class--01-objectstructure'),
      expected: 'none',
    });
    expect(result.isError).toBe(false);
    const outline = member(result.payload, 'outline');
    const local = childNamed(outline, 'LCL_HELPER');
    expect(member(local, 'type')).toBe('CLAS/OCL');
    const help = childNamed(local, 'HELP');
    expect(linkOf(help, 'implementationBlock')).toEqual({
      rel: 'implementationBlock',
      source: '/sap/bc/adt/oo/classes/zmcp_d1_276d_cl/includes/implementations',
      start: { line: 3, column: 2 },
      end: { line: 5, column: 11 },
    });
    expect(
      member(
        linkOf(childNamed(outline, 'TY_LOCAL'), 'definitionBlock'),
        'source',
      ),
    ).toBe('/sap/bc/adt/oo/classes/zmcp_d1_276d_cl/includes/definitions');
  });

  it('an interface: its components with positions', async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'INTF/OI',
        object_name: 'ZMCP_D1_9E25_IF',
        version: 'inactive',
      },
      answers: answered('read-outline-interface--01-objectstructure'),
      expected: 'none',
    });
    expect(result.isError).toBe(false);
    expect(result.urls).toEqual([
      '/sap/bc/adt/oo/interfaces/zmcp_d1_9e25_if/objectstructure?version=inactive',
    ]);
    const method = childNamed(member(result.payload, 'outline'), 'RUN');
    expect(member(method, 'type')).toBe('INTF/IO');
    expect(linkOf(method, 'definitionBlock')).toEqual({
      rel: 'definitionBlock',
      source: '/sap/bc/adt/oo/interfaces/zmcp_d1_9e25_if/source/main',
      start: { line: 5, column: 2 },
      end: { line: 5, column: 72 },
    });
  });

  it('a program: no positions — each link names its target by fragment', async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'PROG/P', object_name: 'ZMCP_D1_9E25_PR' },
      answers: answered('read-outline-program--01-objectstructure'),
      expected: 'none',
    });
    expect(result.isError).toBe(false);
    const outline = member(result.payload, 'outline');
    expect(
      linkOf(childNamed(outline, 'MAIN_FORM'), 'definitionIdentifier'),
    ).toEqual({
      rel: 'definitionIdentifier',
      source: '/sap/bc/adt/programs/programs/zmcp_d1_9e25_pr/source/main',
      fragment: 'type=PROG%2FPU;name=MAIN_FORM',
    });
    expect(
      linkOf(childNamed(outline, 'INC_FORM'), 'definitionIdentifier'),
    ).toEqual({
      rel: 'definitionIdentifier',
      source:
        '/sap/bc/adt/programs/includes/zmcp_d1_9e25_i01/source/main?context=%2fsap%2fbc%2fadt%2fprograms%2fprograms%2fzmcp_d1_9e25_pr',
      fragment: 'type=PROG%2FPU;name=INC_FORM',
    });
    expect(member(childNamed(outline, 'INC_FORM'), 'type')).toBe('PROG/PU');
  });

  it('a function group: its includes and modules, each with its source', async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'cloud',
      stand: 'recording',
      args: { object_type: 'FUGR/F', object_name: 'ZMCP_D19E25' },
      answers: answered('read-outline-function-group--01-objectstructure'),
      expected: 'none',
    });
    expect(result.isError).toBe(false);
    expect(result.urls).toEqual([
      '/sap/bc/adt/functions/groups/zmcp_d19e25/objectstructure?version=active',
    ]);
    const module = childNamed(
      member(result.payload, 'outline'),
      'Z_MCP_D1_9E25',
    );
    expect(member(module, 'type')).toBe('FUGR/FF');
    expect(linkOf(module, 'definitionIdentifier')).toEqual({
      rel: 'definitionIdentifier',
      source:
        '/sap/bc/adt/functions/groups/zmcp_d19e25/fmodules/z_mcp_d1_9e25/source/main',
    });
  });

  it('detail "raw" answers the document as SAP sent it', async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'INTF/OI',
        object_name: 'ZMCP_D1_9E25_IF',
        detail: 'raw',
      },
      answers: answered('read-outline-interface--01-objectstructure'),
      expected: 'none',
    });
    expect(result.isError).toBe(false);
    expect(result.text).toBe(
      corpusBody('read-outline-interface--01-objectstructure'),
    );
  });

  it("SAP's refusal is answered as the failure it is", async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'CLAS/OC', object_name: 'ZMCP_NOT_THERE' },
      answers: [
        {
          status: 404,
          data: corpusBody('refusal-object-not-found--01-read-source'),
        },
      ],
      expected: 'none',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('ExceptionResourceNotFound');
  });

  it('a 200 that is not an outline is refused, not answered as an empty outline', async () => {
    const result = await run({
      tool: 'GetObjectOutline',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'CLAS/OC', object_name: 'ZMCP_D1_9E25_CL' },
      answers: [{ status: 200, data: '' }],
      expected: 'none',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('no outline document');
  });

  it('on the cloud a program is refused before anything is sent', async () => {
    const recorded = await recordCase({
      tool: 'GetObjectOutline',
      variant: 'cloud',
      stand: 'recording',
      args: { object_type: 'PROG/P', object_name: 'ZMCP_D1_9E25_PR' },
      expected: 'nothing-sent',
      refusal: 'thrown',
    });
    expect(recorded.requests).toEqual([]);
    expect(
      recorded.thrown instanceof Error || recorded.answer?.isError === true,
    ).toBe(true);
  });
});
