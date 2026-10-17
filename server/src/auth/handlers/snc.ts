import { SettingsError } from '@mcp-abap-adt/lib/auth';
import type { AuthenticationHandler } from './types.js';

export const sncHandler: AuthenticationHandler = {
  authType: 'snc',
  brokerOptions: () => ({}),
  checkSettings(settings) {
    if (settings.connectionType !== 'rfc') {
      throw new SettingsError(
        'connection-type',
        "SNC logs on over RFC; set connection-type to 'rfc'.",
      );
    }
  },
};
