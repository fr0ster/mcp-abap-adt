/**
 * What the abapGit pins (`unit/pins/abapGit.pins.test.ts`) run against: the
 * ADT stand-in behind the in-process server (`stand: 'server'`), every
 * request it receives answered by the one matcher it fits (`matched`).
 *
 * The abapGit tools are dispatched by the server alone (its admission), so a
 * pin calls them through `pinServer`. A case's `before` step
 * (`ListAbapGitRepos`) logs the server's connection on and reads the
 * discovery, so the case's window holds the admission's R1 and the tool's
 * own requests. The server's logon, the discovery that says abapGit is
 * served, R1 (the documents of `abapGitSap.ts`) and the logoff at close are
 * the matchers every case shares; the tool's requests are the case's own.
 */

import { after, before, beforeEach } from 'node:test';
import { notifyConnectionResetListeners } from '../../lib/connectionEvents';
import {
  externalRepo,
  modifiedObjects,
  noObjects,
  objectResults,
  reposDocument,
  staging,
} from './abapGitSap';
import type { StandInResponse } from './adtStandIn';
import type { MatchedRequest } from './pinCases';

/** A discovery listing the abapGit repositories collection: abapGit is served. */
const SERVED_DISCOVERY =
  '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>' +
  '<app:collection href="/sap/bc/adt/abapgit/repos"/>' +
  '</app:workspace></app:service>';

const xml = (text: string): StandInResponse => ({
  status: 200,
  headers: { 'content-type': 'application/xml' },
  text,
});

/** SAP's answers a case names. */
export const ANSWERS = {
  repos: xml(reposDocument),
  noObjects: xml(noObjects),
  objectResults: xml(objectResults),
  accepted: { status: 202, text: '' },
  staging: xml(staging),
  modifiedObjects: xml(modifiedObjects),
  externalRepo: xml(externalRepo()),
  branchInfo: xml(externalRepo({ folderLogic: true })),
  file: {
    status: 200,
    headers: { 'content-type': 'text/plain' },
    text: 'CLASS zcl_demo DEFINITION.',
  },
} as const satisfies Readonly<Record<string, StandInResponse>>;

export type AnswerName = keyof typeof ANSWERS;

/** One request of the tool's own: method, path, and SAP's answer (the stand-in's own when absent). */
export type ToolRequest = readonly [string, string, AnswerName?];

/**
 * The matchers of one case on `variant`: the server's logon (the cloud's
 * opens with the sessions read) and logoff, the discovery, R1 read `r1`
 * times (the `before` step's read included), and the tool's own requests,
 * each sent once.
 */
export function sap(
  variant: 'onprem' | 'cloud',
  r1: number,
  own: readonly ToolRequest[] = [],
): MatchedRequest[] {
  return [
    ...(variant === 'cloud'
      ? [{ method: 'GET', path: '/sap/bc/adt/core/http/sessions' }]
      : []),
    { method: 'GET', path: '/sap/bc/adt/core/discovery' },
    { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
    {
      method: 'GET',
      path: '/sap/bc/adt/discovery',
      answer: xml(SERVED_DISCOVERY),
    },
    {
      method: 'GET',
      path: '/sap/bc/adt/abapgit/repos',
      times: r1,
      answer: ANSWERS.repos,
    },
    ...own.map(([method, path, answer]): MatchedRequest => {
      const given = answer === undefined ? undefined : ANSWERS[answer];
      return given === undefined
        ? { method, path }
        : { method, path, answer: given };
    }),
    { method: 'GET', path: '/sap/public/bc/icf/logoff' },
  ];
}

/** The step that logs the server on and reads the discovery before the case's window. */
export const LOGGED_ON = [{ tool: 'ListAbapGitRepos', args: {} }] as const;

/**
 * The enclosing describe's cases run with `SAP_SYSTEM_TYPE` stated as
 * `variant` (the server builds its connection from settings), and each with
 * the discovery cache dropped first, so every case reads its discovery.
 */
export function abapGitPinsOn(variant: 'onprem' | 'cloud'): void {
  let previous: string | undefined;
  before(() => {
    previous = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = variant;
  });
  beforeEach(() => {
    notifyConnectionResetListeners();
  });
  after(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });
}
