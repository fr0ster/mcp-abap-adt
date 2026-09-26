/**
 * Admin script: Setup ALL shared dependencies on a SAP system.
 *
 * Creates every object listed in shared_dependencies (test-config.yaml)
 * in dependency order using direct ADT client calls.
 * Idempotent — skips objects that already exist.
 *
 * Strategy:
 *   1. Create all objects WITHOUT activation (direct client calls)
 *   2. Group-activate all objects at once via activateObjectsGroup
 *
 * This avoids activation errors when objects depend on each other
 * (e.g., BDEF references an implementation class that doesn't exist yet).
 *
 * Run:  npm run shared:setup
 */

import { type AdtClient, utilDocuments } from '@mcp-abap-adt/adt-clients';
import { asItCame } from '@mcp-abap-adt/adt-strategies';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleUpdateBehaviorDefinition } from '../../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleUpdateLocalTestClass } from '../../../handlers/class/high/handleUpdateLocalTestClass';
import { handleCreateDataElement } from '../../../handlers/data_element/high/handleCreateDataElement';
import { handleUpdateDdl } from '../../../handlers/ddl/high/handleUpdateDdl';
import { handleCreateMetadataExtension } from '../../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleCreateDomain } from '../../../handlers/domain/high/handleCreateDomain';
import { handleCreateInterface } from '../../../handlers/interface/high/handleCreateInterface';
import { handleUpdateInterface } from '../../../handlers/interface/high/handleUpdateInterface';
import { handleCreateProgram } from '../../../handlers/program/high/handleCreateProgram';
import { handleUpdateProgram } from '../../../handlers/program/high/handleUpdateProgram';
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleUpdateServiceDefinition } from '../../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { handleUpdateStructure } from '../../../handlers/structure/high/handleUpdateStructure';
import { handleUpdateTable } from '../../../handlers/table/high/handleUpdateTable';
import { createAdtClient } from '../../../lib/clients';
import { withLock } from '../../../lib/strategies/withLock';
import {
  getSystemContext,
  resolveSystemContext,
} from '../../../lib/systemContext';
import { parseActivationResponse } from '../../../lib/utils';
import {
  getSharedDependenciesConfig,
  getTimeout,
  isTestAvailableForSystem,
  loadTestConfig,
} from '../../integration/helpers/configHelpers';
import { createTestLogger } from '../../integration/helpers/loggerHelpers';
import { stillInactive } from '../../integration/helpers/rapFixtures';
import { createTestConnectionAndSession } from '../../integration/helpers/sessionHelpers';
import { ensureSharedPackage } from '../../integration/helpers/sharedObjects';

const testsLogger = createTestLogger('shared-setup');

/**
 * Force-save DDL source for a CDS view by bypassing syntax check.
 * Uses AdtClient.getDdl().lock() / update(lockHandle) / unlock() — public IAdtObject API.
 * Needed for views with circular dependencies (RAP root/child composition)
 * that cannot pass checkView before the counterpart view is active.
 * Group activation handles the mutual refs once both have stored source.
 */
async function forceSaveViewSource(
  client: AdtClient,
  viewName: string,
  ddlSource: string,
  transportRequest?: string,
): Promise<void> {
  // adt-clients 19: `lock` answers `IAdtResponse<string>`, not a bare handle
  // (IAdtCapabilities.ts), and `update` takes the source through
  // `options.source`, not `config.source` (see UpdateDdlLow).
  const lockResponse = await client.getDdl().lock({ ddlName: viewName });
  if (!lockResponse.ok) {
    throw new Error(lockResponse.getError().message);
  }
  const lockHandle = lockResponse.getResult().value;
  try {
    const updated = await client
      .getDdl()
      .update(
        { ddlName: viewName, transportRequest },
        { source: ddlSource, lockHandle },
      );
    if (!updated.ok) {
      throw new Error(updated.getError().message);
    }
  } finally {
    try {
      // `unlock` no longer throws on a refusal — only a genuine
      // connection-level throw reaches this catch now.
      await client.getDdl().unlock({ ddlName: viewName }, lockHandle);
    } catch {
      // ignore unlock errors
    }
  }
}

/** Map shared_dependencies section name to ADT object type code */
const TYPE_CODES: Record<string, string> = {
  tables: 'TABL/DT',
  structures: 'TABL/DS',
  views: 'DDLS/DF',
  behavior_definitions: 'BDEF/BDO',
  classes: 'CLAS/OC',
  function_groups: 'FUGR/F',
  function_modules: 'FUGR/FF',
  service_definitions: 'SRVD/SRV',
  domains: 'DOMA/DD',
  data_elements: 'DTEL/DE',
  interfaces: 'INTF/OI',
  programs: 'PROG/P',
  metadata_extensions: 'DDLX/EX',
  append_structures: 'TABL/DS',
};

/**
 * Shared objects are local and ride on no request. Only a transport named in
 * `shared_dependencies` itself is used; `environment.default_transport` is the
 * TEST objects' request, and borrowing it here scattered shared objects over
 * CTS requests.
 */
function resolveTransportRequest(sharedConfig: any): string | undefined {
  return sharedConfig?.transport_request || undefined;
}

/**
 * The client, with every write made to answer for itself.
 *
 * `create`, `update` and `activate` answer an IAdtResponse; a refusal is
 * `ok: false`, not a throw. This script only ever caught throws, so a refused
 * write logged "Updated … source" and went on — on E19 (2026-09-25) that left
 * ZMCP_SHR_STRU with ADT's generated stub, ZMCP_SHR_SRVD01 empty and
 * ZMCP_SHR_I_ROOT with the stub behaviour, all "updated". Reads are left
 * alone: a read that answers `ok: false` is how an absent object is found.
 */
/**
 * Write a source through a high-level Update handler, which locks, writes
 * and unlocks. The bare `update()` this used to call sends no lock handle, and
 * SAP refuses every such write — `400`, "Parameter lockHandle could not be
 * found." (SADT_RESOURCE 017, E19 2026-09-25) — which is how ADT's generated
 * stubs stayed in ZMCP_SHR_STRU, ZMCP_SHR_SRVD01 and ZMCP_SHR_I_ROOT while
 * this script logged them "updated". A handler answers `isError` rather than
 * throwing; this makes it throw, so the existing catch records the failure.
 */
async function writeSource(answer: Promise<any>): Promise<void> {
  const answered = await answer;
  if (answered?.isError) {
    const text = (answered.content ?? [])
      .map((c: any) => c.text)
      .join('')
      .substring(0, 800);
    throw new Error(text || 'the write was refused');
  }
}

function strictClient(client: AdtClient): AdtClient {
  const WRITES = new Set(['create', 'update', 'activate']);
  return new Proxy(client, {
    get(target, prop, receiver) {
      const member = Reflect.get(target, prop, receiver);
      if (
        typeof member !== 'function' ||
        typeof prop !== 'string' ||
        !prop.startsWith('get') ||
        prop === 'getUtils'
      ) {
        return typeof member === 'function' ? member.bind(target) : member;
      }
      return (...args: unknown[]) => {
        const object = member.apply(target, args);
        return new Proxy(object, {
          get(o, name, r) {
            const fn = Reflect.get(o, name, r);
            if (typeof fn !== 'function' || !WRITES.has(String(name))) {
              return typeof fn === 'function' ? fn.bind(o) : fn;
            }
            return async (...callArgs: unknown[]) => {
              const answer = await fn.apply(o, callArgs);
              if (answer && answer.ok === false) {
                const error = answer.getError?.();
                throw new Error(
                  `${prop.slice(3)}.${String(name)} refused: ${error?.message ?? 'no message'}${
                    error?.messages?.length
                      ? ` — ${error.messages.map((m: any) => m.text).join('; ')}`
                      : ''
                  }`,
                );
              }
              return answer;
            };
          },
        });
      };
    },
  }) as AdtClient;
}

function resolvePackageName(sharedConfig: any): string {
  if (sharedConfig?.package) return sharedConfig.package;
  const config = loadTestConfig();
  return config?.environment?.default_package || 'ZLOCAL';
}

/**
 * The source as ABAP reads it: case and whitespace count only inside literals.
 *
 * SAP does not hand back the text it was given. A table comes back with a
 * blank line after `{` and before `}`; a function module comes back with its
 * signature pretty-printed — lower-cased names, its own indentation, blank
 * lines after the signature (E19, 2026-09-26). Outside '…', `…` and |…| none
 * of that changes the program, so it is folded away; the literals are kept
 * exactly, so a changed text in one still counts as a change.
 */
const normalizedSource = (source: string): string =>
  source
    .replace(/\r\n?/g, '\n')
    .split(/('(?:[^'\n]|'')*'|`[^`\n]*`|\|[^|\n]*\|)/)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(/\s+/g, ' ').toLowerCase(),
    )
    .join('')
    .trim();

/**
 * Whether the object's ACTIVE source already is the configured one.
 *
 * A shared object is written only when it differs. Writing an unchanged
 * source still leaves an inactive version behind until the group activation
 * runs, and any activation that then misses leaves a shared object inactive —
 * which is how the two shared BDEFs were found inactive on E19 (2026-09-26).
 * Activation itself is not skipped: every shared object is still activated
 * and confirmed active below. An object that cannot be read counts as
 * different, so it is written.
 */
async function sameActiveSource(
  client: AdtClient,
  kind: string,
  name: string,
  source: string,
  group?: string,
): Promise<boolean> {
  const c = client as any;
  const readers: Record<string, () => Promise<any>> = {
    table: () => c.getTable().read({ tableName: name }, 'active'),
    structure: () => c.getStructure().read({ structureName: name }, 'active'),
    ddl: () => c.getDdl().read({ ddlName: name }, 'active'),
    bdef: () => c.getBehaviorDefinition().read({ name }, 'active'),
    srvd: () =>
      c.getServiceDefinition().read({ serviceDefinitionName: name }, 'active'),
    class: () => c.getClass().read({ className: name }, 'active'),
    testClasses: () =>
      c.getLocalTestClass().read({ className: name }, 'active'),
    interface: () => c.getInterface().read({ interfaceName: name }, 'active'),
    program: () => c.getProgram().read({ programName: name }, 'active'),
    ddlx: () => c.getMetadataExtension().read({ name }, 'active'),
    append: () =>
      c.getAppendStructure().read({ appendStructureName: name }, 'active'),
    functionModule: () =>
      c
        .getFunctionModule()
        .read({ functionModuleName: name, functionGroupName: group }, 'active'),
  };
  try {
    const answer = await readers[kind]?.();
    if (!answer?.ok) return false;
    const value = answer.getResult().value;
    const text =
      typeof value === 'string'
        ? value
        : String(value?.value ?? value?.raw ?? '');
    const same = normalizedSource(text) === normalizedSource(source);
    if (same) {
      testsLogger?.info?.(
        `${kind} ${name}: active source unchanged — not rewritten`,
      );
    }
    return same;
  } catch {
    return false;
  }
}

describe('Admin: Setup shared dependencies', () => {
  let connection: IAbapConnection;
  let client: AdtClient;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      const result = await createTestConnectionAndSession();
      connection = result.connection;
      await resolveSystemContext(connection);
      const systemCtx = getSystemContext();
      client = strictClient(createAdtClient(connection));
      hasConfig = true;
    } catch (error: any) {
      testsLogger?.warn?.(
        `Skipping: No SAP configuration found: ${error.message}`,
      );
      hasConfig = false;
    }
  });

  it(
    'should create all shared dependencies and group-activate',
    async () => {
      if (!hasConfig) {
        testsLogger?.warn?.('Skipping: SAP not configured');
        return;
      }

      const sharedConfig = getSharedDependenciesConfig();
      if (!sharedConfig) {
        testsLogger?.warn?.('Skipping: No shared_dependencies in config');
        return;
      }

      const packageName = resolvePackageName(sharedConfig);
      const transportRequest = resolveTransportRequest(sharedConfig);

      // 1. Package
      testsLogger?.info?.('Setting up shared package...');
      await ensureSharedPackage(client, testsLogger);

      // 2. Create all objects WITHOUT activation (direct ADT client calls)
      const results: Array<{
        type: string;
        name: string;
        status: string;
      }> = [];

      // Collect names for group activation
      const toActivate: Array<{ name: string; type: string }> = [];

      // --- Tables ---
      const tables = sharedConfig.tables || [];
      if (tables.length > 0) {
        testsLogger?.info?.(
          `Creating Tables (${tables.length}) without activation...`,
        );
        for (const item of tables) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping table ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getTable()
                .read({ tableName: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getTable().create({
                tableName: item.name,
                packageName,
                description: item.description || 'Shared test table',
                source: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created table ${item.name}`);
            }

            // Always update source code to ensure it matches config
            if (
              item.source &&
              !(await sameActiveSource(client, 'table', item.name, item.source))
            ) {
              try {
                await writeSource(
                  handleUpdateTable(
                    { connection, logger: undefined } as any,
                    {
                      table_name: item.name,
                      ddl_code: item.source,
                      activate: false,
                    } as any,
                  ),
                );
                testsLogger?.info?.(`Updated table ${item.name} source`);
              } catch (updateError: any) {
                testsLogger?.error?.(
                  `Update table ${item.name} source failed: ${updateError.message}`,
                );
                results.push({
                  type: 'tables',
                  name: item.name,
                  status: `FAILED: source not written: ${updateError.message}`,
                });
              }
            }

            results.push({
              type: 'tables',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.tables,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            // If create fails with auth/conflict but object may exist, still add to activate
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Table ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'tables',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.tables,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup table ${item.name}: ${msg}`,
              );
              results.push({
                type: 'tables',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Structures ---
      // Structures must be created SEQUENTIALLY with per-item activation:
      // a base structure that contains `include <other>;` requires the
      // included structure to already exist AND be active. Config lists the
      // include first and the base second, so processing in list order with
      // immediate activation satisfies the dependency. These are NOT added to
      // the group-activation list (they are already active by this point).
      const structures = sharedConfig.structures || [];
      if (structures.length > 0) {
        testsLogger?.info?.(
          `Creating Structures (${structures.length}) sequentially with activation...`,
        );
        for (const item of structures) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping structure ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getStructure()
                .read({ structureName: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              try {
                // create() only builds the skeleton (does NOT apply ddlCode)
                await client.getStructure().create({
                  structureName: item.name,
                  packageName,
                  description: item.description || 'Shared test structure',
                  transportRequest,
                });
                testsLogger?.info?.(`Created structure ${item.name}`);
              } catch (createError: any) {
                const cmsg =
                  createError instanceof Error
                    ? createError.message
                    : String(createError);
                if (
                  cmsg.includes('409') ||
                  cmsg.includes('already exist') ||
                  cmsg.includes('NoAccess')
                ) {
                  testsLogger?.warn?.(
                    `Structure ${item.name} create issue (may already exist): ${cmsg.substring(0, 120)}`,
                  );
                } else {
                  throw createError;
                }
              }
            }

            // Apply the real DDL source, then activate immediately so that a
            // later base structure can reference this one via `include`.
            if (
              item.source &&
              !(await sameActiveSource(
                client,
                'structure',
                item.name,
                item.source,
              ))
            ) {
              await writeSource(
                handleUpdateStructure(
                  { connection, logger: undefined } as any,
                  {
                    structure_name: item.name,
                    ddl_code: item.source,
                    activate: false,
                  } as any,
                ),
              );
              testsLogger?.info?.(`Updated structure ${item.name} source`);
            }
            await client.getStructure().activate({ structureName: item.name });
            testsLogger?.info?.(`Activated structure ${item.name}`);

            results.push({
              type: 'structures',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            testsLogger?.error?.(
              `Failed to setup structure ${item.name}: ${msg}`,
            );
            results.push({
              type: 'structures',
              name: item.name,
              status: `FAILED: ${msg}`,
            });
          }
        }
      }

      // --- Views ---
      const views = sharedConfig.views || [];
      if (views.length > 0) {
        testsLogger?.info?.(
          `Creating Views (${views.length}) without activation...`,
        );
        for (const item of views) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping view ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getDdl()
                .read({ ddlName: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getDdl().create({
                ddlName: item.name,
                packageName,
                description: item.description || 'Shared test view',
                source: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created view ${item.name}`);
            }

            if (
              item.source &&
              !(await sameActiveSource(client, 'ddl', item.name, item.source))
            ) {
              try {
                await writeSource(
                  handleUpdateDdl(
                    { connection, logger: undefined } as any,
                    {
                      ddl_name: item.name,
                      ddl_source: item.source,
                      activate: false,
                    } as any,
                  ),
                );
                testsLogger?.info?.(`Updated view ${item.name} source`);
              } catch (updateError: any) {
                testsLogger?.warn?.(
                  `Update view ${item.name} source failed (${updateError.message}), trying force-save...`,
                );
                try {
                  await forceSaveViewSource(
                    client,
                    item.name,
                    item.source,
                    transportRequest,
                  );
                  testsLogger?.info?.(
                    `Force-saved source for view ${item.name}`,
                  );
                } catch (forceSaveError: any) {
                  testsLogger?.error?.(
                    `Force-save view ${item.name} also failed: ${forceSaveError.message}`,
                  );
                  results.push({
                    type: 'views',
                    name: item.name,
                    status: `FAILED: source not written: ${forceSaveError.message}`,
                  });
                }
              }
            }

            results.push({
              type: 'views',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.views,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `View ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'views',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.views,
              });
            } else {
              testsLogger?.error?.(`Failed to setup view ${item.name}: ${msg}`);
              results.push({
                type: 'views',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Behavior definitions ---
      const bdefs = sharedConfig.behavior_definitions || [];
      if (bdefs.length > 0) {
        testsLogger?.info?.(
          `Creating Behavior definitions (${bdefs.length}) without activation...`,
        );
        for (const item of bdefs) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping behavior definition ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getBehaviorDefinition()
                .read({ name: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getBehaviorDefinition().create({
                name: item.name,
                packageName,
                rootEntity: item.root_entity || item.name,
                implementationType: item.implementation_type || 'Managed',
                description: item.description || 'Shared test BDEF',
                source: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created behavior definition ${item.name}`);
            }

            if (
              item.source &&
              !(await sameActiveSource(client, 'bdef', item.name, item.source))
            ) {
              try {
                await writeSource(
                  handleUpdateBehaviorDefinition(
                    { connection, logger: undefined } as any,
                    {
                      name: item.name,
                      source_code: item.source,
                      activate: false,
                    } as any,
                  ),
                );
                testsLogger?.info?.(
                  `Updated behavior definition ${item.name} source`,
                );
              } catch (updateError: any) {
                testsLogger?.error?.(
                  `Update BDEF ${item.name} source failed: ${updateError.message}`,
                );
                results.push({
                  type: 'behavior_definitions',
                  name: item.name,
                  status: `FAILED: source not written: ${updateError.message}`,
                });
              }
            }

            results.push({
              type: 'behavior_definitions',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.behavior_definitions,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `BDEF ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'behavior_definitions',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.behavior_definitions,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup behavior definition ${item.name}: ${msg}`,
              );
              results.push({
                type: 'behavior_definitions',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Classes (implementation classes for BDEFs) ---
      const classes = sharedConfig.classes || [];
      if (classes.length > 0) {
        testsLogger?.info?.(
          `Creating Classes (${classes.length}) without activation...`,
        );
        for (const item of classes) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping class ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getClass()
                .read({ className: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (exists) {
              testsLogger?.info?.(`Class ${item.name} already exists`);
              results.push({
                type: 'classes',
                name: item.name,
                status: 'existed',
              });
            } else {
              await client.getClass().create({
                className: item.name,
                packageName,
                description: item.description || 'Shared test class',
                transportRequest,
              });
              testsLogger?.info?.(`Created class ${item.name}`);
              results.push({
                type: 'classes',
                name: item.name,
                status: 'created',
              });
            }

            if (
              item.source &&
              !(await sameActiveSource(client, 'class', item.name, item.source))
            ) {
              await writeSource(
                handleUpdateClass(
                  { connection, logger: undefined } as any,
                  {
                    class_name: item.name,
                    source_code: item.source,
                    activate: false,
                  } as any,
                ),
              );
              testsLogger?.info?.(`Updated class ${item.name} source`);
            }

            // The class's ABAP Unit test classes, where the configuration
            // gives them (the shared unit-test container). They activate
            // with the class.
            if (
              item.test_classes &&
              !(await sameActiveSource(
                client,
                'testClasses',
                item.name,
                item.test_classes,
              ))
            ) {
              await writeSource(
                handleUpdateLocalTestClass(
                  { connection, logger: undefined } as any,
                  {
                    class_name: item.name,
                    test_class_code: item.test_classes,
                    activate_on_update: false,
                  } as any,
                ),
              );
              testsLogger?.info?.(`Updated class ${item.name} test classes`);
            }

            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.classes,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Class ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'classes',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.classes,
              });
            } else {
              testsLogger?.error?.(
                `Failed to create class ${item.name}: ${msg}`,
              );
              results.push({
                type: 'classes',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Function Groups ---
      const functionGroups = sharedConfig.function_groups || [];
      if (functionGroups.length > 0) {
        testsLogger?.info?.(
          `Creating Function Groups (${functionGroups.length}) without activation...`,
        );
        for (const item of functionGroups) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping function group ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              // A function group has no source of its own — only a document
              // (IAdtMetadataReadable, not IAdtReadable): AdtFunctionGroup.d.ts.
              const readResult = await client
                .getFunctionGroup()
                .readMetadata({ functionGroupName: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getFunctionGroup().create({
                functionGroupName: item.name,
                description: item.description || 'Shared test function group',
                packageName,
                transportRequest,
              });
              testsLogger?.info?.(`Created function group ${item.name}`);
            }

            results.push({
              type: 'function_groups',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.function_groups,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Function group ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'function_groups',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.function_groups,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup function group ${item.name}: ${msg}`,
              );
              results.push({
                type: 'function_groups',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Function Modules ---
      const functionModules = sharedConfig.function_modules || [];
      if (functionModules.length > 0) {
        testsLogger?.info?.(
          `Creating Function Modules (${functionModules.length}) without activation...`,
        );
        for (const item of functionModules) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping function module ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client.getFunctionModule().read({
                functionModuleName: item.name,
                functionGroupName: item.group,
              });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              // `create` posts a metadata document only — no create in
              // adt-clients 19 carries source (IAdtCreatable.create's own
              // comment) — so the empty `source` this used to send is
              // dropped rather than ported; it never reached the wire either
              // way, and the type now says so.
              await client.getFunctionModule().create({
                functionModuleName: item.name,
                functionGroupName: item.group,
                description: item.description || 'Shared test function module',
                transportRequest,
              });
              testsLogger?.info?.(`Created function module ${item.name}`);
            }

            // Update source code if provided
            if (
              item.source &&
              !(await sameActiveSource(
                client,
                'functionModule',
                item.name,
                item.source,
                item.group,
              ))
            ) {
              try {
                const lockResponse = await client.getFunctionModule().lock({
                  functionModuleName: item.name,
                  functionGroupName: item.group,
                });
                if (!lockResponse.ok) {
                  throw new Error(lockResponse.getError().message);
                }
                const lockHandle = lockResponse.getResult().value;
                try {
                  const updated = await client.getFunctionModule().update(
                    {
                      functionModuleName: item.name,
                      functionGroupName: item.group,
                      transportRequest,
                    },
                    { source: item.source, lockHandle },
                  );
                  if (!updated.ok) {
                    throw new Error(updated.getError().message);
                  }
                  testsLogger?.info?.(
                    `Updated function module ${item.name} source`,
                  );
                } finally {
                  try {
                    // `unlock` no longer throws on a refusal — only a
                    // genuine connection-level throw reaches this catch.
                    await client.getFunctionModule().unlock(
                      {
                        functionModuleName: item.name,
                        functionGroupName: item.group,
                      },
                      lockHandle,
                    );
                  } catch {
                    // ignore unlock errors
                  }
                }
              } catch (updateError: any) {
                testsLogger?.error?.(
                  `Update function module ${item.name} source failed: ${updateError.message}`,
                );
                results.push({
                  type: 'function_modules',
                  name: item.name,
                  status: `FAILED: source not written: ${updateError.message}`,
                });
              }
            }

            results.push({
              type: 'function_modules',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.function_modules,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Function module ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'function_modules',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.function_modules,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup function module ${item.name}: ${msg}`,
              );
              results.push({
                type: 'function_modules',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Service Definitions ---
      const serviceDefinitions = sharedConfig.service_definitions || [];
      if (serviceDefinitions.length > 0) {
        testsLogger?.info?.(
          `Creating Service Definitions (${serviceDefinitions.length}) without activation...`,
        );
        for (const item of serviceDefinitions) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping service definition ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            let exists = false;
            try {
              const readResult = await client
                .getServiceDefinition()
                .read({ serviceDefinitionName: item.name });
              exists = readResult.ok;
            } catch {
              exists = false;
            }

            if (!exists) {
              await client.getServiceDefinition().create({
                serviceDefinitionName: item.name,
                packageName,
                description:
                  item.description || 'Shared test service definition',
                source: item.source,
                transportRequest,
              });
              testsLogger?.info?.(`Created service definition ${item.name}`);
            }

            if (
              item.source &&
              !(await sameActiveSource(client, 'srvd', item.name, item.source))
            ) {
              try {
                await writeSource(
                  handleUpdateServiceDefinition(
                    { connection, logger: undefined } as any,
                    {
                      service_definition_name: item.name,
                      source_code: item.source,
                      activate: false,
                    } as any,
                  ),
                );
                testsLogger?.info?.(
                  `Updated service definition ${item.name} source`,
                );
              } catch (updateError: any) {
                testsLogger?.error?.(
                  `Update service definition ${item.name} source failed: ${updateError.message}`,
                );
                results.push({
                  type: 'service_definitions',
                  name: item.name,
                  status: `FAILED: source not written: ${updateError.message}`,
                });
              }
            }

            results.push({
              type: 'service_definitions',
              name: item.name,
              status: exists ? 'existed' : 'created',
            });
            toActivate.push({
              name: item.name.toUpperCase(),
              type: TYPE_CODES.service_definitions,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes('409') ||
              msg.includes('already exist') ||
              msg.includes('NoAccess')
            ) {
              testsLogger?.warn?.(
                `Service definition ${item.name} create issue (may already exist): ${msg.substring(0, 120)}`,
              );
              results.push({
                type: 'service_definitions',
                name: item.name,
                status: 'existed',
              });
              toActivate.push({
                name: item.name.toUpperCase(),
                type: TYPE_CODES.service_definitions,
              });
            } else {
              testsLogger?.error?.(
                `Failed to setup service definition ${item.name}: ${msg}`,
              );
              results.push({
                type: 'service_definitions',
                name: item.name,
                status: `FAILED: ${msg}`,
              });
            }
          }
        }
      }

      // --- Domains, data elements, interfaces, programs, metadata extensions ---
      //
      // Created through this repository's own handlers — the paths their
      // integration suites prove on this system — with `activate: false`;
      // the group activation below activates them with everything else. A
      // handler answers `isError` rather than throwing, and that answer is
      // what decides here: an `isError` is a failure, never a log line.
      const handlerCtx = { connection, logger: undefined } as any;
      const answerText = (a: any) =>
        (a?.content ?? []).map((c: any) => c.text).join('');
      const existsBySearch = async (name: string, typeCode: string) => {
        const found = await handleSearchObject(handlerCtx, {
          object_name: name,
          maxResults: 10,
        });
        return answerText(found)
          .split(/\r?\n/)
          .some((line: string) =>
            line.toUpperCase().startsWith(`${name.toUpperCase()}\t${typeCode}`),
          );
      };
      const viaHandlers: Array<{
        section: string;
        label: string;
        typeCode: string;
        create: (item: any) => Promise<any[]>;
        /** Writes the configured source; runs for an existing object too. */
        update?: (item: any) => Promise<any>;
      }> = [
        {
          section: 'domains',
          label: 'domain',
          typeCode: 'DOMA/DD',
          create: async (item) => [
            await handleCreateDomain(handlerCtx, {
              domain_name: item.name,
              description: item.description || 'Shared test domain',
              package_name: packageName,
              datatype: item.datatype || 'CHAR',
              length: item.length ?? 10,
              decimals: item.decimals ?? 0,
              // Active at once: CreateDataElement activates what it creates,
              // and refuses "No active domain … available" (DO 315) for a
              // data element whose domain is still inactive.
              activate: true,
            } as any),
          ],
        },
        {
          section: 'data_elements',
          label: 'data element',
          typeCode: 'DTEL/DE',
          create: async (item) => [
            await handleCreateDataElement(handlerCtx, {
              data_element_name: item.name,
              description: item.description || 'Shared test data element',
              package_name: packageName,
              type_kind: item.type_kind || 'domain',
              type_name: item.type_name,
              data_type: item.data_type,
              length: item.length,
              decimals: item.decimals,
              short_label: item.short_label,
              medium_label: item.medium_label,
              long_label: item.long_label,
              heading_label: item.heading_label,
            } as any),
          ],
        },
        {
          section: 'interfaces',
          label: 'interface',
          typeCode: 'INTF/OI',
          create: async (item) => [
            await handleCreateInterface(handlerCtx, {
              interface_name: item.name,
              description: item.description || 'Shared test interface',
              package_name: packageName,
            } as any),
          ],
          update: (item) =>
            handleUpdateInterface(handlerCtx, {
              interface_name: item.name,
              source_code: item.source,
              activate: false,
            } as any),
        },
        {
          section: 'programs',
          label: 'program',
          typeCode: 'PROG/P',
          create: async (item) => [
            await handleCreateProgram(handlerCtx, {
              program_name: item.name,
              description: item.description || 'Shared test program',
              package_name: packageName,
            } as any),
          ],
          update: (item) =>
            handleUpdateProgram(handlerCtx, {
              program_name: item.name,
              source_code: item.source,
              activate: false,
            } as any),
        },
        {
          section: 'metadata_extensions',
          label: 'metadata extension',
          typeCode: 'DDLX/EX',
          create: async (item) => [
            await handleCreateMetadataExtension(handlerCtx, {
              name: item.name,
              description: item.description || 'Shared test metadata extension',
              package_name: packageName,
              activate: false,
            } as any),
          ],
          update: (item) =>
            handleUpdateMetadataExtension(handlerCtx, {
              name: item.name,
              source_code: item.source,
              activate: false,
            } as any),
        },
        {
          // No handler in this project creates an append structure; the
          // client does, the way the structure handlers use it: a metadata
          // create naming the base structure, then the `extend type` source
          // under a lock. The base must be active first — the structures
          // above are activated one by one as they are written.
          section: 'append_structures',
          label: 'append structure',
          typeCode: 'TABL/DS',
          create: async (item) => {
            await client.getAppendStructure().create({
              appendStructureName: item.name,
              baseObject: item.base_structure,
              packageName,
              description: item.description || 'Shared append structure',
            });
            return [];
          },
          update: async (item) => {
            const obj = client.getAppendStructure();
            const written = await withLock(
              () => obj.lock({ appendStructureName: item.name }),
              (lockHandle) =>
                obj.update(
                  { appendStructureName: item.name },
                  { source: item.source, lockHandle },
                ),
              (lockHandle) =>
                obj.unlock({ appendStructureName: item.name }, lockHandle),
            );
            return written.ok
              ? { isError: false }
              : {
                  isError: true,
                  content: [{ type: 'text', text: written.getError().message }],
                };
          },
        },
      ];
      for (const kind of viaHandlers) {
        const items: any[] = sharedConfig[kind.section] || [];
        if (items.length === 0) continue;
        testsLogger?.info?.(
          `Creating ${kind.label}s (${items.length}) without activation...`,
        );
        for (const item of items) {
          if (!isTestAvailableForSystem(item.available_in)) {
            testsLogger?.info?.(
              `Skipping ${kind.label} ${item.name} (not available for ${loadTestConfig()?.environment?.system_type})`,
            );
            continue;
          }
          try {
            if (await existsBySearch(item.name, kind.typeCode)) {
              testsLogger?.info?.(`${kind.label} ${item.name} already exists`);
              results.push({
                type: kind.section,
                name: item.name,
                status: 'existed',
              });
            } else {
              for (const answered of await kind.create(item)) {
                if (answered?.isError) {
                  throw new Error(answerText(answered).substring(0, 800));
                }
              }
              testsLogger?.info?.(`Created ${kind.label} ${item.name}`);
              results.push({
                type: kind.section,
                name: item.name,
                status: 'created',
              });
            }
            const readKind = {
              'INTF/OI': 'interface',
              'PROG/P': 'program',
              'DDLX/EX': 'ddlx',
              'TABL/DS': 'append',
            }[kind.typeCode];
            if (
              kind.update &&
              item.source &&
              !(
                readKind &&
                (await sameActiveSource(
                  client,
                  readKind,
                  item.name,
                  item.source,
                ))
              )
            ) {
              const updated = await kind.update(item);
              if (updated?.isError) {
                throw new Error(
                  `source not written: ${answerText(updated).substring(0, 800)}`,
                );
              }
              testsLogger?.info?.(`Updated ${kind.label} ${item.name} source`);
            }
            toActivate.push({
              name: item.name.toUpperCase(),
              type: kind.typeCode,
            });
          } catch (error: any) {
            const msg = error instanceof Error ? error.message : String(error);
            testsLogger?.error?.(
              `Failed to create ${kind.label} ${item.name}: ${msg}`,
            );
            results.push({
              type: kind.section,
              name: item.name,
              status: `FAILED: ${msg}`,
            });
          }
        }
      }

      // 3. Activate all objects.
      //
      // Preferred path: a single bulk group-activate (resolves cross-object
      // dependency ordering in one activation run). On cloud, however,
      // bulk-activating many objects can exceed the activation-run request
      // timeout (adt-clients uses a fixed ~45s timeout that is NOT overridable
      // via activateObjectsGroup). Retrying the full group after a timeout just
      // burns another 45s, so on timeout we skip straight to the batched
      // fallback: activate in small chunks (each chunk is one cheap activation
      // run well under the limit), two passes to resolve ordering between
      // dependents (pass 2 retries only what failed in pass 1).
      if (toActivate.length > 0) {
        const isTimeout = (err: any) =>
          err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');

        const maxActivationAttempts = 3;
        let groupActivated = false;
        for (let attempt = 1; attempt <= maxActivationAttempts; attempt++) {
          testsLogger?.info?.(
            `Group-activating ${toActivate.length} objects (attempt ${attempt}/${maxActivationAttempts})...`,
          );
          try {
            // adt-clients 19's shipped default for the `activation` slot is
            // the run id, not the document — acceptance, not completion (see
            // handleActivateObject.ts). This script wants the messages a
            // group-activate answers, so it asks for the raw document back
            // explicitly (utilResultSet.d.ts: "rawDocument is one argument
            // away") rather than the run id neither loop here follows up on.
            const response = await client
              .getUtils({ ...utilDocuments, activation: asItCame })
              .activateObjectsGroup(toActivate, true);
            if (!response.ok) {
              throw new Error(response.getError().message);
            }
            const activationResult = parseActivationResponse(
              response.getResult().value,
            );

            const errors = activationResult.messages.filter(
              (m) => m.type === 'error' || m.type === 'E',
            );
            const warnings = activationResult.messages.filter(
              (m) => m.type === 'warning' || m.type === 'W',
            );

            if (errors.length > 0) {
              if (attempt < maxActivationAttempts) {
                testsLogger?.warn?.(
                  `Activation attempt ${attempt} had ${errors.length} error(s), retrying...`,
                );
                continue;
              }
              testsLogger?.error?.(
                `Group activation errors:\n${errors.map((e: any) => `  ${e.shortText || e.text}`).join('\n')}`,
              );
            } else {
              testsLogger?.info?.('Group activation completed successfully');
              groupActivated = true;
            }
            if (warnings.length > 0) {
              testsLogger?.warn?.(
                `Group activation warnings:\n${warnings.map((w: any) => `  ${w.shortText || w.text}`).join('\n')}`,
              );
            }
            break; // Success or final attempt — stop retrying
          } catch (error: any) {
            // Retrying the full group after a timeout wastes another ~45s and
            // will time out again — go straight to the batched fallback.
            if (isTimeout(error)) {
              testsLogger?.warn?.(
                `Group activation timed out (${error.message}); falling back to batched activation`,
              );
              break;
            }
            if (attempt < maxActivationAttempts) {
              testsLogger?.warn?.(
                `Activation attempt ${attempt} failed: ${error.message}, retrying...`,
              );
              continue;
            }
            testsLogger?.warn?.(
              `Group activation failed: ${error.message}; falling back to batched activation`,
            );
          }
        }

        // Fallback: bulk group-activate never succeeded (e.g. timed out on
        // cloud). Activate in small chunks — far fewer activation runs than
        // one-per-object, each well under the timeout. Two passes resolve
        // ordering between dependents; pass 2 retries only the leftovers.
        if (!groupActivated) {
          const CHUNK_SIZE = 5;
          let pending = toActivate;
          let lastErrors = new Map<string, string>();

          for (let pass = 1; pass <= 2 && pending.length > 0; pass++) {
            testsLogger?.info?.(
              `Fallback activation pass ${pass}/2: ${pending.length} object(s) in chunks of ${CHUNK_SIZE}...`,
            );
            const failedThisPass: typeof toActivate = [];
            lastErrors = new Map();

            for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
              const chunk = pending.slice(i, i + CHUNK_SIZE);
              const recordFailure = (msg: string) => {
                for (const obj of chunk) {
                  failedThisPass.push(obj);
                  lastErrors.set(`${obj.type} ${obj.name}`, msg);
                }
              };
              try {
                const resp = await client
                  .getUtils({ ...utilDocuments, activation: asItCame })
                  .activateObjectsGroup(chunk, true);
                if (!resp.ok) {
                  throw new Error(resp.getError().message);
                }
                const r = parseActivationResponse(resp.getResult().value);
                const errs = r.messages.filter(
                  (m) => m.type === 'error' || m.type === 'E',
                );
                if (errs.length > 0) {
                  recordFailure(
                    errs.map((e: any) => e.shortText || e.text).join('; '),
                  );
                }
              } catch (e: any) {
                recordFailure(e?.message || String(e));
              }
            }
            pending = failedThisPass;
          }

          if (pending.length > 0) {
            testsLogger?.error?.(
              `Fallback activation failed for:\n${[...lastErrors.entries()].map(([k, v]) => `  ${k}: ${v}`).join('\n')}`,
            );
            results.push({
              type: 'activation',
              name: 'FALLBACK',
              status: `FAILED: ${pending.length} object(s) not activated`,
            });
          } else {
            testsLogger?.info?.(
              'Fallback activation completed successfully (batched group-activate)',
            );
          }
        }
      }

      // 4. Confirm from the system. The activation answer says what the
      // server stated; only GetInactiveObjects says what is true, and
      // activation is asynchronous. "Group activation completed
      // successfully" was logged over four inactive objects on E19.
      if (toActivate.length > 0) {
        let inactive: string[] = [];
        for (let attempt = 1; attempt <= 8; attempt++) {
          inactive = await stillInactive(
            { connection, logger: undefined } as any,
            toActivate,
          );
          if (inactive.length === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        if (inactive.length > 0) {
          testsLogger?.error?.(
            `Still inactive after activation: ${inactive.join(', ')}`,
          );
          for (const name of inactive) {
            results.push({
              type: 'activation',
              name,
              status: 'FAILED: still inactive after activation',
            });
          }
        } else {
          testsLogger?.info?.(
            `Confirmed active: all ${toActivate.length} object(s)`,
          );
        }
      }

      // Summary
      const created = results.filter((r) => r.status === 'created');
      const existed = results.filter((r) => r.status === 'existed');
      const failed = results.filter((r) => r.status.startsWith('FAILED'));

      testsLogger?.info?.(
        `Setup complete: ${created.length} created, ${existed.length} already existed, ${failed.length} failed`,
      );

      if (failed.length > 0) {
        for (const f of failed) {
          testsLogger?.error?.(`  ${f.type}:${f.name} — ${f.status}`);
        }
      }

      expect(failed.length).toBe(0);
    },
    getTimeout('long'),
  );
});
