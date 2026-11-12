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
import {
  type IAdtStillInactive,
  stillInactiveAmong,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { asciiLower, asciiUpper } from '../plainText';
import { child, entries, listOf, text } from '../xml/tree';
import {
  type AdtReading,
  attributeOf,
  membersNamed,
  parseStructure,
} from './reading';
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
  results?: string | undefined;
  /**
   * What the inactive list, read once after a silent results checklist
   * (`activationExecuted="false"`, no message), still names of the run's
   * references (`stillInactiveAmong`, fr0ster/mcp-abap-adt#351). Absent where
   * no list was read; empty where none is listed — nothing to activate.
   */
  stillInactive?: ReadonlyArray<IAdtStillInactive>;
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
    options: { withLongPolling?: boolean | undefined; analyse?: unknown },
  ): Promise<IAdtResponse<AdtReading<unknown> | unknown, IAdtError>>;
  getActivationResults(
    runId: string,
    options: { analyse?: unknown },
  ): Promise<IAdtResponse<AdtReading<unknown> | unknown, IAdtError>>;
  /** Read with `wireItself` in the `inactive` slot: the list as it came. */
  getInactiveObjects(options: {
    analyse?: unknown;
  }): Promise<IAdtResponse<IAdtWireResponse, IAdtError>>;
}

/** The step the read after a silent results checklist arises at. */
export const INACTIVE_OBJECTS = 'inactiveObjects';

/** The words of an outcome the read after a silent checklist could not decide. */
const UNDECIDED =
  "The activation's outcome could not be decided: the run's results say no activation ran and give no message, and";

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

/**
 * The documents a value holds, in the order they are read: its parse, then
 * its document kept as text, parsed (`parseStructure`) — a caller may hand a
 * set that keeps only the document.
 */
function documentsOf(value: unknown): unknown[] {
  const { parsed, raw } = readingOf(value);
  return [parsed, parseStructure(raw)];
}

/** A document's root element: its first member that is not the declaration. */
function rootOf(document: unknown): unknown {
  return entries(document).find(([name]) => !name.startsWith('?'))?.[1];
}

/**
 * `runs:status` out of a run document, lowercased; `''` when it states none.
 *
 * Read from the parse when there is one and from the document kept as text
 * otherwise, because `run`'s reading is `structured` in `READING_BY_SLOT` but a
 * caller may hand this a set that keeps the document.
 */
export function runStatusOf(value: unknown): string {
  for (const document of documentsOf(value)) {
    const root = rootOf(document);
    const stated =
      attributeOf(root, 'runs:status') ??
      attributeOf(root, 'run:status') ??
      attributeOf(root, 'status');
    if (stated !== undefined && stated !== '') return stated.toLowerCase();
  }
  return '';
}

/** A message's words: its `shortText`, or the `txt` in it, else its `text` attribute. */
function wordsOf(msg: unknown): string {
  const shortText = child(msg, 'shortText');
  const own = text(shortText);
  if (own !== undefined) return own;
  const txt = listOf(child(shortText, 'txt'))
    .map((member) => text(member))
    .filter((words) => words !== undefined);
  if (txt.length > 0) return txt.join(',');
  return attributeOf(msg, 'text') ?? 'Unknown message';
}

/**
 * Every message a results document carries.
 *
 * The shape is the checklist the single-object `/activation` answers —
 * `chkl:messages` with `msg` children — read at any depth, so a document this
 * reading does not recognise by its root still has its messages read, and
 * keeps the object each message is about when the document names one. A
 * results document with no messages is not an error: a run that activated
 * everything says nothing. `type` comes back as stated; the caller decides
 * what `E` means.
 */
export function activationMessagesOf(value: unknown): ActivationMessage[] {
  for (const document of documentsOf(value)) {
    const messages = membersNamed(document, 'msg').map(({ node: msg }) => {
      const objectName =
        attributeOf(msg, 'objName') ?? attributeOf(msg, 'adtcore:name');
      return {
        type: attributeOf(msg, 'type') ?? 'info',
        text: wordsOf(msg),
        ...(objectName !== undefined ? { objectName } : {}),
      };
    });
    if (messages.length > 0) return messages;
  }
  return [];
}

/**
 * `activationExecuted` of a results document's `chkl:properties`: SAP's own
 * statement whether the activation ran (`"false"` for a run SAP cancelled,
 * "Activation was cancelled.", or one with nothing to activate). `undefined`
 * where the document states none. Read from the parse, else from the
 * document kept as text, parsed — never from a message's words.
 */
export function activationExecutedOf(value: unknown): boolean | undefined {
  for (const document of documentsOf(value)) {
    for (const { node } of membersNamed(document, 'chkl:properties')) {
      const stated = attributeOf(node, 'activationExecuted');
      if (stated === 'true' || stated === 'false') return stated === 'true';
    }
  }
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

/** SAP's message-type letters of error severity: error, abort, exit. */
const ERROR_LETTERS: ReadonlySet<string> = new Set(['E', 'A', 'X']);

/** An error-severity message, by SAP's own letters. */
export function isRefusal(message: ActivationMessage): boolean {
  return (
    ERROR_LETTERS.has(asciiUpper(message.type)) ||
    asciiLower(message.type) === 'error'
  );
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
 *
 * **One read more, after a silent results checklist alone**
 * (`activationExecuted="false"`, no message): `getInactiveObjects`, judged by
 * `stillInactiveAmong(named, …)` with `named` the uris of the references the
 * run was started with — the run's references still listed are its
 * `stillInactive`, none is nothing to activate. A read that fails, or answers
 * no list, is the outcome's `failure` at step `inactiveObjects`: the outcome
 * could not be decided. Every other results document is read as it came.
 */
export async function awaitActivationRun(
  utils: ActivationRunSource,
  runId: string,
  analyse: unknown,
  named: readonly string[],
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
  const messages = activationMessagesOf(value);
  const outcome: ActivationRunOutcome = {
    runId,
    status,
    messages,
    ...(executed === undefined ? {} : { executed }),
    results: readingOf(value).raw || undefined,
  };
  if (executed !== false || messages.length > 0) return outcome;

  // The silent checklist: it answered an activation that had nothing to do
  // and one that left objects inactive (S/4HANA 2025), so the inactive list
  // is read once, and the run's references still on it decide
  // (fr0ster/mcp-abap-adt#351, Q8). The judgement is adt-strategies' own,
  // the one analyseActivation makes on the synchronous paths.
  const listed = await utils.getInactiveObjects({ analyse });
  if (!listed.ok) {
    const error = listed.getError();
    return {
      ...outcome,
      failure: withStep(
        {
          ...error,
          message: `${UNDECIDED} reading the inactive objects failed: ${error.message}`,
        },
        INACTIVE_OBJECTS,
      ),
    };
  }
  const still = stillInactiveAmong(named, listed.getResult().value);
  if (still === null) {
    return {
      ...outcome,
      failure: withStep(
        {
          origin: 'refusal',
          message: `${UNDECIDED} the inactive list SAP answered is no list of inactive objects.`,
        },
        INACTIVE_OBJECTS,
      ),
    };
  }
  return { ...outcome, stillInactive: still };
}
