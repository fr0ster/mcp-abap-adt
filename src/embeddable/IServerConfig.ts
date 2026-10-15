/**
 * The shared server configuration, re-exported from lib/config. The
 * transport, HTTP, SSE and destination fields are each in the package that
 * reads them.
 */

export type {
  HandlerSet,
  IServerConfig,
} from '../lib/config/IServerConfig.js';
