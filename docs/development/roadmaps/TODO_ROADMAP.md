# TODO Roadmap - mcp-abap-adt-v2

## Overall Statistics
- **Total TODOs**: 15
- **Files with TODOs**: 14
- **Status**: All handlers are functional, TODOs represent technical debt for refactoring

---

## Category 1: Migration to ReadOnlyClient Infrastructure (11 TODOs)

### Priority: Medium
**Goal**: Unify all read-only operations through ReadOnlyClient instead of direct ADT requests

### System Handlers (7 TODOs)
- [ ] `handlers/system/readonly/handleGetAllTypes.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetObjectInfo.ts` - Migrate to infrastructure module  
- [ ] `handlers/system/readonly/handleGetObjectNodeFromCache.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetObjectStructure.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetSqlQuery.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetTypeInfo.ts` - Migrate to infrastructure module
- [ ] `handlers/system/readonly/handleGetWhereUsed.ts` - Migrate to infrastructure module

**Migration Plan**:
1. Add corresponding methods to ReadOnlyClient (@mcp-abap-adt/clients)
2. Replace `makeAdtRequestWithTimeout` with ReadOnlyClient methods
3. Verify all edge cases are covered
4. Maintain backward compatibility with existing calls

**Estimate**: 2-3 days for all system handlers

### Domain Handlers (4 TODOs)
- [ ] `handlers/behavior_definition/readonly/handleGetBdef.ts` - Migrate to infrastructure module
- [ ] `handlers/include/readonly/handleGetInclude.ts` - Migrate to infrastructure module
- [ ] `handlers/package/readonly/handleGetPackage.ts` - Migrate to infrastructure module
- [ ] `handlers/transport/readonly/handleGetTransport.ts` - Migrate to infrastructure module or enhance ReadOnlyClient.readTransport()

**Migration Plan**:
1. Check if corresponding methods exist in ReadOnlyClient
2. If not - add them first
3. Migrate handlers one by one
4. Test with real ABAP systems

**Estimate**: 1-2 days

---

## Category 2: Adding Methods to ReadOnlyClient (3 TODOs)

### Priority: High (blocking handler migration)
**Goal**: Extend ReadOnlyClient API to cover all use cases

### TODOs in lib/utils.ts (2 TODOs)
- [ ] **Line 835**: Add `fetchNodeStructure()` to ReadOnlyClient
  - **Used in**: `getNodeStructureWithTimeout()`
  - **Endpoint**: `/sap/bc/adt/repository/nodestructure`
  - **Plan**: Add `readNodeStructure()` method to ReadOnlyClient
  - **Estimate**: 2-4 hours

- [ ] **Line 858**: Add `getSystemInformation()` to ReadOnlyClient
  - **Used in**: `getSystemInformation()`
  - **Endpoint**: `/sap/bc/adt/discovery`
  - **Plan**: Add `readSystemInfo()` method to ReadOnlyClient
  - **Estimate**: 2-4 hours

### TODOs in handlers (1 TODO)
- [ ] **handlers/table/readonly/handleGetTableContents.ts** (Line 19): Implement using ReadOnlyClient.readTableContents() when method is added
  - **Current**: Uses `makeAdtRequestWithTimeout` directly
  - **Needed**: Add `readTableContents()` to ReadOnlyClient
  - **Endpoint**: `/sap/bc/adt/datapreview/freestyle?...`
  - **Estimate**: 3-5 hours

**Action Plan**:
1. Create issues in @mcp-abap-adt/clients for each method
2. Implement methods in ReadOnlyClient
3. Publish new version of @mcp-abap-adt/clients
4. Update mcp-abap-adt to new clients version
5. Migrate corresponding handlers

**Overall Estimate**: 1-2 days

---

## Category 3: Feature Enhancement (1 TODO)

### Priority: Low
**Goal**: Improve structure creation functionality

- [ ] **handlers/structure/high/handleCreateStructure.ts** (Line 209): Implement DDL generation or enhance CrudClient to accept fields directly

**Details**:
- **Current**: StructureBuilder generates DDL internally, but structure is not updated with fields after creation
- **Issue**: Update step is skipped after create
- **Solution Options**:
  1. Implement explicit DDL generation in handler
  2. Extend CrudClient to accept fields during creation
  3. Use StructureBuilder for DDL generation and pass to update

**Estimate**: 1-2 days (depending on chosen approach)

---

## Execution Sequence (Recommended)

### Phase 1: Infrastructure Enhancement (Week 1)
1. ✅ Add methods to ReadOnlyClient:
   - `readNodeStructure()`
   - `readSystemInfo()`
   - `readTableContents()`
2. ✅ Publish new version of @mcp-abap-adt/clients
3. ✅ Update dependency in mcp-abap-adt

### Phase 2: System Handlers Migration (Week 2)
1. ✅ Migrate all 7 system handlers to ReadOnlyClient
2. ✅ Test with different ABAP systems
3. ✅ Verify backward compatibility

### Phase 3: Domain Handlers Migration (Week 3)
1. ✅ Migrate behavior_definition, include, package handlers
2. ✅ Migrate transport handler (most complex)
3. ✅ Migrate table handler after adding readTableContents()
4. ✅ Complete regression testing

### Phase 4: Feature Enhancement (Week 4 - Optional)
1. ⭕ Analyze requirements for DDL generation in CreateStructure
2. ⭕ Choose architecture (DDL gen vs CrudClient enhancement)
3. ⭕ Implementation and testing

---

## Success Metrics

- [ ] All handlers use ReadOnlyClient instead of makeAdtRequestWithTimeout
- [ ] Code in lib/utils.ts reduced by 30%+ (removed duplicate ADT requests)
- [ ] Test coverage for new ReadOnlyClient methods >= 80%
- [ ] Read-only operation execution time not increased > 5%
- [ ] Backward compatibility: existing integrations work without changes

---

## Risks and Mitigations

### Risk 1: Breaking changes in ReadOnlyClient
**Mitigation**: Semantic versioning, deprecated warnings, migration guide

### Risk 2: Performance degradation
**Mitigation**: Benchmarks before/after migration, profiling

### Risk 3: Edge cases in different ABAP versions
**Mitigation**: Testing on NetWeaver 7.5x, S/4HANA 2020+, BTP ABAP Environment

---

## Notes

- All TODOs are marked as non-blocking - v2 is functional as is
- Migration will improve maintainability and code reuse
- Prioritization: blockers first (ReadOnlyClient methods), then mass migration
- DDL generation - nice-to-have, not critical for release

---

**Last Updated**: 2025-12-19  
**Version**: mcp-abap-adt v2.0.0  
**Status**: Roadmap approved, ready for execution
