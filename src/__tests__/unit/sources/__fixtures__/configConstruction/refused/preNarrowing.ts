// Refused (pre-narrowing): a literal whose contextual type is the whole union.
import type { SapConfig } from '@mcp-abap-adt/connection';

export const config: SapConfig = {
  url: 'https://system.example.test',
  authType: 'basic',
};
