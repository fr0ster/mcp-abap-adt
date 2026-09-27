import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { analyseOmissions } from '../../../scripts/lib/analyseOmissions';
import { globSync } from '../helpers/platform';

const handlers = globSync('src/handlers/**/handle*.ts');

/**
 * Does this file's AST reach for any of these names as an actual property —
 * `.name`, `['name']`, or a destructured `{ name }` — rather than merely
 * mentioning the word in a comment or a log message?
 *
 * **Why the AST, not a regex over the text.** A first draft matched
 * `\.name\b` over the raw file text and had two failure modes at once: it
 * flagged accurate prose — a comment explaining what a strategy reads, or
 * what pre-migration code used to read, both of which legitimately name the
 * same wire attribute — and it missed a destructured read
 * (`const { readResult } = x`) and a bracket-accessed one
 * (`parsed['isDeleted']`), neither of which contains the literal substring
 * `.readResult`/`.isDeleted` the dot-anchored pattern required. Comments are
 * not nodes in the AST at all, so a structural walk never sees them, and a
 * `PropertyAccessExpression`/`ElementAccessExpression`/destructuring
 * `BindingElement` is exactly the three shapes an actual read takes,
 * independent of which of the three spellings the author used.
 */
function readsAnyPropertyNamed(
  sourceText: string,
  names: ReadonlySet<string>,
): boolean {
  const source = ts.createSourceFile(
    'f.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(node) && names.has(node.name.text)) {
      found = true;
      return;
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      names.has(node.argumentExpression.text)
    ) {
      found = true;
      return;
    }
    if (ts.isBindingElement(node)) {
      const key = node.propertyName ?? node.name;
      if (ts.isIdentifier(key) && names.has(key.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The envelope is gone; a file still reading one is a file still on 18. */
it('no handler reads an envelope property', () => {
  // A glob that stopped matching anything would make the assertion below
  // vacuously true — the same failure mode `analyseOmissions`'s own
  // `inspected` bound guards against, three tests down. 326 handler files
  // exist today; 200 is comfortably below that and well above zero.
  expect(handlers.length).toBeGreaterThan(200);

  const ENVELOPE_NAMES = new Set([
    'readResult',
    'metadataResult',
    'deleteResult',
    'createResult',
    'updateResult',
    'unlockResult',
    'activateResult',
    'validationResponse',
    'checkResult',
  ]);
  expect(
    handlers.filter((f) =>
      readsAnyPropertyNamed(readFileSync(f, 'utf8'), ENVELOPE_NAMES),
    ),
  ).toEqual([]);
});

/**
 * The verdict belongs to `analyse`. A handler reading the document to decide
 * is a second opinion beside the strategy's, and the two will disagree.
 *
 * Two spellings reach a handler for the same attribute: the namespaced one a
 * wire document carries, and the bare one an XML parser configured to strip
 * namespaces hands back instead. Both are listed for `exc:exception` and
 * `del:isDeleted`, because a parser option is not a defence against this
 * invariant.
 *
 * `chkrun:status` is listed in one spelling only, and deliberately. Its bare
 * twin is `status`, which every HTTP-shaped object in this tree also carries —
 * listing it would fail on `answer.status` and `reading.status`, which are not
 * verdicts and are read legitimately all over. So a handler that decides a
 * check's outcome from a namespace-stripped parse passes this invariant. That
 * is a known hole, not a claim of coverage; the omission audit and the two
 * strategy tests are what stand behind that case.
 */
it('no handler decides a refusal for itself', () => {
  expect(handlers.length).toBeGreaterThan(200);

  const VERDICT_NAMES = new Set([
    'exc:exception',
    'exception',
    'del:isDeleted',
    'isDeleted',
    'activationExecuted',
    'chkrun:status',
    'CHECK_RESULT',
  ]);
  expect(
    handlers.filter((f) =>
      readsAnyPropertyNamed(readFileSync(f, 'utf8'), VERDICT_NAMES),
    ),
  ).toEqual([]);
});

/**
 * **There are no excused offenders any more, and there is no list.**
 *
 * The four this list used to carry were all one case: a member that shipped a
 * tailored default `analyse` of its own, which passing `analyseException` would
 * have REPLACED rather than composed with — `AdtServiceBinding.update`'s
 * `publicationRefusal`, `AdtMessageClassMessage.read`'s msgno-presence check,
 * `AdtUnitTest.run`'s `startedRun`, plus `AdtPackage.readMetadata` as a
 * judgement call. adt-clients 23 ended that: every member reads
 * `options?.analyse` with no `?? default` behind it, and all four readings moved
 * into `@mcp-abap-adt/adt-strategies` under their own names. So the reason to
 * pass nothing inverted into a reason to pass exactly those —
 * `analysePublication`, `analyseMessageClassMessage(msgno)`,
 * `analyseUnitTestStart` — at the very call sites that used to be excused, and
 * an omission here is now an omission with no verdict behind it at all.
 *
 * The list stays deleted rather than emptied: an empty array with a comment
 * invites the next exception to be added quietly.
 */
/**
 * Resolved by the compiler, not matched by a regex over the text.
 *
 * Three earlier drafts of this test used a member-name allowlist and each was
 * wrong: `fetchNodeStructure` has an options parameter and accepts no strategy;
 * `AdtPackageLegacy.readMetadata<E>()` is generic and takes no parameters at
 * all; and `readMetadata` accepts one on thirty classes and not on
 * `AdtPackageLegacy`. A name cannot answer the question, so ask the type.
 *
 * Passing an `analyse` where it is not accepted is already a compile error, so
 * only the omission needs checking here.
 */
it('every client call that accepts an analyse is given one', () => {
  // The same function `scripts/check-analyse.ts` has been running per family
  // since Task 10. Here it runs over the whole tree, which is what the spec
  // makes a success criterion.
  const { offenders, inspected } = analyseOmissions(handlers);
  // 526 call sites accept one under adt-clients 23, where 275 did under 19 —
  // the release gave 79 more members an `analyse` and took every default away.
  // The floor stays well under that count, because it guards against a run that
  // resolved nothing, not against the number changing.
  expect(inspected).toBeGreaterThan(200);

  expect(offenders).toEqual([]);
});
