/**
 * The session trace of a served server (an owner's run, opt-in): a preamble
 * put before the launcher, writing one `session-trace` line on stderr per
 * HTTP(S) request the server sends and one per answer — the method and
 * path without the query, whether it asks for the stateful session, the
 * first 12 hex digits of the SHA-256 of its security session cookie, the
 * context id, a timestamp; no cookie value, token or credential — and the
 * reading of those lines by security session: its contexts, its requests by
 * path, its logoff and SAP's answer to it.
 */

/**
 * The child's session trace, put before the launcher runs: every HTTP(S)
 * request the server sends is one `session-trace` line on stderr at its
 * creation — its method, its path without the query, whether it asks for the
 * stateful session, a hash of the security session cookie it carries and the
 * context id it carries — and every answer one line with the hash of a
 * security session cookie and the context id it sets. No cookie value, token
 * or credential is printed: the security session only as the first 12 hex
 * digits of its SHA-256, the context id as SAP gave it.
 */
export const SESSION_TRACE_PREAMBLE = [
  "import { createRequire as traceRequire } from 'node:module';",
  // The modules themselves, not an import's namespace copy: their `request` is what the wires call.
  "const traceHttp = traceRequire(process.cwd() + '/')('node:http');",
  "const traceHttps = traceRequire(process.cwd() + '/')('node:https');",
  "import { createHash as traceHash } from 'node:crypto';",
  'let traceId = 0;',
  "const traceSecurity = (value: string | undefined) => value ? traceHash('sha256').update(value).digest('hex').slice(0, 12) : '-';",
  'const traceCookie = (header: unknown, name: string) => {',
  "  for (const pair of String(header ?? '').split(';')) {",
  "    const at = pair.indexOf('=');",
  '    if (at < 0) continue;',
  '    const key = pair.slice(0, at).trim();',
  "    if (name === 'SAP_SESSIONID' ? key.startsWith('SAP_SESSIONID') : key === name) return pair.slice(at + 1).trim();",
  '  }',
  '  return undefined;',
  '};',
  'const traceSet = (header: unknown, name: string) => {',
  '  for (const line of Array.isArray(header) ? header : header ? [header] : []) {',
  "    const value = traceCookie(String(line).split(';')[0], name);",
  '    if (value !== undefined) return value;',
  '  }',
  '  return undefined;',
  '};',
  'for (const mod of [traceHttp, traceHttps] as any[]) {',
  '  const original = mod.request;',
  '  mod.request = function (...args: any[]) {',
  '    const req = original.apply(this, args);',
  '    const id = ++traceId;',
  '    try {',
  "      const path = String(req.path ?? '').split('?')[0];",
  "      const cookie = req.getHeader('cookie');",
  "      const stateful = String(req.getHeader('x-sap-adt-sessiontype') ?? '').toLowerCase() === 'stateful' ? 1 : 0;",
  "      process.stderr.write(['session-trace', 'req', id, req.method + ' ' + path, 'stateful=' + stateful, 'sec=' + traceSecurity(traceCookie(cookie, 'SAP_SESSIONID')), 'ctx=' + (traceCookie(cookie, 'sap-contextid') ?? '-'), 't=' + Date.now()].join(String.fromCharCode(9)) + String.fromCharCode(10));",
  "      req.on('response', (res: any) => {",
  "        const set = res.headers['set-cookie'];",
  "        process.stderr.write(['session-trace', 'res', id, res.statusCode, 'sec=' + traceSecurity(traceSet(set, 'SAP_SESSIONID')), 'ctx=' + (traceSet(set, 'sap-contextid') ?? '-'), 't=' + Date.now()].join(String.fromCharCode(9)) + String.fromCharCode(10));",
  '      });',
  '    } catch {}',
  '    return req;',
  '  };',
  '}',
];

/** One security session of the trace: what its requests carried, whether it was logged off. */
interface TracedSession {
  sec: string;
  paths: Record<string, number>;
  requests: number;
  stateful: boolean;
  contexts: Set<string>;
  loggedOff: boolean;
  /** SAP's answer to the logoff and the ms from its send to it; `no answer` before the trace was read. */
  logoff?: { status: string; ms?: number };
}

/** A trace line's `t=` field: when it was written, in ms. */
const timeOf = (fields: string[]): number | undefined => {
  const field = fields.find((f) => f.startsWith('t='));
  return field === undefined ? undefined : Number(field.slice(2));
};

/**
 * The trace read back, by security session: a request's session is the one
 * its cookie names, else the one its answer set. Each stateful session must
 * hold one context id throughout, each session must be logged off; answers
 * the summary and what broke the rules.
 */
export function readSessionTrace(lines: string[]): {
  summary: Record<string, number>;
  sessions: Array<{
    sec: string;
    stateful: boolean;
    contexts: string[];
    paths: Record<string, number>;
    logged_off: boolean;
    logoff?: { status: string; ms?: number };
  }>;
  problems: string[];
} {
  const requests = new Map<
    string,
    { what: string; stateful: boolean; sec: string; ctx: string; t?: number }
  >();
  const answers = new Map<
    string,
    { status: string; sec: string; ctx: string; t?: number }
  >();
  for (const line of lines) {
    const fields = line.split('\t');
    const [, type, id, what, a, b, c] = fields;
    if (id === undefined) continue;
    if (type === 'req') {
      requests.set(id, {
        what: String(what),
        stateful: a === 'stateful=1',
        sec: String(b).slice(4),
        ctx: String(c).slice(4),
        t: timeOf(fields),
      });
    } else if (type === 'res') {
      answers.set(id, {
        status: String(what),
        sec: String(a).slice(4),
        ctx: String(b).slice(4),
        t: timeOf(fields),
      });
    }
  }
  const sessions = new Map<string, TracedSession>();
  for (const [id, request] of requests) {
    const answer = answers.get(id);
    const sec = request.sec !== '-' ? request.sec : (answer?.sec ?? '-');
    if (sec === '-') continue;
    const session = sessions.get(sec) ?? {
      sec,
      paths: {},
      requests: 0,
      stateful: false,
      contexts: new Set<string>(),
      loggedOff: false,
    };
    sessions.set(sec, session);
    if (request.what.includes('/sap/public/bc/icf/logoff')) {
      session.loggedOff = true;
      session.logoff =
        answer === undefined
          ? { status: 'no answer' }
          : {
              status: answer.status,
              ...(answer.t !== undefined && request.t !== undefined
                ? { ms: answer.t - request.t }
                : {}),
            };
      continue;
    }
    session.requests += 1;
    session.paths[request.what] = (session.paths[request.what] ?? 0) + 1;
    if (request.stateful) session.stateful = true;
    for (const ctx of [request.ctx, answer?.ctx ?? '-'])
      if (ctx !== '-') session.contexts.add(ctx);
  }
  const problems: string[] = [];
  let index = 0;
  for (const session of sessions.values()) {
    index += 1;
    if (session.contexts.size > 1)
      problems.push(
        `security session #${index}: ${session.contexts.size} ABAP contexts on one connection`,
      );
    if (!session.stateful && session.contexts.size > 0)
      problems.push(
        `security session #${index}: a context on a stateless connection`,
      );
    if (!session.loggedOff)
      problems.push(`security session #${index}: never logged off`);
    // A live run claims SAP closed the session: its logoff answered 200.
    else if (session.logoff?.status !== '200')
      problems.push(
        `security session #${index}: its logoff was answered ${session.logoff?.status ?? 'no answer'}, not 200`,
      );
  }
  const all = [...sessions.values()];
  return {
    summary: {
      security_sessions: all.length,
      stateful: all.filter((s) => s.stateful).length,
      stateless: all.filter((s) => !s.stateful).length,
      contexts: all.reduce((n, s) => n + s.contexts.size, 0),
      logged_off: all.filter((s) => s.loggedOff).length,
      requests: all.reduce((n, s) => n + s.requests, 0),
    },
    sessions: all.map((s) => ({
      sec: s.sec,
      stateful: s.stateful,
      contexts: [...s.contexts],
      paths: s.paths,
      logged_off: s.loggedOff,
      ...(s.logoff !== undefined ? { logoff: s.logoff } : {}),
    })),
    problems,
  };
}
