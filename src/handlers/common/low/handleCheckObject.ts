import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CheckObject Handler - Syntax check for ABAP objects via ADT API.
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level CheckX handler in this migration uses. Each branch carries its
 * own `resultsFor(xDocuments)` and `analyseException`.
 *
 * **Why not `analyseCheck`.** A check tool's answer IS its findings. The
 * shipped `analyseCheck` turns a `chkrun:checkMessage` of type `E` into a
 * refusal, which makes a check that did its job — ran, found something, said
 * what — look like a call that failed. Before this migration these handlers
 * answered `return_response` every time, with `success` inside and the
 * findings beside it; a caller read the messages either way. That is the
 * behaviour restored here, in the new shape: `terseCheck` answers `ran`,
 * `status_text` and `messages`, so "it ran and found errors" and "it never
 * ran" are both readable, and neither is dressed as a transport failure.
 * `analyseException` still refuses what genuinely failed: an
 * `exc:exception`, a non-2xx, a connection that broke.
 */

import {
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  ddlDocuments,
  domainDocuments,
  functionGroupDocuments,
  functionModuleDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  packageDocuments,
  programDocuments,
  structureDocuments,
  tableDocuments,
  tableTypeDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { CHECK_KINDS, type CheckKind } from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { inCheckedGroupOn } from '../../../lib/strategies/functionModuleGroup';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages.',
  inputSchema: z.object({
    object_name: z.string().describe('Object name'),
    object_type: z
      .enum([
        'class',
        'program',
        'interface',
        'function_group',
        'function_module',
        'table',
        'structure',
        'ddl',
        'domain',
        'data_element',
        'package',
        'behavior_definition',
        'metadata_extension',
      ])
      .describe('Object type'),
    source_code: z
      .string()
      .optional()
      .describe(
        'Source to check instead of the saved one (class, structure, ddl only); nothing is saved.',
      ),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe("Version to check: 'active' or 'inactive' (default active)"),
    ...DETAIL_SHAPE,
  }),
} as const;

interface CheckObjectArgs {
  object_name: string;
  object_type: string;
  version?: string;
  source_code?: string;
  detail?: 'terse' | 'full' | 'raw';
}

/** The types whose check can take source that is not saved. */
const SOURCE_TYPES = ['class', 'structure', 'ddl'];

/**
 * The tool's boundary: `object_type` is one of the kinds the declared
 * variant serves (`CHECK_KINDS`), either case; past it, {@link checkObject} takes
 * the kind typed and checks it no more.
 */
export async function handleCheckObject(
  context: HandlerContext,
  args: CheckObjectArgs,
) {
  if (!args.object_name || !args.object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }
  const variant = variantOf(context.connection);
  const kind = acceptedOf(args.object_type, CHECK_KINDS[variant]);
  if (kind === undefined) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${CHECK_KINDS[variant].join(', ')}`,
      ),
    );
  }
  return checkObject(context, { ...args, object_type: kind });
}

/** One object of a kind checked at the tool's boundary. */
export async function checkObject(
  context: HandlerContext,
  args: Omit<CheckObjectArgs, 'object_type'> & { object_type: CheckKind },
) {
  const { connection, logger } = context;
  const { object_name, object_type, version = 'active', source_code } = args;

  if (!object_name || !object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }

  const objectType = object_type;

  const checkVersion =
    version.toLowerCase() === 'inactive' ? 'inactive' : 'active';

  if (source_code !== undefined && !SOURCE_TYPES.includes(objectType)) {
    return return_error(
      new Error(`source_code is checked only for: ${SOURCE_TYPES.join(', ')}`),
    );
  }

  // A function module is addressed under its group: GROUP|MODULE, as the
  // lock takes it.
  // Set for a function module only, and read only for one.
  let functionGroupName = '';
  let functionModuleName = '';
  if (objectType === 'function_module') {
    const [group, module] = object_name.toUpperCase().split('|');
    if (!group || !module) {
      return return_error(
        new Error('Function module name must be in format GROUP|FM_NAME'),
      );
    }
    functionGroupName = group;
    functionModuleName = module;
  }

  const objectName = object_name.toUpperCase();
  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'CheckObjectLow', detail },
    () => {
      switch (objectType) {
        case 'class':
          return withAdtHeaders(context, 'class.check', (headers) =>
            client
              .getClass(resultsFor(classDocuments))
              .check(
                { className: objectName, source: source_code },
                checkVersion,
                { headers, analyse: analyseException },
              ),
          );
        case 'program':
          return withAdtHeaders(context, 'program.check', (headers) =>
            client
              .getProgram(resultsFor(programDocuments))
              .check({ programName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'interface':
          return withAdtHeaders(context, 'interface.check', (headers) =>
            client
              .getInterface(resultsFor(interfaceDocuments))
              .check({ interfaceName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'function_group':
          return withAdtHeaders(context, 'functionGroup.check', (headers) =>
            client
              .getFunctionGroup(resultsFor(functionGroupDocuments))
              .check({ functionGroupName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'table':
          return withAdtHeaders(context, 'table.check', (headers) =>
            client
              .getTable(resultsFor(tableDocuments))
              .check({ tableName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'table_type':
          return withAdtHeaders(context, 'tableType.check', (headers) =>
            client
              .getTableType(resultsFor(tableTypeDocuments))
              .check({ tableTypeName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'structure':
          return withAdtHeaders(context, 'structure.check', (headers) =>
            client
              .getStructure(resultsFor(structureDocuments))
              .check(
                { structureName: objectName, source: source_code },
                checkVersion,
                { headers, analyse: analyseException },
              ),
          );
        case 'ddl':
          return withAdtHeaders(context, 'ddl.check', (headers) =>
            client
              .getDdl(resultsFor(ddlDocuments))
              .check(
                { ddlName: objectName, source: source_code },
                checkVersion,
                { headers, analyse: analyseException },
              ),
          );
        case 'domain':
          return withAdtHeaders(context, 'domain.check', (headers) =>
            client
              .getDomain(resultsFor(domainDocuments))
              .check({ domainName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'data_element':
          return withAdtHeaders(context, 'dataElement.check', (headers) =>
            client
              .getDataElement(resultsFor(dataElementDocuments))
              .check({ dataElementName: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'behavior_definition':
          return withAdtHeaders(
            context,
            'behaviorDefinition.check',
            (headers) =>
              client
                .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
                .check({ name: objectName }, checkVersion, {
                  headers,
                  analyse: analyseException,
                }),
          );
        case 'metadata_extension':
          return withAdtHeaders(context, 'metadataExtension.check', (headers) =>
            client
              .getMetadataExtension(resultsFor(metadataExtensionDocuments))
              .check({ name: objectName }, checkVersion, {
                headers,
                analyse: analyseException,
              }),
          );
        case 'function_module':
          // SAP ignores the group of the address (#2): the check is sent
          // after the module's metadata names the group given.
          return inCheckedGroupOn(
            client,
            functionGroupName,
            functionModuleName,
            () =>
              withAdtHeaders(context, 'functionModule.check', (headers) =>
                client
                  .getFunctionModule(resultsFor(functionModuleDocuments))
                  .check(
                    {
                      functionGroupName,
                      functionModuleName,
                    },
                    checkVersion,
                    { headers, analyse: analyseException },
                  ),
              ),
          );
        case 'package':
          // A package check runs on the active version, like every check.
          return withAdtHeaders(context, 'package.check', (headers) =>
            client
              .getPackage(resultsFor(packageDocuments))
              .check({ packageName: objectName }, 'active', {
                headers,
                analyse: analyseException,
              }),
          );
      }
    },
    project(detail, terseCheck),
  );
}
