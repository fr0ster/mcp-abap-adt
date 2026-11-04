/**
 * #348, live (plan D2, step 6c): a created object's original language is
 * the one given. SAP takes it from the request's logon language and ignores
 * the create body's (measured on ABAP cloud), so a create given
 * `master_language` sends it as `sap-language` too (adt-clients 43).
 *
 * The cloud system only: the on-premise test system does not offer `DE` or `ES`
 * for logon, so a create sent with `DE` is created in `EN` there (measured).
 *
 * A class is created with `master_language: 'DE'` (its name read free
 * first, recorded for cleanup before its create), its metadata read back —
 * the original language `DE` — then deleted and read absent. Every step is
 * a `livePrepare`: `CreateClass` stands for its key in the class family's
 * live file (C3–C16), where the ledger names it on both systems.
 */
import { randomBytes } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import {
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';

const NAME = `ZCL_MCP_LANG_${randomBytes(3).toString('hex').toUpperCase()}`;

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** The metadata document a `part: 'metadata'` read answers (its `metadata`). */
function metadataOf(answer: LiveAnswer): string {
  const payload: unknown = JSON.parse(answer.text);
  const document =
    typeof payload === 'object' && payload !== null
      ? Reflect.get(payload, 'metadata')
      : undefined;
  if (typeof document !== 'string') {
    throw new Error(`the metadata read answered no document: ${answer.text}`);
  }
  return document;
}

/** The root element's `adtcore:masterLanguage` in a metadata document. */
function masterLanguageOf(document: string): unknown {
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
  }).parse(document);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const root = Object.entries(parsed).find(([name]) => !name.startsWith('?'));
  const element = root?.[1];
  if (typeof element !== 'object' || element === null) return undefined;
  return Reflect.get(element, '@adtcore:masterLanguage');
}

liveSuite(['cloud'], 'a create states its language (#348)', () => {
  const recorded: string[] = [];

  afterAll(async () => {
    await deleteRecorded();
    for (const name of recorded) {
      await expectAbsent({ tool: 'GetClass', args: { class_name: name } });
    }
  });

  it('creates a class in DE given master_language DE', async () => {
    const request = resolveTransportRequest();
    const onRequest =
      request === undefined || request === ''
        ? {}
        : { transport_request: request };
    await expectNameFree({ tool: 'GetClass', args: { class_name: NAME } });
    recordCreated('DeleteClass', { class_name: NAME, ...onRequest });
    recorded.push(NAME);
    succeeded(
      `CreateClass ${NAME}`,
      await livePrepare('CreateClass', {
        class_name: NAME,
        package_name: resolvePackageName(),
        description: 'MCP create language',
        master_language: 'DE',
        ...onRequest,
      }),
    );
    const metadata = succeeded(
      `HandlerGet metadata ${NAME}`,
      await livePrepare('HandlerGet', {
        object_type: 'CLASS',
        class_name: NAME,
        part: 'metadata',
      }),
    );
    expect(masterLanguageOf(metadataOf(metadata))).toBe('DE');
  });
});
