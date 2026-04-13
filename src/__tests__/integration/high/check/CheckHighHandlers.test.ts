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
import { handleCheckDataElement } from '../../../../handlers/data_element/high/handleCheckDataElement';
import { handleCheckMetadataExtension } from '../../../../handlers/ddlx/high/handleCheckMetadataExtension';
import { handleCheckDomain } from '../../../../handlers/domain/high/handleCheckDomain';
import { handleCheckFunctionGroup } from '../../../../handlers/function/high/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../../../handlers/function/high/handleCheckFunctionModule';
import { handleCheckInterface } from '../../../../handlers/interface/high/handleCheckInterface';
import { handleCheckPackage } from '../../../../handlers/package/high/handleCheckPackage';
import { handleCheckProgram } from '../../../../handlers/program/high/handleCheckProgram';
import { handleCheckStructure } from '../../../../handlers/structure/high/handleCheckStructure';
import { handleCheckTable } from '../../../../handlers/table/high/handleCheckTable';
import { handleCheckView } from '../../../../handlers/view/high/handleCheckView';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

/**
 * Assert normalized check response contract.
 * Verifies: object_name present, session fields absent, core fields present.
 */
function assertNormalizedCheckResponse(data: any, expectedObjectName: string) {
  expect(data.object_name).toBe(expectedObjectName.toUpperCase());
  expect(data.success).toBeDefined();
  expect(data.message).toBeDefined();
  expect(data.check_result).toBeDefined();
  expect(data).not.toHaveProperty('session_id');
  expect(data).not.toHaveProperty('session_state');
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-class');
          const response = await tester.invokeToolOrHandler(
            'CheckClass',
            { class_name: params.class_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckClass(ctx, { class_name: params.class_name });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.class_name);
          expect(data.class_name).toBe(params.class_name.toUpperCase());
        });
      },
      getTimeout('medium'),
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-bdef');
          const response = await tester.invokeToolOrHandler(
            'CheckBehaviorDefinition',
            { name: params.name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckBehaviorDefinition(ctx, { name: params.name });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.name);
          expect(data.name).toBe(params.name.toUpperCase());
        });
      },
      getTimeout('medium'),
    );
  });

  // CheckView
  describe('CheckView', () => {
    let tester: LambdaTester;

    beforeAll(async () => {
      tester = new LambdaTester(
        'check_view_high',
        'check_existing',
        'check-view-high',
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
      'should check existing view and return normalized response',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-view');
          const response = await tester.invokeToolOrHandler(
            'CheckView',
            { view_name: params.view_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckView(ctx, { view_name: params.view_name });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.view_name);
          expect(data.view_name).toBe(params.view_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-domain');
          const response = await tester.invokeToolOrHandler(
            'CheckDomain',
            { domain_name: params.domain_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckDomain(ctx, {
                domain_name: params.domain_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.domain_name);
          expect(data.domain_name).toBe(params.domain_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-dtel');
          const response = await tester.invokeToolOrHandler(
            'CheckDataElement',
            { data_element_name: params.data_element_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckDataElement(ctx, {
                data_element_name: params.data_element_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.data_element_name);
          expect(data.data_element_name).toBe(
            params.data_element_name.toUpperCase(),
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-table');
          const response = await tester.invokeToolOrHandler(
            'CheckTable',
            { table_name: params.table_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckTable(ctx, { table_name: params.table_name });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.table_name);
          expect(data.table_name).toBe(params.table_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-structure');
          const response = await tester.invokeToolOrHandler(
            'CheckStructure',
            { structure_name: params.structure_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckStructure(ctx, {
                structure_name: params.structure_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.structure_name);
          expect(data.structure_name).toBe(params.structure_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-interface');
          const response = await tester.invokeToolOrHandler(
            'CheckInterface',
            { interface_name: params.interface_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckInterface(ctx, {
                interface_name: params.interface_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.interface_name);
          expect(data.interface_name).toBe(params.interface_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-package');
          const response = await tester.invokeToolOrHandler(
            'CheckPackage',
            {
              package_name: params.package_name,
              super_package: params.super_package,
            },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckPackage(ctx, {
                package_name: params.package_name,
                super_package: params.super_package,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.package_name);
          expect(data.package_name).toBe(params.package_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-program');
          const response = await tester.invokeToolOrHandler(
            'CheckProgram',
            { program_name: params.program_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckProgram(ctx, {
                program_name: params.program_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.program_name);
          expect(data.program_name).toBe(params.program_name.toUpperCase());
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-fgrp');
          const response = await tester.invokeToolOrHandler(
            'CheckFunctionGroup',
            { function_group_name: params.function_group_name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckFunctionGroup(ctx, {
                function_group_name: params.function_group_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.function_group_name);
          expect(data.function_group_name).toBe(
            params.function_group_name.toUpperCase(),
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-fm');
          const response = await tester.invokeToolOrHandler(
            'CheckFunctionModule',
            {
              function_group_name: params.function_group_name,
              function_module_name: params.function_module_name,
            },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckFunctionModule(ctx, {
                function_group_name: params.function_group_name,
                function_module_name: params.function_module_name,
              });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.function_module_name);
          expect(data.function_module_name).toBe(
            params.function_module_name.toUpperCase(),
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
          const { connection, params } = context;
          const checkLogger = createTestLogger('check-ddlx');
          const response = await tester.invokeToolOrHandler(
            'CheckMetadataExtension',
            { name: params.name },
            async () => {
              const ctx = createHandlerContext({
                connection,
                logger: checkLogger,
              });
              return handleCheckMetadataExtension(ctx, { name: params.name });
            },
          );

          expect(response.isError).toBe(false);
          const data = parseHandlerResponse(response);
          assertNormalizedCheckResponse(data, params.name);
          expect(data.name).toBe(params.name.toUpperCase());
        });
      },
      getTimeout('medium'),
    );
  });
});
