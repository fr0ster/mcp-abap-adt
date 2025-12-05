# Integration Roadmap: New Auth Packages

This document outlines the plan for integrating the new authentication packages into `mcp-abap-adt`.

## Overview

The authentication system has been refactored into separate packages:
- `@mcp-abap-adt/auth-broker` (v0.1.6) - Core interfaces and AuthBroker class
- `@mcp-abap-adt/auth-stores` (v0.1.2) - Store implementations (ServiceKeyStore, SessionStore)
- `@mcp-abap-adt/auth-providers` (v0.1.0) - Token providers (XsuaaTokenProvider, BtpTokenProvider)
- `@mcp-abap-adt/logger` (v0.1.0) - Centralized logging

## Current State

### Current Dependencies
- `@mcp-abap-adt/auth-broker`: `^0.1.5` (needs update to `^0.1.6`)
- Uses old `FileServiceKeyStore` and `FileSessionStore` from `auth-broker`
- Uses `SafeSessionStore` from `auth-broker` for in-memory sessions
- No token providers (AuthBroker handles token acquisition internally)

### Current Implementation
- `src/lib/stores/` - Platform-specific wrappers around old stores
- `src/index.ts` - Uses `getPlatformStores()` to create stores
- Stores use `searchPaths` (array of paths) instead of single `directory`

## Integration Plan

### Phase 1: Update Dependencies

**Tasks:**
1. Update `package.json`:
   - `@mcp-abap-adt/auth-broker`: `^0.1.5` → `^0.1.6`
   - Add `@mcp-abap-adt/auth-stores`: `^0.1.2`
   - Add `@mcp-abap-adt/auth-providers`: `^0.1.0`
   - Add `@mcp-abap-adt/logger`: `^0.1.0`

2. Run `npm install` to update dependencies

**Files to modify:**
- `package.json`

**Estimated time:** 15 minutes

---

### Phase 2: Replace Store Implementations

**Tasks:**
1. **Update `src/lib/stores/index.ts`**:
   - Replace imports from `@mcp-abap-adt/auth-broker` with `@mcp-abap-adt/auth-stores`
   - Update `getPlatformStores()` to use new stores:
     - `AbapServiceKeyStore` / `BtpServiceKeyStore` / `XsuaaServiceKeyStore` (instead of `FileServiceKeyStore`)
     - `AbapSessionStore` / `BtpSessionStore` / `XsuaaSessionStore` (instead of `FileSessionStore`)
     - `SafeAbapSessionStore` / `SafeBtpSessionStore` / `SafeXsuaaSessionStore` (instead of `SafeSessionStore`)
   - **Important**: New stores accept single `directory` parameter, not `searchPaths` array
   - Convert `customPath` (which may be array) to single directory (use first path)

2. **Remove old store files** (after migration):
   - `src/lib/stores/UnixFileServiceKeyStore.ts`
   - `src/lib/stores/UnixFileSessionStore.ts`
   - `src/lib/stores/WindowsFileServiceKeyStore.ts`
   - `src/lib/stores/WindowsFileSessionStore.ts`

3. **Update `src/lib/stores/platformPaths.ts`**:
   - Keep for backward compatibility, but return single directory instead of array
   - Or remove if not needed (new stores use single directory)

**Key Changes:**
- Old: `new FileServiceKeyStore(searchPaths)` where `searchPaths` is `string[]`
- New: `new AbapServiceKeyStore(directory)` where `directory` is `string`
- Need to determine which store type to use (ABAP vs BTP vs XSUAA) based on service key format

**Files to modify:**
- `src/lib/stores/index.ts`
- `src/lib/stores/platformPaths.ts` (or remove)
- Delete: `src/lib/stores/UnixFileServiceKeyStore.ts`
- Delete: `src/lib/stores/UnixFileSessionStore.ts`
- Delete: `src/lib/stores/WindowsFileServiceKeyStore.ts`
- Delete: `src/lib/stores/WindowsFileSessionStore.ts`

**Estimated time:** 2-3 hours

---

### Phase 3: Add Token Providers

**Tasks:**
1. **Update `src/index.ts`**:
   - Import token providers from `@mcp-abap-adt/auth-providers`:
     - `XsuaaTokenProvider`
     - `BtpTokenProvider`
   - Import logger from `@mcp-abap-adt/logger`:
     - `defaultLogger` or create logger instance

2. **Update `getOrCreateAuthBroker()` method**:
   - Determine token provider based on service key type:
     - If service key has `uaa` object (ABAP format) → use `BtpTokenProvider`
     - If service key is XSUAA format (direct) → use `XsuaaTokenProvider` or `BtpTokenProvider`
   - Pass token provider to `AuthBroker` constructor:
     ```typescript
     const tokenProvider = new BtpTokenProvider(); // or XsuaaTokenProvider
     const authBroker = new AuthBroker(
       {
         serviceKeyStore,
         sessionStore,
         tokenProvider, // Add token provider
       },
       'system'
     );
     ```

3. **Handle service key type detection**:
   - Try to load service key to determine format
   - Or use configuration to specify provider type
   - Default to `BtpTokenProvider` for backward compatibility

**Files to modify:**
- `src/index.ts`

**Estimated time:** 2-3 hours

---

### Phase 4: Update Logger Usage

**Tasks:**
1. **Replace logger imports**:
   - Find all imports of logger from `src/lib/logger` or local logger
   - Replace with `@mcp-abap-adt/logger`

2. **Update logger initialization**:
   - Use `defaultLogger` from `@mcp-abap-adt/logger`
   - Or create logger instance if needed

**Files to modify:**
- `src/index.ts`
- Any other files using logger

**Estimated time:** 1 hour

---

### Phase 5: Testing

**Tasks:**
1. **Unit Tests**:
   - Update tests that mock stores
   - Update tests that use `getPlatformStores()`
   - Ensure all tests pass

2. **Integration Tests**:
   - Test with real service keys (ABAP format)
   - Test with real service keys (XSUAA format)
   - Test with real service keys (BTP format)
   - Verify token acquisition works
   - Verify session storage works

3. **Manual Testing**:
   - Test with `--mcp` parameter
   - Test with `--auth-broker` flag
   - Test with different service key formats
   - Test browser authentication flow
   - Test refresh token flow

**Files to modify:**
- `src/__tests__/**/*.ts`
- `tests/test-config.yaml` (if needed)

**Estimated time:** 4-6 hours

---

### Phase 6: Documentation Updates

**Tasks:**
1. **Update README.md**:
   - Document new dependencies
   - Update examples if needed

2. **Update CHANGELOG.md**:
   - Document integration of new packages
   - Document breaking changes (if any)

3. **Update user documentation**:
   - `doc/user-guide/CLIENT_CONFIGURATION.md` - Update if store behavior changed
   - `doc/development/` - Update development docs if needed

**Files to modify:**
- `README.md`
- `CHANGELOG.md`
- `doc/user-guide/CLIENT_CONFIGURATION.md`

**Estimated time:** 1-2 hours

---

## Implementation Details

### Store Type Selection

**Challenge**: How to determine which store type to use (ABAP vs BTP vs XSUAA)?

**Options:**
1. **Auto-detect from service key format**:
   - Try to load service key with `AbapServiceKeyStore`
   - If fails, try `BtpServiceKeyStore`
   - If fails, try `XsuaaServiceKeyStore`
   - Use first successful store

2. **Configuration-based**:
   - Add configuration option to specify store type
   - Default to ABAP for backward compatibility

3. **File naming convention**:
   - Use file naming to determine type (e.g., `{destination}-abap.json`, `{destination}-btp.json`)
   - Default to ABAP format

**Recommendation**: Option 1 (auto-detect) with fallback to ABAP for backward compatibility.

### Path Resolution

**Challenge**: Old stores use `searchPaths` (array), new stores use `directory` (single string).

**Solution**:
- Use first path from `getPlatformPaths()` as the directory
- Or use custom path if provided (convert array to single string)
- Log warning if multiple paths provided (only first will be used)

### Token Provider Selection

**Challenge**: How to determine which token provider to use?

**Options:**
1. **Based on service key format**:
   - ABAP service key (has `uaa` object) → `BtpTokenProvider`
   - XSUAA service key (direct format) → `XsuaaTokenProvider` or `BtpTokenProvider`

2. **Configuration-based**:
   - Add configuration option
   - Default to `BtpTokenProvider` for backward compatibility

**Recommendation**: Option 1 (auto-detect) with default to `BtpTokenProvider`.

---

## Breaking Changes

### API Changes
- `getPlatformStores()` now returns stores with single `directory` parameter instead of `searchPaths`
- Store types changed (AbapServiceKeyStore instead of FileServiceKeyStore)
- Token providers must be explicitly provided to AuthBroker

### Behavior Changes
- Only first path from `searchPaths` will be used (new stores use single directory)
- Token acquisition now uses token providers (may have different behavior)

### Migration Path
- Existing service keys should continue to work (ABAP format is default)
- Users may need to update service key format if using XSUAA/BTP formats

---

## Risk Assessment

### High Risk
- **Store path resolution**: Changing from array to single directory may break existing setups
- **Token provider selection**: Wrong provider may cause authentication failures

### Medium Risk
- **Service key format detection**: Auto-detection may fail in edge cases
- **Backward compatibility**: Existing configurations may not work

### Low Risk
- **Logger integration**: Should be straightforward replacement
- **Documentation updates**: No functional impact

---

## Timeline Estimate

- **Phase 1**: 15 minutes
- **Phase 2**: 2-3 hours
- **Phase 3**: 2-3 hours
- **Phase 4**: 1 hour
- **Phase 5**: 4-6 hours
- **Phase 6**: 1-2 hours

**Total**: ~10-15 hours

---

## Success Criteria

1. ✅ All existing tests pass
2. ✅ Integration tests pass with real service keys
3. ✅ Manual testing confirms authentication works
4. ✅ Documentation is updated
5. ✅ No breaking changes for existing users (backward compatible)
6. ✅ New packages are properly integrated

---

## Notes

- Keep old store implementations until migration is complete and tested
- Consider feature flag to switch between old and new stores during migration
- Test thoroughly with different service key formats
- Ensure backward compatibility with existing service keys

