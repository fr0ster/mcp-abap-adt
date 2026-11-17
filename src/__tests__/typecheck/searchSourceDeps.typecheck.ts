/**
 * `npm run test:check` compiles this file: the orchestrator's deps require
 * the line-match strategy (DO14) and the SAP-answer strategy (DO22) —
 * leaving either out does not compile, so each `@ts-expect-error` below
 * fails the check the moment its strategy turns optional — and the
 * SAP-answer strategy's two unions are closed as the plan states them.
 */
import { substringLineMatch } from '../../lib/search-source/lineScanner';
import type { OrchestratorDeps } from '../../lib/search-source/orchestrator';
import {
  type SapAnswerDecision,
  type SapAnswerPlace,
  skipSapAnswers,
} from '../../lib/search-source/readFailure';
import {
  exactPackages,
  listing,
  sourcesFrom,
} from '../helpers/sourceReaderFake';

// @ts-expect-error the orchestrator has no line match of its own
export const withoutStrategy: OrchestratorDeps = {
  sapAnswers: skipSapAnswers,
  fetchPackageContents: async (name) => listing(name, []),
  sourceReader: sourcesFrom({}),
  resolvePackages: exactPackages,
};

// @ts-expect-error the orchestrator has no failure rule of its own
export const withoutSapAnswers: OrchestratorDeps = {
  lineMatch: substringLineMatch,
  fetchPackageContents: async (name) => listing(name, []),
  sourceReader: sourcesFrom({}),
  resolvePackages: exactPackages,
};

/** `true` exactly when `A` and `B` are the same type. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const decisionsAreClosed: Same<
  SapAnswerDecision,
  'skip' | 'end' | 'throw'
> = true;

export const placesAreClosed: Same<
  SapAnswerPlace['kind'],
  'mask' | 'package' | 'level' | 'structure' | 'source'
> = true;
