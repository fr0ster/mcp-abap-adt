/**
 * Integration tests for Check High-Level Handlers
 *
 * Tests high-level Check handlers that perform syntax/semantic validation.
 * Each handler wraps a low-level check, strips session fields,
 * and adds normalized object_name field.
 *
 * Run: npm test -- --testPathPattern=integration/high/check
 */

import { handleCheckBehaviorDefinition } from '../../../../handlers/behavior_definition/high/handleCheckBehaviorDefinition';
import { handleCheckClass } from '../../../../handlers/class/high/handleCheckClass';
import { handleCreateClass } from '../../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/high/handleDeleteClass';
import { handleUpdateClass } from '../../../../handlers/class/high/handleUpdateClass';
import { handleCheckDataElement } from '../../../../handlers/data_element/high/handleCheckDataElement';
import { handleCheckDdl } from '../../../../handlers/ddl/high/handleCheckDdl';
import { handleCheckMetadataExtension } from '../../../../handlers/ddlx/high/handleCheckMetadataExtension';
import { handleCheckDomain } from '../../../../handlers/domain/high/handleCheckDomain';
import { handleCheckFunctionGroup } from '../../../../handlers/function/high/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../../../handlers/function/high/handleCheckFunctionModule';
import { handleCheckInterface } from '../../../../handlers/interface/high/handleCheckInterface';
import { handleCheckPackage } from '../../../../handlers/package/high/handleCheckPackage';
import { handleCheckProgram } from '../../../../handlers/program/high/handleCheckProgram';
import { handleCheckStructure } from '../../../../handlers/structure/high/handleCheckStructure';
import { handleCheckTable } from '../../../../handlers/table/high/handleCheckTable';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

/**
 * Assert the normalized check response contract.
 *
 * What a high-tier check answers is its low-tier sibling's terse projection
 * (`terseCheck` in `src/lib/strategies/projections.ts`) with `object_name`
 * added and the two session fields removed by `normalizeCheckResponse`. So
 * the fields are the check run's own: whether it ran, SAP's own status
 * sentence, and the messages when there are any.
 *
 * The three fields this used to require — `success`, `message`,
 * `check_result` — were the pre-migration handler's own envelope, built by
 * `parseCheckRunResponse` around a boolean this repository derived itself.
 * The verdict now belongs to `analyseException`: a check run that reports
 * errors is a refusal and never reaches here, which is why no `success`
 * boolean survives on the success path. `check_result` is gone with the
 * envelope; its content is `status_text` plus `messages`.
 */
function assertNormalizedCheckResponse(data: any, expectedObjectName: string) {
  expect(data.object_name).toBe(expectedObjectName.toUpperCase());
  expect(data.ran).toBe(true);
  expect(typeof data.status_text).toBe('string');
  expect(data).not.toHaveProperty('session_id');
  expect(data).not.toHaveProperty('session_state');
  // The shared objects are active and correct, and every check here asks
  // about the active version: an error is a broken test environment or a
  // broken implementation, not an answer to accept. Warnings may stand.
  const errors = (data.messages ?? []).filter(
    (m: { type?: string }) => m.type === 'E',
  );
  expect(errors).toEqual([]);
}

describe('Check High-Level Handlers Integration', () => {
  // CheckClass
  describe('CheckClass', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_class_high',
        'check_existing',
        'check-class-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing class and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.class_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-class');
          const response = await tester.invokeToolOrHandler(
            'CheckClass',
            { class_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckClass(ctx, {
                class_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckClass — a finding is an answer, not a failure
  //
  // A check that finds an error has done its job: the handler answers it
  // (`isError: false`) with the error among the messages. The shared objects
  // are correct by definition, so this uses a class of the test's own,
  // created on the test request with a misspelt keyword in its method
  // (`DAAT` for `DATA`). It cannot activate, so it is saved inactive, and it
  // is the inactive version that is checked.
  describe('CheckClass finds an error', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_class_high',
        'check_findings',
        'check-class-findings',
      );
      await tester.beforeAll(
        async () => {},
        async (context: LambdaTesterContext) => {
          const { connection, params, transportRequest } = context;
          if (!params?.class_name) return;
          await handleDeleteClass(
            createHandlerContext({
              connection,
              logger: createTestLogger('check-findings-cleanup'),
            }),
            {
              class_name: params.class_name,
              ...(transportRequest && { transport_request: transportRequest }),
            },
          );
        },
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'answers the keyword error as a finding, not as a failed call',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger, packageName, transportRequest } =
            context;
          const objectName = params.class_name;
          const ctx = () =>
            createHandlerContext({
              connection,
              logger: createTestLogger('check-findings'),
            });

          logger?.info(`   • create: ${objectName}`);
          const created = await handleCreateClass(ctx(), {
            class_name: objectName,
            description: params.description,
            package_name: packageName,
            ...(transportRequest && { transport_request: transportRequest }),
          } as any);
          expect(created.isError).toBe(false);

          logger?.info(
            `   • write the broken source (inactive): ${objectName}`,
          );
          const written = await handleUpdateClass(ctx(), {
            class_name: objectName,
            source_code: params.source_code,
            ...(transportRequest && { transport_request: transportRequest }),
            activate: false,
          } as any);
          expect(written.isError).toBe(false);

          logger?.info(`   • check the inactive version: ${objectName}`);
          const response = await tester.invokeToolOrHandler(
            'CheckClass',
            { class_name: objectName, version: 'inactive' },
            async () =>
              handleCheckClass(ctx(), {
                class_name: objectName,
                version: 'inactive',
              }),
          );

          // Reported, not raised: the finding is the answer.
          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          expect(data.object_name).toBe(objectName.toUpperCase());
          expect(data.ran).toBe(true);
          const errors = (data.messages ?? []).filter(
            (m: { type?: string }) => m.type === 'E',
          );
          expect(errors.length).toBeGreaterThan(0);

          logger?.success(
            `✅ check: ${objectName} — ${errors.length} error(s): ${errors.map((e: { text?: string }) => e.text).join('; ')}`,
          );
        });
      },
      getTimeout('long'),
    );
  });

  // CheckBehaviorDefinition
  describe('CheckBehaviorDefinition', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_bdef_high',
        'check_existing',
        'check-bdef-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing behavior definition and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-bdef');
          const response = await tester.invokeToolOrHandler(
            'CheckBehaviorDefinition',
            { name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckBehaviorDefinition(ctx, {
                name: objectName,
                version: 'active',
              });
            },
          );

          // It used to take a name and nothing else, so it could only ask
          // about the inactive version — which an active behaviour
          // definition does not have ("Inactive version … does not exist").
          // It asks about the active one now, like every check here.
          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckDdl
  describe('CheckDdl', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_ddl_high',
        'check_existing',
        'check-ddl-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing CDS view and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.ddl_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-ddl');
          const response = await tester.invokeToolOrHandler(
            'CheckDdl',
            { ddl_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckDdl(ctx, {
                ddl_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckDomain
  describe('CheckDomain', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_domain_high',
        'check_existing',
        'check-domain-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing domain and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.domain_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-domain');
          const response = await tester.invokeToolOrHandler(
            'CheckDomain',
            { domain_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckDomain(ctx, {
                domain_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckDataElement
  describe('CheckDataElement', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_data_element_high',
        'check_existing',
        'check-dtel-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing data element and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.data_element_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-dtel');
          const response = await tester.invokeToolOrHandler(
            'CheckDataElement',
            { data_element_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckDataElement(ctx, {
                data_element_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckTable
  describe('CheckTable', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_table_high',
        'check_existing',
        'check-table-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing table and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.table_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-table');
          const response = await tester.invokeToolOrHandler(
            // `version` is not optional here, and the default is not the
            // one this test wants. `CheckTableLow` defaults to `new`, which
            // the check endpoint treats as `inactive`; the shared table is
            // active-only, so SAP answers `status="notProcessed"` with
            // `statusText="Inactive version for TABL ZMCP_SHR_RTABL does not
            // exist"` — a check that never ran, which `analyseException` reports
            // as the refusal it is. Before the migration the same answer was
            // parsed into `success: false` inside an `isError: false`
            // response, which is the masking this work removed. Asking for
            // the active version is asking the question the test's own name
            // states.
            'CheckTable',
            { table_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckTable(ctx, {
                table_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckStructure
  describe('CheckStructure', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_structure_high',
        'check_existing',
        'check-structure-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing structure and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.structure_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-structure');
          const response = await tester.invokeToolOrHandler(
            'CheckStructure',
            { structure_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckStructure(ctx, {
                structure_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckInterface
  describe('CheckInterface', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_interface_high',
        'check_existing',
        'check-interface-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing interface and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.interface_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-interface');
          const response = await tester.invokeToolOrHandler(
            'CheckInterface',
            { interface_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckInterface(ctx, {
                interface_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckPackage
  describe('CheckPackage', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_package_high',
        'check_existing',
        'check-package-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing package and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.package_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-package');
          const response = await tester.invokeToolOrHandler(
            'CheckPackage',
            {
              package_name: objectName,
              super_package: params.super_package,
            },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckPackage(ctx, {
                package_name: objectName,
                super_package: params.super_package,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckProgram
  describe('CheckProgram', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_program_high',
        'check_existing',
        'check-program-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing program and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.program_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-program');
          const response = await tester.invokeToolOrHandler(
            'CheckProgram',
            { program_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckProgram(ctx, {
                program_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckFunctionGroup
  describe('CheckFunctionGroup', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_function_group_high',
        'check_existing',
        'check-fgrp-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing function group and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.function_group_name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-fgrp');
          const response = await tester.invokeToolOrHandler(
            'CheckFunctionGroup',
            { function_group_name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckFunctionGroup(ctx, {
                function_group_name: objectName,
                version: 'active',
              });
            },
          );

          // An active, healthy function group checks clean. This used to
          // demand `MESSAGE(G46)` — "The REPORT/PROGRAM statement is missing,
          // or the program type is INCLUDE." — as what SAP says about any
          // function group (measured 2026-09-16). It is what SAP says about a
          // group that was never activated, whose main program has not been
          // generated yet: once the shared group was activated (E19,
          // 2026-09-25) the same check answered no message at all, and the
          // test failed on a correct answer. A shared object is active by
          // definition, so this asserts the answer's shape, as CheckTable
          // does, and not a finding the shared object must not have.
          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckFunctionModule
  describe('CheckFunctionModule', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_function_module_high',
        'check_existing',
        'check-fm-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing function module and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.function_module_name;

          logger?.info(
            `   • check: ${objectName} (group: ${params.function_group_name})`,
          );
          const checkLogger = createTestLogger('check-fm');
          const response = await tester.invokeToolOrHandler(
            'CheckFunctionModule',
            {
              function_group_name: params.function_group_name,
              function_module_name: objectName,
              version: 'active',
            },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckFunctionModule(ctx, {
                function_group_name: params.function_group_name,
                function_module_name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckMetadataExtension
  describe('CheckMetadataExtension', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_metadata_extension_high',
        'check_existing',
        'check-ddlx-high',
      );
      await tester.beforeAll(
        async () => {},
        async () => {},
      );
    }, getTimeout('long'));

    afterAll(async () => {
      await tester.afterAll(async () => {});
    });
    beforeEach(async () => {
      await tester.beforeEach(async () => {});
    });
    afterEach(async () => {
      await tester.afterEach();
    });

    it(
      'should check existing metadata extension and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params, logger } = context;
          const objectName = params.name;

          logger?.info(`   • check: ${objectName}`);
          const checkLogger = createTestLogger('check-ddlx');
          const response = await tester.invokeToolOrHandler(
            'CheckMetadataExtension',
            { name: objectName, version: 'active' },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckMetadataExtension(ctx, {
                name: objectName,
                version: 'active',
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, objectName);

          logger?.success(
            `✅ check: ${objectName} — ${data.status_text} (${data.messages?.length ?? 0} message(s))`,
          );
        });
      },
      getTimeout('medium'),
    );
  });
});
