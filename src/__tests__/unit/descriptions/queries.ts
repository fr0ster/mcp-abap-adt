/**
 * The labelled queries tool retrieval is measured with: what a user asks,
 * which roles ask it, and the tools that must be found — one group per step,
 * any tool of a group answering it.
 *
 * The cases of #270 and #271 are quoted as the consumer reported them; the
 * rest are realistic requests of the same kind, of a reader (read-only
 * tools) and of a developer (every tool).
 */

/** A reader searches the read tools only; a developer every tool. */
export type Role = 'reader' | 'developer';

export interface Query {
  readonly query: string;
  readonly roles: readonly Role[];
  /** One group per step of the request; any tool of a group answers it. */
  readonly required: ReadonlyArray<readonly string[]>;
  /** Where the query comes from. */
  readonly source: '#270' | '#271' | 'own' | 'heldout';
}

const BOTH: readonly Role[] = ['reader', 'developer'];
const DEVELOPER: readonly Role[] = ['developer'];

export const QUERIES: readonly Query[] = [
  // #270 and #271, as reported.
  {
    query: 'Read the CDS view ZI_SALESORDER',
    roles: BOTH,
    required: [['GetDdl']],
    source: '#270',
  },
  {
    query: 'Where is function module BAPI_USER_GET_DETAIL used?',
    roles: BOTH,
    required: [['GetWhereUsed']],
    source: '#271',
  },
  {
    query: 'Why did program ZREP_DEMO crash yesterday? Show me the dump',
    roles: BOTH,
    required: [['RuntimeListFeeds']],
    source: '#271',
  },
  {
    query: 'Remove class ZCL_DEMO from transport DEVK900001',
    roles: DEVELOPER,
    required: [['RemoveTransportObject']],
    source: '#271',
  },
  {
    query: 'Read class ZCL_DEMO, add a method to it and activate the class',
    roles: DEVELOPER,
    required: [
      ['GetClass'],
      ['UpdateClass'],
      ['ActivateClass', 'ActivateObjects'],
    ],
    source: '#271',
  },
  {
    query: 'Create class ZCL_DEMO_TEST and add it to transport DEVK900001',
    roles: DEVELOPER,
    required: [['CreateClass'], ['AddTransportObject']],
    source: '#271',
  },
  // A reader's requests.
  {
    query: 'Show me the source code of class ZCL_DEMO',
    roles: BOTH,
    required: [['GetClass']],
    source: 'own',
  },
  {
    query: 'What are the parameters of BAPI_USER_GET_DETAIL?',
    roles: BOTH,
    required: [['GetFunctionModule']],
    source: 'own',
  },
  {
    query: 'Read the behavior definition of ZI_TRAVEL',
    roles: BOTH,
    required: [['GetBehaviorDefinition']],
    source: 'own',
  },
  {
    query: 'Show the first 10 rows of table ZTAB_ORDERS',
    roles: BOTH,
    required: [['GetTableContents', 'GetSqlQuery']],
    source: 'own',
  },
  {
    query: 'Select the open orders from ZTAB_ORDERS where status is O',
    roles: BOTH,
    required: [['GetSqlQuery']],
    source: 'own',
  },
  {
    query: 'List the objects in package ZDEMO',
    roles: BOTH,
    required: [['GetPackageContents', 'GetPackageTree', 'GetObjectsList']],
    source: 'own',
  },
  {
    query: 'Which objects does transport request DEVK900001 contain?',
    roles: BOTH,
    required: [['ReadTransportObjects', 'GetTransport']],
    source: 'own',
  },
  {
    query: 'List my open transport requests',
    roles: BOTH,
    required: [['ListTransports']],
    source: 'own',
  },
  {
    query: 'Find all classes whose name starts with ZCL_SALES',
    roles: BOTH,
    required: [['SearchObject']],
    source: 'own',
  },
  {
    query: 'Search the source code of package ZDEMO for SELECT FROM mara',
    roles: BOTH,
    required: [['SearchSource']],
    source: 'own',
  },
  {
    query: 'Show the short dumps of today',
    roles: BOTH,
    required: [['RuntimeListFeeds']],
    source: 'own',
  },
  {
    query: 'Open the runtime error dump with this id and show its details',
    roles: BOTH,
    required: [['RuntimeGetDumpById']],
    source: 'own',
  },
  {
    query: 'Run class ZCL_DEMO_RUN and show its console output',
    roles: DEVELOPER,
    required: [['RuntimeRunClass']],
    source: 'own',
  },
  {
    query: 'Execute report ZREP_DEMO',
    roles: DEVELOPER,
    required: [['RuntimeRunProgram']],
    source: 'own',
  },
  {
    query: 'Which domain does data element ZDE_STATUS use?',
    roles: BOTH,
    required: [['GetDataElement', 'GetTypeInfo']],
    source: 'own',
  },
  {
    query: 'Show the fixed values of domain ZDO_STATUS',
    roles: BOTH,
    required: [['GetDomain', 'GetTypeInfo']],
    source: 'own',
  },
  {
    query: 'Which program does transaction ZTX01 start?',
    roles: BOTH,
    required: [['GetTransaction']],
    source: 'own',
  },
  {
    query: 'Show the version history of class ZCL_DEMO',
    roles: BOTH,
    required: [['GetClassVersions', 'GetObjectVersions']],
    source: 'own',
  },
  {
    query:
      'Compare the current version of program ZREP_DEMO with the previous one',
    roles: BOTH,
    required: [['GetProgramVersionDiff', 'GetObjectVersionDiff']],
    source: 'own',
  },
  {
    query: 'Which of my objects are still inactive?',
    roles: BOTH,
    required: [['GetInactiveObjects']],
    source: 'own',
  },
  {
    query: 'Show the messages of message class ZMSG_DEMO',
    roles: BOTH,
    required: [['GetMessageClass']],
    source: 'own',
  },
  {
    query: 'Read the include ZREP_DEMO_TOP',
    roles: BOTH,
    required: [['GetInclude']],
    source: 'own',
  },
  {
    query: 'List the function modules of function group ZFG_DEMO',
    roles: BOTH,
    required: [['ListFunctionModules']],
    source: 'own',
  },
  {
    query: 'Give me the preview URL of service binding ZUI_TRAVEL_O4',
    roles: BOTH,
    required: [['GetServiceBindingPreviewUrl']],
    source: 'own',
  },
  {
    query: 'Show the UI annotations of the metadata extension ZC_TRAVEL',
    roles: BOTH,
    required: [['GetMetadataExtension']],
    source: 'own',
  },
  {
    query: 'Read the service definition ZUI_TRAVEL',
    roles: BOTH,
    required: [['GetServiceDefinition']],
    source: 'own',
  },
  {
    query: 'Which enhancements are implemented in program ZREP_DEMO?',
    roles: BOTH,
    required: [['GetEnhancements']],
    source: 'own',
  },
  {
    query: 'Show the SAP Gateway error log of the OData service',
    roles: BOTH,
    required: [['RuntimeGetGatewayErrorLog', 'RuntimeListFeeds']],
    source: 'own',
  },
  {
    query: 'Show the fields of table ZTAB_ORDERS',
    roles: BOTH,
    required: [['GetTable', 'GetTypeInfo']],
    source: 'own',
  },
  {
    query: 'Who calls method GET_DATA of class ZCL_DEMO?',
    roles: BOTH,
    required: [['GetWhereUsed']],
    source: 'own',
  },
  {
    query: 'Show the profiler trace of my last run and the slowest statements',
    roles: BOTH,
    required: [['RuntimeAnalyzeProfilerTrace', 'RuntimeGetProfilerTraceData']],
    source: 'own',
  },
  // A developer's requests.
  {
    query: 'Create a CDS view ZI_DEMO over table ZTAB_ORDERS',
    roles: DEVELOPER,
    required: [['CreateDdl']],
    source: 'own',
  },
  {
    query: 'Change the source of the CDS view ZI_SALESORDER',
    roles: DEVELOPER,
    required: [['UpdateDdl']],
    source: 'own',
  },
  {
    query: 'Delete program ZREP_OLD',
    roles: DEVELOPER,
    required: [['DeleteProgram']],
    source: 'own',
  },
  {
    query: 'Run the unit tests of class ZCL_DEMO',
    roles: DEVELOPER,
    required: [['RunUnitTest']],
    source: 'own',
  },
  {
    query: 'Write ABAP Unit tests for class ZCL_DEMO',
    roles: DEVELOPER,
    required: [['CreateUnitTest', 'UpdateUnitTest', 'UpdateLocalTestClass']],
    source: 'own',
  },
  {
    query: 'Run the ATC checks on package ZDEMO and show the findings',
    roles: DEVELOPER,
    required: [['RunATC'], ['GetATCFindings']],
    source: 'own',
  },
  {
    query: 'Check the syntax of class ZCL_DEMO',
    roles: DEVELOPER,
    required: [['CheckClass']],
    source: 'own',
  },
  {
    query: 'Create a new transport request for my changes',
    roles: DEVELOPER,
    required: [['CreateTransport']],
    source: 'own',
  },
  {
    query: 'Set a breakpoint in class ZCL_DEMO and debug it',
    roles: DEVELOPER,
    required: [['DebugSetBreakpoints', 'DebugStartListener']],
    source: 'own',
  },
  {
    query: 'Create a table ZTAB_LOG with the fields id and text',
    roles: DEVELOPER,
    required: [['CreateTable']],
    source: 'own',
  },
  {
    query: 'Publish the OData service binding ZUI_TRAVEL_O4',
    roles: DEVELOPER,
    required: [['UpdateServiceBinding']],
    source: 'own',
  },
  {
    query: 'Activate all my inactive objects',
    roles: DEVELOPER,
    required: [['GetInactiveObjects'], ['ActivateObjects']],
    source: 'own',
  },
  {
    query: 'Add message 001 with a text to message class ZMSG_DEMO',
    roles: DEVELOPER,
    required: [['CreateMessageClassMessage']],
    source: 'own',
  },
  {
    query: 'Create a behavior definition for the RAP business object ZI_TRAVEL',
    roles: DEVELOPER,
    required: [['CreateBehaviorDefinition']],
    source: 'own',
  },
  {
    query: 'Move the objects of one transport task to another task',
    roles: DEVELOPER,
    required: [['MoveTransportObjects']],
    source: 'own',
  },
  {
    query: 'Fix the bug in report ZREP_DEMO and activate it',
    roles: DEVELOPER,
    required: [
      ['GetProgram'],
      ['UpdateProgram'],
      ['ActivateProgram', 'ActivateObjects'],
    ],
    source: 'own',
  },
  {
    query: 'Create function module Z_DEMO_FM in function group ZFG_DEMO',
    roles: DEVELOPER,
    required: [['CreateFunctionModule']],
    source: 'own',
  },
];
