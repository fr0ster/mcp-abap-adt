import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { type AnswerTable, answerAt } from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { readPackageMetadata } from '../../../lib/strategies/metadataReads';
import {
  packageDetails,
  packageSummary,
} from '../../../lib/strategies/packageSummary';
import type { AdtReading } from '../../../lib/strategies/reading';

export const TOOL_DEFINITION = {
  name: 'GetPackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP package named by package_name in one request: its ADT metadata document (description, super-package, sub-packages, ...), at the version asked. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.',
  inputSchema: z.object({
    package_name: requiredText('package_name is required').describe(
      'Package name.',
    ),
    version: READ_VERSION_FIELD,
    ...DETAIL_SHAPE,
  }),
} as const;

type GetPackageArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * What the package answers at each `detail`, selected through a table
 * (`src/lib/detail`): terse a summary, medium and full the details, raw
 * the metadata document as SAP sent it, nothing of ours around it.
 */
function packageAnswers(
  packageName: string,
  version: string,
): AnswerTable<string, string | object> {
  const answered = (metadata: object) => ({
    success: true,
    package_name: packageName,
    version,
    part: 'metadata',
    metadata,
  });
  return {
    terse: (document) => answered(packageSummary(document)),
    medium: (document) => answered(packageDetails(document)),
    full: (document) => answered(packageDetails(document)),
    raw: (document) => document,
  };
}

export async function handleGetPackage(
  context: HandlerContext,
  args: GetPackageArgs,
) {
  const { connection, logger } = context;
  const { package_name, version = 'active' } = args;
  const packageName = package_name.toUpperCase();
  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);

  // A package is a container: it has no source of its own —
  // `IPackageContract` composes `IAdtMetadataReadable` and nothing else, so
  // unlike its siblings there is no `.read()` to call at all. One call, at
  // the version asked.
  return answer(
    { tool: 'GetPackage', detail },
    () => readPackageMetadata(client, { packageName }, version),
    (metadata: AdtReading<string>) =>
      answerAt(
        packageAnswers(packageName, version),
        levelOf(args),
      )(metadata.raw),
  );
}
