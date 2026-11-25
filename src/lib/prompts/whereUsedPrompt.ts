/**
 * The where_used prompt: the objects that use an object, by the where-used
 * code of its type — `GetWhereUsed` on the full set, `HandlerSystem`'s
 * `where_used` on compact — answered in the call.
 */
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import * as z from 'zod';
import type { TextElementsContainer } from '../../handlers/system/readonly/handleGetWhereUsed.js';
import { WHERE_USED_CODES, type WhereUsedCode } from '../adtProjections.js';
import { completeFrom } from './completion.js';
import {
  functionGroupTakers,
  nameArguments,
  objectNameOf,
} from './functionModule.js';
import { jsonLiteral } from './instruction.js';
import {
  objectArguments,
  offers,
  type StepArguments,
  userValue,
} from './objectPrompts.js';
import type { PromptObjectType } from './objectRows.js';
import { notServedWords, promptRefusal, requiredWords } from './refusals.js';
import { lowercaseKeyed, matchServed, requiredArgument } from './served.js';
import { listedProperty, longToolStep } from './source.js';
import type {
  AbapPrompt,
  ListedPromptTool,
  PromptInstruction,
  PromptSource,
} from './types.js';

/** The types `where_used` names: the vocabulary's, and the text elements of a program or a function group. */
export type WhereUsedType =
  | Extract<
      PromptObjectType,
      | 'CLASS'
      | 'INTERFACE'
      | 'PROGRAM'
      | 'INCLUDE'
      | 'FUNCTION_GROUP'
      | 'FUNCTION_MODULE'
      | 'PACKAGE'
      | 'DDL'
      | 'TABLE'
      | 'STRUCTURE'
      | 'TABLE_TYPE'
      | 'DOMAIN'
      | 'DATA_ELEMENT'
      | 'BEHAVIOR_DEFINITION'
      | 'METADATA_EXTENSION'
      | 'SERVICE_DEFINITION'
      | 'SERVICE_BINDING'
    >
  | 'TEXT_ELEMENTS';

/** The where-used code of each type, a code both kinds serve. */
export const WHERE_USED_AS = {
  CLASS: 'CLAS/OC',
  INTERFACE: 'INTF/OI',
  PROGRAM: 'PROG/P',
  INCLUDE: 'PROG/I',
  FUNCTION_GROUP: 'FUGR/F',
  FUNCTION_MODULE: 'FUGR/FF',
  PACKAGE: 'DEVC/K',
  DDL: 'DDLS/DF',
  TABLE: 'TABL/DT',
  STRUCTURE: 'TABL/DS',
  TABLE_TYPE: 'TTYP/DA',
  DOMAIN: 'DOMA/DD',
  DATA_ELEMENT: 'DTEL/DE',
  BEHAVIOR_DEFINITION: 'BDEF/BDO',
  METADATA_EXTENSION: 'DDLX/EX',
  SERVICE_DEFINITION: 'SRVD/SRV',
  SERVICE_BINDING: 'SRVB/SVB',
  TEXT_ELEMENTS: 'PROG/PX',
} as const satisfies {
  readonly [T in WhereUsedType]: WhereUsedCode<'onprem'> &
    WhereUsedCode<'cloud'>;
};

/** The types in the order they are offered. */
const WHERE_USED_TYPES: readonly WhereUsedType[] = [
  'CLASS',
  'INTERFACE',
  'PROGRAM',
  'INCLUDE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'PACKAGE',
  'DDL',
  'TABLE',
  'STRUCTURE',
  'TABLE_TYPE',
  'DOMAIN',
  'DATA_ELEMENT',
  'BEHAVIOR_DEFINITION',
  'METADATA_EXTENSION',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
  'TEXT_ELEMENTS',
];

/** The tool a where-used list is read with, and the arguments that open its call. */
interface WhereUsedRow {
  readonly tool: ListedPromptTool;
  readonly opening: StepArguments;
}

/** `GetWhereUsed` where it is listed, else `HandlerSystem` offering `where_used`. */
function whereUsedRow(source: PromptSource): WhereUsedRow | undefined {
  const full = source.tools.get('GetWhereUsed');
  if (full !== undefined) return { tool: full, opening: [] };
  const system = source.tools.get('HandlerSystem');
  return offers(source, system, 'where_used')
    ? { tool: system, opening: [['action', userValue('where_used')]] }
    : undefined;
}

/** Whose text elements they are: the closed set the where-used tools take. */
const CONTAINERS: readonly TextElementsContainer[] = [
  'program',
  'function_group',
];

const CONTAINER_WORDS =
  'For text_elements: whose text elements they are, program or function_group.';

/** `container` as given: required with text elements, read with them alone, one of the listed values in any case. */
function containerOf(
  given: string | undefined,
  type: WhereUsedType,
  listed: ReadonlyMap<string, TextElementsContainer>,
): TextElementsContainer | undefined {
  if (type !== 'TEXT_ELEMENTS') {
    if (given === undefined) return undefined;
    throw promptRefusal(
      'where_used: container is read with object_type text_elements only.',
    );
  }
  if (given === undefined) {
    throw promptRefusal(requiredWords('where_used', 'container'));
  }
  const container = matchServed(given, listed);
  if (container === undefined) {
    throw promptRefusal(
      `where_used: container is one of ${[...listed.values()].join(', ')}.`,
    );
  }
  return container;
}

/** `where_used`: the objects that use the object. */
export function whereUsedPrompt(source: PromptSource): AbapPrompt | undefined {
  const row = whereUsedRow(source);
  if (row === undefined) return undefined;
  const codes: readonly string[] = WHERE_USED_CODES[source.kind ?? 'onprem'];
  const types = WHERE_USED_TYPES.filter((type) =>
    codes.includes(WHERE_USED_AS[type]),
  );
  if (types.length === 0) return undefined;
  const served = types.map((type) => type.toLowerCase());
  const byLowercase = new Map(types.map((type) => [type.toLowerCase(), type]));
  const listedContainers = listedProperty(row.tool, 'container')?.values ?? [];
  const containers = CONTAINERS.filter((container) =>
    listedContainers.includes(container),
  );
  const containerByName = lowercaseKeyed(containers);
  const nameWords = listedProperty(row.tool, 'object_name')?.description;
  /** Whether `objectType` as given so far reads `container`: text elements, or none given yet. */
  const readsContainer = (objectType: string | undefined): boolean => {
    const given = objectType?.trim();
    return given === undefined || given === ''
      ? true
      : matchServed(given, byLowercase) === 'TEXT_ELEMENTS';
  };
  return {
    name: 'where_used',
    description: `Lists the objects that use the object of object_type named name: asks the model to call ${row.tool.definition.name}.`,
    argsSchema: {
      ...objectArguments(served),
      container: completable(
        z.string().optional().describe(CONTAINER_WORDS),
        (typed, context) =>
          readsContainer(context?.arguments?.object_type)
            ? completeFrom(containers, typed ?? '')
            : [],
      ),
    },
    instruction: (args): PromptInstruction => {
      const objectType = requiredArgument(args, 'object_type');
      if (objectType === undefined) {
        throw promptRefusal(requiredWords('where_used', 'object_type'));
      }
      const type = matchServed(objectType, byLowercase);
      if (type === undefined) {
        throw promptRefusal(notServedWords('where_used', objectType, served));
      }
      const name = requiredArgument(args, 'name');
      if (name === undefined) {
        throw promptRefusal(requiredWords('where_used', 'name'));
      }
      const container = containerOf(
        requiredArgument(args, 'container'),
        type,
        containerByName,
      );
      return {
        headline: `List where the ${type} ${jsonLiteral(name)} is used.`,
        steps: [
          longToolStep(row.tool, [
            ...row.opening,
            ...nameArguments(
              row.tool,
              type,
              'object_name',
              objectNameOf(
                'where_used',
                type,
                name,
                args,
                functionGroupTakers(served),
              ),
            ),
            ['object_type', userValue(WHERE_USED_AS[type])],
            ...(container === undefined
              ? []
              : [['container', userValue(container)] as const]),
          ]),
        ],
        notes:
          type === 'FUNCTION_MODULE' && nameWords !== undefined
            ? [`object_name: ${nameWords}`]
            : [],
      };
    },
  };
}
