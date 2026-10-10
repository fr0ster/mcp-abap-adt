/**
 * A description is read by a model and indexed by a vector search — so it names
 * nothing concrete.
 *
 * **The rule, stated by the user 2026-09-28: no concrete names anywhere in a
 * tool's text.** A description says what the tool does and what a parameter
 * means, most important first — "creates a domain; takes X; answers Y" — and an
 * example object, package or transport is never part of that. We say `class`; we
 * do not say which class.
 *
 * **Why, in the user's own terms.** The consumer is an LLM over a vector search,
 * not a person: *"коли в промті юзер вказує щось типу TMP, а в описі є TMP,
 * система сприйме це як найближче влучання, навіть якщо решта опису каже, що це
 * не підходить"*. Ask for a report in `$TMP` and everything whose text mentions
 * `$TMP` comes back — which is issue #241, measured in cloud-llm-hub's tool-RAG:
 * `Delete*` went from 12 of the top 15 to 1 once `$TMP` left their descriptions.
 * A literal in a PARAMETER description is worse in a second way: the model fills
 * the argument from it, and an example transport request addressed a real one.
 *
 * **And a consumer who wants names is not stuck.** They import `@mcp-abap-adt/lib`,
 * inherit, and override the descriptions with whatever suits their retrieval. The
 * shipped text stays agnostic because we do not know who indexes it, where, or how.
 *
 * **Scope: every description, tool and parameter alike.** 2026-09-28 this covered
 * tool descriptions only, because parameter descriptions broke the rule in 255 of
 * 370 tools (350 occurrences, 169 distinct strings) and a test that fails
 * everywhere fixes nothing. They are replaced now, in the same pass that took the
 * transport numbers out, so the scope is whole and the staging is gone.
 *
 * **Why a pattern, when ranking is measured with a RAG.** It is measured there —
 * #241's numbers come from loading the descriptions into cloud-llm-hub and
 * querying it, and that is how this wording was chosen. A pattern measures no
 * ranking and does not try to. It keeps the RULE where descriptions are authored
 * and where no RAG runs; without it the next `$TMP` returns and nothing notices
 * until a consumer's retrieval degrades.
 */
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';

/**
 * Classes of literal, not a list of known offenders: a new example of the same
 * kind — another package, another customer object, another transport — fails here
 * too. What is caught is a concrete name or prefix, mask or not: `ZOK*` names our
 * prefix and fails. A bare mask — `Z*`, `Y*`, any-namespace — names nothing and
 * stays allowed, and so does a format placeholder built from the letters of a
 * date: `YYYYMMDDHHMMSS` is a shape, not somebody's object. Both are in the
 * self-check below.
 */
const INCIDENTAL = [
  { name: 'a package name ($TMP, $ANY)', pattern: /\$[A-Z][A-Z0-9_]*/ },
  {
    name: 'a customer-namespace object name (ZCL_DEMO, ZOK*, YFOO, LZOK_FG…F01)',
    // The generated prefixes count: a function group's includes are named
    // `L<group>…` and its main program `SAPL<group>`, so the customer name is
    // one character in rather than at the start.
    pattern: /\b(?:SAPL|L)?[ZY][A-Z0-9_]{2,}/,
  },
  {
    // Two shapes, because the number is not always `<SID>K9…`: the user named
    // `ER121235` as one that must fail too. The word `request` is what a
    // description may say; a number never is.
    name: 'a transport number (SIDK905635, ER121235)',
    pattern: /\b[A-Z0-9]{3}K9\d{5}\b|\b[A-Z]{2,4}\d{6,}\b/,
  },
];

/** A date or time format built from its own letters names no object. */
const FORMAT_PLACEHOLDER = /^[YMDHS]+$/;

/** Which classes a text names, ignoring tokens that are shapes rather than names. */
const literalsIn = (text: string): string[] =>
  INCIDENTAL.filter(({ pattern }) =>
    [...text.matchAll(new RegExp(pattern.source, 'g'))].some(
      (m) => !FORMAT_PLACEHOLDER.test(m[0]),
    ),
  ).map(({ name }) => name);

/**
 * Every parameter description in an input schema, in both shapes this repo
 * ships.
 *
 * **Two shapes, and the second one is why this is not a one-liner.** Most tools
 * declare JSON Schema (`{ type: 'object', properties: { x: { description } } }`),
 * where the text is an own enumerable property. Eight declare a flat map of Zod
 * fields instead (`{ package_name: z.string().describe('…') }`) — no
 * `properties` wrapper, and in Zod 4 `.description` is a GETTER on the prototype,
 * so `Object.entries` does not see it and `inputSchema.properties` is `undefined`.
 * The first version of this walker read only `properties` and only own keys, so
 * `CreatePackage` and seven others were never checked at all: a reviewer put the
 * transport literal back into `CreatePackage`'s `transport_request` and every
 * assertion stayed green (PR #244).
 *
 * So: read `description` by ACCESS rather than by enumeration, and recurse
 * through Zod's wrappers (`ZodOptional`, `ZodDefault`, `ZodArray`, `ZodObject`)
 * as well as plain objects and arrays.
 */
const parameterDescriptions = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(parameterDescriptions);
  if (node === null || typeof node !== 'object') return [];
  const found: string[] = [];
  // A getter or an own property, JSON Schema or Zod, both answer here.
  const stated = (node as { description?: unknown }).description;
  if (typeof stated === 'string') found.push(stated);
  const def = (node as { def?: Record<string, unknown> }).def;
  for (const inner of [def?.shape, def?.innerType, def?.type, def?.options]) {
    if (inner !== undefined) found.push(...parameterDescriptions(inner));
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' && typeof value === 'string') continue;
    found.push(...parameterDescriptions(value));
  }
  return found;
};

/** A tool's parameter text, whichever shape its schema is written in. */
const parametersOf = (definition: {
  inputSchema?: { properties?: unknown };
}): string[] =>
  parameterDescriptions(
    definition.inputSchema?.properties ?? definition.inputSchema,
  );

/**
 * The tools that take no parameter at all — a fixed, tiny list, so a schema
 * shape that stops being read shows up here as a new name rather than as
 * silence. This one answers a feed with no argument; `HandlerProfileList` was the
 * other until the compact facade moved into `@mcp-abap-adt/compact-readonly`.
 */
const TAKES_NO_PARAMETERS = ['RuntimeListProfilerTraceFiles'];

describe('descriptions carry no incidental literals', () => {
  const tools = new HandlerExporter({
    includeReadOnly: true,
    includeHighLevel: true,
    includeLowLevel: true,
    includeSystem: true,
    includeSearch: true,
    includeDebug: true,
  })
    .getHandlerEntries()
    .map((e) => e.toolDefinition);

  it('the classes catch new literals and leave generic text alone', () => {
    for (const literal of [
      'optional for $TMP objects',
      'in package $ZLOCAL',
      "e.g. 'ZCL_DEMO'",
      'mask ZOK*',
      'class YFOO_BAR',
      'include LZOK_FG_MCP01F01',
      'transport SIDK905635',
      'transport ER121235',
    ]) {
      expect([literal, literalsIn(literal).length > 0]).toEqual([
        literal,
        true,
      ]);
    }
    for (const generic of [
      "wildcard pattern (e.g. 'Z*')",
      'masks (Z*, /NS/Z*)',
      'customer masks Z* and Y*',
      'any namespace: /*/*',
      'filter by type (PROG, CLAS, INTF, DEVC, TABL)',
      'e.g. "CLAS/OC"',
      'optional for local objects',
      'Start of time range in YYYYMMDDHHMMSS format.',
      'End of time range (YYYYMMDDHHMMSS).',
      // Neither a message number nor a release is a transport number.
      'refused with CTS_WBO_API 020',
      'measured on BASIS 816',
      'answers TK127 on premise',
    ]) {
      expect([generic, literalsIn(generic)]).toEqual([generic, []]);
    }
  });

  it('sees every tool group', () => {
    expect(tools.length).toBeGreaterThan(300);
  });

  it('reads the parameter descriptions it claims to read', () => {
    // Guards the selector: one that finds nothing would make the checks below
    // pass over no text at all, which is how a probe once reported "0
    // violations" from a scan of 0 tools.
    const all = tools.flatMap(parametersOf);
    expect(all.length).toBeGreaterThan(500);
    expect(all.some((text) => /transport request number/i.test(text))).toBe(
      true,
    );
    // The gap this replaced was invisible to a total: a whole shape of schema
    // read as zero while the total stayed over 500. So assert per tool — every
    // tool that declares a parameter yields its text, and the only tools
    // without one are the tools that take no parameters.
    const silent = tools
      .filter((t) => parametersOf(t).length === 0)
      .map((t) => t.name)
      .sort();
    expect(silent).toEqual(TAKES_NO_PARAMETERS);
  });

  for (const { name } of INCIDENTAL) {
    it(`no tool description names ${name}`, () => {
      const offenders = tools
        .filter((t) => literalsIn(t.description).includes(name))
        .map((t) => t.name);
      expect(offenders).toEqual([]);
    });

    it(`no parameter description names ${name}`, () => {
      const offenders = tools
        .flatMap((t) => parametersOf(t).map((text) => [t.name, text] as const))
        .filter(([, text]) => literalsIn(text).includes(name))
        .map(([tool, text]) => `${tool}: ${text.slice(0, 80)}`);
      expect(offenders).toEqual([]);
    });
  }
});
