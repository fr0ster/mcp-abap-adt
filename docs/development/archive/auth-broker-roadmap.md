# Auth Broker Roadmap

**Status:** ✅ Completed  
**Priority:** High  
**Created:** 2025-01-27  
**Last Updated:** 2025-11-30

**Note:** This roadmap has been completed. The `@mcp-abap-adt/auth-broker` package is now published and integrated into `mcp-abap-adt` server. See [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication) for usage details.

## Goal

Create a new package `@mcp-abap-adt/auth-broker` that handles JWT authentication based on HTTP headers (`x-sap-auth-type: jwt` and `x-mcp-destination`). The package will manage token retrieval, validation, and automatic refresh using service keys when needed.

## Requirements

### Core Functionality

1. **Header-based Authentication Detection**
   - Detect `x-sap-auth-type: jwt` header
   - Extract destination name from `x-mcp-destination` header (e.g., "TRIAL")
   - Only process when both headers are present

2. **Environment File Lookup**
   - Search for `{destination}.env` file (e.g., `TRIAL.env`) in a configurable directory
   - Extract JWT token from the `.env` file
   - Use token for authentication if file is found

3. **Token Validation**
   - Test connection using the token from `.env` file
   - Detect expired tokens (401/403 errors that indicate auth failure, not permission issues)

4. **Service Key Fallback**
   - If `.env` file is not found OR token is expired:
     - Search for `{destination}.json` file (e.g., `TRIAL.json`) containing service key
     - Use `@mcp-abap-adt/connection` utilities to refresh/obtain new token
     - Save new token to `.env` file for future use

5. **Token Management**
   - Cache tokens per destination
   - Provide `getToken(destination)` method
   - Provide `refreshToken(destination)` method
   - Handle token storage and retrieval

## Architecture

### Package Structure

```
mcp-abap-adt-auth-broker/
├── src/
│   ├── AuthBroker.ts          # Main class with getToken/refreshToken methods
│   ├── envLoader.ts            # Load .env files by destination name
│   ├── serviceKeyLoader.ts     # Load service key JSON files
│   ├── tokenValidator.ts       # Validate token by testing connection
│   ├── tokenRefresher.ts       # Refresh token using service key
│   └── index.ts                # Package exports
├── package.json
├── tsconfig.json
└── README.md
```

### Dependencies

- `@mcp-abap-adt/connection` - For token refresh utilities (`refreshJwtToken`)
- `axios` - For connection testing
- `dotenv` - For parsing `.env` files
- `fs` / `path` - For file system operations

## Implementation Steps

### Phase 1: Repository Setup

1. **Create new repository**
   - [ ] Create directory `/home/okyslytsia/prj/mcp-abap-adt-auth-broker`
   - [ ] Initialize npm package with name `@mcp-abap-adt/auth-broker`
   - [ ] Set up TypeScript configuration
   - [ ] Create basic package structure

2. **Package Configuration**
   - [ ] Configure `package.json` with proper name, version, and dependencies
   - [ ] Set up TypeScript build configuration
   - [ ] Configure exports in `package.json` (main, types, files)
   - [ ] Add build scripts

### Phase 2: Core Components

3. **Environment File Loader**
   - [ ] Create `envLoader.ts` module
   - [ ] Implement `loadEnvFile(destination: string, basePath?: string): Promise<EnvConfig | null>`
   - [ ] Search for `{destination}.env` in configurable directory
   - [ ] Parse `.env` file and extract:
     - `SAP_JWT_TOKEN`
     - `SAP_REFRESH_TOKEN` (optional)
     - `SAP_URL`
     - `SAP_CLIENT` (optional)
     - `SAP_UAA_URL` (optional, for refresh)
     - `SAP_UAA_CLIENT_ID` (optional, for refresh)
     - `SAP_UAA_CLIENT_SECRET` (optional, for refresh)
   - [ ] Return structured config object or null if not found

4. **Service Key Loader**
   - [ ] Create `serviceKeyLoader.ts` module
   - [ ] Implement `loadServiceKey(destination: string, basePath?: string): Promise<ServiceKey | null>`
   - [ ] Search for `{destination}.json` file
   - [ ] Parse JSON and validate structure (must have `uaa` object with `url`, `clientid`, `clientsecret`)
   - [ ] Extract ABAP URL from service key (`url`, `abap.url`, or `sap_url`)
   - [ ] Return structured service key object or null if not found

5. **Token Validator**
   - [ ] Create `tokenValidator.ts` module
   - [ ] Implement `validateToken(token: string, sapUrl: string): Promise<boolean>`
   - [ ] Make test request to SAP system (e.g., `/sap/bc/adt/core/discovery`)
   - [ ] Handle 401/403 errors:
     - Distinguish between auth errors (token expired) and permission errors
     - Return `false` for expired tokens
     - Return `true` for valid tokens
   - [ ] Handle network errors appropriately

6. **Token Refresher**
   - [ ] Create `tokenRefresher.ts` module
   - [ ] Import `refreshJwtToken` from `@mcp-abap-adt/connection`
   - [ ] Implement `refreshTokenFromServiceKey(serviceKey: ServiceKey): Promise<TokenRefreshResult>`
   - [ ] Use service key to obtain initial token (if needed) or refresh existing token
   - [ ] Handle OAuth flow if refresh token is not available (may need to use browser flow or client credentials)
   - [ ] Return new access token and refresh token

### Phase 3: Main AuthBroker Class

7. **AuthBroker Class Implementation**
   - [ ] Create `AuthBroker.ts` class
   - [ ] Constructor accepts:
     - `basePath?: string` - Base directory for searching `.env` and `.json` files (default: current working directory or configurable)
   - [ ] Implement `getToken(destination: string): Promise<string>`
     - Check cache for existing valid token
     - Load `{destination}.env` file
     - Extract token from `.env`
     - Validate token by testing connection
     - If valid, cache and return token
     - If invalid or not found, call `refreshToken()`
   - [ ] Implement `refreshToken(destination: string): Promise<string>`
     - Load `{destination}.json` service key file
     - Use token refresher to obtain new token
     - Save new token to `{destination}.env` file
     - Cache new token
     - Return new token
   - [ ] Implement token caching (in-memory cache per destination)
   - [ ] Implement error handling and logging

8. **Token Storage**
   - [ ] Implement `saveTokenToEnv(destination: string, token: string, refreshToken?: string, config?: Partial<EnvConfig>): Promise<void>`
   - [ ] Update or create `{destination}.env` file
   - [ ] Preserve existing values that are not being updated
   - [ ] Write file atomically (write to temp file, then rename)

### Phase 4: NPM Publishing Setup

9. **Package.json Configuration**
   - [ ] Configure `package.json` for npm publishing:
     - [ ] Set `"name": "@mcp-abap-adt/auth-broker"`
     - [ ] Set initial version (e.g., `"0.1.0"`)
     - [ ] Add `"publishConfig": { "access": "public" }` for scoped package
     - [ ] Configure `"files"` array to include only necessary files:
       - `dist/` - compiled JavaScript and TypeScript definitions
       - `README.md` - package documentation
       - `LICENSE` - license file
     - [ ] Set `"main": "dist/index.js"` and `"types": "dist/index.d.ts"`
     - [ ] Add proper `"repository"` field with GitHub URL
     - [ ] Add `"keywords"` for npm searchability
     - [ ] Add `"homepage"` and `"bugs"` URLs
     - [ ] Configure `"engines"` (Node.js >= 18.0.0)
     - [ ] Add `"prepublishOnly"` script to build before publishing

10. **NPM Account Setup**
    - [ ] Verify npm account access to `@mcp-abap-adt` scope
    - [ ] If needed, create organization or request access to existing scope
    - [ ] Configure npm authentication:
      - [ ] Run `npm login` or configure `.npmrc` with auth token
      - [ ] Verify access: `npm whoami`
      - [ ] Test scope access: `npm access ls-packages @mcp-abap-adt`

11. **NPM Configuration Files**
    - [ ] Create `.npmrc` file (if needed) with:
      - [ ] `package-lock=true` - ensure lock file is generated
      - [ ] Other npm settings as needed (see existing packages for reference)
    - [ ] Add `.npmignore` file (if needed) to exclude:
      - [ ] `src/` - source files (only `dist/` should be published)
      - [ ] `node_modules/`
      - [ ] `*.test.ts`, `*.spec.ts` - test files
      - [ ] `tsconfig.json`, `jest.config.js` - build configs
      - [ ] `.git/`, `.github/` - version control files
      - [ ] Development files

12. **Build and Test Package Locally**
    - [ ] Run `npm run build` to ensure TypeScript compiles correctly
    - [ ] Run `npm pack` to create `.tgz` package locally
    - [ ] Verify package contents: `tar -tzf *.tgz | head -20`
    - [ ] Test package installation locally:
      ```bash
      npm pack
      npm install -g ./mcp-abap-adt-auth-broker-*.tgz
      ```
    - [ ] Verify package can be imported in test project
    - [ ] Clean up test installation

13. **GitHub Repository Setup** (if separate repo)
    - [ ] Create GitHub repository (if package is in separate repo)
    - [ ] Initialize git repository
    - [ ] Add `.gitignore` file
    - [ ] Create initial commit
    - [ ] Push to GitHub
    - [ ] Update `package.json` repository field with correct URL

14. **GitHub Actions for Publishing** (optional but recommended)
    - [ ] Create `.github/workflows/publish-npm.yml`:
      - [ ] Trigger on version tags (`v*.*.*`)
      - [ ] Setup Node.js
      - [ ] Install dependencies
      - [ ] Run tests
      - [ ] Build package
      - [ ] Publish to npm using `NPM_TOKEN` secret
    - [ ] Add `NPM_TOKEN` to GitHub repository secrets
    - [ ] Test workflow with dry-run or test publish

15. **First Publication**
    - [ ] Ensure all code is complete and tested
    - [ ] Update version in `package.json` (e.g., `0.1.0`)
    - [ ] Build package: `npm run build`
    - [ ] Verify package: `npm pack`
    - [ ] Publish to npm:
      ```bash
      npm publish --access public
      ```
    - [ ] Verify publication:
      - [ ] Check npm registry: `npm view @mcp-abap-adt/auth-broker`
      - [ ] Test installation: `npm install @mcp-abap-adt/auth-broker`
      - [ ] Verify package works in test project

16. **Version Management**
    - [ ] Document versioning strategy (semantic versioning)
    - [ ] Set up `CHANGELOG.md` for tracking changes
    - [ ] Document release process
    - [ ] Consider using `npm version` command for version bumps

### Phase 5: Integration with mcp-abap-adt

17. **Package Installation**
    - [ ] Add `@mcp-abap-adt/auth-broker` as dependency to `mcp-abap-adt/package.json`
    - [ ] Install package: `npm install @mcp-abap-adt/auth-broker`
    - [ ] Verify package is installed correctly

18. **Header Processing Integration**
    - [ ] Modify `applyAuthHeaders()` method in `mcp_abap_adt_server` class
    - [ ] Add detection for `x-mcp-destination` header
    - [ ] When `x-sap-auth-type: jwt` AND `x-mcp-destination` are present:
      - Create `AuthBroker` instance
      - Call `getToken(destination)` to obtain token
      - Use returned token instead of token from `x-sap-jwt-token` header
      - Update `processJwtConfigUpdate()` to use broker token

19. **Configuration**
    - [ ] Add configuration option for base path where `.env` and `.json` files are stored
    - [ ] Default to current working directory or a configurable directory (e.g., `~/.mcp-abap-adt/destinations/`)
    - [ ] Allow override via environment variable (e.g., `MCP_AUTH_BROKER_BASE_PATH`)

### Phase 6: Testing and Documentation

20. **Unit Tests**
    - [ ] Test `envLoader` with various `.env` file formats
    - [ ] Test `serviceKeyLoader` with valid and invalid service keys
    - [ ] Test `tokenValidator` with valid, expired, and invalid tokens
    - [ ] Test `tokenRefresher` with service keys
    - [ ] Test `AuthBroker.getToken()` flow
    - [ ] Test `AuthBroker.refreshToken()` flow
    - [ ] Test error handling scenarios

21. **Integration Tests**
    - [ ] Test full flow: header → destination → `.env` file → token validation → token refresh if needed
    - [ ] Test with real SAP system (if available)
    - [ ] Test token caching behavior
    - [ ] Test concurrent requests for same destination

22. **Documentation**
    - [ ] Write README.md for `auth-broker` package
    - [ ] Document API (AuthBroker class methods)
    - [ ] Document file structure requirements (`.env` and `.json` file formats)
    - [ ] Document configuration options
    - [ ] Add usage examples
    - [ ] Update `mcp-abap-adt` documentation to explain new header-based destination authentication

## File Structure Details

### Environment File Format (`{destination}.env`)

```env
SAP_URL=https://your-system.abap.us10.hana.ondemand.com
SAP_CLIENT=100
SAP_JWT_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
SAP_REFRESH_TOKEN=refresh_token_string
SAP_UAA_URL=https://your-account.authentication.us10.hana.ondemand.com
SAP_UAA_CLIENT_ID=client_id
SAP_UAA_CLIENT_SECRET=client_secret
```

### Service Key File Format (`{destination}.json`)

```json
{
  "url": "https://your-system.abap.us10.hana.ondemand.com",
  "uaa": {
    "url": "https://your-account.authentication.us10.hana.ondemand.com",
    "clientid": "your_client_id",
    "clientsecret": "your_client_secret"
  }
}
```

## API Design

### AuthBroker Class

```typescript
export class AuthBroker {
  constructor(basePath?: string);
  
  /**
   * Get authentication token for destination.
   * Tries to load from .env file, validates it, and refreshes if needed.
   */
  getToken(destination: string): Promise<string>;
  
  /**
   * Force refresh token for destination using service key.
   */
  refreshToken(destination: string): Promise<string>;
  
  /**
   * Clear cached token for destination.
   */
  clearCache(destination: string): void;
  
  /**
   * Clear all cached tokens.
   */
  clearAllCache(): void;
}
```

## Integration Points

### In mcp-abap-adt/src/index.ts

Modify `applyAuthHeaders()` method:

```typescript
// When x-sap-auth-type: jwt AND x-mcp-destination are present
if (isJwtAuth && destination) {
  const authBroker = new AuthBroker(configurableBasePath);
  const token = await authBroker.getToken(destination);
  // Use token instead of header token
  this.processJwtConfigUpdate(sapUrl, token, refreshToken, sessionId);
}
```

## Configuration

### Environment Variables

- `MCP_AUTH_BROKER_BASE_PATH` - Base directory for searching `.env` and `.json` files (default: current working directory)

### Default File Locations

1. Check `MCP_AUTH_BROKER_BASE_PATH` if set
2. Fallback to current working directory
3. Future: Support `~/.mcp-abap-adt/destinations/` as default

## Error Handling

- File not found: Log warning, attempt service key refresh
- Invalid token: Attempt refresh using service key
- Service key not found: Throw error with clear message
- Token refresh failure: Throw error with details
- Network errors: Retry with exponential backoff (if applicable)

## Future Enhancements

- Support for multiple base paths (search in multiple directories)
- Token expiration prediction (refresh before expiration)
- Support for encrypted service key files
- Integration with keychain/credential stores
- Support for destination-specific configuration files
- Metrics and monitoring hooks

## Dependencies

### Required
- `@mcp-abap-adt/connection` - For `refreshJwtToken` utility
- `axios` - For HTTP requests (token validation)
- `dotenv` - For parsing `.env` files

### Optional
- `fs-extra` - For better file operations (if needed)
- `winston` or similar - For structured logging (if needed)

## Notes

- The package should be lightweight and focused only on token management
- It should not handle actual ADT requests - that's the responsibility of `@mcp-abap-adt/connection`
- Token validation should be minimal (just test connection, don't do full ADT operations)
- The package should be stateless where possible, but token caching is acceptable for performance
- Consider thread-safety if multiple requests come in for the same destination simultaneously

