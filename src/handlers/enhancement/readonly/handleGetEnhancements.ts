import {
  classDocuments,
  functionGroupDocuments,
  includeDocuments,
  programDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  AdtTypeCode,
  IAdtError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import * as z from 'zod';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../../../lib/adtHeaders/withAdtHeaders';
import type { AdtCodes, TableMainOf } from '../../../lib/adtProjections';
import {
  answerPayload,
  type FailureEntry,
  failedPayloadOf,
  failureEntry,
  isCredentialFailure,
  isCredentialPayload,
  type ListedAnswer,
  listedAnswer,
  type McpResult,
  messageOf,
  thrownEntry,
} from '../../../lib/answer';
import { failureOf } from '../../../lib/auth/failures';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import {
  about,
  asJsonResult,
  asTextResult,
  byListing,
  type DetailLevel,
  entries,
  type Head,
  type JsonSchemas,
  type ListAnswerTable,
  type Listing,
  listAnswerAt,
  marks,
  partsOf,
  type RowSchemas,
  rows,
  sections,
  type TextResult,
  values,
  type Written,
  wholeEntries,
  wholeMarks,
  wireAnswer,
  within,
  writeJson,
  writeJsonList,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { ReadVersion } from '../../../lib/handlers/readVersion';
import {
  isAnswerList,
  isAnswerObject,
  type JsonValue,
} from '../../../lib/json';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { includeContextUriOf } from '../../../lib/strategies/metadataFields';
import {
  childNodesOf,
  endsTheCall,
  nodeItemsOf,
} from '../../../lib/strategies/packageWalk';
import {
  attributeOf,
  parseStructure,
  walkStructure,
} from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import {
  carryingFailure,
  carryingPayload,
  methodFailureOf,
  payloadCarriedBy,
} from '../../../lib/strategies/step';
import { thrownAs } from '../../../lib/thrownValue';
import { logger, return_error } from '../../../lib/utils';
import {
  child,
  text,
  type XmlRead,
  entries as xmlEntries,
} from '../../../lib/xml/tree';

/**
 * Raised deliberately by the enhancement helpers. Distinguishes "I decided this
 * input is unusable" from "something unexpected failed", which the helpers'
 * catch blocks need in order to avoid double-wrapping a message.
 */
class EnhancementInputError extends Error {}

/**
 * How a caller may name a host GetEnhancements reads by its type: the code,
 * its main type — the one its entry in the tables states (`main`) — and the
 * tool's own names, each upper-cased.
 */
type HostSpelling = {
  [C in AdtTypeCode]: {
    readonly code: C;
    readonly main?: TableMainOf<C>;
    readonly names: readonly string[];
  };
}[AdtTypeCode];

/** The hosts GetEnhancements takes a type for, as a caller may name each. */
const HOST_SPELLINGS = {
  class: { code: 'CLAS/OC', main: 'CLAS', names: ['CLASS'] },
  group: {
    code: 'FUGR/F',
    main: 'FUGR',
    names: ['FUNCTION_GROUP', 'FUNCTIONGROUP'],
  },
  program: { code: 'PROG/P', main: 'PROG', names: ['PROGRAM'] },
  include: { code: 'PROG/I', names: ['INCLUDE'] },
} as const satisfies Readonly<Record<string, HostSpelling>>;

/** Whether `kind`, upper-cased, names `host`. */
function spelledAs(kind: string, host: HostSpelling): boolean {
  return kind === host.code || kind === host.main || host.names.includes(kind);
}

/** The tool's arguments, as its schema parses them. */
type GetEnhancementsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * Interface for enhancement implementation data
 */
export interface EnhancementImplementation {
  name: string;
  type: string;
  sourceCode?: string;
  description?: string;
}

/**
 * Interface for parsed enhancement response
 */
export interface EnhancementResponse {
  object_name: string;
  object_type: 'program' | 'include' | 'class' | 'function_group';
  context?: string | undefined;
  enhancements: EnhancementImplementation[];
  detailed?: boolean;
  total_enhancements?: number;
  /**
   * Probes that were refused rather than answering "not this kind of object".
   * Present only when there is something to say: an empty enhancement list and
   * a list nobody was allowed to read are different answers, and they used to
   * look the same.
   */
  unreadable?: FailureEntry[];
}

/** The first attribute of `node` whose name ends in `suffix` (`name` takes `enh:full_name` too). */
function endingIn(node: XmlRead, suffix: string): string | undefined {
  const found = xmlEntries(child(node, '@')).find(([key]) =>
    key.endsWith(suffix),
  );
  return found ? attributeOf(node, found[0]) : undefined;
}

/**
 * Parses enhancement XML to extract enhancement implementations with their source code
 * @param xmlData - Raw XML response from ADT
 * @returns Array of enhancement implementations
 */
export function parseEnhancementsFromXml(
  xmlData: string,
): EnhancementImplementation[] {
  const enhancements: EnhancementImplementation[] = [];

  try {
    // Every <enh:source> (in walkStructure's order), read through the XML parser:
    // its text (CDATA included) is the base64 encoded source code.
    const sources = walkStructure(parseStructure(xmlData)).filter(
      ({ name }) => name === 'enh:source',
    );
    sources.forEach((source, index) => {
      const enhancement: EnhancementImplementation = {
        name: `enhancement_${index + 1}`, // Default name if not found in attributes
        type: 'enhancement',
      };

      // The implementation a source sits in names it. Every source nests in
      // `enh:enhancementImplementations adtcore:name="…"`, so the nearest one
      // around it is its own — a search of the whole preceding document took
      // its FIRST name, which named all five of SAPMV45A's implementations
      // after the first (on premise, 2026-09-25). For a document without it,
      // the element the source sits in names it, else the nearest enclosing
      // element whose name says enhancement. (The text search named such a
      // source after the first tag before it mentioning "enhancement" with a
      // `name=` — typically the root, through its `xmlns:enh` URI — so two
      // sources in `<a adtcore:name="A">` and `<b adtcore:name="B">` under a
      // root named ROOT were ROOT, ROOT; they are A, B.)
      const around = [...source.path].reverse();
      const owner = around.find(
        ({ name }) => name === 'enh:enhancementImplementations',
      )?.node;
      const parent = around[0]?.node;
      const named = around.find(
        ({ name, node }) =>
          name.toLowerCase().includes('enhancement') &&
          endingIn(node, 'name') !== undefined,
      )?.node;
      const name =
        attributeOf(owner, 'adtcore:name') ??
        attributeOf(parent, 'adtcore:name') ??
        attributeOf(parent, 'enh:name') ??
        endingIn(parent, 'name') ??
        endingIn(named, 'name');
      const type =
        attributeOf(owner, 'adtcore:type') ??
        attributeOf(parent, 'adtcore:type') ??
        attributeOf(parent, 'enh:type') ??
        endingIn(parent, 'type');
      if (name) enhancement.name = name;
      if (type) enhancement.type = type;

      // Decode the base64 source code
      const base64Source = text(source.node) ?? '';
      if (base64Source) {
        enhancement.sourceCode = Buffer.from(base64Source, 'base64').toString(
          'utf-8',
        );
      }

      enhancements.push(enhancement);
    });

    logger?.info(`Parsed ${enhancements.length} enhancement implementations`);
    return enhancements;
  } catch (parseError) {
    logger?.error('Failed to parse enhancement XML:', parseError);
    return [];
  }
}

/**
 * Whose enhancements to read, and what kind of object it is.
 *
 * **The caller's `object_type` decides; guessing is the fallback.** This
 * used to ignore it and probe class → program → include. A function group's
 * main program `SAPL<fg>` is none of those addressable things — on premise
 * (2026-09-25) all three URIs answered 404 — so the tool failed outright.
 * Its enhancements are the group's, which answer 200. Each probe that remains
 * is its own metadata read through adt-clients (`getClass()`, `getProgram()`,
 * `getInclude()`) with `analyseException`, so a refusal arrives in the shape
 * every other failure has.
 *
 * The elements themselves are read by the host's own adt-clients member,
 * `readEnhancementElements` (`IAdtEnhancementHost`, and
 * `IAdtIncludeEnhancementHost` for an include, whose read names its main
 * program).
 */
async function determineObjectTypeAndPath(
  connection: IAbapConnection,
  objectName: string,
  manualProgramContext?: string,
  requestedType?: string,
): Promise<{
  type: 'program' | 'include' | 'class' | 'function_group';
  /** The host's enhancement elements, read with `analyseException`. */
  readElements: () => Promise<IAdtResponse<string, IAdtError>>;
  context?: string | undefined;
  /** Probes that were refused rather than answering "not this kind". */
  unreadable?: FailureEntry[];
}> {
  const name = objectName.toUpperCase();
  const kind = (requestedType ?? '').trim().toUpperCase();

  const client = createAdtClient(connection, logger);
  const analyse = { analyse: analyseException };
  const classPath = {
    type: 'class' as const,
    readElements: () =>
      client
        .getClass(classDocuments)
        .readEnhancementElements({ className: name }, analyse),
  };
  const programPath = {
    type: 'program' as const,
    readElements: () =>
      client
        .getProgram(programDocuments)
        .readEnhancementElements({ programName: name }, analyse),
  };
  const groupPath = (group: string) => ({
    type: 'function_group' as const,
    readElements: () =>
      client
        .getFunctionGroup(functionGroupDocuments)
        .readEnhancementElements({ functionGroupName: group }, analyse),
  });
  // `SAPL<fg>` is the group's main program: address the group.
  const saplGroup =
    name.startsWith('SAPL') && name.length > 4 ? name.slice(4) : undefined;

  /**
   * What could not be read, and why. A probe that finds nothing is how this
   * handler learns which kind of object it was given; a probe that is REFUSED is
   * something else entirely, and both used to come back as `undefined`.
   *
   * So a `404` — the object is not of that kind, or not there — keeps the probe
   * going and says nothing, and anything else is collected and travels in the
   * answer beside the enhancements that were found: the method's error as it
   * is, with the probe's step. `ExceptionResourceNoAccess` is the case that
   * mattered: an object this user may not read answered "no enhancements",
   * which is a different statement from "could not look".
   */
  const unreadable: FailureEntry[] = [];
  /** Carry the refusals out with whichever path was resolved. */
  const withReport = <T extends { type: string }>(path: T) =>
    unreadable.length > 0 ? { ...path, unreadable } : path;
  /** A metadata read: its document when found, `undefined` otherwise. */
  const probe = async (
    step: string,
    read: () => Promise<IAdtResponse<string, IAdtError>>,
  ): Promise<string | undefined> => {
    try {
      const answer = await read();
      if (answer.ok) return String(answer.getResult().value ?? '');
      const error = answer.getError();
      // The credentials are the same for every probe: the call ends, as it came.
      if (isCredentialPayload(failureEntry(error, step)))
        throw carryingFailure(new Error(error.message), error, step);
      if (error?.response?.status !== 404)
        unreadable.push(failureEntry(error, step));
      return undefined;
    } catch (error) {
      if (isCredentialPayload(thrownEntry(error, step))) throw error;
      unreadable.push(thrownEntry(error, step));
      return undefined;
    }
  };

  /**
   * The object's kind could not be resolved. When probes were refused, the
   * answer is those refusals as they are, each with its step — not words that
   * replace them; when every probe found nothing (404), the words.
   */
  const unresolved = (message: string): never => {
    const words = new EnhancementInputError(message);
    throw unreadable.length > 0
      ? carryingPayload(words, { failures: unreadable })
      : words;
  };

  const asInclude = async () => {
    const metadata = await probe('read include metadata', () =>
      client
        .getInclude(includeDocuments)
        .readMetadata(
          { includeName: name },
          { version: 'active', analyse: analyseException },
        ),
    );
    if (metadata === undefined) return undefined;
    let context: string | undefined;
    let mainProgram: string | undefined;
    if (manualProgramContext) {
      context = `/sap/bc/adt/programs/programs/${manualProgramContext}`;
      mainProgram = manualProgramContext;
    } else {
      context = includeContextUriOf(metadata);
      mainProgram = context ? mainProgramOf(context) : undefined;
    }
    if (!context || !mainProgram) {
      throw new EnhancementInputError(
        `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
      );
    }
    // adt-clients takes the main program's name and builds its URI.
    const program = mainProgram;
    return {
      type: 'include' as const,
      readElements: () =>
        client
          .getInclude(includeDocuments)
          .readEnhancementElements(
            { includeName: name },
            { context: program, analyse: analyseException },
          ),
      context,
    };
  };

  // The type the caller named, taken at its word.
  if (spelledAs(kind, HOST_SPELLINGS.class)) {
    return withReport(classPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.group)) {
    return groupPath(saplGroup ?? name);
  }
  if (spelledAs(kind, HOST_SPELLINGS.program)) {
    return withReport(saplGroup ? groupPath(saplGroup) : programPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.include)) {
    const include = await asInclude();
    if (include) return withReport(include);
    return unresolved(`Include ${objectName} could not be read.`);
  }

  // No usable type: find out, one independent probe at a time.
  if (saplGroup) return withReport(groupPath(saplGroup));
  if (
    (await probe('read class metadata', () =>
      client
        .getClass(classDocuments)
        .readMetadata(
          { className: name },
          { version: 'active', analyse: analyseException },
        ),
    )) !== undefined
  ) {
    return withReport(classPath);
  }
  if (
    (await probe('read program metadata', () =>
      client
        .getProgram(programDocuments)
        .readMetadata(
          { programName: name },
          { version: 'active', analyse: analyseException },
        ),
    )) !== undefined
  ) {
    return withReport(programPath);
  }
  const include = await asInclude();
  if (include) return withReport(include);
  return unresolved(
    `Could not determine object type for: ${objectName}. Object is neither a valid class, program, include, nor a function group's main program.`,
  );
}

/** `text` up to the first of `stops`, or the whole of it when none is there. */
function beforeAny(text: string, stops: string): string {
  for (let end = 0; end < text.length; end++) {
    const character = text.charAt(end);
    if (stops.includes(character)) return text.slice(0, end);
  }
  return text;
}

/** Whether a node structure type is an includes folder: `PROG/I`, `FUGR/I`, any `…/I`. */
function isIncludesFolder(type: string): boolean {
  return type.endsWith('/I');
}

/**
 * The main program an include's `contextRef` URI names: a program's own name,
 * or `SAPL<group>` for a function group. `undefined` for any other URI.
 */
function mainProgramOf(uri: string): string | undefined {
  const last = (prefix: string) => {
    if (!uri.toLowerCase().startsWith(prefix)) return undefined;
    const segment = beforeAny(uri.slice(prefix.length), '/?#');
    return segment ? decodeURIComponent(segment).toUpperCase() : undefined;
  };
  const program = last('/sap/bc/adt/programs/programs/');
  if (program) return program;
  const group = last('/sap/bc/adt/functions/groups/');
  return group ? `SAPL${group}` : undefined;
}

/**
 * Internal function to get includes list using SAP ADT API
 * @param objectName - Name of the object
 * @param objectType - Type of the object ('program' | 'include' | 'class')
 * @returns Array of include names
 */
async function getIncludesListInternal(
  context: HandlerContext,
  objectName: string,
  objectType: 'program' | 'include' | 'class' | 'function_group',
): Promise<string[]> {
  const { connection, logger } = context;
  try {
    // Classes don't have includes in the traditional sense
    if (objectType === 'class') {
      logger?.info(
        `Classes don't have includes. Returning empty list for class '${objectName}'`,
      );
      return [];
    }

    // A function group's main program is walked as the group.
    const upper = objectName.toUpperCase();
    const isGroup =
      objectType === 'function_group' ||
      (upper.startsWith('SAPL') && upper.length > 4);
    const parentName =
      isGroup && upper.startsWith('SAPL') ? upper.slice(4) : upper;
    const parentType: AdtCodes<'FUGR/F' | 'PROG/P'> = isGroup
      ? 'FUGR/F'
      : 'PROG/P';

    if (objectType === 'include') {
      logger?.warn(
        `Include processing: assuming parent program for include ${objectName}`,
      );
    }

    // Create AdtClient and get utilities. `ourUtils` — not `resultsFor`'s
    // generic `structured` reading — because the shape this function needs
    // (objects at a level, and the type→nodeId pairs to descend into) is
    // exactly the node reading's level (`utilNodeContents`), the one reading
    // every node-structure caller reuses rather than re-derives.
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils(ourUtils);

    // Step 1: Get root node structure to find the includes node
    const rootResponse = await withAdtHeaders(
      context,
      'utils.fetchNodeStructure',
      (headers) =>
        utils.fetchNodeStructure(parentType, parentName, {
          headers,
          analyse: analyseException,
          nodeId: '000000', // Root node
          withShortDescriptions: true,
        }),
    );

    if (!rootResponse.ok) {
      // SAP's refusal is the method's error as it is, with the step — not an
      // empty list of includes.
      throw carryingFailure(
        new Error(rootResponse.getError().message),
        rootResponse.getError(),
        'read node structure',
      );
    }

    // Step 2: Find the includes (PROG/I) node id among the type folders.
    // The includes node is `PROG/I` or `FUGR/I` (SAPMV45A's is FUGR/I,
    // with PROG/I objects under it — on premise, 2026-09-25).
    const includesNode = childNodesOf(rootResponse.getResult().value).find(
      (info) => isIncludesFolder(info.type),
    );

    if (!includesNode) {
      logger?.info(`No includes node found for ${objectType} '${objectName}'`);
      return [];
    }

    // Step 3: Get includes list using the found node ID
    const includesResponse = await withAdtHeaders(
      context,
      'utils.fetchNodeStructure',
      (headers) =>
        utils.fetchNodeStructure(parentType, parentName, {
          headers,
          analyse: analyseException,
          nodeId: includesNode.nodeId,
          withShortDescriptions: true,
        }),
    );

    if (!includesResponse.ok) {
      throw carryingFailure(
        new Error(includesResponse.getError().message),
        includesResponse.getError(),
        'read includes node',
      );
    }

    // Step 4: Names of the objects under that node — de-duplicated, matching
    // the pre-migration parser's `[...new Set(...)]`.
    const includeNames = [
      ...new Set(
        nodeItemsOf(includesResponse.getResult().value).map((o) => o.name),
      ),
    ];

    logger?.info(
      `Found ${includeNames.length} includes for ${objectType} '${objectName}' using SAP ADT API`,
    );
    return includeNames;
  } catch (error) {
    // SAP's refusal carried with its step, or a credential failure as it
    // came (adt-clients rejects with it): never an empty list of includes.
    if (methodFailureOf(error) !== undefined || failureOf(error) !== undefined)
      throw error;
    logger?.error(
      `Failed to get includes list for ${objectType} '${objectName}':`,
      error,
    );
    return [];
  }
}

/**
 * Gets enhancements for a single object (program or include)
 * @param objectName - Name of the object
 * @param manualProgramContext - Optional manual program context for includes
 * @returns Enhancement response for the single object
 */
async function getEnhancementsForSingleObject(
  connection: IAbapConnection,
  objectName: string,
  manualProgramContext?: string,
  requestedType?: string,
): Promise<EnhancementResponse> {
  logger?.info(
    `Getting enhancements for single object: ${objectName}`,
    manualProgramContext
      ? `with manual program context: ${manualProgramContext}`
      : '',
  );

  // Determine object type and get appropriate path and context
  const objectInfo = await determineObjectTypeAndPath(
    connection,
    objectName,
    manualProgramContext,
    requestedType,
  );

  if (objectInfo.type === 'include' && objectInfo.context) {
    logger?.info(`Using context for include: ${objectInfo.context}`);
  }

  // The host's own adt-clients member, read with the strategy every other
  // read uses: SAP's refusal is the method's error as it is, with the step.
  const step = 'read enhancements';
  let answer: IAdtResponse<string, IAdtError>;
  try {
    answer = await objectInfo.readElements();
  } catch (thrown) {
    // A credential failure or an error already carrying its answer: as it is.
    if (
      failureOf(thrown) !== undefined ||
      methodFailureOf(thrown) !== undefined
    )
      throw thrown;
    const message = messageOf(thrown);
    throw new EnhancementInputError(
      `Failed to retrieve enhancements for ${objectName}: ${message}`,
    );
  }
  if (!answer.ok) {
    const error = answer.getError();
    throw carryingFailure(
      new EnhancementInputError(error.message),
      error,
      step,
    );
  }

  // Parse the XML to extract enhancement implementations
  const enhancements = parseEnhancementsFromXml(
    String(answer.getResult().value ?? ''),
  );

  return {
    object_name: objectName,
    object_type: objectInfo.type,
    context: objectInfo.context,
    enhancements: enhancements,
    ...(objectInfo.unreadable ? { unreadable: objectInfo.unreadable } : {}),
  };
}

/**
 * A credential failure, however it travels: a chain failure or a `401` on the
 * throw itself, or carried as the method's error of a read.
 */
function credentialFailure(thrown: unknown): boolean {
  return (
    isCredentialFailure(thrown) ||
    isCredentialPayload(thrownEntry(thrown, 'read enhancements'))
  );
}

/** An include whose enhancements SAP refused: its name, the step, the failures as they are. */
interface IncludeUnread {
  include: string;
  step: 'read enhancements';
  failures: FailureEntry[];
}

/** The answer with `include_nested`: every object read, the main one first. */
export interface NestedEnhancements {
  main_object: { name: string; type: EnhancementResponse['object_type'] };
  include_nested: true;
  total_objects_analyzed: number;
  total_enhancements_found: number;
  objects: EnhancementResponse[];
  includes_unread?: IncludeUnread[];
}

/** An enhancement with its whole source: an answer is never cut. */
function minimalEnhancement(enh: EnhancementImplementation) {
  return {
    name: enh.name,
    type: enh.type,
    sourceCode: enh.sourceCode,
  };
}

/** An object's enhancements and refused probes, each entry short: written by the JSON writer. */
const objectLists: JsonSchemas<EnhancementResponse> = {
  enhancements: entries('enhancements', minimalEnhancement),
  unreadable: entries('unreadable', (entry: FailureEntry) => entry),
};

/**
 * A nested enhancement response at medium, written from its own lists:
 * every object read — one without enhancements too, with its zero count —
 * each enhancement short, each refused probe whole.
 */
export function filterMinimalNested(response: NestedEnhancements) {
  return writeJson(
    {
      main_object: response.main_object,
      include_nested: response.include_nested,
      total_objects_analyzed: response.total_objects_analyzed,
      total_enhancements_found: response.total_enhancements_found,
    },
    response,
    {
      objects: entries(
        'objects',
        (obj: EnhancementResponse) => ({
          object_name: obj.object_name,
          object_type: obj.object_type,
          total_enhancements: obj.enhancements.length,
        }),
        { lists: objectLists },
      ),
      includes_unread: wholeEntries<IncludeUnread, 'includes_unread'>(
        'includes_unread',
      ),
    },
    {
      detailed: false,
      // The objects that have enhancements, counted; every object is listed.
      total_objects_with_enhancements: response.objects.filter(
        (obj) => obj.enhancements.length > 0,
      ).length,
    },
  );
}

/** One object's enhancement response at medium, written from its own lists. */
function filterMinimalEnhancements(response: EnhancementResponse) {
  return writeJson(
    {
      object_name: response.object_name,
      object_type: response.object_type,
      context: response.context,
      detailed: false,
      total_enhancements: response.enhancements.length,
    },
    response,
    objectLists,
  );
}

/** What an enhancements read answered: one object, or one with its includes. */
type EnhancementsRead =
  | { readonly kind: 'single'; readonly response: EnhancementResponse }
  | { readonly kind: 'nested'; readonly response: NestedEnhancements };

/** A read and whether the caller asked for every source whole. */
interface EnhancementsShown {
  readonly read: EnhancementsRead;
  readonly detailed: boolean;
}

/** One object's heads: its `# object`, its context where SAP gave one, and its count. */
const objectHeads = (response: EnhancementResponse): Head[] => [
  { head: 'object', value: `${response.object_type} ${response.object_name}` },
  ...(response.context ? [{ head: 'context', value: response.context }] : []),
  { head: 'count', value: String(response.enhancements.length) },
];

/** One object's lists: its enhancements as rows (no source), then each probe that was refused. */
const objectSchemas: RowSchemas<EnhancementResponse> = {
  enhancements: about(
    'for each enhancement',
    rows('enhancements', {
      columns: [
        {
          name: 'name',
          means: 'its name',
          cell: (enh: EnhancementImplementation) => enh.name,
        },
        {
          name: 'type',
          means: 'its type',
          cell: (enh: EnhancementImplementation) => enh.type,
        },
        {
          name: 'description',
          means: 'its description',
          cell: (enh: EnhancementImplementation) =>
            (enh.description ?? '').split('\n')[0] ?? '',
        },
      ],
      header: 'when-rows',
    }),
  ),
  unreadable: about(
    'what SAP answered to each read it refused while finding the kind of an object',
    marks('unreadable', 'unreadable', (entry: FailureEntry) => [
      JSON.stringify(entry),
    ]),
  ),
};

/** The lists of a response with its includes: each object's section, then every include not read. */
const nestedSchemas: RowSchemas<NestedEnhancements> = {
  objects: sections('objects', objectHeads, objectSchemas),
  // Each include whose enhancements could not be read, whole: its
  // failures inside it.
  includes_unread: about(
    'the includes whose enhancements SAP refused to read, with what it answered',
    wholeMarks<IncludeUnread, 'includes_unread'>(
      'includes_unread',
      'include_unread',
    ),
  ),
};

/** A read as its terse listing reads it: one object's response, or one with its includes. */
interface EnhancementsTerse {
  readonly single?: EnhancementResponse | undefined;
  readonly nested?: NestedEnhancements | undefined;
}

/** A read's response under the member its kind names. */
const terseOf = (read: EnhancementsRead): EnhancementsTerse =>
  read.kind === 'single'
    ? { single: read.response }
    : { nested: read.response };

/** The lists a EnhancementsTerse listing writes: what its description states. */
const ENHANCEMENTS_LISTS: RowSchemas<EnhancementsTerse> = {
  single: within<EnhancementResponse, 'single'>('single', objectSchemas),
  nested: within<NestedEnhancements, 'nested'>('nested', nestedSchemas),
};

export const TOOL_DEFINITION = {
  name: 'GetEnhancements',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the enhancement implementations of ABAP programs, includes, function groups or classes at their active version, and of their includes when asked.',
    ),
  }),
  inputSchema: z.object({
    object_name: z
      .string()
      .optional()
      .describe('Name of the ABAP object (with object_type; or give objects)'),
    object_type: z
      .string()
      .optional()
      .describe('[read-only] Type of the ABAP object'),
    objects: z
      .array(
        z.object({
          object_name: z.string().describe('Name of the ABAP object'),
          object_type: z.string().describe('Type of the ABAP object'),
        }),
      )
      .optional()
      .describe(
        '[read-only] Several objects, read together (give this or object_name and object_type)',
      ),
    program: z
      .string()
      .optional()
      .describe(
        "[read-only] An include's main program, when its metadata names none",
      ),
    include_nested: z
      .boolean()
      .optional()
      .describe(
        '[read-only] true: also the enhancements of every include of a program or function group',
      ),
    detailed: z
      .boolean()
      .optional()
      .describe(
        '[read-only] true: every field of each enhancement, as read; false (default): each enhancement by name, type and source. Either way every object read is answered, one without enhancements with total_enhancements 0',
      ),
    max_includes: z
      .number()
      .int()
      .optional()
      .describe(
        '[read-only] With include_nested: how many includes are read (default 50)',
      ),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

/**
 * The terse listing of a read, written from its own lists: one object's
 * heads and lists, or — with its includes — the total, each object's
 * section, and every include whose enhancements could not be read.
 */
function terseListing(read: EnhancementsTerse): Listing<EnhancementsTerse> {
  return {
    heads:
      read.single !== undefined
        ? objectHeads(read.single)
        : read.nested !== undefined
          ? [
              {
                head: 'total',
                value: String(read.nested.total_enhancements_found),
              },
            ]
          : [],
    reading: read,
    lists: ENHANCEMENTS_LISTS,
  };
}

/** The terse text of a read. */
const terseText = ({ read }: EnhancementsShown): Written<string> =>
  writeListing(terseListing(terseOf(read)));

/**
 * What `GetEnhancements` answers at each `detail`, selected before the reads
 * (`src/lib/detail`): the answer is built from several requests, so each
 * level is a formatter of what they read. Terse is TSV — each object's
 * enhancements, name, type and description, no source; medium, full and raw
 * the JSON answer, every source whole and every object read, one without
 * enhancements with its zero count (`detailed` adds every field).
 */
const ENHANCEMENT_ANSWERS: ListAnswerTable<EnhancementsShown, string | object> =
  (() => {
    // Detailed: the reading whole, every field; else every object and
    // enhancement written short by the JSON writer.
    const former = ({ read, detailed }: EnhancementsShown): Written<object> =>
      detailed
        ? writeWhole<object>({ ...read.response, detailed: true })
        : read.kind === 'single'
          ? filterMinimalEnhancements(read.response)
          : filterMinimalNested(read.response);
    return {
      // Every enhancement and every part not read, by the listing writer.
      terse: terseText,
      medium: former,
      full: (shown) => former(shown).answer,
      raw: (shown) => former(shown).answer,
    };
  })();

/** The answer a read is shown as, at the level asked. */
type EnhancementsAnswerOf = (shown: EnhancementsShown) => string | object;

/**
 * Each answered read, by the answer it became: a list call writes every
 * object's terse text from these by the listing writer, never by splicing the
 * single answers' texts.
 */
const readsOf = new WeakMap<McpResult, EnhancementsShown>();

/** A read's answer at the level asked, the read kept for a list call. */
function shownResult(
  shown: EnhancementsAnswerOf,
  read: EnhancementsShown,
): McpResult {
  const result = enhancementsResult(shown(read));
  readsOf.set(result, read);
  return result;
}

/** An answer's text: TSV as it is, JSON serialised. */
function enhancementsResult(answer: string | object): McpResult {
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: typeof answer === 'string' ? answer : JSON.stringify(answer),
      },
    ],
  };
}

/** The failures a throw carries as its payload's `failures`, when it carries a list. */
function carriedFailures(error: unknown): FailureEntry[] | undefined {
  const failures = payloadCarriedBy(error)?.failures;
  return isAnswerList(failures) ? failures.filter(isAnswerObject) : undefined;
}

/**
 * Handler to retrieve enhancement implementations for ABAP programs/includes
 * Automatically determines if object is a program or include and handles accordingly
 *
 * @param args - Tool arguments containing:
 *   - object_name: Name of the ABAP object
 *   - program: Optional manual program context for includes
 *   - include_nested: Optional boolean - if true, also searches enhancements in all nested includes
 *   - detailed: Optional boolean - if false (default), returns minimal info; if true, returns full details including raw XML
 *   - max_includes: Optional maximum number of includes to process (default: 50)
 * @returns Response with parsed enhancement data or error
 */
async function enhancementsOf(
  context: HandlerContext,
  args: GetEnhancementsArgs,
  shown: EnhancementsAnswerOf,
): Promise<McpResult> {
  const { connection, logger } = context;
  try {
    logger?.info('handleGetEnhancements called with args:', args);

    if (!args?.object_name) {
      return return_error('Object name is required');
    }

    const objectName = args.object_name;
    const manualProgram = args.program; // Optional manual program context for includes
    const includeNested = args.include_nested === true; // Optional boolean for recursive include search
    const isDetailed = args.detailed === true; // Optional boolean for detailed output

    const maxIncludes = args.max_includes ? args.max_includes : 50; // Maximum number of includes to process

    logger?.info(`Getting enhancements for object: ${objectName}`, {
      manualProgram: manualProgram || '(not provided)',
      includeNested: includeNested,
      maxIncludes: maxIncludes,
    });

    // Get enhancements for the main object
    const mainEnhancementResponse = await getEnhancementsForSingleObject(
      connection,
      objectName,
      manualProgram,
      args.object_type,
    );

    if (!includeNested) {
      // Return only main object enhancements
      // Apply filtering if not detailed; add the detailed flag for consistency
      return shownResult(shown, {
        read: { kind: 'single', response: mainEnhancementResponse },
        detailed: isDetailed,
      });
    }

    // If include_nested is true, also get enhancements from all nested includes
    logger?.info('Searching for nested includes and their enhancements...');

    // Simplified nested processing - no recursion, just flat list
    const processNestedIncludes = async () => {
      // Get flat list of all includes using the optimized GetIncludesList logic
      let includesList = await getIncludesListInternal(
        context,
        objectName,
        mainEnhancementResponse.object_type,
      );

      logger?.info(
        `Found ${includesList.length} includes (flat list, no recursion):`,
        includesList,
      );

      // Limit the number of includes to process
      if (includesList.length > maxIncludes) {
        logger?.warn(
          `Too many includes found (${includesList.length}). Limiting to first ${maxIncludes} includes.`,
        );
        includesList = includesList.slice(0, maxIncludes);
      }

      // An include whose request SAP refused is listed, the method's error as
      // it is with the step and the include's name, beside the others' results.
      const includesUnread: IncludeUnread[] = [];

      // Collect all enhancement responses
      const allEnhancementResponses: EnhancementResponse[] = [
        mainEnhancementResponse,
      ];

      // Sequential processing. No deadline of the server's: each read waits
      // for SAP's answer.
      for (const includeName of includesList) {
        try {
          logger?.info(`Getting enhancements for include: ${includeName}`);

          const includeEnhancements = await getEnhancementsForSingleObject(
            connection,
            includeName,
            manualProgram,
            'include',
          );

          allEnhancementResponses.push(includeEnhancements);
        } catch (error) {
          // The credentials are the same for every include: the call ends.
          if (credentialFailure(error)) throw error;
          includesUnread.push({
            include: includeName,
            step: 'read enhancements',
            failures: carriedFailures(error) ?? [
              thrownEntry(error, 'read enhancements'),
            ],
          });
          // Continue with the other includes
        }
      }

      return { allEnhancementResponses, includesUnread };
    };

    let allEnhancementResponses: EnhancementResponse[];
    let includesUnread: Awaited<
      ReturnType<typeof processNestedIncludes>
    >['includesUnread'];
    try {
      ({ allEnhancementResponses, includesUnread } =
        await processNestedIncludes());
    } catch (error) {
      if (credentialFailure(error)) throw error; // as it came
      logger?.error('Nested enhancement processing failed:', error);
      // Return partial results with just the main object
      const fallbackResult: McpResult = {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              main_object: {
                name: objectName,
                type: mainEnhancementResponse.object_type,
              },
              include_nested: true,
              // A refusal: the method's error as it is, with its step; a
              // throw of our own `client_threw` with the step.
              error: thrownEntry(error, 'list includes'),
              partial_result: true,
              total_objects_analyzed: 1,
              total_enhancements_found:
                mainEnhancementResponse.enhancements.length,
              objects: [mainEnhancementResponse],
            }),
          },
        ],
      };
      return fallbackResult;
    }

    // Create combined response
    const combinedResponse: NestedEnhancements = {
      main_object: {
        name: objectName,
        type: mainEnhancementResponse.object_type,
      },
      include_nested: true,
      total_objects_analyzed: allEnhancementResponses.length,
      total_enhancements_found: allEnhancementResponses.reduce(
        (sum, resp) => sum + resp.enhancements.length,
        0,
      ),
      objects: allEnhancementResponses,
      ...(includesUnread.length > 0 ? { includes_unread: includesUnread } : {}),
    };

    return shownResult(shown, {
      read: { kind: 'nested', response: combinedResponse },
      detailed: isDetailed,
    });
  } catch (error) {
    return return_error(error);
  }
}

/** A read of a node structure level: an object's root node, or its includes node. */
interface NodeRead {
  kind: 'node';
  parentType: AdtTypeCode;
  parentName: string;
  nodeId: string;
}

/** A read answered by a document: a probe, or a host's elements. */
type DocumentRead =
  | { kind: 'metadata'; host: 'class' | 'program' | 'include'; name: string }
  | {
      kind: 'elements';
      host: 'class' | 'program' | 'function_group';
      name: string;
    }
  | { kind: 'elements'; host: 'include'; name: string; program: string };

/** One read of the batched version: a probe, a host's elements, a node structure. */
type EnhancementRead = DocumentRead | NodeRead;

const enhancementKey = (read: EnhancementRead): string =>
  read.kind === 'node'
    ? `node:${read.parentType}:${read.parentName}:${read.nodeId}`
    : read.kind === 'elements'
      ? `elements:${read.host}:${read.name}:${read.host === 'include' ? read.program : ''}`
      : `metadata:${read.host}:${read.name}`;

/** The step a read's failure carries, as the sequential version names it. */
function enhancementStep(read: EnhancementRead): string {
  if (read.kind === 'elements') return 'read enhancements';
  if (read.kind === 'metadata') return `read ${read.host} metadata`;
  return read.nodeId === '000000'
    ? 'read node structure'
    : 'read includes node';
}

/** A node structure level's read, sent on `connection`. */
function sendNodeRead(
  context: AdtHeadersContext,
  connection: IAbapConnection,
  read: NodeRead,
) {
  const client = createAdtClient(connection, logger);
  return withAdtHeaders(context, 'utils.fetchNodeStructure', (headers) =>
    client
      .getUtils(ourUtils)
      .fetchNodeStructure(read.parentType, read.parentName, {
        headers,
        analyse: analyseException,
        nodeId: read.nodeId,
        withShortDescriptions: true,
      }),
  );
}

/** A node structure level's answer. */
type NodeAnswer = Awaited<ReturnType<typeof sendNodeRead>>;

/** A read's answer, by what the read was: a document, or a node structure level. */
type EnhancementAnswer =
  | { of: 'document'; response: IAdtResponse<string, IAdtError> }
  | { of: 'node'; response: NodeAnswer };

/** `read` sent on `connection`, as the sequential version sends it. */
async function sendEnhancementRead(
  context: AdtHeadersContext,
  connection: IAbapConnection,
  read: EnhancementRead,
): Promise<EnhancementAnswer> {
  if (read.kind === 'node') {
    return {
      of: 'node',
      response: await sendNodeRead(context, connection, read),
    };
  }
  return { of: 'document', response: await sendDocumentRead(connection, read) };
}

/** A probe's or a host's elements' read, sent on `connection`. */
function sendDocumentRead(
  connection: IAbapConnection,
  read: DocumentRead,
): Promise<IAdtResponse<string, IAdtError>> {
  const client = createAdtClient(connection, logger);
  const analyse = { analyse: analyseException };
  const active: { version: ReadVersion; analyse: typeof analyseException } = {
    version: 'active',
    analyse: analyseException,
  };
  if (read.kind === 'metadata') {
    if (read.host === 'class')
      return client
        .getClass(classDocuments)
        .readMetadata({ className: read.name }, active);
    if (read.host === 'program')
      return client
        .getProgram(programDocuments)
        .readMetadata({ programName: read.name }, active);
    return client
      .getInclude(includeDocuments)
      .readMetadata({ includeName: read.name }, active);
  }
  switch (read.host) {
    case 'class':
      return client
        .getClass(classDocuments)
        .readEnhancementElements({ className: read.name }, analyse);
    case 'program':
      return client
        .getProgram(programDocuments)
        .readEnhancementElements({ programName: read.name }, analyse);
    case 'function_group':
      return client
        .getFunctionGroup(functionGroupDocuments)
        .readEnhancementElements({ functionGroupName: read.name }, analyse);
    case 'include':
      return client
        .getInclude(includeDocuments)
        .readEnhancementElements(
          { includeName: read.name },
          { context: read.program, analyse: analyseException },
        );
  }
}

/** A read the walk needs before it can go on: the next phase sends it. */
class Unanswered {
  constructor(readonly read: EnhancementRead) {}
}

/**
 * The answers of the batched version's phases, by read. Each phase sends the
 * reads not answered yet in one envelope (`runPhase`); a credential failure
 * any of them answers — thrown, or SAP's `401` — ends the call: thrown, as
 * the sequential version throws it at that read.
 */
function enhancementAnswers(context: HandlerContext) {
  const documents = new Map<
    string,
    PhaseResult<IAdtResponse<string, IAdtError>>
  >();
  const nodes = new Map<string, PhaseResult<NodeAnswer>>();
  return {
    /** The answer to a document's read; `Unanswered` thrown when no phase sent it yet. */
    answered(read: DocumentRead): PhaseResult<IAdtResponse<string, IAdtError>> {
      const result = documents.get(enhancementKey(read));
      if (result === undefined) throw new Unanswered(read);
      return result;
    },
    /** The answer to a node's read; `Unanswered` thrown when no phase sent it yet. */
    answeredNode(read: NodeRead): PhaseResult<NodeAnswer> {
      const result = nodes.get(enhancementKey(read));
      if (result === undefined) throw new Unanswered(read);
      return result;
    },
    async phase(reads: readonly EnhancementRead[]): Promise<void> {
      const asked = new Map<string, EnhancementRead>();
      for (const read of reads) {
        const key = enhancementKey(read);
        if (!documents.has(key) && !nodes.has(key)) asked.set(key, read);
      }
      if (asked.size === 0) return;
      const pending = [...asked.values()];
      const results = await runPhase(context, pending, (read, connection) =>
        sendEnhancementRead(context, connection, read),
      );
      results.forEach((result, i) => {
        const read = pending[i];
        const key = enhancementKey(read);
        if (!result.ok) {
          if (endsTheCall(result.error)) throw result.error;
          if (read.kind === 'node') nodes.set(key, result);
          else documents.set(key, result);
          return;
        }
        const answer = result.value;
        const step = enhancementStep(read);
        if (
          answer.response.ok === false &&
          isCredentialPayload(failureEntry(answer.response.getError(), step))
        ) {
          const error = answer.response.getError();
          throw carryingFailure(
            read.kind === 'elements'
              ? new EnhancementInputError(error.message)
              : new Error(error.message),
            error,
            step,
          );
        }
        if (answer.of === 'node') {
          nodes.set(key, { ok: true, value: answer.response });
        } else {
          documents.set(key, { ok: true, value: answer.response });
        }
      });
    },
  };
}

type EnhancementAnswers = ReturnType<typeof enhancementAnswers>;

/** A resolved object: what kind it is, and the read of its elements. */
interface EnhancementPath {
  type: 'program' | 'include' | 'class' | 'function_group';
  elements: DocumentRead;
  context?: string | undefined;
  unreadable?: FailureEntry[];
}

/**
 * `determineObjectTypeAndPath` over the phases' answers: the same decision,
 * the same refusals collected, the same throws. A probe no phase sent yet
 * is thrown as `Unanswered`: the next phase sends it, one probe per object.
 */
function pathFromAnswers(
  answers: EnhancementAnswers,
  objectName: string,
  manualProgramContext?: string,
  requestedType?: string,
): EnhancementPath {
  const name = objectName.toUpperCase();
  const kind = (requestedType ?? '').trim().toUpperCase();
  const classElements: DocumentRead = { kind: 'elements', host: 'class', name };
  const classPath = { type: 'class' as const, elements: classElements };
  const programElements: DocumentRead = {
    kind: 'elements',
    host: 'program',
    name,
  };
  const programPath = { type: 'program' as const, elements: programElements };
  const groupPath = (group: string) => {
    const elements: DocumentRead = {
      kind: 'elements',
      host: 'function_group',
      name: group,
    };
    return { type: 'function_group' as const, elements };
  };
  const saplGroup =
    name.startsWith('SAPL') && name.length > 4 ? name.slice(4) : undefined;

  const unreadable: FailureEntry[] = [];
  const withReport = <T extends { type: string }>(path: T) =>
    unreadable.length > 0 ? { ...path, unreadable } : path;
  const probe = (step: string, read: DocumentRead): string | undefined => {
    const result = answers.answered(read);
    try {
      if (!result.ok) throw result.error;
      const answer = result.value;
      if (answer.ok) return String(answer.getResult().value ?? '');
      const error = answer.getError();
      if (isCredentialPayload(failureEntry(error, step)))
        throw carryingFailure(new Error(error.message), error, step);
      if (error?.response?.status !== 404)
        unreadable.push(failureEntry(error, step));
      return undefined;
    } catch (error) {
      if (isCredentialPayload(thrownEntry(error, step))) throw error;
      unreadable.push(thrownEntry(error, step));
      return undefined;
    }
  };
  const unresolved = (message: string): never => {
    const words = new EnhancementInputError(message);
    throw unreadable.length > 0
      ? carryingPayload(words, { failures: unreadable })
      : words;
  };
  const asInclude = () => {
    const metadata = probe('read include metadata', {
      kind: 'metadata',
      host: 'include',
      name,
    });
    if (metadata === undefined) return undefined;
    let context: string | undefined;
    let mainProgram: string | undefined;
    if (manualProgramContext) {
      context = `/sap/bc/adt/programs/programs/${manualProgramContext}`;
      mainProgram = manualProgramContext;
    } else {
      context = includeContextUriOf(metadata);
      mainProgram = context ? mainProgramOf(context) : undefined;
    }
    if (!context || !mainProgram) {
      throw new EnhancementInputError(
        `Could not determine parent program context for include: ${objectName}. No contextRef found in metadata. Consider providing the 'program' parameter manually.`,
      );
    }
    const elements: DocumentRead = {
      kind: 'elements',
      host: 'include',
      name,
      program: mainProgram,
    };
    return { type: 'include' as const, elements, context };
  };

  if (spelledAs(kind, HOST_SPELLINGS.class)) {
    return withReport(classPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.group)) {
    return groupPath(saplGroup ?? name);
  }
  if (spelledAs(kind, HOST_SPELLINGS.program)) {
    return withReport(saplGroup ? groupPath(saplGroup) : programPath);
  }
  if (spelledAs(kind, HOST_SPELLINGS.include)) {
    const include = asInclude();
    if (include) return withReport(include);
    return unresolved(`Include ${objectName} could not be read.`);
  }
  if (saplGroup) return withReport(groupPath(saplGroup));
  if (
    probe('read class metadata', { kind: 'metadata', host: 'class', name }) !==
    undefined
  ) {
    return withReport(classPath);
  }
  if (
    probe('read program metadata', {
      kind: 'metadata',
      host: 'program',
      name,
    }) !== undefined
  ) {
    return withReport(programPath);
  }
  const include = asInclude();
  if (include) return withReport(include);
  return unresolved(
    `Could not determine object type for: ${objectName}. Object is neither a valid class, program, include, nor a function group's main program.`,
  );
}

/** A path resolved, or the throw resolving it came to. */
type Resolved =
  | { ok: true; path: EnhancementPath }
  | { ok: false; error: unknown };

/**
 * Every object's path, probe by probe: each phase sends the next probe of
 * every object still unresolved (class, then program, then include — each
 * only when the earlier answered none), one per object. One path per object,
 * in the objects' order.
 */
async function resolvePaths(
  answers: EnhancementAnswers,
  objects: ReadonlyArray<{ name: string; type?: string | undefined }>,
  manualProgramContext?: string,
): Promise<Resolved[]> {
  const resolved: Array<Resolved | undefined> = objects.map(() => undefined);
  for (;;) {
    const next: EnhancementRead[] = [];
    objects.forEach((o, i) => {
      if (resolved[i] !== undefined) return;
      try {
        resolved[i] = {
          ok: true,
          path: pathFromAnswers(answers, o.name, manualProgramContext, o.type),
        };
      } catch (error) {
        const unanswered = thrownAs(error, Unanswered);
        if (unanswered !== undefined) next.push(unanswered.read);
        else resolved[i] = { ok: false, error };
      }
    });
    // With nothing left to send, every object was resolved.
    if (next.length === 0) {
      return resolved.flatMap((path) => (path === undefined ? [] : [path]));
    }
    await answers.phase(next);
  }
}

/** The node structure an object's includes are listed under: parent type and name. */
function includesParentOf(
  objectName: string,
  objectType: EnhancementPath['type'],
): { parentType: AdtTypeCode; parentName: string } {
  const upper = objectName.toUpperCase();
  const isGroup =
    objectType === 'function_group' ||
    (upper.startsWith('SAPL') && upper.length > 4);
  return {
    parentName: isGroup && upper.startsWith('SAPL') ? upper.slice(4) : upper,
    parentType: isGroup ? 'FUGR/F' : 'PROG/P',
  };
}

/** The includes node's read, once the root node structure answered one. */
function includesNodeRead(
  answers: EnhancementAnswers,
  objectName: string,
  objectType: EnhancementPath['type'],
): NodeRead | undefined {
  if (objectType === 'class') return undefined;
  const parent = includesParentOf(objectName, objectType);
  let root: PhaseResult<NodeAnswer>;
  try {
    root = answers.answeredNode({ kind: 'node', ...parent, nodeId: '000000' });
  } catch {
    return undefined;
  }
  if (!root.ok) return undefined;
  const response = root.value;
  if (!response.ok) return undefined;
  const node = childNodesOf(response.getResult().value).find((info) =>
    isIncludesFolder(info.type),
  );
  return node === undefined
    ? undefined
    : { kind: 'node', ...parent, nodeId: node.nodeId };
}

/** `getIncludesListInternal` over the phases' answers: the same names, the same throws. */
function includesFromAnswers(
  context: HandlerContext,
  answers: EnhancementAnswers,
  objectName: string,
  objectType: EnhancementPath['type'],
): string[] {
  const { logger } = context;
  try {
    if (objectType === 'class') {
      logger?.info(
        `Classes don't have includes. Returning empty list for class '${objectName}'`,
      );
      return [];
    }
    const parent = includesParentOf(objectName, objectType);
    if (objectType === 'include') {
      logger?.warn(
        `Include processing: assuming parent program for include ${objectName}`,
      );
    }
    const settled = (read: NodeRead) => {
      const result = answers.answeredNode(read);
      if (!result.ok) throw result.error;
      return result.value;
    };
    const rootResponse = settled({ kind: 'node', ...parent, nodeId: '000000' });
    if (!rootResponse.ok) {
      throw carryingFailure(
        new Error(rootResponse.getError().message),
        rootResponse.getError(),
        'read node structure',
      );
    }
    const includesNode = includesNodeRead(answers, objectName, objectType);
    if (includesNode === undefined) {
      logger?.info(`No includes node found for ${objectType} '${objectName}'`);
      return [];
    }
    const includesResponse = settled(includesNode);
    if (!includesResponse.ok) {
      throw carryingFailure(
        new Error(includesResponse.getError().message),
        includesResponse.getError(),
        'read includes node',
      );
    }
    const includeNames = [
      ...new Set(
        nodeItemsOf(includesResponse.getResult().value).map((o) => o.name),
      ),
    ];
    logger?.info(
      `Found ${includeNames.length} includes for ${objectType} '${objectName}' using SAP ADT API`,
    );
    return includeNames;
  } catch (error) {
    if (methodFailureOf(error) !== undefined || failureOf(error) !== undefined)
      throw error;
    logger?.error(
      `Failed to get includes list for ${objectType} '${objectName}':`,
      error,
    );
    return [];
  }
}

/** `getEnhancementsForSingleObject` over a resolved path and the phases' answers. */
function responseFromAnswers(
  answers: EnhancementAnswers,
  objectName: string,
  resolved: Resolved,
): EnhancementResponse {
  if (!resolved.ok) throw resolved.error;
  const objectInfo = resolved.path;
  const step = 'read enhancements';
  const result = answers.answered(objectInfo.elements);
  if (!result.ok) {
    const thrown = result.error;
    if (
      failureOf(thrown) !== undefined ||
      methodFailureOf(thrown) !== undefined
    )
      throw thrown;
    const message = messageOf(thrown);
    throw new EnhancementInputError(
      `Failed to retrieve enhancements for ${objectName}: ${message}`,
    );
  }
  const answer = result.value;
  if (!answer.ok) {
    const error = answer.getError();
    throw carryingFailure(
      new EnhancementInputError(error.message),
      error,
      step,
    );
  }
  const enhancements = parseEnhancementsFromXml(
    String(answer.getResult().value ?? ''),
  );
  return {
    object_name: objectName,
    object_type: objectInfo.type,
    context: objectInfo.context,
    enhancements: enhancements,
    ...(objectInfo.unreadable ? { unreadable: objectInfo.unreadable } : {}),
  };
}

/** The call's options every object is read with. */
interface EnhancementOptions {
  manualProgram?: string | undefined;
  includeNested: boolean;
  isDetailed: boolean;
  maxIncludes: number;
  /** The answer at the level asked, selected by the handler. */
  shown: EnhancementsAnswerOf;
}

function enhancementOptionsOf(
  args: GetEnhancementsArgs,
  shown: EnhancementsAnswerOf,
): EnhancementOptions {
  return {
    shown,
    manualProgram: args.program,
    includeNested: args.include_nested === true,
    isDetailed: args.detailed === true,
    maxIncludes: args.max_includes ? args.max_includes : 50,
  };
}

/**
 * One object's answer from the phases' answers — the sequential version's
 * assembly: the same response, the same nested objects and `includes_unread`,
 * the same partial result, the same failure answer.
 */
function enhancementsAnswerFrom(
  context: HandlerContext,
  answers: EnhancementAnswers,
  objectName: string,
  resolved: Resolved,
  includes: string[] | { thrown: unknown } | undefined,
  includePaths: Map<string, Resolved>,
  options: EnhancementOptions,
): McpResult {
  const { logger } = context;
  try {
    const mainEnhancementResponse = responseFromAnswers(
      answers,
      objectName,
      resolved,
    );
    if (!options.includeNested) {
      return shownResult(options.shown, {
        read: { kind: 'single', response: mainEnhancementResponse },
        detailed: options.isDetailed,
      });
    }
    let allEnhancementResponses: EnhancementResponse[];
    const includesUnread: IncludeUnread[] = [];
    try {
      // No list: the walk of the includes threw (`undefined` when it did
      // not run, which the main object's read rules out).
      const listed = includes ?? { thrown: undefined };
      if (!Array.isArray(listed)) throw listed.thrown;
      allEnhancementResponses = [mainEnhancementResponse];
      for (const includeName of listed) {
        try {
          const includePath = includePaths.get(includeName);
          if (includePath === undefined) {
            throw new Error(`Include ${includeName} was not resolved.`);
          }
          allEnhancementResponses.push(
            responseFromAnswers(answers, includeName, includePath),
          );
        } catch (error) {
          if (credentialFailure(error)) throw error;
          includesUnread.push({
            include: includeName,
            step: 'read enhancements',
            failures: carriedFailures(error) ?? [
              thrownEntry(error, 'read enhancements'),
            ],
          });
        }
      }
    } catch (error) {
      if (credentialFailure(error)) throw error;
      logger?.error('Nested enhancement processing failed:', error);
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              main_object: {
                name: objectName,
                type: mainEnhancementResponse.object_type,
              },
              include_nested: true,
              error: thrownEntry(error, 'list includes'),
              partial_result: true,
              total_objects_analyzed: 1,
              total_enhancements_found:
                mainEnhancementResponse.enhancements.length,
              objects: [mainEnhancementResponse],
            }),
          },
        ],
      };
    }
    const combinedResponse: NestedEnhancements = {
      main_object: {
        name: objectName,
        type: mainEnhancementResponse.object_type,
      },
      include_nested: true,
      total_objects_analyzed: allEnhancementResponses.length,
      total_enhancements_found: allEnhancementResponses.reduce(
        (sum, resp) => sum + resp.enhancements.length,
        0,
      ),
      objects: allEnhancementResponses,
      ...(includesUnread.length > 0 ? { includes_unread: includesUnread } : {}),
    };
    return shownResult(options.shown, {
      read: { kind: 'nested', response: combinedResponse },
      detailed: options.isDetailed,
    });
  } catch (error) {
    return return_error(error);
  }
}

/**
 * Every object's enhancements in ADT batch envelopes (spec §11): (1) the
 * type probes, one per phase for every object still unresolved; (2) every
 * object's enhancements, with `include_nested` beside its root node
 * structure; (3) the includes node of every object that lists one; (4) the
 * metadata of every include, up to `max_includes` per object; (5) the
 * enhancements of every include resolved. Each answer is then the
 * sequential version's assembly over these answers. A credential failure
 * ends the call: thrown.
 */
async function enhancementsInPhases(
  context: HandlerContext,
  objects: ReadonlyArray<{ name: string; type?: string | undefined }>,
  options: EnhancementOptions,
): Promise<McpResult[]> {
  const answers = enhancementAnswers(context);
  const paths = await resolvePaths(answers, objects, options.manualProgram);
  const second: EnhancementRead[] = [];
  objects.forEach((o, i) => {
    const resolved = paths[i];
    if (!resolved.ok) return;
    second.push(resolved.path.elements);
    if (options.includeNested && resolved.path.type !== 'class') {
      second.push({
        kind: 'node',
        ...includesParentOf(o.name, resolved.path.type),
        nodeId: '000000',
      });
    }
  });
  await answers.phase(second);

  const includes: Array<string[] | { thrown: unknown } | undefined> =
    objects.map(() => undefined);
  const includePaths = new Map<string, Resolved>();
  if (options.includeNested) {
    // Only an object whose enhancements answered goes on to its includes,
    // as in the sequential version.
    const answeredMain = objects.map((o, i) => {
      try {
        responseFromAnswers(answers, o.name, paths[i]);
        return true;
      } catch {
        return false;
      }
    });
    const third: EnhancementRead[] = [];
    objects.forEach((o, i) => {
      const resolved = paths[i];
      if (!resolved.ok || !answeredMain[i]) return;
      const node = includesNodeRead(answers, o.name, resolved.path.type);
      if (node !== undefined) third.push(node);
    });
    await answers.phase(third);
    const names = new Set<string>();
    objects.forEach((o, i) => {
      const resolved = paths[i];
      if (!resolved.ok || !answeredMain[i]) return;
      try {
        let list = includesFromAnswers(
          context,
          answers,
          o.name,
          resolved.path.type,
        );
        if (list.length > options.maxIncludes) {
          list = list.slice(0, options.maxIncludes);
        }
        includes[i] = list;
        for (const name of list) names.add(name);
      } catch (thrown) {
        includes[i] = { thrown };
      }
    });
    const asked = [...names];
    const resolvedIncludes = await resolvePaths(
      answers,
      asked.map((name) => ({ name, type: 'include' })),
      options.manualProgram,
    );
    asked.forEach((name, i) => {
      includePaths.set(name, resolvedIncludes[i]);
    });
    await answers.phase(
      resolvedIncludes.flatMap((r) => (r.ok ? [r.path.elements] : [])),
    );
  }
  return objects.map((o, i) =>
    enhancementsAnswerFrom(
      context,
      answers,
      o.name,
      paths[i],
      includes[i],
      includePaths,
      options,
    ),
  );
}

/** The hosts whose call is one request: the elements, read directly. */
const ONE_REQUEST_HOSTS: readonly HostSpelling[] = [
  HOST_SPELLINGS.class,
  HOST_SPELLINGS.group,
  HOST_SPELLINGS.program,
];

/** Whether an answer is a credential failure: it ends a call for several objects. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read enhancements');
  return failed !== undefined && isCredentialPayload(failed);
}

/** What a list call answers from: the entries asked, and each one's answer. */
interface ListOf {
  readonly objects: ReadonlyArray<{
    readonly object_name: string;
    readonly object_type: string;
  }>;
  readonly results: readonly McpResult[];
}

/**
 * A list call's answer at each `detail`, selected through the table like
 * every other answer: terse one text written by the listing writer, the other
 * levels a JSON array of the entries.
 */
const LIST_ANSWERS: ListAnswerTable<ListOf, McpResult> = {
  terse: terseList,
  medium: jsonList,
  full: (list) => jsonList(list).answer,
  raw: (list) => jsonList(list).answer,
};

/** A list call's answer: one entry per asked, in the order asked, at the level asked. */
function listAnswer(
  objects: ReadonlyArray<{
    readonly object_name: string;
    readonly object_type: string;
  }>,
  results: readonly McpResult[],
  level: DetailLevel,
): McpResult {
  return listAnswerAt(LIST_ANSWERS, level)({ objects, results });
}

/** A list call's terse text. */
function terseList({ objects, results }: ListOf): Written<TextResult> {
  // Every object's text written by the listing writer: a failure under its
  // escaped `# object` line and one `# error` line; an answered one as its
  // own terse listing.
  const text = writeListing({
    heads: [],
    reading: {
      answered: results.map((result, i) => ({
        asked: objects[i],
        answer: answerPayload(result),
        read: (() => {
          const shown = result.isError ? undefined : readsOf.get(result);
          return shown === undefined ? undefined : terseOf(shown.read);
        })(),
      })),
    },
    lists: {
      answered: partsOf(
        'answered',
        ({ asked, answer, read }: AnsweredObject): Head[] =>
          read === undefined
            ? [
                {
                  head: 'object',
                  value: `${asked?.object_type ?? ''} ${asked?.object_name ?? ''}`,
                },
                {
                  head: 'error',
                  value: JSON.stringify(answer),
                },
              ]
            : [],
        'read',
        byListing(ENHANCEMENTS_LISTS, terseListing),
      ),
    },
  });
  return asTextResult(text);
}

/** One object of a list call: what was asked, its answer, and its read when answered. */
interface AnsweredObject {
  readonly asked: ListOf['objects'][number] | undefined;
  readonly answer: JsonValue;
  readonly read: EnhancementsTerse | undefined;
}

/** A list call's entries as a JSON array. */
function jsonList({ objects, results }: ListOf): Written<TextResult> {
  // Every answer one entry, written by the listing writer.
  return asJsonResult(
    writeJsonList(
      { answered: results.map(listedAnswer) },
      values('answered', ({ isError, answer, i }: ListedAnswer) =>
        ((isError, answer, i) => {
          const asked = objects[i];
          return isError
            ? {
                object_name: asked.object_name,
                object_type: asked.object_type,
                error: answer,
              }
            : answer;
        })(isError, answer, i),
      ),
    ),
  );
}

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetEnhancements(
  context: HandlerContext,
  args: GetEnhancementsArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetEnhancements',
        shape: 'assembled',
      },
      () => answeredGetEnhancements(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetEnhancements(context, args);
}

async function answeredGetEnhancements(
  context: HandlerContext,
  args: GetEnhancementsArgs,
) {
  const listed = args?.objects;
  const shown = listAnswerAt(ENHANCEMENT_ANSWERS, levelOf(args));
  try {
    if (listed === undefined) {
      const objectName = args.object_name;
      if (!objectName) return await enhancementsOf(context, args, shown);
      const options = enhancementOptionsOf(args, shown);
      const kind = String(args.object_type ?? '')
        .trim()
        .toUpperCase();
      // The elements of an object named by its type: one request.
      if (
        !options.includeNested &&
        ONE_REQUEST_HOSTS.some((host) => spelledAs(kind, host))
      ) {
        return await enhancementsOf(context, args, shown);
      }
      return await withSequentialFallback<McpResult>(
        context,
        async () =>
          (
            await enhancementsInPhases(
              context,
              [{ name: objectName, type: args.object_type }],
              options,
            )
          )[0],
        () => enhancementsOf(context, args, shown),
      );
    }
    if (
      args.object_name !== undefined ||
      args.object_type !== undefined ||
      !Array.isArray(listed) ||
      listed.length === 0
    ) {
      return return_error(
        'Give exactly one of object_name and object_type, or objects (a non-empty list of { object_name, object_type })',
      );
    }
    const objects = listed.map((o) => ({
      object_name: o.object_name,
      object_type: o.object_type,
    }));
    const single = (o: (typeof objects)[number]) => {
      const { objects: _list, ...rest } = args;
      return { ...rest, ...o };
    };
    const options = enhancementOptionsOf(args, shown);
    return await withSequentialFallback<McpResult>(
      context,
      async () => {
        const read = objects.filter((o) => Boolean(o.object_name));
        const answered = await enhancementsInPhases(
          context,
          read.map((o) => ({ name: o.object_name, type: o.object_type })),
          options,
        );
        const results: McpResult[] = [];
        let at = 0;
        for (const o of objects) {
          results.push(
            o.object_name
              ? answered[at++]
              : await enhancementsOf(context, single(o), shown),
          );
        }
        return listAnswer(objects, results, levelOf(args));
      },
      async () => {
        // One object after another, each as the single call reads it; a
        // credential failure ends the call, and nothing after it is read.
        const results: McpResult[] = [];
        for (const o of objects) {
          const result = await enhancementsOf(context, single(o), shown);
          if (endsList(result)) return result;
          results.push(result);
        }
        return listAnswer(objects, results, levelOf(args));
      },
    );
  } catch (error) {
    return return_error(error);
  }
}
