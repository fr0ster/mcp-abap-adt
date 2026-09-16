import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Where the legacy contract decides for itself.
 *
 * Passing a strategy these members have no parameter for is harmless —
 * JavaScript drops it — but the verdict is then adt-clients', and a refusal
 * encoded inside a 200 stays masked on a legacy system. Pinned so the set
 * cannot grow without someone saying so, and so the release notes can name it.
 * The real fix is one contract across a class and its Legacy twin: issue #200.
 *
 * **Not `LEGACY_NO_STRATEGY` from `scripts/lib/analyseOmissions.ts`, on
 * purpose.** That ledger (asserted against the shipped `.js` by
 * `legacyMembersPinnedToPackage.test.ts`) answers "does this member exist as
 * an override at all" — eighteen of them, nine of which (`AdtRequestLegacy.
 * readMetadata` among them) declare a parameter that DOES type as accepting
 * `analyse` and simply never read it out of the object at runtime. That is
 * an implementation-level drop, invisible here. This pin reads the opposite
 * end: the member's own declared TYPE, straight from the shipped `.d.ts` —
 * a strictly narrower set, because a member whose type accepts `analyse` is
 * excluded here even when its body throws the value away.
 *
 * **Parsed with the compiler's own AST, not a regex over the text.** A
 * regex tried first — `/^ {4}(\w+)\(([\s\S]*?)\)\s*:\s*Promise</gm` over the
 * whole class body — and it silently dropped `AdtRequestLegacy.create`.
 * `AdtRequestLegacy` is the one class among these four whose `.d.ts` also
 * declares a `constructor(...)`, which does not end in `: Promise<`; the
 * regex's lazy parameter group then backtracked PAST the constructor's own
 * closing paren, through `create<E extends IAdtError = IAdtError>(`'s
 * opening paren, and matched `create`'s closing paren and `: Promise<`
 * instead — folding two unrelated declarations into one match and reporting
 * `constructor`'s (irrelevant, filtered out) decl text while `create` was
 * never matched on its own and dropped from the set entirely. Confirmed by
 * running the brief's own regex against the installed package: it answers
 * three members for `AdtRequestLegacy`, not four, and the missing one is
 * exactly the one member the class shares no boundary keyword with its
 * neighbour. Parsing each method's own last-parameter node — which the
 * compiler already knows is exactly one parameter wide — cannot cross into
 * a sibling declaration the way a text scan can, so it sees all four.
 */
const PINNED = {
  AdtPackageLegacy: [
    'create',
    'read',
    'readMetadata',
    'updateMetadata',
    'delete',
    'validate',
  ],
  AdtUnitTestLegacy: ['run', 'getStatus', 'getResult'],
  AdtRequestLegacy: ['create', 'delete', 'updateMetadata', 'list'],
  AdtUtilsLegacy: [
    'activateObjectsGroup',
    'getTableContents',
    'getTableColumns',
    'getSqlQuery',
  ],
};

/** Every own method a class declares — not its constructor, not what it inherits. */
function ownMethodsOf(classNode: ts.ClassDeclaration): ts.MethodDeclaration[] {
  return classNode.members.filter(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) && ts.isIdentifier(member.name),
  );
}

/** Does this method's own last parameter — its options, when it has one — type as accepting a strategy? */
function acceptsAnalyse(method: ts.MethodDeclaration): boolean {
  const last = method.parameters.at(-1);
  if (last === undefined) return false;
  // The parameter's OWN text, not the surrounding source: a sibling
  // declaration's text can never leak in, because the node itself ends
  // exactly where the parameter does.
  return /IAdtOperationOptions|IAdtCreateOptions|analyse/.test(last.getText());
}

it('pins the legacy members whose own declared type accepts no strategy', () => {
  const found: Record<string, string[]> = {};
  for (const file of globSync(
    'node_modules/@mcp-abap-adt/adt-clients/dist/core/**/*Legacy.d.ts',
  )) {
    const cls = file.split('/').pop()!.replace('.d.ts', '');
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const members = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        for (const method of ownMethodsOf(node)) {
          const name = (method.name as ts.Identifier).text;
          if (name !== 'constructor' && !acceptsAnalyse(method)) {
            members.add(name);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (members.size > 0) found[cls] = [...members].sort();
  }
  // A new entry, or a grown one, means a legacy tool quietly lost its
  // verdict's type. Decide, then pin.
  expect(found).toEqual(
    Object.fromEntries(
      Object.entries(PINNED).map(([k, v]) => [k, [...v].sort()]),
    ),
  );
});
