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
import { child, type Element, isElement, isList } from '../xml/tree';
import type { AdtReading } from './reading';
import { withStep } from './step';

/** What a run answered, once it stopped running. */
export interface ActivationRunOutcome {
  /** The run's id — `''` when the POST answered no `Location`. */
  runId: string;
  /**
   * `runs:status` as the server last stated it, lowercased — `finished`,
   * `error` or `failed` unless a read failed (then `failure` says which) or
   * there was no run id (`''`).
   */
  status: string;
  /** Every message the results document carries, in wire order. */
  messages: ActivationMessage[];
  /**
   * SAP's own verdict, as the results document states it
   * (`chkl:properties activationExecuted`); `undefined` where it states none.
   */
  executed?: boolean;
  /** The results document, for a caller that wants it verbatim. */
  results?: string;
  /**
   * Reading the run or its results failed: the method's error as it is, with
   * its step (`read activation run`, `read activation results`). The run's
   * outcome is then unknown, not "no messages".
   */
  failure?: IAdtError;
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

/** A status that ends the wait. */
const SETTLED = new Set(['finished', 'error', 'failed']);

/**
 * A status that says the run is still going, so the wait reads again:
 * `running`, the one measured on premise and on the cloud (2026-11-04).
 * adt-clients types the status as text, so nothing else is known to mean
 * "still running"; any other status ends the wait (`unreadableStatus`).
 */
const RUNNING = new Set(['running']);

/**
 * A run status the wait does not know — none, an empty one, or one that is
 * neither running nor terminal — in fixed words and the value as SAP sent it.
 * Not SAP's refusal and not a verdict on the run: the wait cannot tell
 * whether to read again, so it stops and says why.
 */
export class UnreadableRunStatus extends Error {
  readonly runId: string;
  readonly status: string;
  constructor(runId: string, status: string) {
    super(
      `The activation run ${runId} answered ${
        status === '' ? 'no status' : `the status "${status}"`
      }, which is neither running (read again) nor finished, error or failed (the run ended): the wait stops here, and the run's results are not read.`,
    );
    this.name = 'UnreadableRunStatus';
    this.runId = runId;
    this.status = status;
  }
}

/** A reading's parse and its document as it came, from a reading or a bare value. */
export function readingOf(value: unknown): {
  parsed: unknown;
  raw: string;
} {
  if (
    value !== null &&
    typeof value === 'object' &&
    ('value' in value || 'raw' in value)
  ) {
    const raw = 'raw' in value ? value.raw : undefined;
    return {
      parsed: 'value' in value ? value.value : undefined,
      raw: typeof raw === 'string' ? raw : '',
    };
  }
  return { parsed: value, raw: typeof value === 'string' ? value : '' };
}

function attrs(node: unknown): Element {
  const a = child(node, '@');
  return isElement(a) ? a : {};
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
  const root = child(parsed, 'runs:run');
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
  const root = child(parsed, 'chkl:messages') ?? child(parsed, 'messages');
  const raw_msgs = child(root, 'msg');
  const list = isList(raw_msgs)
    ? raw_msgs
    : raw_msgs === undefined
      ? []
      : [raw_msgs];
  for (const msg of list) {
    const a = attrs(msg);
    const shortText = child(msg, 'shortText');
    const text =
      typeof shortText === 'string' ? shortText : child(shortText, 'txt');
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

/**
 * `activationExecuted` of a results document's `chkl:properties`: SAP's own
 * statement whether the activation ran (`"false"` for a run SAP cancelled,
 * "Activation was cancelled.", or one with nothing to activate). `undefined`
 * where the document states none. Read from the parse, else off the raw
 * text by plain string search (the attribute of the one `chkl:properties`
 * element), never from a message's words.
 */
export function activationExecutedOf(value: unknown): boolean | undefined {
  const { parsed, raw } = readingOf(value);
  const root = child(parsed, 'chkl:messages') ?? child(parsed, 'messages');
  const properties = child(root, 'chkl:properties');
  const stated = attrs(properties).activationExecuted;
  if (stated === 'true' || stated === 'false') return stated === 'true';
  const element = raw.indexOf('<chkl:properties');
  if (element < 0) return undefined;
  const end = raw.indexOf('>', element);
  const tag = raw.slice(element, end < 0 ? undefined : end);
  if (tag.includes(' activationExecuted="true"')) return true;
  if (tag.includes(' activationExecuted="false"')) return false;
  return undefined;
}

/**
 * Whether a finished run activated what it was given, by SAP's verdict:
 * not where its results state `activationExecuted="false"`, and not where a
 * message is of error severity. Where the results state no
 * `activationExecuted`, the messages alone decide, as a run that activated
 * everything says nothing.
 */
export function activationVerdict(
  executed: boolean | undefined,
  messages: readonly ActivationMessage[],
): boolean {
  return executed !== false && !messages.some(isRefusal);
}

/** An error-severity message, by SAP's own letters. */
export function isRefusal(message: ActivationMessage): boolean {
  return /^[EAX]$/i.test(message.type) || /^error$/i.test(message.type);
}

/**
 * Wait for a started run, then read what it produced.
 *
 * Every status read is a long poll (`withLongPolling=true`): SAP holds it
 * until the run ends (measured on premise and on the cloud trial,
 * 2026-11-04), so the wait is one request in practice. A status that is not
 * terminal is followed by another long poll — no timer of ours, no attempt
 * limit: the run ends the wait, or SAP's refusal does. Only `running` is
 * read again; a status it does not know — none, empty, any other — throws
 * `UnreadableRunStatus`, naming it, rather than reading on a guess.
 *
 * Never throws for a refusal: a refused `getActivationRun` or
 * `getActivationResults` comes back as the outcome's `failure` — the method's
 * error as it is, with its step — never folded into `messages`, which are
 * SAP's messages about the run.
 */
export async function awaitActivationRun(
  utils: ActivationRunSource,
  runId: string,
  analyse: unknown,
): Promise<ActivationRunOutcome> {
  if (runId === '') {
    return {
      runId,
      status: '',
      messages: [
        {
          type: 'E',
          text: 'The activation run answered no id — POST /activation/runs carries it in the Location header, and without it neither the run nor its results can be read.',
        },
      ],
    };
  }

  let status = '';
  while (!SETTLED.has(status)) {
    const answered = await utils.getActivationRun(runId, {
      withLongPolling: true,
      analyse,
    });
    if (!answered.ok) {
      return {
        runId,
        status,
        messages: [],
        failure: withStep(answered.getError(), 'read activation run'),
      };
    }
    status = runStatusOf(answered.getResult().value);
    if (!SETTLED.has(status) && !RUNNING.has(status)) {
      throw new UnreadableRunStatus(runId, status);
    }
  }

  const produced = await utils.getActivationResults(runId, { analyse });
  if (!produced.ok) {
    return {
      runId,
      status,
      messages: [],
      failure: withStep(produced.getError(), 'read activation results'),
    };
  }
  const value = produced.getResult().value;
  const executed = activationExecutedOf(value);
  return {
    runId,
    status,
    messages: activationMessagesOf(value),
    ...(executed === undefined ? {} : { executed }),
    results: readingOf(value).raw || undefined,
  };
}
