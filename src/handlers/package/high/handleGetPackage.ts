import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  type AnswerTable,
  answerAt,
  completeAnswer,
  identityOf,
  Written,
} from '../../../lib/detail';
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
import { packageDetails } from '../../../lib/strategies/packageSummary';
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

/** Every sub-package the document holds, by its name as written. */
const heldSubPackages = (document: string) =>
  packageDetails(document).sub_packages.map((sub) =>
    identityOf([sub.name ?? '']),
  );

/**
 * What the package answers at each `detail`, selected through a table
 * (`src/lib/detail`): terse the package's facts as `#` lines and its
 * sub-packages as TSV rows, name and description; medium and full the
 * details, each sub-package written as a row; raw the metadata document as
 * SAP sent it, nothing of ours around it. Every sub-package, or nothing
 * (`completeAnswer`).
 */
function packageAnswers(
  packageName: string,
  version: string,
): AnswerTable<string, string | object> {
  const details = completeAnswer(
    'GetPackage',
    heldSubPackages,
    (document: string) => {
      const { sub_packages, ...facts } = packageDetails(document);
      // The sub-packages written as rows, inside the metadata as before.
      return Written.nested(
        {
          success: true,
          package_name: packageName,
          version,
          part: 'metadata',
        },
        'metadata',
        Written.json(facts, { sub_packages }, ['name']),
      );
    },
  );
  return {
    terse: completeAnswer('GetPackage', heldSubPackages, (document: string) => {
      const {
        sub_packages,
        sub_package_count: _count,
        ...facts
      } = packageDetails(document);
      return Written.text(
        [
          { head: 'package', value: facts.name ?? packageName },
          ...Object.entries(facts).flatMap(([field, value]) =>
            field === 'name' || value === undefined
              ? []
              : [{ head: field, value }],
          ),
          { header: ['sub_package', 'description'] },
          ...sub_packages.map((sub) => ({
            row: [sub.name ?? '', sub.description ?? ''],
          })),
        ],
        [0],
      );
    }),
    medium: details,
    full: details,
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
