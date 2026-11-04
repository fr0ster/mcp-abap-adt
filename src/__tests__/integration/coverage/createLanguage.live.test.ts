/**
 * #348, live (plan D2, step 6c): a created object's original language is
 * the one given. SAP takes it from the request's logon language and ignores
 * the create body's (measured on ABAP cloud), so a create given
 * `master_language` sends it as `sap-language` too (adt-clients 43).
 *
 * The language must be one the system offers for logon. Measured on
 * premise: `RU` is taken, and an object created with it reads back `RU`;
 * `DE` and `ES` fall back to `EN` over HTTP without a refusal. So the cloud
 * case creates in `DE`, the on-premise case in `RU`.
 *
 * A class is created with that `master_language` (its name read free first,
 * recorded for cleanup before its create), its metadata read back — that
 * original language — then deleted and read absent. Every step is a
 * `livePrepare`: `CreateClass` stands for its key in the class family's
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

/** The suite of `system`: a class created in `language`, read back, deleted. */
function languageSuite(system: 'onprem' | 'cloud', language: string): void {
  liveSuite([system], `a create states its language (#348), ${system}`, () => {
    const name = `ZCL_MCP_LANG_${randomBytes(3).toString('hex').toUpperCase()}`;
    const recorded: string[] = [];

    afterAll(async () => {
      await deleteRecorded();
      for (const each of recorded) {
        await expectAbsent({ tool: 'GetClass', args: { class_name: each } });
      }
    });

    it(`creates a class in ${language} given master_language ${language}`, async () => {
      // `$TMP` on premise; the configured package on the cloud, which has none.
      const packageName = system === 'onprem' ? '$TMP' : resolvePackageName();
      const request =
        system === 'onprem' ? undefined : resolveTransportRequest();
      const onRequest =
        request === undefined || request === ''
          ? {}
          : { transport_request: request };
      await expectNameFree({ tool: 'GetClass', args: { class_name: name } });
      recordCreated('DeleteClass', { class_name: name, ...onRequest });
      recorded.push(name);
      succeeded(
        `CreateClass ${name}`,
        await livePrepare('CreateClass', {
          class_name: name,
          package_name: packageName,
          description: 'MCP create language',
          master_language: language,
          ...onRequest,
        }),
      );
      const metadata = succeeded(
        `HandlerGet metadata ${name}`,
        await livePrepare('HandlerGet', {
          object_type: 'CLASS',
          class_name: name,
          part: 'metadata',
        }),
      );
      expect(masterLanguageOf(metadataOf(metadata))).toBe(language);
    });
  });
}

languageSuite('cloud', 'DE');
languageSuite('onprem', 'RU');
