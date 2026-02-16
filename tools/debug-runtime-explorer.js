#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const yaml = require('yaml');
const { XMLParser } = require('fast-xml-parser');
const { createAbapConnection } = require('@mcp-abap-adt/connection');
const { AuthBrokerFactory } = require('../dist/lib/auth/brokerFactory.js');
const { AdtObjectErrorCodes } = require('@mcp-abap-adt/interfaces');
const {
  AdtClient,
  AdtRuntimeClient,
} = require('@mcp-abap-adt/adt-clients');

function makeLogger(verbose) {
  const noop = () => {};
  return {
    debug: verbose ? (...args) => console.log('[debug]', ...args) : noop,
    info: (...args) => console.log('[info]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    error: (...args) => console.error('[error]', ...args),
  };
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function buildConnectionConfig() {
  const authType = process.env.SAP_AUTH_TYPE || 'basic';
  const cfg = {
    url: getRequiredEnv('SAP_URL'),
    client: process.env.SAP_CLIENT || '',
    authType,
  };

  if (authType === 'basic') {
    cfg.username = getRequiredEnv('SAP_USERNAME');
    cfg.password = getRequiredEnv('SAP_PASSWORD');
  } else {
    cfg.jwtToken = getRequiredEnv('SAP_JWT_TOKEN');
  }
  return cfg;
}

function getArgValue(name) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === name && i + 1 < args.length) return args[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

function toUpperOrUndefined(value) {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function resolveHomePath(value) {
  if (!value || typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function ensureAbapObjectName(name, objectType, maxLength = 30) {
  if (!name) {
    throw new Error(`${objectType} name is empty`);
  }
  if (name.length > maxLength) {
    throw new Error(
      `${objectType} name "${name}" is too long (${name.length}), max ${maxLength}`,
    );
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error(
      `${objectType} name "${name}" must match ^[A-Z][A-Z0-9_]*$`,
    );
  }
  if (!/^[ZY]/.test(name)) {
    throw new Error(
      `${objectType} name "${name}" must start with Z or Y in test systems`,
    );
  }
}

function ensureLocalClassName(name, objectType, maxLength = 30) {
  if (!name) {
    throw new Error(`${objectType} name is empty`);
  }
  if (name.length > maxLength) {
    throw new Error(
      `${objectType} name "${name}" is too long (${name.length}), max ${maxLength}`,
    );
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error(
      `${objectType} name "${name}" must match ^[A-Z][A-Z0-9_]*$`,
    );
  }
  if (!/^(LTC_|LCL_)/.test(name)) {
    throw new Error(
      `${objectType} name "${name}" must start with LTC_ or LCL_`,
    );
  }
}

function loadProjectTestConfig() {
  const cfgPath = path.resolve(process.cwd(), 'tests/test-config.yaml');
  if (!fs.existsSync(cfgPath)) return null;
  const raw = fs.readFileSync(cfgPath, 'utf8');
  return yaml.parse(raw);
}

function getAuthFromTestConfig() {
  const cfg = loadProjectTestConfig();
  if (!cfg) return null;
  const auth = cfg.auth_broker || {};
  const destination = auth?.abap?.destination;
  const browserAuthPort = auth?.browser_auth_port;
  const serviceKeysDir = auth?.paths?.service_keys_dir;
  return {
    destination: destination ? String(destination).trim() : undefined,
    browserAuthPort:
      typeof browserAuthPort === 'number' ? browserAuthPort : undefined,
    serviceKeysDir: serviceKeysDir ? String(serviceKeysDir).trim() : undefined,
  };
}

function getProbeFromTestConfig() {
  const cfg = loadProjectTestConfig();
  if (!cfg) return null;
  const createClassCases = cfg?.create_class?.test_cases;
  if (!Array.isArray(createClassCases)) return null;
  const builderCase =
    createClassCases.find((tc) => tc?.name === 'builder_class') ||
    createClassCases.find((tc) => tc?.enabled === true);
  if (!builderCase) return null;

  const params =
    builderCase?.params ||
    builderCase?.params_groups?.builder_class ||
    {};

  const className = toUpperOrUndefined(params.class_name);
  const packageName =
    params.package_name ||
    cfg?.environment?.default_package ||
    process.env.DEBUG_PROBE_PACKAGE ||
    '$TMP';
  const transportRequest =
    params.transport_request ||
    cfg?.environment?.default_transport ||
    process.env.DEBUG_PROBE_TRANSPORT ||
    undefined;
  const testClassName =
    toUpperOrUndefined(params.test_class_name) || 'LTC_DEBUG_PROBE';

  if (!className) return null;
  return {
    className,
    packageName: String(packageName).trim(),
    transportRequest: transportRequest
      ? String(transportRequest).trim()
      : undefined,
    testClassName,
    sourceCode:
      typeof params.source_code === 'string' ? params.source_code : undefined,
    updateSourceCode:
      typeof params.update_source_code === 'string'
        ? params.update_source_code
        : undefined,
  };
}

function getDefaultPackageFromTestConfig() {
  const cfg = loadProjectTestConfig();
  if (!cfg) return undefined;
  const fromEnv = cfg?.environment?.default_package;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return undefined;
}

async function buildConnectionConfigFromDestination(destination, logger) {
  const testAuth = getAuthFromTestConfig();
  const browserAuthPortRaw =
    getArgValue('--browser-auth-port') ||
    process.env.MCP_BROWSER_AUTH_PORT ||
    (testAuth?.browserAuthPort ? String(testAuth.browserAuthPort) : undefined);
  const browserAuthPort = browserAuthPortRaw
    ? Number.parseInt(browserAuthPortRaw, 10)
    : 4001;
  const authBrokerPath =
    getArgValue('--auth-broker-path') ||
    process.env.AUTH_BROKER_PATH ||
    testAuth?.serviceKeysDir ||
    path.join(os.homedir(), '.config', 'mcp-abap-adt');
  const resolvedAuthBrokerPath = path.resolve(resolveHomePath(authBrokerPath));

  const factory = new AuthBrokerFactory({
    defaultMcpDestination: destination,
    authBrokerPath: resolvedAuthBrokerPath,
    unsafe: false,
    transportType: 'stdio',
    useAuthBroker: true,
    browser: getArgValue('--browser') || process.env.MCP_BROWSER || 'system',
    browserAuthPort:
      Number.isInteger(browserAuthPort) && browserAuthPort > 0
        ? browserAuthPort
        : undefined,
    logger,
    storeLogger: logger,
    brokerLogger: logger,
    providerLogger: logger,
  });

  logger.info(`Using auth broker path: ${resolvedAuthBrokerPath}`);

  await factory.initializeDefaultBroker();
  const broker =
    factory.getDefaultBroker?.() ||
    (await factory.getOrCreateAuthBroker(destination));
  if (!broker) {
    throw new Error(`Auth broker not available for destination: ${destination}`);
  }

  const connectionConfig = await broker.getConnectionConfig(destination);
  if (!connectionConfig?.serviceUrl) {
    throw new Error(
      `Connection config not found for destination: ${destination}`,
    );
  }

  let token = connectionConfig.authorizationToken;
  try {
    token = await broker.getToken(destination);
  } catch (error) {
    logger.warn(
      `Token refresh skipped for ${destination}: ${error?.message || String(error)}`,
    );
  }

  if (connectionConfig.authType === 'basic') {
    if (!connectionConfig.username || !connectionConfig.password) {
      throw new Error(`Missing basic auth credentials for destination: ${destination}`);
    }
    return {
      url: connectionConfig.serviceUrl,
      client: connectionConfig.sapClient || '',
      authType: 'basic',
      username: connectionConfig.username,
      password: connectionConfig.password,
    };
  }

  if (!token) {
    throw new Error(`Missing JWT token for destination: ${destination}`);
  }
  return {
    url: connectionConfig.serviceUrl,
    client: connectionConfig.sapClient || '',
    authType: 'jwt',
    jwtToken: token,
  };
}

function getProbeNames() {
  const fromTests = getProbeFromTestConfig();
  if (fromTests) {
    ensureAbapObjectName(fromTests.className, 'Class');
    ensureLocalClassName(fromTests.testClassName, 'Local test class');
    return fromTests;
  }

  const generatedClass =
    process.env.DEBUG_PROBE_CLASS ||
    `ZADT_BLD_CLS${Date.now().toString().slice(-3)}`;
  const className = generatedClass.toUpperCase().slice(0, 30);
  const packageName =
    process.env.DEBUG_PROBE_PACKAGE || getDefaultPackageFromTestConfig();
  if (!packageName) {
    throw new Error(
      'Package is not configured. Set environment.default_package in tests/test-config.yaml or DEBUG_PROBE_PACKAGE.',
    );
  }
  const transportRequest = process.env.DEBUG_PROBE_TRANSPORT || undefined;
  const testClassName = (
    process.env.DEBUG_PROBE_TEST_CLASS || 'LTC_DEBUG_PROBE'
  )
    .toUpperCase()
    .slice(0, 30);

  ensureAbapObjectName(className, 'Class');
  ensureLocalClassName(testClassName, 'Local test class');
  return { className, packageName, transportRequest, testClassName };
}

function buildClassSource(className) {
  return `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    CLASS-METHODS run_probe RETURNING VALUE(rv_sum) TYPE i.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    out->write( |${className}=>run_probe( ) = { run_probe( ) }| ).
  ENDMETHOD.

  METHOD run_probe.
    DATA lv_idx TYPE i.
    rv_sum = 0.

    DO 20 TIMES.
      lv_idx = sy-index.
      rv_sum = rv_sum + lv_idx.
      IF lv_idx = 7.
        rv_sum = rv_sum + 100.
      ENDIF.
    ENDDO.
  ENDMETHOD.
ENDCLASS.`;
}

function buildTestClassSource(className, testClassName, classSource) {
  const sourceUpper = (classSource || '').toUpperCase();
  let testBody = 'cl_abap_unit_assert=>assert_true( abap_true ).';

  if (sourceUpper.includes('CLASS-METHODS RUN_PROBE')) {
    testBody = `DATA(lv_sum) = ${className}=>run_probe( ).
    cl_abap_unit_assert=>assert_true( xsdbool( lv_sum > 0 ) ).`;
  } else if (sourceUpper.includes('METHODS GET_TEXT')) {
    testBody = `DATA(lo_obj) = NEW ${className}( ).
    DATA(lv_text) = lo_obj->get_text( ).
    cl_abap_unit_assert=>assert_not_initial( act = lv_text ).`;
  }

  return `CLASS ${testClassName} DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS test_main FOR TESTING.
ENDCLASS.

CLASS ${testClassName} IMPLEMENTATION.
  METHOD test_main.
    ${testBody}
  ENDMETHOD.
ENDCLASS.`;
}

function hasClassRunMain(source) {
  const src = String(source || '').toUpperCase();
  return (
    src.includes('INTERFACES IF_OO_ADT_CLASSRUN') &&
    src.includes('METHOD IF_OO_ADT_CLASSRUN~MAIN')
  );
}

function compact(data, max = 1200) {
  const raw =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2) || '';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}\n... [truncated ${raw.length - max} chars]`;
}

function buildProbeSourceUri(className) {
  return `/sap/bc/adt/oo/classes/${String(className || '').toLowerCase()}/source/main`;
}

async function fetchProbeSource(runtimeContext, probe) {
  const classApi = runtimeContext.adt.getClass();
  const readState = await classApi.read(
    { className: probe.className },
    'active',
    { withLongPolling: true },
  );
  const source = readState?.readResult?.data;
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error(`Failed to read active source for class ${probe.className}`);
  }
  return source;
}

function printNumberedSource(sourceText) {
  const lines = String(sourceText || '').split('\n');
  const width = String(lines.length).length;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = String(idx + 1).padStart(width, ' ');
    console.log(`${lineNo} | ${lines[idx]}`);
  }
}

async function setBreakpointByLine(runtimeContext, probe, lineNo) {
  const uri = buildProbeSourceUri(probe.className);
  const anchor = `${uri}#start=${lineNo},0`;
  const strategies = [
    {
      label: 'debugger/breakpoints relation=insert (uri,line)',
      req: {
        url: '/sap/bc/adt/debugger/breakpoints',
        method: 'GET',
        params: { uri, line: lineNo },
        headers: {
          Accept: 'application/xml',
          'X-sap-adt-relation': 'http://www.sap.com/adt/debugger/relations/insert',
        },
      },
    },
    {
      label: 'debugger/actions action=insertBreakpoint value=<uri#start>',
      req: {
        url: '/sap/bc/adt/debugger/actions',
        method: 'GET',
        params: { action: 'insertBreakpoint', value: anchor },
        headers: {
          Accept: 'application/xml',
          'X-sap-adt-relation': 'http://www.sap.com/adt/debugger/relations/action',
        },
      },
    },
    {
      label: 'debugger/actions action=toggleBreakpoint value=<uri#start>',
      req: {
        url: '/sap/bc/adt/debugger/actions',
        method: 'GET',
        params: { action: 'toggleBreakpoint', value: anchor },
        headers: {
          Accept: 'application/xml',
          'X-sap-adt-relation': 'http://www.sap.com/adt/debugger/relations/action',
        },
      },
    },
  ];

  let lastError;
  for (const strategy of strategies) {
    try {
      const resp = await runtimeContext.connection.makeAdtRequest(strategy.req);
      console.log(
        `[ok] set breakpoint line ${lineNo} via ${strategy.label} -> HTTP ${resp?.status || 'n/a'}`,
      );
      return resp;
    } catch (error) {
      lastError = error;
      const msg = parseAdtException(error)?.message || error?.message || String(error);
      const status = error?.response?.status;
      console.warn(
        `[warn] set breakpoint via ${strategy.label} failed: ${msg}${status ? ` [HTTP ${status}]` : ''}`,
      );
    }
  }

  throw lastError || new Error('Failed to set breakpoint by line');
}

async function removeBreakpointByLine(runtimeContext, probe, lineNo) {
  const uri = buildProbeSourceUri(probe.className);
  const anchor = `${uri}#start=${lineNo},0`;
  const strategies = [
    {
      label: 'debugger/breakpoints relation=delete (uri,line)',
      req: {
        url: '/sap/bc/adt/debugger/breakpoints',
        method: 'GET',
        params: { uri, line: lineNo },
        headers: {
          Accept: 'application/xml',
          'X-sap-adt-relation': 'http://www.sap.com/adt/debugger/relations/delete',
        },
      },
    },
    {
      label: 'debugger/actions action=deleteBreakpoint value=<uri#start>',
      req: {
        url: '/sap/bc/adt/debugger/actions',
        method: 'GET',
        params: { action: 'deleteBreakpoint', value: anchor },
        headers: {
          Accept: 'application/xml',
          'X-sap-adt-relation': 'http://www.sap.com/adt/debugger/relations/action',
        },
      },
    },
    {
      label: 'debugger/actions action=toggleBreakpoint value=<uri#start>',
      req: {
        url: '/sap/bc/adt/debugger/actions',
        method: 'GET',
        params: { action: 'toggleBreakpoint', value: anchor },
        headers: {
          Accept: 'application/xml',
          'X-sap-adt-relation': 'http://www.sap.com/adt/debugger/relations/action',
        },
      },
    },
  ];

  let lastError;
  for (const strategy of strategies) {
    try {
      const resp = await runtimeContext.connection.makeAdtRequest(strategy.req);
      console.log(
        `[ok] remove breakpoint line ${lineNo} via ${strategy.label} -> HTTP ${resp?.status || 'n/a'}`,
      );
      return resp;
    } catch (error) {
      lastError = error;
      const msg = parseAdtException(error)?.message || error?.message || String(error);
      const status = error?.response?.status;
      console.warn(
        `[warn] remove breakpoint via ${strategy.label} failed: ${msg}${status ? ` [HTTP ${status}]` : ''}`,
      );
    }
  }

  throw lastError || new Error('Failed to remove breakpoint by line');
}

function parseAdtException(error) {
  const raw = error?.response?.data;
  if (typeof raw !== 'string') return null;
  if (!raw.includes('<exc:exception')) return null;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(raw);
    const exc = parsed?.['exc:exception'];
    if (!exc) return null;
    const message =
      exc?.localizedMessage?.['#text'] ||
      exc?.message?.['#text'] ||
      exc?.localizedMessage ||
      exc?.message;
    const typeRaw = exc?.type?.['#text'] || exc?.type;
    const type =
      typeof typeRaw === 'string'
        ? typeRaw
        : typeRaw?.['@_id'] || typeRaw?.id || undefined;
    const entries = Array.isArray(exc?.properties?.entry)
      ? exc.properties.entry
      : exc?.properties?.entry
        ? [exc.properties.entry]
        : [];
    const propertyMap = {};
    for (const entry of entries) {
      const key = entry?.['@_key'] || entry?.key;
      const val = entry?.['#text'] || entry?._ || entry?.value;
      if (key) propertyMap[String(key)] = val ? String(val) : '';
    }

    return {
      type,
      message: message ? String(message).trim() : undefined,
      longText: propertyMap.LONGTEXT || undefined,
      properties: propertyMap,
    };
  } catch {
    return null;
  }
}

function isAlreadyExistsError(error) {
  const status = error?.response?.status;
  const payload = String(error?.response?.data || error?.message || '');
  return (
    error?.code === AdtObjectErrorCodes.VALIDATION_FAILED ||
    (status === 400 &&
      (payload.includes('ExceptionResourceAlreadyExists') ||
        payload.includes('does already exist')))
  );
}

async function prepareProbeArtifacts(adtClient, probe, logger) {
  const classApi = adtClient.getClass();
  const localTestApi = adtClient.getLocalTestClass();
  let classSource = probe.sourceCode || buildClassSource(probe.className);
  if (!hasClassRunMain(classSource)) {
    logger.warn(
      'Probe source has no IF_OO_ADT_CLASSRUN~main. Using generated runnable source for debugger flow.',
    );
    classSource = buildClassSource(probe.className);
  }
  const testSource = buildTestClassSource(
    probe.className,
    probe.testClassName,
    classSource,
  );

  try {
    await classApi.create(
      {
        className: probe.className,
        packageName: probe.packageName,
        description: `Debug probe ${probe.className}`,
        sourceCode: classSource,
        transportRequest: probe.transportRequest,
      },
      { activateOnCreate: true },
    );
    logger.info(`Created class ${probe.className}`);
  } catch (error) {
    if (error?.response?.status === 403) {
      throw new Error(
        `No change authorization for class create/update (${error?.response?.data || error?.message || String(error)}).`,
      );
    }
    if (isAlreadyExistsError(error)) {
      logger.warn(`Class ${probe.className} exists, switching to update`);
      await classApi.update(
        {
          className: probe.className,
          sourceCode: classSource,
          transportRequest: probe.transportRequest,
        },
        { activateOnUpdate: true },
      );
      logger.info(`Updated class ${probe.className}`);
    } else {
      throw error;
    }
  }

  try {
    await localTestApi.create(
      {
        className: probe.className,
        testClassCode: testSource,
        testClassName: probe.testClassName,
        transportRequest: probe.transportRequest,
      },
      { activateOnCreate: true },
    );
    logger.info(`Created local test class ${probe.testClassName}`);
  } catch (_error) {
    if (_error?.response?.status === 403) {
      throw new Error(
        `No change authorization for local test class create/update (${_error?.response?.data || _error?.message || String(_error)}).`,
      );
    }
    logger.warn(
      `Local test class exists or create failed, trying update for ${probe.className}`,
    );
    await localTestApi.update(
      {
        className: probe.className,
        testClassCode: testSource,
        transportRequest: probe.transportRequest,
      },
      { activateOnUpdate: true },
    );
    logger.info(`Updated local test class include for ${probe.className}`);
  }
}

async function runBaselineUnitTest(adtClient, probe, logger) {
  const unitApi = adtClient.getUnitTest();
  const runId = await unitApi.run([
    {
      containerClass: probe.className,
      testClass: probe.testClassName,
    },
  ]);
  logger.info(`Unit test run started. run_id=${runId}`);

  const statusResp = await unitApi.getStatus(runId, true);
  logger.info(`Status HTTP ${statusResp?.status || 'n/a'}`);
  console.log(compact(statusResp?.data));

  const resultResp = await unitApi.getResult(runId, {
    format: 'junit',
    withNavigationUris: true,
  });
  logger.info(`Result HTTP ${resultResp?.status || 'n/a'}`);
  console.log(compact(resultResp?.data));
}

function readHeader(headers, key) {
  if (!headers) return undefined;
  return headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];
}

async function callRuntime(runtimeContext, label, fn) {
  try {
    const resp = await fn();
    const adtConnectionId = readHeader(resp?.headers, 'sap-adt-connection-id');
    if (adtConnectionId && !runtimeContext.adtConnectionId) {
      runtimeContext.adtConnectionId = String(adtConnectionId);
      console.log(
        `[session] sap-adt-connection-id=${runtimeContext.adtConnectionId}`,
      );
    }
    console.log(`[ok] ${label} -> HTTP ${resp?.status || 'n/a'}`);
    console.log(compact(resp?.data));
  } catch (error) {
    const adtException = parseAdtException(error);
    if (adtException?.message || adtException?.type) {
      const details = adtException?.properties?.['T100KEY-V1']
        ? ` (msg=${adtException.properties['T100KEY-ID'] || ''}${adtException.properties['T100KEY-NO'] || ''} ${adtException.properties['T100KEY-V1']}${adtException.properties['T100KEY-V2'] ? ` ${adtException.properties['T100KEY-V2']}` : ''})`
        : '';
      console.error(
        `[fail] ${label}: ${adtException?.message || error?.message || String(error)}${adtException?.type ? ` [${adtException.type}]` : ''}${details}`,
      );
      if (adtException.longText) {
        console.error(`[fail] ${label} longtext: ${adtException.longText}`);
      }
    } else {
      console.error(`[fail] ${label}: ${error?.message || String(error)}`);
    }
  }
}

async function launchDebuggerWithFallback(runtimeContext) {
  const explicitMode = getArgValue('--debugging-mode');
  const modeCandidates = explicitMode
    ? [explicitMode]
    : ['external', 'internal'];

  let lastError;
  for (const mode of modeCandidates) {
    try {
      const options = mode ? { debuggingMode: mode } : {};
      const resp = await runtimeContext.runtime.launchDebugger(options);
      const adtConnectionId = readHeader(resp?.headers, 'sap-adt-connection-id');
      if (adtConnectionId && !runtimeContext.adtConnectionId) {
        runtimeContext.adtConnectionId = String(adtConnectionId);
        console.log(
          `[session] sap-adt-connection-id=${runtimeContext.adtConnectionId}`,
        );
      }
      console.log(
        `[ok] launchDebugger${mode ? `(${mode})` : '(default)'} -> HTTP ${resp?.status || 'n/a'}`,
      );
      console.log(compact(resp?.data));
      return;
    } catch (error) {
      lastError = error;
      const adtException = parseAdtException(error);
      const status = error?.response?.status;
      console.warn(
        `[warn] launchDebugger${mode ? `(${mode})` : '(default)'} failed: ${adtException?.message || error?.message || String(error)}${status ? ` [HTTP ${status}]` : ''}`,
      );
    }
  }

  const adtException = parseAdtException(lastError);
  throw new Error(
    adtException?.message ||
      lastError?.message ||
      'Failed to launch debugger with all mode candidates',
  );
}

async function startAmdpDebuggerWithFallback(runtimeContext) {
  const candidates = [{}, { stopExisting: true }];
  let lastError;

  for (const options of candidates) {
    try {
      const resp = await runtimeContext.runtime.startAmdpDebugger(options);
      const adtConnectionId = readHeader(resp?.headers, 'sap-adt-connection-id');
      if (adtConnectionId && !runtimeContext.adtConnectionId) {
        runtimeContext.adtConnectionId = String(adtConnectionId);
        console.log(
          `[session] sap-adt-connection-id=${runtimeContext.adtConnectionId}`,
        );
      }
      const tag = Object.keys(options).length ? JSON.stringify(options) : '{}';
      console.log(`[ok] startAmdpDebugger(${tag}) -> HTTP ${resp?.status || 'n/a'}`);
      console.log(compact(resp?.data));
      return;
    } catch (error) {
      lastError = error;
      const adtException = parseAdtException(error);
      const status = error?.response?.status;
      const tag = Object.keys(options).length ? JSON.stringify(options) : '{}';
      console.warn(
        `[warn] startAmdpDebugger(${tag}) failed: ${adtException?.message || error?.message || String(error)}${status ? ` [HTTP ${status}]` : ''}`,
      );
    }
  }

  const adtException = parseAdtException(lastError);
  throw new Error(
    adtException?.message ||
      lastError?.message ||
      'Failed to start AMDP debugger with all option candidates',
  );
}

function printMenu() {
  console.log('\n=== Runtime Debug Explorer ===');
  console.log('1) Prepare probe class + local test class');
  console.log('2) Run baseline (ABAP Unit, no debugger)');
  console.log('3) Launch debugger');
  console.log('4) Get debugger session');
  console.log('5) Synchronize breakpoints');
  console.log('6) Execute debugger action');
  console.log('7) Get call stack');
  console.log('8) Get variable as JSON');
  console.log('9) Stop debugger');
  console.log('10) Start AMDP debugger');
  console.log('11) List cross traces');
  console.log('12) Get ST05 trace state');
  console.log('13) Show probe source (line numbers)');
  console.log('14) Set breakpoint by line');
  console.log('15) Remove breakpoint by line');
  console.log('q) Quit');
}

async function main() {
  const verbose = process.env.DEBUG_PROBE_VERBOSE === 'true';
  const logger = makeLogger(verbose);
  const testAuth = getAuthFromTestConfig();
  const mcpDestination = getArgValue('--mcp') || testAuth?.destination;
  const connectionConfig = mcpDestination
    ? await buildConnectionConfigFromDestination(mcpDestination, logger)
    : buildConnectionConfig();
  const connection = createAbapConnection(connectionConfig, logger);
  const runtimeContext = {
    connection,
    adt: new AdtClient(connection, logger),
    runtime: new AdtRuntimeClient(connection, logger),
    adtConnectionId: undefined,
  };
  const probe = getProbeNames();
  const prepareOnly = getArgValue('--prepare-only') !== undefined;

  console.log('Probe config:');
  if (mcpDestination) {
    console.log(`  destination: ${mcpDestination}`);
  }
  console.log(`  class:      ${probe.className}`);
  console.log(`  package:    ${probe.packageName}`);
  console.log(`  transport:  ${probe.transportRequest || '(none)'}`);
  console.log(`  test class: ${probe.testClassName}`);
  console.log(
    `  session id: ${runtimeContext.connection.getSessionId() || '(not assigned yet)'}`,
  );

  if (prepareOnly) {
    await prepareProbeArtifacts(runtimeContext.adt, probe, logger);
    console.log('[ok] Prepare-only completed');
    return;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      printMenu();
      const choice = (await rl.question('Select action: ')).trim().toLowerCase();

      if (choice === 'q') break;
      if (choice === '1') {
        await prepareProbeArtifacts(runtimeContext.adt, probe, logger);
        continue;
      }
      if (choice === '2') {
        await runBaselineUnitTest(runtimeContext.adt, probe, logger);
        continue;
      }
      if (choice === '3') {
        await callRuntime(runtimeContext, 'launchDebugger', () =>
          launchDebuggerWithFallback(runtimeContext),
        );
        continue;
      }
      if (choice === '4') {
        await callRuntime(runtimeContext, 'getDebugger', () =>
          runtimeContext.runtime.getDebugger({ debuggingMode: 'external' }),
        );
        continue;
      }
      if (choice === '5') {
        await callRuntime(runtimeContext, 'synchronizeBreakpoints', () =>
          runtimeContext.runtime.synchronizeBreakpoints(true),
        );
        continue;
      }
      if (choice === '6') {
        const action = (await rl.question(
          'Action (e.g. step_over, step_into, continue): ',
        )).trim();
        const value = (await rl.question('Value (optional): ')).trim();
        await callRuntime(
          runtimeContext,
          `executeDebuggerAction(${action})`,
          () =>
            runtimeContext.runtime.executeDebuggerAction(
              action,
              value || undefined,
            ),
        );
        continue;
      }
      if (choice === '7') {
        await callRuntime(runtimeContext, 'getCallStack', () =>
          runtimeContext.runtime.getCallStack(),
        );
        continue;
      }
      if (choice === '8') {
        const variableName = (await rl.question('Variable name: ')).trim();
        const part = (await rl.question('Variable part (default DATA): ')).trim() || 'DATA';
        await callRuntime(
          runtimeContext,
          `getVariableAsJson(${variableName})`,
          () => runtimeContext.runtime.getVariableAsJson(variableName, part),
        );
        continue;
      }
      if (choice === '9') {
        await callRuntime(runtimeContext, 'stopDebugger', () =>
          runtimeContext.runtime.stopDebugger({ debuggingMode: 'external' }),
        );
        continue;
      }
      if (choice === '10') {
        await callRuntime(runtimeContext, 'startAmdpDebugger', () =>
          startAmdpDebuggerWithFallback(runtimeContext),
        );
        continue;
      }
      if (choice === '11') {
        await callRuntime(runtimeContext, 'listCrossTraces', () =>
          runtimeContext.runtime.listCrossTraces(),
        );
        continue;
      }
      if (choice === '12') {
        await callRuntime(runtimeContext, 'getSt05TraceState', () =>
          runtimeContext.runtime.getSt05TraceState(),
        );
        continue;
      }
      if (choice === '13') {
        const source = await fetchProbeSource(runtimeContext, probe);
        printNumberedSource(source);
        continue;
      }
      if (choice === '14') {
        const source = await fetchProbeSource(runtimeContext, probe);
        printNumberedSource(source);
        const lineRaw = (await rl.question('Breakpoint line number: ')).trim();
        const lineNo = Number.parseInt(lineRaw, 10);
        if (!Number.isInteger(lineNo) || lineNo <= 0) {
          console.error('[fail] Invalid line number');
          continue;
        }
        await callRuntime(runtimeContext, `setBreakpoint(line=${lineNo})`, () =>
          setBreakpointByLine(runtimeContext, probe, lineNo),
        );
        await callRuntime(runtimeContext, 'synchronizeBreakpoints', () =>
          runtimeContext.runtime.synchronizeBreakpoints(true),
        );
        console.log(
          '[hint] Check Eclipse ADT breakpoint view/editor to verify the breakpoint marker on this line.',
        );
        continue;
      }
      if (choice === '15') {
        const lineRaw = (await rl.question(
          'Breakpoint line number to remove: ',
        )).trim();
        const lineNo = Number.parseInt(lineRaw, 10);
        if (!Number.isInteger(lineNo) || lineNo <= 0) {
          console.error('[fail] Invalid line number');
          continue;
        }
        await callRuntime(
          runtimeContext,
          `removeBreakpoint(line=${lineNo})`,
          () => removeBreakpointByLine(runtimeContext, probe, lineNo),
        );
        await callRuntime(runtimeContext, 'synchronizeBreakpoints', () =>
          runtimeContext.runtime.synchronizeBreakpoints(true),
        );
        continue;
      }

      console.log('Unknown action');
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`[fatal] ${error?.message || String(error)}`);
  process.exit(1);
});
