/**
 * The package files the module-mock suites replace names on: the modules
 * that define them, reached by their path inside each package's `dist`
 * (each package index re-exports them by getter, so the replacement goes on
 * the defining module). A change of a package's layout is fixed here alone.
 *
 * Each is the module object itself (`export * as` hands an `__esModule`
 * module on as it is), so a `mock.method` / `mock.property` on it is seen
 * by every caller that reads the name through the package index.
 */
export * as authBroker from '@mcp-abap-adt/auth-broker/dist/AuthBroker';
export * as authProviderBrowsers from '@mcp-abap-adt/auth-providers/dist/authorization/presentation/browsers';
export * as basicAuthProvider from '@mcp-abap-adt/auth-providers/dist/credentials/BasicAuthProvider';
export * as certificateAuthProvider from '@mcp-abap-adt/auth-providers/dist/credentials/CertificateAuthProvider';
export * as samlAuthProvider from '@mcp-abap-adt/auth-providers/dist/credentials/SamlAuthProvider';
export * as tokenAuthProvider from '@mcp-abap-adt/auth-providers/dist/credentials/TokenAuthProvider';
export * as connectionCreate from '@mcp-abap-adt/connection/dist/connection/createConnection.js';

/**
 * The same files by specifier, for a scenario process run through tsx:
 * there an `import * as` of a compiled package file is an ESM namespace
 * whose members cannot be redefined, so the scenario takes the module object
 * with `require(PACKAGE_FILES.…)`, typed by the export above.
 */
export const PACKAGE_FILES = {
  authBroker: '@mcp-abap-adt/auth-broker/dist/AuthBroker',
  authProviderBrowsers:
    '@mcp-abap-adt/auth-providers/dist/authorization/presentation/browsers',
} as const;
