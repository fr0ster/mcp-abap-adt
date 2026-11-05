/**
 * Fields read off an object's metadata document and off a where-used scope,
 * through the XML parser (`parseStructure`): each the first element, in
 * document order, that carries what is asked for.
 */
import {
  attributeOf,
  firstAttributeOn,
  membersNamed,
  parseStructure,
  walkStructure,
} from './reading';

/** The package an object sits in: its `adtcore:packageRef`'s `adtcore:name`. */
export function packageRefNameOf(metadata: string): string | undefined {
  return firstAttributeOn(
    parseStructure(metadata),
    'adtcore:packageRef',
    'adtcore:name',
  );
}

/**
 * A class's sections, by `class:includeType` (definitions, implementations,
 * macros, testclasses, main), as its metadata lists them, in order.
 */
export function classIncludeTypesOf(metadata: string): string[] {
  return walkStructure(parseStructure(metadata)).flatMap(({ node }) => {
    const type = attributeOf(node, 'class:includeType');
    return type === undefined ? [] : [type];
  });
}

/** An include's main program: its `include:contextRef`'s `adtcore:uri`. */
export function includeContextUriOf(metadata: string): string | undefined {
  return firstAttributeOn(
    parseStructure(metadata),
    'include:contextRef',
    'adtcore:uri',
  );
}

/** The object types a where-used scope offers: each `usagereferences:type`'s `name`, in order. */
export function whereUsedScopeTypesOf(scope: string): string[] {
  return membersNamed(parseStructure(scope), 'usagereferences:type').flatMap(
    ({ node }) => {
      const name = attributeOf(node, 'name');
      return name === undefined ? [] : [name];
    },
  );
}
