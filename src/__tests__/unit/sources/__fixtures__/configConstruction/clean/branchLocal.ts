// Clean: each shape built as a literal of its own shape, inside the branch
// that narrowed the wire; a base spread into each.
import type {
  SapConfig,
  SapHttpConfig,
  SapRfcConfig,
} from '@mcp-abap-adt/connection';
import type { ISapConfigBase } from '@mcp-abap-adt/interfaces-auth-sap';

function rfcOf(base: ISapConfigBase): SapRfcConfig {
  return {
    ...base,
    connectionType: 'rfc',
    client: '100',
    language: 'EN',
    ashost: 'host.example.test',
    sysnr: '00',
  };
}

function httpOf(base: ISapConfigBase): SapHttpConfig {
  return { ...base, url: 'https://system.example.test', connectionType: 'http' };
}

export function build(base: ISapConfigBase, wire: 'http' | 'rfc'): SapConfig {
  return wire === 'rfc' ? rfcOf(base) : httpOf(base);
}

export function narrowed(settings: SapConfig) {
  if (settings.connectionType === 'rfc') return { config: settings };
  return { config: settings };
}
