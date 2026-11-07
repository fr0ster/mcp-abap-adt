/**
 * `npm run test:check` compiles this file: the orchestrator's deps require
 * the line-match strategy (DO14) — leaving it out does not compile, so the
 * `@ts-expect-error` below fails the check the moment the strategy turns
 * optional.
 */
import type { OrchestratorDeps } from '../../lib/search-source/orchestrator';
import { exactPackages, sourcesFrom } from '../helpers/sourceReaderFake';

// @ts-expect-error the orchestrator has no line match of its own
export const withoutStrategy: OrchestratorDeps = {
  fetchPackageContents: async () => [],
  sourceReader: sourcesFrom({}),
  resolvePackages: exactPackages,
};
