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
import { attr, child, childAt, isList } from '../xml/tree';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

/** The attribute `name` of `element`'s attribute group (`@`). */
const at = (element: unknown, name: string): string | undefined =>
  attr(child(element, '@'), name);

const count = (value: unknown): number =>
  value === undefined || value === '' ? 0 : isList(value) ? value.length : 1;

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
  const root = child(parser.parse(xml), 'package');
  const transport = child(root, 'transport');
  return {
    name: orUndefined(at(root, 'name')),
    description: orUndefined(
      at(root, 'description') ?? at(child(root, 'packageRef'), 'description'),
    ),
    package_type: orUndefined(at(child(root, 'attributes'), 'packageType')),
    super_package: orUndefined(at(child(root, 'superPackage'), 'name')),
    software_component: orUndefined(
      at(child(transport, 'softwareComponent'), 'name'),
    ),
    application_component: orUndefined(
      at(child(root, 'applicationComponent'), 'name'),
    ),
    transport_layer: orUndefined(
      at(child(transport, 'transportLayer'), 'name'),
    ),
    language_version: orUndefined(
      at(child(root, 'attributes'), 'languageVersion'),
    ),
    responsible: orUndefined(at(root, 'responsible')),
    sub_package_count: count(childAt(root, 'subPackages', 'packageRef')),
  };
}

export interface PackageDetails extends PackageSummary {
  sub_packages: Array<{ name?: string; description?: string }>;
}

/** The summary and, for `detail: full`, every sub-package by name and description. */
export function packageDetails(xml: string): PackageDetails {
  const root = child(parser.parse(xml), 'package');
  const refs = childAt(root, 'subPackages', 'packageRef');
  const list = refs === undefined ? [] : isList(refs) ? refs : [refs];
  return {
    ...packageSummary(xml),
    sub_packages: list.map((ref) => ({
      name: orUndefined(at(ref, 'name')),
      description: orUndefined(at(ref, 'description')),
    })),
  };
}
