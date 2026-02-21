export type CompactAction =
  | 'run'
  | 'status'
  | 'result'
  | 'validate'
  | 'list_types'
  | 'create_transport'
  | 'runProfiling'
  | 'viewProfile'
  | 'viewProfiles'
  | 'viewDump'
  | 'viewDumps';

export const COMPACT_ACTIONS: CompactAction[] = [
  'run',
  'status',
  'result',
  'validate',
  'list_types',
  'create_transport',
  'runProfiling',
  'viewProfile',
  'viewProfiles',
  'viewDump',
  'viewDumps',
];
