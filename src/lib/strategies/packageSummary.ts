/**
 * What a package's metadata says, without the list of its sub-packages.
 *
 * The package document ADT answers carries every sub-package as a
 * `pak:packageRef` — measured on the cloud trial, a top-level package answered
 * about 950,000 characters for 5,815 of them, and no member object at all. That
 * list is not what a caller reading a package wants and is more than an MCP
 * client accepts, so the answer counts the sub-packages and leaves the list to
 * `detail: raw`. The objects a package contains are its contents, not its
 * metadata.
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

type Element = Record<string, unknown> & { '@'?: Record<string, string> };

const attrs = (element: unknown): Record<string, string> =>
  (element as Element | undefined)?.['@'] ?? {};

const count = (value: unknown): number =>
  value === undefined || value === ''
    ? 0
    : Array.isArray(value)
      ? value.length
      : 1;

export interface PackageSummary {
  name?: string;
  description?: string;
  package_type?: string;
  super_package?: string;
  software_component?: string;
  application_component?: string;
  transport_layer?: string;
  language_version?: string;
  responsible?: string;
  sub_package_count: number;
}

const orUndefined = (value: string | undefined) =>
  value === undefined || value === '' ? undefined : value;

export function packageSummary(xml: string): PackageSummary {
  const root = (parser.parse(xml) as Record<string, unknown>).package as
    | Element
    | undefined;
  const pkg = attrs(root);
  const transport = root?.transport as Element | undefined;
  const subPackages = root?.subPackages as Element | string | undefined;
  return {
    name: orUndefined(pkg.name),
    description: orUndefined(
      pkg.description ?? attrs(root?.packageRef).description,
    ),
    package_type: orUndefined(attrs(root?.attributes).packageType),
    super_package: orUndefined(attrs(root?.superPackage).name),
    software_component: orUndefined(attrs(transport?.softwareComponent).name),
    application_component: orUndefined(attrs(root?.applicationComponent).name),
    transport_layer: orUndefined(attrs(transport?.transportLayer).name),
    language_version: orUndefined(attrs(root?.attributes).languageVersion),
    responsible: orUndefined(pkg.responsible),
    sub_package_count:
      typeof subPackages === 'object' && subPackages !== null
        ? count((subPackages as Element).packageRef)
        : 0,
  };
}

export interface PackageDetails extends PackageSummary {
  sub_packages: Array<{ name?: string; description?: string }>;
}

/** The summary and, for `detail: full`, every sub-package by name and description. */
export function packageDetails(xml: string): PackageDetails {
  const root = (parser.parse(xml) as Record<string, unknown>).package as
    | Element
    | undefined;
  const subPackages = root?.subPackages as Element | string | undefined;
  const refs =
    typeof subPackages === 'object' && subPackages !== null
      ? (subPackages as Element).packageRef
      : undefined;
  const list = refs === undefined ? [] : Array.isArray(refs) ? refs : [refs];
  return {
    ...packageSummary(xml),
    sub_packages: list.map((ref) => ({
      name: orUndefined(attrs(ref).name),
      description: orUndefined(attrs(ref).description),
    })),
  };
}
