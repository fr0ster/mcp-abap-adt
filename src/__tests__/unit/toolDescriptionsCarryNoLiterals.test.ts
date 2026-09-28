/**
 * A tool's description is its search text.
 *
 * A consumer's tool-RAG indexes `description` and ranks it against the user's
 * request, so an incidental literal in it is a match on that literal. "Transport
 * request optional for $TMP objects" in every Delete* description made any
 * request mentioning $TMP — "which packages are in $TMP", "create a class in
 * $TMP" — retrieve the Delete* tools in bulk (issue #241). A description says
 * what the tool does; examples of package names, object prefixes or sample ids
 * belong in the parameter descriptions, which the calling model reads and
 * retrieval does not.
 */
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';

/**
 * Classes of literal, not a list of known offenders: a new example of the same
 * kind — another package, another customer object, a transport number — fails
 * here too. A bare mask such as `Z*` names no object and stays allowed.
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
