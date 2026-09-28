/**
 * A tool's description is its search text — and it names nothing concrete.
 *
 * **The rule, stated by the user 2026-09-28: no concrete names in a description at
 * all.** A description says what the tool does, most important first — "creates a
 * domain; takes X; answers Y" — and an example of a package, an object or a
 * transport is never part of that. So this is not a heuristic about retrieval any
 * more: it is a rule, and a rule stated is a rule a test can keep.
 *
 * **Why a pattern, when ranking is measured with a RAG.** It is: the numbers in
 * issue #241 come from loading the descriptions into cloud-llm-hub's tool-RAG and
 * querying it, and that is how the wording in this PR was chosen. A pattern
 * measures no ranking and does not try to. It keeps the RULE, in the repository
 * where descriptions are authored and where no RAG runs — without it the next
 * `$TMP` returns and nothing here notices until a consumer's retrieval degrades.
 *
 * **Scope: every tool description, and parameter descriptions class by class as
 * each class is cleared.** Parameter descriptions broke the same rule — measured
 * 2026-09-28, 254 of 370 tools and 464 occurrences, among them a real transport
 * number from a real system 78 times and the author's own package names 42 times.
 * The transport numbers are gone (78 of them, across 78 files), so that class is
 * enforced on parameters here from now on. The package and customer-object classes
 * are not yet: enforcing them today would fail 254 tools without replacing one
 * line of their text, so each joins `ON_PARAMETERS_TOO` when its text is rewritten.
 * A class enforced on descriptions but not on parameters is a class still being
 * worked through, not a class exempt.
 *
 * A consumer's tool-RAG indexes `description` and ranks it against the user's
 * request, so an incidental literal in it is a match on that literal. "Transport
 * request optional for $TMP objects" in every Delete* description made any
 * request mentioning $TMP — "which packages are in $TMP", "create a class in
 * $TMP" — retrieve the Delete* tools in bulk (issue #241).
 */
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';

/**
 * Classes of literal, not a list of known offenders: a new example of the same
 * kind — another package, another customer object, a transport number — fails
 * here too. What is caught is a concrete name or prefix, mask or not: `ZOK*`
 * names our prefix and fails. A bare mask — `Z*`, `Y*`, any-namespace — names
 * nothing and stays allowed (the self-check below lists them).
 */
const INCIDENTAL = [
  { name: 'a package name ($TMP, $ANY)', pattern: /\$[A-Z][A-Z0-9_]*/ },
  {
    name: 'a customer-namespace object name (ZCL_DEMO, ZOK*, YFOO)',
    pattern: /\b[ZY][A-Z0-9_]{2,}/,
  },
  {
    name: 'a transport number (SIDK905635)',
    pattern: /\b[A-Z0-9]{3}K9\d{5}\b/,
  },
];

describe('tool descriptions carry no incidental literals', () => {
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
    const caught = (text: string) =>
      INCIDENTAL.some(({ pattern }) => pattern.test(text));
    for (const literal of [
      'optional for $TMP objects',
      'in package $ZLOCAL',
      "e.g. 'ZCL_DEMO'",
      'mask ZOK*',
      'class YFOO_BAR',
      'transport SIDK905635',
    ]) {
      expect([literal, caught(literal)]).toEqual([literal, true]);
    }
    for (const generic of [
      "wildcard pattern (e.g. 'Z*')",
      'masks (Z*, /NS/Z*)',
      'customer masks Z* and Y*',
      'any namespace: /*/*',
      'filter by type (PROG, CLAS, INTF, DEVC, TABL)',
      'e.g. "CLAS/OC"',
      'optional for local objects',
    ]) {
      expect([generic, caught(generic)]).toEqual([generic, false]);
    }
  });

  it('sees every tool group', () => {
    expect(tools.length).toBeGreaterThan(300);
  });

  for (const { name, pattern } of INCIDENTAL) {
    it(`no tool description names ${name}`, () => {
      const offenders = tools
        .filter((t) => pattern.test(t.description))
        .map((t) => t.name);
      expect(offenders).toEqual([]);
    });
  }

  /**
   * The classes already cleared out of PARAMETER descriptions, which are indexed
   * by a consumer's tool-RAG alongside the tool's own text and read by the model
   * that fills the argument. A transport number in `corrNr`'s description is the
   * worst of the three: it is a real request from a real system, so a model that
   * copies the example addresses somebody's transport.
   */
  const ON_PARAMETERS_TOO = ['a transport number (SIDK905635)'];

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

  for (const { name, pattern } of INCIDENTAL.filter((c) =>
    ON_PARAMETERS_TOO.includes(c.name),
  )) {
    it(`no parameter description names ${name}`, () => {
      const offenders = tools
        .flatMap((t) =>
          parameterDescriptions(t.inputSchema?.properties).map(
            (text) => [t.name, text] as const,
          ),
        )
        .filter(([, text]) => pattern.test(text))
        .map(([tool, text]) => `${tool}: ${text.slice(0, 80)}`);
      expect(offenders).toEqual([]);
    });
  }

  it('reads the parameter descriptions it claims to read', () => {
    // Guards the walker itself: a selector that finds nothing would make the
    // test above pass over any text at all, which is how the first version of
    // this file reported "0 violations" from a probe that scanned 0 tools.
    const all = tools.flatMap((t) =>
      parameterDescriptions(t.inputSchema?.properties),
    );
    expect(all.length).toBeGreaterThan(500);
    expect(all.some((text) => /transport request number/i.test(text))).toBe(
      true,
    );
  });
});
