/**
 * What the top-level package live case reads and how it tears down, kept
 * apart from the live file so the unit tests can run both without SAP
 * (`topLevelPackageCase.test.ts`).
 */
import { packageSummary } from '../../lib/strategies/packageSummary';

/** An answer as the live helpers give it: its error flag and its text. */
export interface CaseAnswer {
  readonly isError?: boolean | undefined;
  readonly text: string;
}

/**
 * The package document a `GetPackage` raw read answered, when it is one:
 * the raw level answers SAP's XML document itself, nothing around it.
 */
function documentOf(answerText: string): string | undefined {
  return answerText.trimStart().startsWith('<') ? answerText : undefined;
}

/**
 * Why a `GetPackage` raw read is not the top-level package `packageName`;
 * `undefined` when it is. The document is parsed as the package tools parse
 * it (`packageSummary`): it names `packageName` and no super package.
 */
export function topLevelReadProblem(
  answerText: string,
  packageName: string,
): string | undefined {
  const document = documentOf(answerText);
  if (document === undefined) {
    return `the read holds no package document: ${answerText.slice(0, 2000)}`;
  }
  const summary = packageSummary(document);
  if (summary.name !== packageName) {
    return `the read names the package ${String(summary.name)}, not ${packageName}`;
  }
  if (summary.super_package !== undefined) {
    return `${packageName} reads the super package ${summary.super_package}`;
  }
  return undefined;
}

/**
 * The teardown of the case, in the session the case ran in: a lock it
 * still holds released under its handle first, then the package deleted —
 * the delete runs whatever the unlock answered, and a failed unlock fails
 * the teardown after it.
 */
export async function releaseThenDelete(
  held: string | undefined,
  unlock: (handle: string) => Promise<CaseAnswer>,
  remove: () => Promise<void>,
): Promise<void> {
  const failures: string[] = [];
  if (held !== undefined) {
    try {
      const answer = await unlock(held);
      if (answer.isError === true) {
        failures.push(`HandlerUnlock: ${answer.text}`);
      }
    } catch (error) {
      failures.push(
        `HandlerUnlock: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    await remove();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (failures.length > 0) {
    throw new Error(`teardown failed:\n${failures.join('\n')}`);
  }
}
