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
 * **Scope: tool descriptions only, deliberately.** Parameter descriptions break
 * the same rule today — measured on this branch, 254 of 370 tools, 464
 * occurrences, among them a real transport number from a real system 72 times and
 * the author's own package names 42 times. Extending this test to them is the
 * follow-up that replaces that text; widening it now would only fail 254 tools
 * without fixing one of them.
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
 * names our prefix and fails. A mask with no concrete prefix — `Z*`, `/NS/Z*`,
 * the namespace alone — names nothing and stays allowed.
 */
const INCIDENTAL = [
  { name: 'a package name ($TMP, $ANY)', pattern: /\$[A-Z][A-Z0-9_]*/ },
  {
    name: 'a customer-namespace object name (ZCL_DEMO, ZOK*, YFOO)',
    pattern: /\b[ZY][A-Z0-9_]{2,}/,
  },
  {
    name: 'a transport number (E19K905635)',
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
      'transport E19K905635',
    ]) {
      expect([literal, caught(literal)]).toEqual([literal, true]);
    }
    for (const generic of [
      "wildcard pattern (e.g. 'Z*')",
      'masks (Z*, /NS/Z*)',
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
});
