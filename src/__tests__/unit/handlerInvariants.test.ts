import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { analyseOmissions } from '../../../scripts/lib/analyseOmissions';

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
 * Every offender `analyseOmissions` names today, and why each is excused —
 * or isn't.
 *
 * Running the check fresh against this tree (not assumed from an earlier
 * report) found six, not the four this list carries: two in
 * `handleGetStructuresList.ts` were genuine bugs, not exceptions, and are
 * fixed in this same commit rather than excused here — `extractSource` read
 * `.data`/`.readResult.data`, the pre-19 wire shape, which answers
 * `undefined` on both the success half (`{ ok: true, getResult() }`) and the
 * failure half (`{ ok: false, getError() }`) of the real contract. That made
 * `readDdl` fall through to the table endpoint for every structure, even
 * ones that would have read back fine — a functional bug, not a missing
 * strategy, and adding `analyse: analyseException` to both calls alongside
 * the `.ok`/`.getResult().value` fix was the actual repair.
 *
 * The remaining four are left as offenders on purpose, each already
 * reasoned about and documented at its own call site by an earlier task's
 * review — this list exists so a reviewer sees the four together, and so a
 * fifth one cannot join silently.
 */
const ANALYSE_EXCEPTIONS: ReadonlyArray<{
  file: string;
  call: string;
  reason: string;
}> = [
  {
    file: 'src/handlers/system/high/handleGetPackageTree.ts',
    call: 'client.getPackage().readMetadata',
    reason:
      'a judgement call, not a necessity, and weaker in kind than the other three exceptions here. `AdtPackage.readMetadata` ships no default strategy of its own to protect — passing `analyseException` would only ENRICH the message on refusal, not replace a tailored verdict with a worse one. Skipped anyway (task 25 review) because this call is a plain existence check: the default error contract already answers ok:false, and only that boolean is read here, so the enrichment was judged not worth adding.',
  },
  {
    file: 'src/handlers/service_binding/high/handleUpdateServiceBinding.ts',
    call: 'obj.update',
    reason:
      "AdtServiceBinding.update()'s own default `analyse` is the exported `publicationRefusal`, read from the job's own <SEVERITY> — already the tailored verdict this endpoint needs. Passing `analyseException` would REPLACE it (the member reads `options?.analyse ?? defaultCheck`, not both), with a strategy that inspects the wrong element.",
  },
  {
    file: 'src/handlers/message_class/readonly/handleReadMessageClassMessage.ts',
    call: '.getMessageClassMessage()\n        .read',
    reason:
      'AdtMessageClassMessage.read is one of two read-shaped members in the whole distribution that ship their own default strategy: it parses the class document and refuses OBJECT_NOT_FOUND when msgno is absent. Task 18 review round 1 found that passing `{ analyse: analyseException }` REPLACES that check rather than composing with it, letting a request for a nonexistent message answer success:true with the unrelated whole-class document.',
  },
  {
    file: 'src/handlers/message_class/high/handleGetMessageClassMessage.ts',
    call: '.getMessageClassMessage()\n        .read',
    reason:
      "Same member, same reasoning as ReadMessageClassMessage's exception above — this tool's own default msgno-presence check would be replaced, not composed with, by passing analyseException here.",
  },
];

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
  expect(inspected).toBeGreaterThan(200);

  const isExcused = (offender: string): boolean =>
    ANALYSE_EXCEPTIONS.some(
      (exc) =>
        offender.startsWith(`${exc.file}:`) && offender.includes(exc.call),
    );

  expect(offenders.filter((o) => !isExcused(o))).toEqual([]);

  // A named exception that no longer matches anything real is a stale entry
  // hiding nothing — harmless on its own, but a sign this list has drifted
  // from the code it describes. Each one must still be a live offender.
  for (const exc of ANALYSE_EXCEPTIONS) {
    expect(
      offenders.some(
        (o) => o.startsWith(`${exc.file}:`) && o.includes(exc.call),
      ),
    ).toBe(true);
  }
});
