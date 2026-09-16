import { globSync, readFileSync } from 'node:fs';
import { analyseOmissions } from '../../../scripts/lib/analyseOmissions';

const handlers = globSync('src/handlers/**/handle*.ts');

/** The envelope is gone; a file still naming it is a file still on 18. */
it('no handler reads an envelope property', () => {
  const ENVELOPE =
    /\.(readResult|metadataResult|deleteResult|createResult|updateResult|unlockResult|activateResult|validationResponse|checkResult)\b/;
  expect(
    handlers.filter((f) => ENVELOPE.test(readFileSync(f, 'utf8'))),
  ).toEqual([]);
});

/** The verdict belongs to `analyse`. A handler reading the document to decide
 *  is a second opinion beside the strategy's, and the two will disagree. */
it('no handler decides a refusal for itself', () => {
  const VERDICT =
    /exc:exception|del:isDeleted|activationExecuted|chkrun:status|CHECK_RESULT/;
  expect(handlers.filter((f) => VERDICT.test(readFileSync(f, 'utf8')))).toEqual(
    [],
  );
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
      'a plain existence check before assembling the tree (task 25 review): the default error contract already answers ok:false on refusal, and only the boolean is read — no message enrichment, so no strategy is needed.',
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
