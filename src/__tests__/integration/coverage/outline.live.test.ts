/**
 * `GetObjectOutline`, live (plan D5): the outline of objects the test
 * creates, as SAP states it, on both systems — a class, an interface and a
 * function group on each, a program on premise only (the cloud has none).
 *
 * Every object's name is read free before its create and recorded for
 * cleanup before it; everything is deleted in reverse creation order and
 * read absent after.
 *
 * The class's and the interface's positions are checked against their
 * source: the line a method's definition identifier names, read with a line
 * range (`start_line` = `end_line`, DO1), holds the method's name between
 * the columns it names, and the line its implementation block starts on
 * holds `METHOD <name>`.
 */
import { randomBytes } from 'node:crypto';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  type LiveRead,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const CLASS = `ZCL_MCP_OL_${SUFFIX}`;
const INTERFACE = `ZIF_MCP_OL_${SUFFIX}`;
const GROUP = `ZMCP_OL${SUFFIX}`;
const MODULE = `Z_MCP_OL_${SUFFIX}`;
const PROGRAM = `ZMCP_OL_${SUFFIX}_P`;

/** `$TMP` on premise; the configured package on the cloud, which has none. */
const packageName = (): string =>
  configuredSystemKind() === 'onprem' ? '$TMP' : resolvePackageName();

/** The configured request on the cloud; none on premise (`$TMP`). */
function onRequest(): { transport_request?: string } {
  if (configuredSystemKind() === 'onprem') return {};
  const request = resolveTransportRequest();
  return request === undefined || request === ''
    ? {}
    : { transport_request: request };
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The answer's JSON payload. */
function payloadOf(answer: LiveAnswer): unknown {
  return JSON.parse(answer.text);
}

/** The child of `component` named `name`; the case fails when there is none. */
function childNamed(component: unknown, name: string): unknown {
  const children = member(component, 'children');
  const found = Array.isArray(children)
    ? children.find((each) => member(each, 'name') === name)
    : undefined;
  if (found === undefined) {
    throw new Error(
      `the outline lists no ${name}: ${JSON.stringify(component)}`,
    );
  }
  return found;
}

/** A position SAP stated: line from 1, column from 0. */
interface Point {
  line: number;
  column: number;
}

function pointOf(value: unknown): Point {
  const line = member(value, 'line');
  const column = member(value, 'column');
  if (typeof line !== 'number' || typeof column !== 'number') {
    throw new Error(`no position: ${JSON.stringify(value)}`);
  }
  return { line, column };
}

/** The link of `component` whose `rel` is `rel`, with its source and position. */
function positionOf(
  component: unknown,
  rel: string,
): { source: string; start: Point; end: Point } {
  const links = member(component, 'links');
  const link = Array.isArray(links)
    ? links.find((each) => member(each, 'rel') === rel)
    : undefined;
  const source = member(link, 'source');
  if (typeof source !== 'string') {
    throw new Error(`no ${rel} link: ${JSON.stringify(component)}`);
  }
  return {
    source,
    start: pointOf(member(link, 'start')),
    end: pointOf(member(link, 'end')),
  };
}

/** One line of a source, read with the line range. */
async function lineOf(read: LiveRead, line: number): Promise<string> {
  const answer = succeeded(
    `${read.tool} line ${line}`,
    await livePrepare(read.tool, {
      ...read.args,
      start_line: line,
      end_line: line,
    }),
  );
  const source = member(payloadOf(answer), 'source');
  if (typeof source !== 'string') {
    throw new Error(`${read.tool} answered no source: ${answer.text}`);
  }
  return source;
}

/**
 * The function module is in no group: a repository search for its name
 * answers no hit. Its read answers no `404` while it is absent (measured on
 * premise: `500` `SY 530` under a group that does not exist; D1: not a
 * `404` under a fresh group), so its absence is the search's.
 */
async function expectNoModule(name: string): Promise<void> {
  const answer = succeeded(
    `SearchObject ${name}`,
    await livePrepare('SearchObject', {
      object_name: name,
      object_type: 'FUNC',
    }),
  );
  if (answer.text.includes(name)) {
    throw new Error(`the function module ${name} exists: ${answer.text}`);
  }
}

/** Creates an object after its name was read free, recorded for cleanup first. */
async function create(
  free: LiveRead,
  remove: { tool: string; args: Record<string, unknown> },
  createTool: string,
  createArgs: Record<string, unknown>,
): Promise<void> {
  await expectNameFree(free);
  recordCreated(remove.tool, { ...remove.args, ...onRequest() });
  succeeded(
    `${createTool}`,
    await livePrepare(createTool, { ...createArgs, ...onRequest() }),
  );
}

const CLASS_SOURCE = [
  `CLASS ${CLASS.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
  '  PUBLIC SECTION.',
  '    METHODS first_method RETURNING VALUE(r) TYPE i.',
  '  PRIVATE SECTION.',
  '    METHODS second_method IMPORTING iv TYPE i.',
  'ENDCLASS.',
  `CLASS ${CLASS.toLowerCase()} IMPLEMENTATION.`,
  '  METHOD first_method.',
  '    r = 1.',
  '  ENDMETHOD.',
  '  METHOD second_method.',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const INTERFACE_SOURCE = [
  `INTERFACE ${INTERFACE.toLowerCase()} PUBLIC.`,
  '  METHODS run IMPORTING iv TYPE i.',
  'ENDINTERFACE.',
].join('\n');

liveSuite(['onprem', 'cloud'], 'GetObjectOutline states components', () => {
  afterAll(async () => {
    await deleteRecorded();
    await expectAbsent({ tool: 'GetClass', args: { class_name: CLASS } });
    await expectAbsent({
      tool: 'GetInterface',
      args: { interface_name: INTERFACE },
    });
    await expectNoModule(MODULE);
    await expectAbsent({
      tool: 'GetFunctionGroup',
      args: { function_group_name: GROUP },
    });
  });

  it('a class: its methods with visibility and positions, and those lines of its source hold them', async () => {
    const read = { tool: 'GetClass', args: { class_name: CLASS } };
    await create(
      read,
      { tool: 'DeleteClass', args: { class_name: CLASS } },
      'CreateClass',
      {
        class_name: CLASS,
        package_name: packageName(),
        description: 'MCP outline live case',
      },
    );
    succeeded(
      'UpdateClass',
      await livePrepare('UpdateClass', {
        class_name: CLASS,
        source_code: CLASS_SOURCE,
        activate: true,
        ...onRequest(),
      }),
    );

    const answered = await liveCall('GetObjectOutline', {
      object_type: 'CLAS/OC',
      object_name: CLASS,
    });
    const answer = succeeded('GetObjectOutline CLAS/OC', answered);
    const outline = member(payloadOf(answer), 'outline');
    expect(member(outline, 'name')).toBe(CLASS);
    for (const [name, visibility] of [
      ['FIRST_METHOD', 'public'],
      ['SECOND_METHOD', 'private'],
    ] as const) {
      const method = childNamed(outline, name);
      expect({ name, visibility: member(method, 'visibility') }).toEqual({
        name,
        visibility,
      });
      const identifier = positionOf(method, 'definitionIdentifier');
      expect(identifier.source.endsWith('/source/main')).toBe(true);
      expect(identifier.start.line).toBe(identifier.end.line);
      const line = await lineOf(read, identifier.start.line);
      expect(line.slice(identifier.start.column, identifier.end.column)).toBe(
        name.toLowerCase(),
      );
      const block = positionOf(method, 'implementationBlock');
      const first = await lineOf(read, block.start.line);
      // SAP keeps a line's trailing blanks (measured on premise).
      expect(first.slice(block.start.column).trimEnd()).toBe(
        `METHOD ${name.toLowerCase()}.`,
      );
    }
  });

  it('an interface: its method with its position, and that line of its source holds it', async () => {
    const read = { tool: 'GetInterface', args: { interface_name: INTERFACE } };
    await create(
      read,
      { tool: 'DeleteInterface', args: { interface_name: INTERFACE } },
      'CreateInterface',
      {
        interface_name: INTERFACE,
        package_name: packageName(),
        description: 'MCP outline live case',
      },
    );
    succeeded(
      'UpdateInterface',
      await livePrepare('UpdateInterface', {
        interface_name: INTERFACE,
        source_code: INTERFACE_SOURCE,
        activate: true,
        ...onRequest(),
      }),
    );

    const answered = await liveCall('GetObjectOutline', {
      object_type: 'INTF/OI',
      object_name: INTERFACE,
    });
    const answer = succeeded('GetObjectOutline INTF/OI', answered);
    const method = childNamed(member(payloadOf(answer), 'outline'), 'RUN');
    expect(member(method, 'visibility')).toBe('public');
    const identifier = positionOf(method, 'definitionIdentifier');
    const line = await lineOf(read, identifier.start.line);
    expect(line.slice(identifier.start.column, identifier.end.column)).toBe(
      'run',
    );
  });

  it('a function group: its module, with its source', async () => {
    await expectNoModule(MODULE);
    await create(
      { tool: 'GetFunctionGroup', args: { function_group_name: GROUP } },
      { tool: 'DeleteFunctionGroup', args: { function_group_name: GROUP } },
      'CreateFunctionGroup',
      {
        function_group_name: GROUP,
        package_name: packageName(),
        description: 'MCP outline live case',
      },
    );
    recordCreated('DeleteFunctionModule', {
      function_module_name: MODULE,
      function_group_name: GROUP,
      ...onRequest(),
    });
    succeeded(
      'CreateFunctionModule',
      await livePrepare('CreateFunctionModule', {
        function_group_name: GROUP,
        function_module_name: MODULE,
        description: 'MCP outline live case',
        ...onRequest(),
      }),
    );
    succeeded(
      'UpdateFunctionModule',
      await livePrepare('UpdateFunctionModule', {
        function_group_name: GROUP,
        function_module_name: MODULE,
        source_code: `FUNCTION ${MODULE.toLowerCase()}.\nENDFUNCTION.`,
        activate: true,
        ...onRequest(),
      }),
    );

    const answered = await liveCall('GetObjectOutline', {
      object_type: 'FUGR/F',
      object_name: GROUP,
    });
    const answer = succeeded('GetObjectOutline FUGR/F', answered);
    const module = childNamed(member(payloadOf(answer), 'outline'), MODULE);
    expect(member(module, 'type')).toBe('FUGR/FF');
    const links = member(module, 'links');
    const sources = Array.isArray(links)
      ? links.map((link) => member(link, 'source'))
      : [];
    expect(sources).toContain(
      `/sap/bc/adt/functions/groups/${GROUP.toLowerCase()}/fmodules/${MODULE.toLowerCase()}/source/main`,
    );
  });
});

liveSuite(['onprem'], 'GetObjectOutline states a program', () => {
  afterAll(async () => {
    await deleteRecorded();
    await expectAbsent({
      tool: 'GetProgram',
      args: { program_name: PROGRAM },
    });
  });

  it('a program: its FORM, named by its link', async () => {
    await create(
      { tool: 'GetProgram', args: { program_name: PROGRAM } },
      { tool: 'DeleteProgram', args: { program_name: PROGRAM } },
      'CreateProgram',
      {
        program_name: PROGRAM,
        package_name: '$TMP',
        description: 'MCP outline live case',
      },
    );
    succeeded(
      'UpdateProgram',
      await livePrepare('UpdateProgram', {
        program_name: PROGRAM,
        source_code: [
          `REPORT ${PROGRAM.toLowerCase()}.`,
          'START-OF-SELECTION.',
          '  PERFORM main_form.',
          'FORM main_form.',
          'ENDFORM.',
        ].join('\n'),
        activate: true,
      }),
    );

    const answered = await liveCall('GetObjectOutline', {
      object_type: 'PROG/P',
      object_name: PROGRAM,
    });
    const answer = succeeded('GetObjectOutline PROG/P', answered);
    const form = childNamed(member(payloadOf(answer), 'outline'), 'MAIN_FORM');
    expect(member(form, 'type')).toBe('PROG/PU');
    const links = member(form, 'links');
    const fragments = Array.isArray(links)
      ? links.map((link) => member(link, 'fragment'))
      : [];
    expect(fragments).toContain('type=PROG%2FPU;name=MAIN_FORM');
  });
});
