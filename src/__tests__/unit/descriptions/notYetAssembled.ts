/**
 * The tools whose description is not yet assembled from its parts (plan
 * step 10.7) — every tool a set serves and every tool a handler defines (the
 * low-level tools too): each group of the migration removes its tools from this list,
 * and the list is gone once the last group lands. A tool listed here is
 * refused once it is assembled, so the list only shrinks.
 */
export const NOT_YET_ASSEMBLED: ReadonlySet<string> = new Set([
  'HandlerAbapGit',
  'HandlerAbapGitGet',
  'HandlerActivate',
  'HandlerCheckRun',
  'HandlerDebugBreakpoints',
  'HandlerDebugMaintain',
  'HandlerDebugSession',
  'HandlerDebugStep',
  'HandlerDeletionCheck',
  'HandlerGet',
  'HandlerSystem',
  'HandlerValidate',
]);

/**
 * How many tools `NOT_YET_ASSEMBLED` may list at most: the list only
 * shrinks — a group of step 10.7 that moves tools lowers this number with
 * them, and a list longer than it fails (`assembledDescriptions.test.ts`).
 */
export const NOT_YET_ASSEMBLED_MOST = 12;

/**
 * The tools written by the listing writers (plan steps 9.3–9.7): their
 * Returns is generated from their schemas and tied to their goldens
 * (`returnsMatch.test.ts`) once assembled — group (2) of the migration.
 */
export const WRITER_TOOLS: readonly string[] = [
  'GetPackageContents',
  'GetPackageTree',
  'GetObjectsList',
  'GetObjectsByType',
  'ListFunctionModules',
  'ListFunctionGroupIncludes',
  'GetIncludesList',
  'GetStructuresList',
  'GetEnhancements',
  'SearchSource',
  'SearchObject',
  'DescribeByList',
  'GetWhereUsed',
  'GetMainPrograms',
  'GetAdtTypes',
  'GetTransport',
  'ReadTransportObjects',
  'ListTransports',
  'ReadTransportActionLog',
  'RuntimeListFeeds',
  'RuntimeListSystemMessages',
  'RuntimeGetGatewayErrorLog',
  'RuntimeListProfilerTraceFiles',
  'GetATCFindings',
  'GetATCResult',
  'GetInactiveObjects',
  'GetObjectVersions',
  'GetObjectOutline',
  'GetObjectStructure',
  'GetTransaction',
  'GetPackage',
  'ListAbapGitRepos',
  'CheckAbapGitExternalRepo',
  'GetAbapGitBranchInfo',
  'GetAbapGitModifiedObjects',
  'GetAbapGitStaging',
  'GetAbapGitErrorLog',
];
