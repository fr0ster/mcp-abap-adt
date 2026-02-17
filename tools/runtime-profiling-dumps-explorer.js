#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const dotenv = require('dotenv');
const { XMLParser } = require('fast-xml-parser');
const { createAbapConnection } = require('@mcp-abap-adt/connection');
const { AdtObjectErrorCodes } = require('@mcp-abap-adt/interfaces');
const {
  AdtClient,
  AdtRuntimeClient,
  AdtExecutor,
} = require('@mcp-abap-adt/adt-clients');
const { AuthBrokerFactory } = require('../dist/lib/auth/brokerFactory.js');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

function makeLogger(verbose) {
  const noop = () => {};
  return {
    debug: verbose ? (...args) => console.log('[debug]', ...args) : noop,
    info: (...args) => console.log('[info]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    error: (...args) => console.error('[error]', ...args),
  };
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

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

function resolveHomePath(value) {
  if (!value || typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function toUpperOrThrow(value, fieldName) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseAdtException(error) {
  const raw = error?.response?.data;
  if (typeof raw !== 'string') return null;
  if (!raw.includes('<exc:exception')) return null;
  try {
    const parsed = xmlParser.parse(raw);
    const exc = parsed?.['exc:exception'];
    if (!exc) return null;
    return {
      type: exc?.type?.['@_id'] || exc?.type?.id || exc?.type,
      message:
        exc?.localizedMessage?.['#text'] ||
        exc?.localizedMessage ||
        exc?.message?.['#text'] ||
        exc?.message ||
        undefined,
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
        payload.includes('already exist') ||
        payload.includes('does already exist')))
  );
}

function loadEnvFromArgs(logger) {
  const envPathArg = getArgValue('--env-path');
  const envArg = getArgValue('--env');
  const mcpArg = getArgValue('--mcp');

  if (envPathArg) {
    const resolved = path.resolve(resolveHomePath(envPathArg));
    dotenv.config({ path: resolved });
    logger.info(`Loaded env from --env-path: ${resolved}`);
    return resolved;
  }

  if (envArg) {
    const name = String(envArg || '').trim();
    if (!name) {
      throw new Error('--env requires non-empty session name');
    }
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(
        '--env accepts only session name. Use --env-path for explicit file path.',
      );
    }
    const resolved = path.resolve(
      os.homedir(),
      '.config',
      'mcp-abap-adt',
      'sessions',
      `${name}.env`,
    );
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `Session env file not found for --env=${name}: ${resolved}`,
      );
    }
    dotenv.config({ path: resolved });
    logger.info(`Loaded env from session name --env=${name}: ${resolved}`);
    return resolved;
  }

  if (!mcpArg) {
    dotenv.config();
    logger.info('Loaded env from default .env');
  }
  return undefined;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const chunks = token.split('.');
  if (chunks.length < 2) return null;
  try {
    const payload = chunks[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function extractDefaultDumpUser(connectionMeta) {
  const fromArg = (getArgValue('--abap-user') || '').trim();
  if (fromArg) {
    return fromArg.toUpperCase();
  }

  if (connectionMeta?.authType === 'basic' && connectionMeta?.username) {
    return String(connectionMeta.username).toUpperCase();
  }
  const claims = decodeJwtPayload(connectionMeta?.jwtToken);
  return (
    claims?.user_name ||
    claims?.['user_name'] ||
    claims?.['sap.user'] ||
    claims?.['sap_user'] ||
    undefined
  );
}

async function resolveAbapUserFromSystem(connection, logger) {
  try {
    const response = await connection.makeAdtRequest({
      url: '/sap/bc/adt/core/http/systeminformation',
      method: 'GET',
      headers: {
        Accept: 'application/vnd.sap.adt.core.http.systeminformation.v1+json',
      },
      params: { _: Date.now() },
    });
    const data =
      typeof response?.data === 'string'
        ? JSON.parse(response.data)
        : response?.data;
    const userName = String(data?.userName || '').trim().toUpperCase();
    if (userName) {
      return userName;
    }
  } catch (error) {
    logger?.debug?.(
      `Failed to resolve ABAP user via systeminformation: ${error?.message || String(error)}`,
    );
  }
  return undefined;
}

function buildConnectionConfigFromEnv() {
  const authTypeRaw = (process.env.SAP_AUTH_TYPE || 'basic').toLowerCase();
  const authType = authTypeRaw === 'basic' ? 'basic' : 'jwt';
  const cfg = {
    url: getRequiredEnv('SAP_URL'),
    client: process.env.SAP_CLIENT || '',
    authType,
  };

  if (authType === 'basic') {
    cfg.username = getRequiredEnv('SAP_USERNAME');
    cfg.password = getRequiredEnv('SAP_PASSWORD');
    return cfg;
  }

  cfg.jwtToken = getRequiredEnv('SAP_JWT_TOKEN');
  return cfg;
}

async function buildConnectionConfigFromMcpDestination(destination, logger) {
  const authBrokerPath =
    getArgValue('--auth-broker-path') ||
    process.env.AUTH_BROKER_PATH ||
    path.join(os.homedir(), '.config', 'mcp-abap-adt');
  const resolvedAuthBrokerPath = path.resolve(resolveHomePath(authBrokerPath));
  const browserAuthPortRaw =
    getArgValue('--browser-auth-port') || process.env.MCP_BROWSER_AUTH_PORT;
  const browserAuthPort = browserAuthPortRaw
    ? Number.parseInt(browserAuthPortRaw, 10)
    : 4001;

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
      throw new Error(`Missing basic auth credentials for ${destination}`);
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

function parsePayload(data) {
  if (typeof data !== 'string') return data;
  const trimmed = data.trim();
  if (!trimmed.startsWith('<')) return data;
  try {
    return xmlParser.parse(trimmed);
  } catch {
    return data;
  }
}

function compact(data, max = 2500) {
  const raw =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2) || '';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}\n... [truncated ${raw.length - max} chars]`;
}

function buildClassSource(className) {
  return `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    CLASS-METHODS compute_series
      IMPORTING iv_seed TYPE i
      RETURNING VALUE(rv_sum) TYPE i.
    CLASS-METHODS recursive_score
      IMPORTING iv_n TYPE i
      RETURNING VALUE(rv_score) TYPE i.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA lv_total TYPE i.
    DATA lv_part TYPE i.

    DO 12 TIMES.
      lv_part = compute_series( sy-index ).
      lv_total = lv_total + lv_part.
    ENDDO.

    out->write( |${className}: total={ lv_total }| ).
  ENDMETHOD.

  METHOD compute_series.
    DATA lv_idx TYPE i.
    DATA lv_score TYPE i.

    rv_sum = 0.
    DO 7 TIMES.
      lv_idx = iv_seed + sy-index.
      lv_score = recursive_score( lv_idx MOD 9 + 2 ).
      rv_sum = rv_sum + lv_score.
    ENDDO.
  ENDMETHOD.

  METHOD recursive_score.
    IF iv_n <= 1.
      rv_score = 1.
      RETURN.
    ENDIF.
    rv_score = iv_n + recursive_score( iv_n - 1 ).
  ENDMETHOD.
ENDCLASS.`;
}

function buildReportSource(programName) {
  return `REPORT ${programName}.

DATA gv_total TYPE i.
DATA gv_seed TYPE i VALUE 3.

START-OF-SELECTION.
  DO 10 TIMES.
    DATA(lv_branch) = 0.
    PERFORM compute_branch USING gv_seed CHANGING lv_branch.
    gv_total = gv_total + lv_branch.
    gv_seed = gv_seed + 1.
  ENDDO.
  WRITE: / '${programName}:', gv_total.

FORM compute_branch USING iv_seed TYPE i CHANGING cv_sum TYPE i.
  DATA lv_i TYPE i.
  DATA lv_score TYPE i.

  cv_sum = 0.
  DO 6 TIMES.
    lv_i = iv_seed + sy-index.
    PERFORM recurse_score USING lv_i CHANGING lv_score.
    cv_sum = cv_sum + lv_score.
  ENDDO.
ENDFORM.

FORM recurse_score USING iv_n TYPE i CHANGING cv_score TYPE i.
  DATA lv_prev TYPE i.
  DATA lv_next TYPE i.

  IF iv_n <= 1.
    cv_score = 1.
    RETURN.
  ENDIF.

  lv_next = iv_n - 1.
  PERFORM recurse_score USING lv_next CHANGING lv_prev.
  cv_score = iv_n + lv_prev.
ENDFORM.`;
}

function buildFunctionModuleSource(functionModuleName) {
  return `FUNCTION ${functionModuleName}.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(iv_in) TYPE i OPTIONAL
*"  EXPORTING
*"     VALUE(ev_out) TYPE i
*"----------------------------------------------------------------------
  DATA lv_seed TYPE i.
  DATA lv_branch TYPE i.

  lv_seed = iv_in.
  IF lv_seed IS INITIAL.
    lv_seed = 2.
  ENDIF.

  PERFORM compute_branch USING lv_seed CHANGING lv_branch.
  ev_out = lv_branch.
ENDFUNCTION.

FORM compute_branch USING iv_seed TYPE i CHANGING cv_sum TYPE i.
  DATA lv_i TYPE i.
  DATA lv_score TYPE i.

  cv_sum = 0.
  DO 5 TIMES.
    lv_i = iv_seed + sy-index.
    PERFORM recurse_score USING lv_i CHANGING lv_score.
    cv_sum = cv_sum + lv_score.
  ENDDO.
ENDFORM.

FORM recurse_score USING iv_n TYPE i CHANGING cv_score TYPE i.
  DATA lv_prev TYPE i.
  DATA lv_next TYPE i.

  IF iv_n <= 1.
    cv_score = 1.
    RETURN.
  ENDIF.

  lv_next = iv_n - 1.
  PERFORM recurse_score USING lv_next CHANGING lv_prev.
  cv_score = iv_n + lv_prev.
ENDFORM.`;
}

function extractTraceId(raw) {
  const asText = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const match = asText.match(/\/runtime\/traces\/abaptraces\/([A-F0-9]{32})/i);
  return match?.[1];
}

function extractDumpIds(raw) {
  const ids = new Set();
  const collect = (value) => {
    if (typeof value === 'string') {
      const regex = /\/sap\/bc\/adt\/runtime\/dumps\/([^"'?&<\s]+)/g;
      let match = regex.exec(value);
      while (match) {
        ids.add(match[1]);
        match = regex.exec(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) collect(nested);
    }
  };
  collect(raw);
  return [...ids];
}

function extractTraceEntriesFromFeed(feedPayload) {
  const parsed = parsePayload(feedPayload);
  const feed = parsed?.['atom:feed'] || parsed?.feed || parsed;
  const entriesRaw = feed?.['atom:entry'] || feed?.entry || [];
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [entriesRaw];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const idRaw = entry['atom:id'] || entry.id || '';
      const titleRaw = entry['atom:title'] || entry.title || '';
      const updatedRaw = entry['atom:updated'] || entry.updated || '';
      const id = typeof idRaw === 'string' ? idRaw : JSON.stringify(idRaw);
      const traceId = extractTraceId(id);
      if (!traceId) return null;
      return {
        traceId,
        id,
        title:
          typeof titleRaw === 'string' ? titleRaw : JSON.stringify(titleRaw),
        updated:
          typeof updatedRaw === 'string'
            ? updatedRaw
            : JSON.stringify(updatedRaw),
        raw: JSON.stringify(entry),
      };
    })
    .filter(Boolean);
}

async function askWithDefault(rl, prompt, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const value = (await rl.question(`${prompt}${suffix}: `)).trim();
  return value || defaultValue || '';
}

function printMenu() {
  console.log('\n=== Runtime Profiling + Dumps Explorer ===');
  console.log('1) Create or update class/fm/report for profiling');
  console.log('2) Run class/fm/report with profiling');
  console.log('3) List profiling traces (+ optional trace data view)');
  console.log('4) List dumps (+ optional read selected dump)');
  console.log('q) Quit');
}

function printUsage() {
  console.log('Runtime Profiling + Dumps Explorer');
  console.log('');
  console.log('Usage:');
  console.log('  node tools/runtime-profiling-dumps-explorer.js --mcp=TRIAL');
  console.log('  node tools/runtime-profiling-dumps-explorer.js --env=trial');
  console.log('  node tools/runtime-profiling-dumps-explorer.js --env-path=/path/to/.env');
  console.log('');
  console.log('--env semantics:');
  console.log('  --env=<name> loads ~/.config/mcp-abap-adt/sessions/<name>.env');
  console.log('  Use --env-path for explicit file path');
  console.log('');
  console.log('Optional:');
  console.log('  --abap-user=CB9980000423');
  console.log('  --auth-broker-path=/path');
  console.log('  --browser-auth-port=3101');
  console.log('  --browser=system');
  console.log('  --verbose');
}

async function upsertExecutableObject(ctx, rl) {
  const kind = (
    await askWithDefault(rl, 'Object type (class/fm/report)', 'class')
  ).toLowerCase();
  const adt = ctx.adt;

  if (kind === 'class') {
    const className = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Class name',
        ctx.state.lastTarget?.kind === 'class'
          ? ctx.state.lastTarget.className
          : 'ZADT_MCP_PROFILE_PROBE',
      ),
      'className',
    );
    const packageName = toUpperOrThrow(
      await askWithDefault(rl, 'Package', process.env.DEBUG_PROBE_PACKAGE || '$TMP'),
      'packageName',
    );
    const transportRequest = (
      await askWithDefault(rl, 'Transport request (optional)', '')
    ).toUpperCase();
    const sourceCode = buildClassSource(className);
    const payload = {
      className,
      packageName,
      description: `Profiling probe ${className}`,
      sourceCode,
      transportRequest: transportRequest || undefined,
    };
    try {
      const existing = await adt.getClass().read({ className }, 'active');
      if (existing) {
        await adt.getClass().update(payload, { activateOnUpdate: true });
        console.log(`[ok] Class ${className} updated`);
      } else {
        await adt.getClass().create(payload, { activateOnCreate: true });
        console.log(`[ok] Class ${className} created`);
      }
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        await adt.getClass().update(payload, { activateOnUpdate: true });
        console.log(`[ok] Class ${className} updated`);
      } else if (error?.response?.status === 403) {
        console.warn(
          `[warn] No change authorization for class ${className}. Using existing class without modifications.`,
        );
      } else {
        throw error;
      }
    }
    ctx.state.lastTarget = { kind: 'class', className };
    return;
  }

  if (kind === 'report') {
    const programName = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Program name',
        ctx.state.lastTarget?.kind === 'report'
          ? ctx.state.lastTarget.programName
          : 'ZADT_MCP_PROFILE_REP',
      ),
      'programName',
    );
    const packageName = toUpperOrThrow(
      await askWithDefault(rl, 'Package', process.env.DEBUG_PROBE_PACKAGE || '$TMP'),
      'packageName',
    );
    const transportRequest = (
      await askWithDefault(rl, 'Transport request (optional)', '')
    ).toUpperCase();
    const sourceCode = buildReportSource(programName);
    const payload = {
      programName,
      packageName,
      description: `Profiling probe ${programName}`,
      sourceCode,
      transportRequest: transportRequest || undefined,
    };
    try {
      const existing = await adt.getProgram().read({ programName }, 'active');
      if (existing) {
        await adt.getProgram().update(payload, { activateOnUpdate: true });
        console.log(`[ok] Program ${programName} updated`);
      } else {
        await adt.getProgram().create(payload, { activateOnCreate: true });
        console.log(`[ok] Program ${programName} created`);
      }
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        await adt.getProgram().update(payload, { activateOnUpdate: true });
        console.log(`[ok] Program ${programName} updated`);
      } else if (error?.response?.status === 403) {
        console.warn(
          `[warn] No change authorization for report ${programName}. Using existing report without modifications.`,
        );
      } else {
        throw error;
      }
    }
    ctx.state.lastTarget = { kind: 'report', programName };
    return;
  }

  if (kind === 'fm') {
    const functionGroupName = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Function group name',
        ctx.state.lastTarget?.kind === 'fm'
          ? ctx.state.lastTarget.functionGroupName
          : '',
      ),
      'functionGroupName',
    );
    const functionModuleName = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Function module name',
        ctx.state.lastTarget?.kind === 'fm'
          ? ctx.state.lastTarget.functionModuleName
          : 'ZADT_MCP_PROFILE_FM',
      ),
      'functionModuleName',
    );
    const transportRequest = (
      await askWithDefault(rl, 'Transport request (optional)', '')
    ).toUpperCase();
    const sourceCode = buildFunctionModuleSource(functionModuleName);
    const payload = {
      functionGroupName,
      functionModuleName,
      description: `Profiling probe ${functionModuleName}`,
      sourceCode,
      transportRequest: transportRequest || undefined,
    };
    try {
      const existing = await adt.getFunctionModule().read(
        { functionGroupName, functionModuleName },
        'active',
      );
      if (existing) {
        await adt
          .getFunctionModule()
          .update(payload, { activateOnUpdate: true });
        console.log(`[ok] Function module ${functionModuleName} updated`);
      } else {
        await adt
          .getFunctionModule()
          .create(payload, { activateOnCreate: true });
        console.log(`[ok] Function module ${functionModuleName} created`);
      }
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        await adt
          .getFunctionModule()
          .update(payload, { activateOnUpdate: true });
        console.log(`[ok] Function module ${functionModuleName} updated`);
      } else if (error?.response?.status === 403) {
        console.warn(
          `[warn] No change authorization for function module ${functionModuleName}. Using existing FM without modifications.`,
        );
      } else {
        throw error;
      }
    }
    ctx.state.lastTarget = { kind: 'fm', functionGroupName, functionModuleName };
    return;
  }

  throw new Error(`Unsupported object type: ${kind}`);
}

async function tryRunRequestCandidates(connection, candidates, logger) {
  let lastError;
  for (const candidate of candidates) {
    try {
      const response = await connection.makeAdtRequest({
        method: 'POST',
        url: candidate.url,
        headers: candidate.headers || { Accept: 'text/plain' },
      });
      logger.info(`Run endpoint accepted: ${candidate.url}`);
      return { response, matchedUrl: candidate.url, requestUri: candidate.requestUri };
    } catch (error) {
      lastError = error;
      const adtException = parseAdtException(error);
      logger.warn(
        `Run endpoint failed: ${candidate.url} -> ${adtException?.message || error?.message || String(error)}`,
      );
    }
  }
  throw lastError || new Error('No run endpoint accepted request');
}

async function resolveTraceId(runtime, uriCandidates, logger) {
  for (const uri of uriCandidates) {
    if (!uri) continue;
    try {
      const response = await runtime.getProfilerTraceRequestsByUri(uri);
      const traceId = extractTraceId(response?.data);
      if (traceId) return { traceId, source: `traceRequestsByUri(${uri})` };
    } catch (error) {
      logger.debug(
        `Trace lookup by URI failed for ${uri}: ${error?.message || String(error)}`,
      );
    }
  }

  try {
    const response = await runtime.listProfilerTraceRequests();
    const traceId = extractTraceId(response?.data);
    if (traceId) return { traceId, source: 'listProfilerTraceRequests' };
  } catch (error) {
    logger.debug(
      `Fallback listProfilerTraceRequests failed: ${error?.message || String(error)}`,
    );
  }

  const filesResponse = await runtime.listProfilerTraceFiles();
  const traceId = extractTraceId(filesResponse?.data);
  if (!traceId) {
    throw new Error('Failed to resolve trace ID from profiler feeds');
  }
  return { traceId, source: 'listProfilerTraceFiles' };
}

function buildProfilerParameters(description) {
  return {
    description,
    allProceduralUnits: true,
    allDbEvents: true,
    sqlTrace: true,
    withRfcTracing: true,
    aggregate: false,
    explicitOnOff: false,
    maxTimeForTracing: 1800,
    maxSizeForTraceFile: 30720,
  };
}

async function runWithProfiling(ctx, rl) {
  const kind = (
    await askWithDefault(
      rl,
      'Object type to run (class/fm/report)',
      ctx.state.lastTarget?.kind || 'class',
    )
  ).toLowerCase();

  if (kind === 'class') {
    const className = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Class name',
        ctx.state.lastTarget?.kind === 'class'
          ? ctx.state.lastTarget.className
          : 'ZADT_MCP_PROFILE_PROBE',
      ),
      'className',
    );
    const description = await askWithDefault(
      rl,
      'Trace description',
      `MCP_CLASS_PROFILE_${Date.now()}`,
    );
    const result = await ctx.executor.getClassExecutor().runWithProfiling(
      { className },
      { profilerParameters: buildProfilerParameters(description) },
    );
    console.log(`[ok] Class run finished: HTTP ${result.response?.status || 'n/a'}`);
    console.log(`[ok] Trace ID: ${result.traceId}`);
    console.log(compact(result.response?.data));
    ctx.state.lastTarget = { kind: 'class', className };
    ctx.state.lastRun = {
      kind,
      traceId: result.traceId,
      profilerId: result.profilerId,
      output: result.response?.data,
    };
    return;
  }

  const runtime = ctx.runtime;
  const description = await askWithDefault(
    rl,
    'Trace description',
    `MCP_${kind.toUpperCase()}_PROFILE_${Date.now()}`,
  );
  const profilerResponse = await runtime.createProfilerTraceParameters(
    buildProfilerParameters(description),
  );
  const profilerId = runtime.extractProfilerIdFromResponse(profilerResponse);
  if (!profilerId) {
    throw new Error('Failed to extract profilerId from createProfilerTraceParameters');
  }

  if (kind === 'report') {
    const programName = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Program name',
        ctx.state.lastTarget?.kind === 'report'
          ? ctx.state.lastTarget.programName
          : 'ZADT_MCP_PROFILE_REP',
      ),
      'programName',
    );
    const encodedProfilerId = encodeURIComponent(profilerId);
    const prog = encodeURIComponent(programName.toLowerCase());
    const candidates = [
      {
        url: `/sap/bc/adt/programs/programs/${prog}/run?profilerId=${encodedProfilerId}`,
        requestUri: `/sap/bc/adt/programs/programs/${prog}/run`,
      },
      {
        url: `/sap/bc/adt/programs/programs/${prog}?profilerId=${encodedProfilerId}`,
        requestUri: `/sap/bc/adt/programs/programs/${prog}`,
      },
    ];
    const runResult = await tryRunRequestCandidates(
      ctx.connection,
      candidates,
      ctx.logger,
    );
    const traceLookup = await resolveTraceId(
      runtime,
      [runResult.requestUri, `/sap/bc/adt/programs/programs/${prog}`],
      ctx.logger,
    );
    console.log(`[ok] Report run finished: HTTP ${runResult.response?.status || 'n/a'}`);
    console.log(`[ok] Trace ID: ${traceLookup.traceId} (${traceLookup.source})`);
    console.log(compact(runResult.response?.data));
    ctx.state.lastTarget = { kind: 'report', programName };
    ctx.state.lastRun = {
      kind,
      traceId: traceLookup.traceId,
      profilerId,
      output: runResult.response?.data,
    };
    return;
  }

  if (kind === 'fm') {
    const functionGroupName = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Function group name',
        ctx.state.lastTarget?.kind === 'fm'
          ? ctx.state.lastTarget.functionGroupName
          : '',
      ),
      'functionGroupName',
    );
    const functionModuleName = toUpperOrThrow(
      await askWithDefault(
        rl,
        'Function module name',
        ctx.state.lastTarget?.kind === 'fm'
          ? ctx.state.lastTarget.functionModuleName
          : 'ZADT_MCP_PROFILE_FM',
      ),
      'functionModuleName',
    );
    const encodedProfilerId = encodeURIComponent(profilerId);
    const fugr = encodeURIComponent(functionGroupName.toLowerCase());
    const fm = encodeURIComponent(functionModuleName.toLowerCase());
    const candidates = [
      {
        url: `/sap/bc/adt/functions/groups/${fugr}/fmodules/${fm}/run?profilerId=${encodedProfilerId}`,
        requestUri: `/sap/bc/adt/functions/groups/${fugr}/fmodules/${fm}/run`,
      },
      {
        url: `/sap/bc/adt/functions/groups/${fugr}/fmodules/${fm}?profilerId=${encodedProfilerId}`,
        requestUri: `/sap/bc/adt/functions/groups/${fugr}/fmodules/${fm}`,
      },
    ];
    const runResult = await tryRunRequestCandidates(
      ctx.connection,
      candidates,
      ctx.logger,
    );
    const traceLookup = await resolveTraceId(
      runtime,
      [
        runResult.requestUri,
        `/sap/bc/adt/functions/groups/${fugr}/fmodules/${fm}`,
      ],
      ctx.logger,
    );
    console.log(`[ok] FM run finished: HTTP ${runResult.response?.status || 'n/a'}`);
    console.log(`[ok] Trace ID: ${traceLookup.traceId} (${traceLookup.source})`);
    console.log(compact(runResult.response?.data));
    ctx.state.lastTarget = { kind: 'fm', functionGroupName, functionModuleName };
    ctx.state.lastRun = {
      kind,
      traceId: traceLookup.traceId,
      profilerId,
      output: runResult.response?.data,
    };
    return;
  }

  throw new Error(`Unsupported object type: ${kind}`);
}

async function listTraces(ctx, rl) {
  const defaultUser = ctx.state.defaultDumpUser || '';
  const traceUserInput = await askWithDefault(
    rl,
    'ABAP user filter for traces (ENTER=default, *=all users)',
    defaultUser,
  );
  const traceUser =
    traceUserInput.trim() === '*'
      ? ''
      : traceUserInput.trim().toUpperCase();

  const response = await ctx.runtime.listProfilerTraceFiles();
  const allEntries = extractTraceEntriesFromFeed(response?.data);
  const entries = traceUser
    ? allEntries.filter((entry) =>
        String(entry.raw || '').toUpperCase().includes(traceUser),
      )
    : allEntries;
  console.log(`[ok] listProfilerTraceFiles -> HTTP ${response?.status || 'n/a'}`);
  if (!entries.length) {
    console.log('[info] No profiler traces found');
    return;
  }

  const limit = Math.min(entries.length, 20);
  console.log(`Found ${entries.length} trace(s), showing ${limit}:`);
  for (let i = 0; i < limit; i += 1) {
    const e = entries[i];
    console.log(
      `${i + 1}) ${e.traceId}  ${e.updated || '-'}  ${e.title || ''}`.trim(),
    );
  }

  const viewSelection = (
    await askWithDefault(
      rl,
      'Enter trace index to read data (or blank to skip)',
      '',
    )
  ).trim();
  if (!viewSelection) return;

  const idx = Number.parseInt(viewSelection, 10);
  if (!Number.isInteger(idx) || idx < 1 || idx > limit) {
    console.log('[warn] Invalid index, skipped');
    return;
  }

  const traceId = entries[idx - 1].traceId;
  const view = (
    await askWithDefault(rl, 'View (hitlist/statements/dbaccesses)', 'hitlist')
  ).toLowerCase();

  let detailsResponse;
  if (view === 'statements') {
    detailsResponse = await ctx.runtime.getProfilerTraceStatements(traceId, {
      withSystemEvents: false,
    });
  } else if (view === 'dbaccesses') {
    detailsResponse = await ctx.runtime.getProfilerTraceDbAccesses(traceId, {
      withSystemEvents: false,
    });
  } else {
    detailsResponse = await ctx.runtime.getProfilerTraceHitList(traceId, {
      withSystemEvents: false,
    });
  }

  console.log(`[ok] Trace ${traceId} (${view}) -> HTTP ${detailsResponse?.status || 'n/a'}`);
  console.log(compact(parsePayload(detailsResponse?.data), 4000));
}

async function listDumps(ctx, rl) {
  const defaultUser = ctx.state.defaultDumpUser || '';
  const userInputRaw = await askWithDefault(
    rl,
    'ABAP dump user (ENTER=default, *=all users)',
    defaultUser,
  );
  const userInput = userInputRaw.trim();
  const userFilter = userInput === '*' ? '' : userInput.toUpperCase();

  const response = userFilter
    ? await ctx.runtime.listRuntimeDumpsByUser(userFilter, {
        inlinecount: 'allpages',
        top: 50,
      })
    : await ctx.runtime.listRuntimeDumps({
        inlinecount: 'allpages',
        top: 50,
      });

  const parsedPayload = parsePayload(response?.data);
  const dumpIds = extractDumpIds(parsedPayload);
  console.log(`[ok] listRuntimeDumps -> HTTP ${response?.status || 'n/a'}`);
  console.log(
    `[info] user filter: ${userFilter || '(all users)'}; dumps found: ${dumpIds.length}`,
  );
  if (!dumpIds.length) return;

  const limit = Math.min(dumpIds.length, 20);
  for (let i = 0; i < limit; i += 1) {
    console.log(`${i + 1}) ${dumpIds[i]}`);
  }

  const selection = (
    await askWithDefault(rl, 'Enter dump index to read (or blank to skip)', '')
  ).trim();
  if (!selection) return;
  const idx = Number.parseInt(selection, 10);
  if (!Number.isInteger(idx) || idx < 1 || idx > limit) {
    console.log('[warn] Invalid index, skipped');
    return;
  }

  const dumpId = dumpIds[idx - 1];
  const details = await ctx.runtime.getRuntimeDumpById(dumpId);
  console.log(`[ok] Dump ${dumpId} -> HTTP ${details?.status || 'n/a'}`);
  console.log(compact(parsePayload(details?.data), 5000));
}

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    printUsage();
    return;
  }

  const verbose =
    getArgValue('--verbose') !== undefined || process.env.DEBUG_PROBE_VERBOSE === 'true';
  const logger = makeLogger(verbose);
  const mcpDestination = getArgValue('--mcp');
  loadEnvFromArgs(logger);

  const connectionConfig = mcpDestination
    ? await buildConnectionConfigFromMcpDestination(mcpDestination, logger)
    : buildConnectionConfigFromEnv();
  const connection = createAbapConnection(connectionConfig, logger);
  const userFromSystem = await resolveAbapUserFromSystem(connection, logger);
  const defaultAbapUser =
    userFromSystem || extractDefaultDumpUser(connectionConfig);
  const ctx = {
    logger,
    connection,
    adt: new AdtClient(connection, logger),
    runtime: new AdtRuntimeClient(connection, logger),
    executor: new AdtExecutor(connection, logger),
    state: {
      lastTarget: undefined,
      lastRun: undefined,
      defaultDumpUser: defaultAbapUser,
    },
  };

  console.log('Connection initialized:');
  if (mcpDestination) console.log(`  mcp destination: ${mcpDestination}`);
  console.log(`  url: ${connectionConfig.url}`);
  console.log(`  client: ${connectionConfig.client || '(none)'}`);
  console.log(`  auth: ${connectionConfig.authType}`);
  console.log(
    `  default ABAP user: ${ctx.state.defaultDumpUser || '(not resolved)'}`,
  );
  if (!ctx.state.defaultDumpUser) {
    console.log(
      '  hint: pass --abap-user=CB9980000423 to set explicit ABAP user for filters',
    );
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      printMenu();
      const choice = (await rl.question('Select action: ')).trim().toLowerCase();
      if (choice === 'q') break;

      try {
        if (choice === '1') {
          await upsertExecutableObject(ctx, rl);
          continue;
        }
        if (choice === '2') {
          await runWithProfiling(ctx, rl);
          continue;
        }
        if (choice === '3') {
          await listTraces(ctx, rl);
          continue;
        }
        if (choice === '4') {
          await listDumps(ctx, rl);
          continue;
        }
        console.log('Unknown action');
      } catch (error) {
        const adtException = parseAdtException(error);
        const message =
          adtException?.message || error?.message || String(error);
        console.error(
          `[fail] ${message}${adtException?.type ? ` [${adtException.type}]` : ''}`,
        );
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`[fatal] ${error?.message || String(error)}`);
  process.exit(1);
});
