/**
 * A group activation is three requests, and only the third says what happened.
 *
 * `POST /activation/runs` answers **`202` with the run id in `Location` and a
 * body that carries nothing**. So a caller who stops there has acceptance and
 * no verdict — and the body it did get parses to zero messages, which reads
 * exactly like "no errors". That is how `shared:setup` came to log
 * *"Group activation completed successfully"* over eleven objects that stayed
 * inactive, with not one SAP message in the log to say why.
 *
 * The other two requests are `getActivationRun` — `runs:status` is `finished`,
 * `error`, `failed`, or a progress percentage while it runs — and
 * `getActivationResults`, which carries the `chkl:messages` the single-object
 * `/activation` endpoint answers inline. Both take the run id, and the library
 * deliberately makes them separate members: *"How long to wait before asking is
 * the caller's decision"*, and *"which of those ends a wait is their decision"*.
 *
 * This is that decision, in one place, because two callers need it: the polygon
 * setup and `ActivateObjectLow`'s group path.
 *
 * **Why the group path at all.** A block of objects that depend on each other —
 * a RAP root and child with their behaviour definitions and pool class, an
 * interface and the class implementing it, a metadata extension over a view —
 * cannot be activated one at a time in any order: each one needs the others
 * active. Only an activation run sees them together. So the answer to "it did
 * not activate" cannot be "activate them separately"; it has to be read out of
 * the run.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from './reading';

/** What a run answered, once it stopped running. */
export interface ActivationRunOutcome {
  /** The run's id — `''` when the POST answered no `Location`. */
  runId: string;
  /** `runs:status` as the server last stated it, lowercased. */
  status: string;
  /** Whether that status is one this waits for: `finished`, `error`, `failed`. */
  settled: boolean;
  /** Every message the results document carries, in wire order. */
  messages: ActivationMessage[];
  /** The results document, for a caller that wants it verbatim. */
  results?: string;
}

export interface ActivationMessage {
  type: string;
  text: string;
  objectName?: string;
}

/** The members this composite calls, structurally — no client needed to test it. */
export interface ActivationRunSource {
  getActivationRun(
    runId: string,
    options: { withLongPolling?: boolean; analyse?: unknown },
  ): Promise<IAdtResponse<AdtReading<unknown> | unknown, IAdtError>>;
  getActivationResults(
    runId: string,
    options: { analyse?: unknown },
  ): Promise<IAdtResponse<AdtReading<unknown> | unknown, IAdtError>>;
}

/** A status that ends the wait. Anything else is progress. */
const SETTLED = new Set(['finished', 'error', 'failed']);

function readingOf(value: unknown): { parsed: unknown; raw: string } {
  const reading = value as { value?: unknown; raw?: unknown } | null;
  if (
    reading !== null &&
    typeof reading === 'object' &&
    ('value' in reading || 'raw' in reading)
  ) {
    return {
      parsed: reading.value,
      raw: typeof reading.raw === 'string' ? reading.raw : '',
    };
  }
  return { parsed: value, raw: typeof value === 'string' ? value : '' };
}

function attrs(node: unknown): Record<string, unknown> {
  const a = (node as { '@'?: Record<string, unknown> } | undefined)?.['@'];
  return a && typeof a === 'object' ? a : {};
}

/**
 * `runs:status` out of a run document.
 *
 * The attribute is read from the parse when there is one and off the raw text
 * otherwise, because `run`'s reading is `structured` in `READING_BY_SLOT` but a
 * caller may hand this a set that keeps the document.
 */
export function runStatusOf(value: unknown): string {
  const { parsed, raw } = readingOf(value);
  const root = (parsed as Record<string, unknown> | undefined)?.['runs:run'];
  const stated = attrs(root)['runs:status'] ?? attrs(root).status;
  if (typeof stated === 'string' && stated !== '') return stated.toLowerCase();
  const fromText = raw.match(/\brun[s]?:status="([^"]+)"/i)?.[1];
  return (fromText ?? '').toLowerCase();
}

/**
 * Every message a results document carries.
 *
 * The shape is the checklist the single-object `/activation` answers —
 * `chkl:messages` with `msg` children — so this reads the same two spellings
 * `parseActivationResponse` does, and keeps the object each message is about
 * when the document names one. A results document with no messages is not an
 * error: a run that activated everything says nothing.
 */
export function activationMessagesOf(value: unknown): ActivationMessage[] {
  const { parsed, raw } = readingOf(value);
  const messages: ActivationMessage[] = [];
  const root =
    (parsed as Record<string, unknown> | undefined)?.['chkl:messages'] ??
    (parsed as Record<string, unknown> | undefined)?.messages;
  const raw_msgs = (root as Record<string, unknown> | undefined)?.msg;
  const list = Array.isArray(raw_msgs)
    ? raw_msgs
    : raw_msgs === undefined
      ? []
      : [raw_msgs];
  for (const msg of list) {
    const a = attrs(msg);
    const shortText = (msg as { shortText?: unknown })?.shortText;
    const text =
      typeof shortText === 'string'
        ? shortText
        : ((shortText as { txt?: unknown })?.txt as string | undefined);
    messages.push({
      type: String(a.type ?? a['@_type'] ?? 'info'),
      text: String(text ?? a.text ?? 'Unknown message'),
      ...(a.objName !== undefined
        ? { objectName: String(a.objName) }
        : a['adtcore:name'] !== undefined
          ? { objectName: String(a['adtcore:name']) }
          : {}),
    });
  }
  if (messages.length === 0 && raw !== '') {
    // A document this parse does not recognise still has its messages in text:
    // report them rather than answering "no messages" for a document nobody
    // read. `type` comes back as stated; the caller decides what `E` means. The
    // object name is picked up too — dropping it here would make a refusal name
    // no object, which is the one detail that makes a group failure actionable.
    for (const m of raw.matchAll(
      /<msg\b([^>]*)>[\s\S]*?<shortText>(?:<txt>)?([^<]*)/gi,
    )) {
      const tag = m[1];
      const named =
        tag.match(/\bobjName="([^"]*)"/i)?.[1] ??
        tag.match(/\badtcore:name="([^"]*)"/i)?.[1];
      messages.push({
        type: tag.match(/\btype="([^"]*)"/i)?.[1] ?? 'info',
        text: m[2],
        ...(named !== undefined ? { objectName: named } : {}),
      });
    }
  }
  return messages;
}

/** An error-severity message, by SAP's own letters. */
export function isRefusal(message: ActivationMessage): boolean {
  return /^[EAX]$/i.test(message.type) || /^error$/i.test(message.type);
}

/**
 * Wait for a started run, then read what it produced.
 *
 * `withLongPolling` holds each request open on the server, so this is a bounded
 * number of requests rather than a tight loop: `attempts` of them, and the
 * default of six covers the runs measured on a cloud trial. A run that has not
 * settled by then is reported as it stands — `settled: false` — rather than
 * called a failure, because "still running" and "refused" are different answers
 * and only one of them is the caller's problem.
 *
 * Never throws for a refusal: a refused `getActivationRun` or
 * `getActivationResults` comes back in the outcome's `messages`, so one caller
 * can log them and another can fail on them.
 */
export async function awaitActivationRun(
  utils: ActivationRunSource,
  runId: string,
  analyse: unknown,
  attempts = 6,
  delayMs = 1000,
): Promise<ActivationRunOutcome> {
  if (runId === '') {
    return {
      runId,
      status: '',
      settled: false,
      messages: [
        {
          type: 'E',
          text: 'The activation run answered no id — POST /activation/runs carries it in the Location header, and without it neither the run nor its results can be read.',
        },
      ],
    };
  }

  let status = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const answered = await utils.getActivationRun(runId, {
      withLongPolling: true,
      analyse,
    });
    if (!answered.ok) {
      return {
        runId,
        status,
        settled: false,
        messages: [
          {
            type: 'E',
            text: `Reading activation run ${runId} was refused: ${answered.getError().message}`,
          },
        ],
      };
    }
    status = runStatusOf(answered.getResult().value);
    if (SETTLED.has(status)) break;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const produced = await utils.getActivationResults(runId, { analyse });
  if (!produced.ok) {
    return {
      runId,
      status,
      settled: SETTLED.has(status),
      messages: [
        {
          type: 'E',
          text: `Reading the results of activation run ${runId} was refused: ${produced.getError().message}`,
        },
      ],
    };
  }
  const value = produced.getResult().value;
  return {
    runId,
    status,
    settled: SETTLED.has(status),
    messages: activationMessagesOf(value),
    results: readingOf(value).raw || undefined,
  };
}
