export type CompactAction =
  | 'run'
  | 'status'
  | 'result'
  | 'validate'
  | 'list_types'
  | 'create_transport';

export const COMPACT_ACTIONS: CompactAction[] = [
  'run',
  'status',
  'result',
  'validate',
  'list_types',
  'create_transport',
];
