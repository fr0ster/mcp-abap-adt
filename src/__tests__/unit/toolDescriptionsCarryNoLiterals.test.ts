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
    name: 'a transport number (SIDK905635)',
    pattern: /\b[A-Z0-9]{3}K9\d{5}\b/,
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

/** Every `description` anywhere in an input schema, nesting included. */
const parameterDescriptions = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(parameterDescriptions);
  if (node === null || typeof node !== 'object') return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' && typeof value === 'string') found.push(value);
    else found.push(...parameterDescriptions(value));
  }
  return found;
};

describe('descriptions carry no incidental literals', () => {
  const tools = new HandlerExporter({
    includeReadOnly: true,
    includeHighLevel: true,
    includeLowLevel: true,
    includeCompact: true,
    includeSystem: true,
    includeSearch: true,
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
    const all = tools.flatMap((t) =>
      parameterDescriptions(t.inputSchema?.properties),
    );
    expect(all.length).toBeGreaterThan(500);
    expect(all.some((text) => /transport request number/i.test(text))).toBe(
      true,
    );
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
        .flatMap((t) =>
          parameterDescriptions(t.inputSchema?.properties).map(
            (text) => [t.name, text] as const,
          ),
        )
        .filter(([, text]) => literalsIn(text).includes(name))
        .map(([tool, text]) => `${tool}: ${text.slice(0, 80)}`);
      expect(offenders).toEqual([]);
    });
  }
});
