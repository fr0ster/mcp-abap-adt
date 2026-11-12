/**
 * The tool names of the compact read-only half and of the compact data tool
 * (`compactReadOnlyEntries()` and `compactDataEntries()` of
 * `@mcp-abap-adt/compact-readonly-entries`), which lib does not import: a
 * constant, pinned by a test against those two builders, so a new read tool
 * fails the test until it is listed here (the owner's decision).
 */
export const COMPACT_READ_ONLY_TOOL_NAMES: readonly string[] = [
  'HandlerGet',
  'HandlerSearch',
  'HandlerWhereUsed',
  'HandlerValidate',
  'HandlerCheckRun',
  'HandlerDeletionCheck',
  'HandlerUnitTestStatus',
  'HandlerUnitTestResult',
  'HandlerCdsUnitTestStatus',
  'HandlerCdsUnitTestResult',
  'HandlerProfileList',
  'HandlerProfileView',
  'HandlerDumpList',
  'HandlerDumpView',
  'HandlerServiceBindingListTypes',
  'HandlerServiceBindingValidate',
  'HandlerGetData',
];
