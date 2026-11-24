import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import {
  about,
  entries,
  type Head,
  headShape,
  type JsonSchemas,
  jsonShapesOf,
  type ListAnswerTable,
  listAnswerAt,
  member,
  type RowSchemas,
  rows,
  shapesOf,
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

/** A sub-package as the document lists it. */
type SubPackage = ReturnType<typeof packageDetails>['sub_packages'][number];

/** The package's facts a terse answer writes as heads, each by its noun. */
export const PACKAGE_HEADS = [
  headShape('package', "the package's name"),
  headShape('description', 'its description'),
  headShape('package_type', 'its type'),
  headShape('super_package', 'its super package'),
  headShape('software_component', 'its software component'),
  headShape('application_component', 'its application component'),
  headShape('transport_layer', 'its transport layer'),
  headShape('language_version', 'its ABAP language version'),
  headShape('responsible', 'who is responsible for it'),
];

/** The package's subpackages at terse. */
export const PACKAGE_TERSE: RowSchemas<PackageDetails> = {
  sub_packages: about(
    'for each subpackage',
    rows('sub_packages', {
      columns: [
        {
          name: 'sub_package',
          means: 'its name',
          cell: (sub: SubPackage) => sub.name ?? '',
        },
        {
          name: 'description',
          means: 'its description',
          cell: (sub: SubPackage) => sub.description ?? '',
        },
      ],
      header: 'always',
    }),
  ),
};

/** The package at medium: its settings, each subpackage an entry. */
export const PACKAGE_MEDIUM: JsonSchemas<{ metadata: PackageDetails }> = {
  metadata: about(
    "the package's settings",
    member(
      'metadata',
      ({ sub_packages: _subPackages, ...facts }: PackageDetails) => facts,
      {
        lists: {
          sub_packages: about(
            'for each subpackage',
            entries('sub_packages', (sub: SubPackage) => sub),
          ),
        },
      },
    ),
  ),
};

/** The heads of a package's terse answer: its name, then each fact it holds. */
export function packageHeads(
  packageName: string,
  read: PackageDetails,
): Head[] {
  const {
    sub_packages: _subPackages,
    sub_package_count: _count,
    ...facts
  } = read;
  return [
    { head: 'package', value: facts.name ?? packageName },
    ...Object.entries(facts).flatMap(([field, value]) =>
      field === 'name' || value === undefined ? [] : [{ head: field, value }],
    ),
  ];
}

export const TOOL_DEFINITION = {
  name: 'GetPackage',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads an ABAP package: its settings and its subpackages, at the version asked.',
    ),
    returns: returnsOf({
      heads: PACKAGE_HEADS,
      shapes: [shapesOf(PACKAGE_TERSE), jsonShapesOf(PACKAGE_MEDIUM)],
    }),
  }),
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
      PACKAGE_MEDIUM,
    );
  };
  return {
    terse: (document: string) => {
      const read = packageDetails(document);
      return writeListing({
        heads: packageHeads(packageName, read),
        reading: read,
        lists: PACKAGE_TERSE,
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
