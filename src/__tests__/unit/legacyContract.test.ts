import { globSync } from 'node:fs';
import ts from 'typescript';
import { compilerOptions } from '../../../scripts/lib/analyseOmissions';

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
 * **Resolved by the type checker, not matched against the parameter's own
 * text.** An AST walk bounds the search window to exactly one parameter — a
 * real improvement over a regex over the whole class body, which silently
 * dropped `AdtRequestLegacy.create` (see below) — but a first draft here
 * still finished the job with `/IAdtOperationOptions|IAdtCreateOptions
 * |analyse/.test(parameter.getText())`, a substring match over that
 * parameter's own source text. That is wrong for the same reason
 * `analyseOmissions.ts` asks the checker instead of the text at a call site:
 * a named options type that itself extends or re-exports
 * `IAdtOperationOptions` under a different name — nothing here requires the
 * literal identifier to appear — would still read as accepting no strategy,
 * because the substring genuinely is not in the parameter's text. Asking
 * `checker.getTypeAtLocation(parameter)` for the resolved type's own
 * properties, the way `analyseOmissions` does for a real call's last
 * argument, sees through an alias to the actual shape and is what this test
 * does now: a `ts.Program` built from the same `compilerOptions()`
 * `analyseOmissions.ts` uses (this module resolves `@mcp-abap-adt/interfaces`
 * imports the same way), asking the checker rather than the source text.
 *
 * **The AST walk stays, because a regex over the whole file has a real,
 * demonstrated bug.** A text scan for `^ {4}(\w+)\(([\s\S]*?)\)\s*:\s*
 * Promise<` over the whole class body — the brief's own worked example —
 * silently drops `AdtRequestLegacy.create`. `AdtRequestLegacy` is the one
 * class among these four whose `.d.ts` also declares a `constructor(...)`,
 * which does not end in `: Promise<`; the regex's lazy parameter group then
 * backtracks PAST the constructor's own closing paren, through `create<E
 * extends IAdtError = IAdtError>(`'s opening paren, and matches `create`'s
 * closing paren and `: Promise<` instead — folding two unrelated
 * declarations into one match and reporting `constructor`'s (irrelevant,
 * filtered out) decl text while `create` is never matched on its own.
 * Confirmed by running the brief's own regex against the installed package:
 * it answers three members for `AdtRequestLegacy`, not four. Parsing each
 * method's own parameter list via the AST — which the compiler already
 * knows is exactly one method wide — cannot cross into a sibling
 * declaration the way a text scan can, so it sees all four; asking the
 * checker for that parameter's type is what then decides the four
 * correctly, including seeing past an alias a text match on that same
 * parameter would still miss.
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
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text !== 'constructor',
  );
}

/** Does this method's own last parameter — its options, when it has one — RESOLVE to a type accepting a strategy? */
function acceptsAnalyse(
  method: ts.MethodDeclaration,
  checker: ts.TypeChecker,
): boolean {
  const last = method.parameters.at(-1);
  if (last === undefined) return false;
  // The resolved type, not the parameter's spelling — an aliased options
  // type that extends `IAdtOperationOptions` under a different name still
  // structurally carries `analyse`, and only the checker sees that.
  const type = checker.getNonNullableType(checker.getTypeAtLocation(last));
  return type.getProperties().some((p) => p.name === 'analyse');
}

it('pins the legacy members whose own declared type accepts no strategy', () => {
  const files = globSync(
    'node_modules/@mcp-abap-adt/adt-clients/dist/core/**/*Legacy.d.ts',
  );
  const program = ts.createProgram(files, compilerOptions());
  const checker = program.getTypeChecker();

  const found: Record<string, string[]> = {};
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source === undefined) continue;
    const cls = file.split('/').pop()!.replace('.d.ts', '');
    const members = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        for (const method of ownMethodsOf(node)) {
          if (!acceptsAnalyse(method, checker)) {
            members.add((method.name as ts.Identifier).text);
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
