import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  entries,
  type ListAnswerTable,
  listAnswerAt,
  member,
  rows,
  writeJson,
  writeListing,
} from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { readPackageMetadata } from '../../../lib/strategies/metadataReads';
import {
  type PackageDetails,
  packageDetails,
} from '../../../lib/strategies/packageSummary';
import type { AdtReading } from '../../../lib/strategies/reading';

export const TOOL_DEFINITION = {
  name: 'GetPackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP package named by package_name in one request: its ADT metadata document (description, super-package, sub-packages, ...), at the version asked. Per `detail`: terse a TSV summary (its facts as `# field value` lines, one row per sub-package); medium and full the details under `metadata`, with `part: "metadata"`; raw the document as SAP sent it.',
  inputSchema: z.object({
    package_name: requiredText('package_name is required').describe(
      'Package name.',
    ),
    version: READ_VERSION_FIELD,
    ...DETAIL_SHAPE,
  }),
} as const;

type GetPackageArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** A sub-package as the document lists it. */
type SubPackage = ReturnType<typeof packageDetails>['sub_packages'][number];

/**
 * What the package answers at each `detail`, selected through a table
 * (`src/lib/detail`): terse the package's facts as `#` lines and its
 * sub-packages as TSV rows, name and description; medium and full the
 * details, each sub-package an entry; raw the metadata document as SAP
 * sent it, nothing of ours around it. Every sub-package written by the
 * listing writers.
 */
function packageAnswers(
  packageName: string,
  version: string,
): ListAnswerTable<string, string | object> {
  const details = (document: string) => {
    // The sub-packages written from the document's own list, inside the
    // metadata as before.
    return writeJson(
      { success: true, package_name: packageName, version, part: 'metadata' },
      { metadata: packageDetails(document) },
      {
        metadata: member(
          'metadata',
          ({ sub_packages: _subPackages, ...facts }: PackageDetails) => facts,
          {
            lists: {
              sub_packages: entries('sub_packages', (sub: SubPackage) => sub),
            },
          },
        ),
      },
    );
  };
  return {
    terse: (document: string) => {
      const read = packageDetails(document);
      const {
        sub_packages: _subPackages,
        sub_package_count: _count,
        ...facts
      } = read;
      return writeListing({
        heads: [
          { head: 'package', value: facts.name ?? packageName },
          ...Object.entries(facts).flatMap(([field, value]) =>
            field === 'name' || value === undefined
              ? []
              : [{ head: field, value }],
          ),
        ],
        reading: read,
        lists: {
          sub_packages: rows('sub_packages', {
            columns: [
              {
                name: 'sub_package',
                cell: (sub: SubPackage) => sub.name ?? '',
              },
              {
                name: 'description',
                cell: (sub: SubPackage) => sub.description ?? '',
              },
            ],
            header: 'always',
          }),
        },
      });
    },
    medium: details,
    full: (document) => details(document).answer,
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
      listAnswerAt(
        packageAnswers(packageName, version),
        levelOf(args),
      )(metadata.raw),
  );
}
