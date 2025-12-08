# Parameter Passing Unit Tests Roadmap

## Problem Statement

We need to ensure that all parameters passed from MCP handlers through CrudClient to Builder classes and finally to low-level functions are not lost or modified during the call chain.

**Issue**: Parameters like `transportRequest` (and potentially others) can be lost when:
1. Builder is reused for the same object (same session)
2. Parameters are not properly propagated through the call chain
3. Optional parameters are not handled correctly

## Goals

1. Verify that all parameters passed from client methods reach low-level functions unchanged
2. Ensure builder reuse doesn't lose parameters
3. Create comprehensive test coverage for parameter passing
4. Prevent regression of parameter loss issues

## Test Strategy

### 1. Unit Tests for Parameter Passing Chain

Create unit tests that verify parameter passing through the complete chain:

```
MCP Handler → CrudClient → Builder → Low-level function
```

#### Test Structure

For each object type (View, Class, Table, Structure, etc.):

1. **Test: Parameter passing in create operations**
   - Verify `transportRequest` is passed correctly
   - Verify `packageName` is passed correctly
   - Verify `description` is passed correctly
   - Verify object-specific parameters (e.g., `ddlSource`, `sourceCode`) are passed correctly

2. **Test: Parameter passing in update operations**
   - Verify `transportRequest` is passed correctly
   - Verify update-specific parameters are passed correctly

3. **Test: Builder reuse doesn't lose parameters**
   - Create builder with initial parameters
   - Reuse builder with new parameters
   - Verify new parameters are applied correctly

4. **Test: Optional parameters handling**
   - Test with all parameters provided
   - Test with some parameters missing
   - Test with undefined/null values
   - Verify optional parameters don't break the chain

### 2. Test Implementation Plan

#### Phase 1: Core Infrastructure (Week 1)

1. **Create test utilities**
   - Mock connection object
   - Mock builder classes
   - Parameter tracking utilities
   - Assertion helpers for parameter verification

2. **Create base test class**
   - Common setup/teardown
   - Parameter verification helpers
   - Builder mock helpers

#### Phase 2: View Tests (Week 1-2)

1. **ViewBuilder parameter passing tests**
   - `createView` with all parameters
   - `createView` with optional parameters
   - `updateView` with transportRequest
   - Builder reuse scenarios

2. **CrudClient.createView tests**
   - Parameter passing to ViewBuilder
   - Builder reuse with new transportRequest
   - Error handling with missing parameters

3. **Low-level createView function tests**
   - URL construction with transportRequest
   - Parameter validation
   - Edge cases (empty strings, undefined)

#### Phase 3: Other Object Types (Week 2-3)

Apply same test pattern to:
- Class
- Table
- Structure
- Interface
- Program
- FunctionModule
- FunctionGroup
- DataElement
- Domain

#### Phase 4: Integration Tests (Week 3-4)

1. **End-to-end parameter passing tests**
   - Full chain: Handler → Client → Builder → Low-level
   - Verify parameters at each level
   - Mock HTTP requests to verify URL construction

2. **Regression tests**
   - Test scenarios that previously failed
   - Verify fixes for known issues

### 3. Test File Structure

```
src/__tests__/unit/
  parameter-passing/
    helpers/
      mockConnection.ts
      mockBuilder.ts
      parameterTracker.ts
      assertions.ts
    view/
      ViewBuilder.parameter.test.ts
      CrudClient.createView.parameter.test.ts
      createView.parameter.test.ts
    class/
      ClassBuilder.parameter.test.ts
      CrudClient.createClass.parameter.test.ts
      createClass.parameter.test.ts
    table/
      TableBuilder.parameter.test.ts
      CrudClient.createTable.parameter.test.ts
      createTable.parameter.test.ts
    structure/
      StructureBuilder.parameter.test.ts
      CrudClient.createStructure.parameter.test.ts
      createStructure.parameter.test.ts
    // ... other object types
    integration/
      full-chain.parameter.test.ts
      builder-reuse.parameter.test.ts
```

### 4. Test Examples

#### Example 1: ViewBuilder.create() parameter passing

```typescript
describe('ViewBuilder.create() parameter passing', () => {
  it('should pass transportRequest to low-level createView function', async () => {
    const mockConnection = createMockConnection();
    const tracker = new ParameterTracker();
    
    // Track calls to low-level function
    mockConnection.makeAdtRequest = jest.fn().mockImplementation((config) => {
      tracker.record('createView', config);
      return Promise.resolve({ status: 201, data: '' });
    });
    
    const builder = new ViewBuilder(mockConnection, {}, {
      viewName: 'Z_TEST_VIEW',
      packageName: 'Z_TEST_PKG',
      transportRequest: 'MDDK900016',
      description: 'Test View'
    });
    
    await builder.create();
    
    const calls = tracker.getCalls('createView');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('corrNr=MDDK900016');
  });
  
  it('should update transportRequest when builder is reused', async () => {
    const mockConnection = createMockConnection();
    const tracker = new ParameterTracker();
    
    mockConnection.makeAdtRequest = jest.fn().mockImplementation((config) => {
      tracker.record('createView', config);
      return Promise.resolve({ status: 201, data: '' });
    });
    
    const builder = new ViewBuilder(mockConnection, {}, {
      viewName: 'Z_TEST_VIEW',
      packageName: 'Z_TEST_PKG',
      transportRequest: 'OLD_REQUEST'
    });
    
    // First create
    await builder.create();
    
    // Update transportRequest
    builder.setRequest('NEW_REQUEST');
    
    // Second create (reuse builder)
    await builder.create();
    
    const calls = tracker.getCalls('createView');
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('corrNr=OLD_REQUEST');
    expect(calls[1].url).toContain('corrNr=NEW_REQUEST');
  });
});
```

#### Example 2: CrudClient.createView() parameter passing

```typescript
describe('CrudClient.createView() parameter passing', () => {
  it('should pass transportRequest to ViewBuilder', async () => {
    const mockConnection = createMockConnection();
    const client = new CrudClient(mockConnection);
    const tracker = new ParameterTracker();
    
    // Track ViewBuilder.create() calls
    const originalCreate = ViewBuilder.prototype.create;
    ViewBuilder.prototype.create = jest.fn().mockImplementation(function() {
      tracker.record('ViewBuilder.create', {
        transportRequest: this.config.transportRequest,
        viewName: this.config.viewName,
        packageName: this.config.packageName
      });
      return originalCreate.call(this);
    });
    
    await client.createView({
      viewName: 'Z_TEST_VIEW',
      packageName: 'Z_TEST_PKG',
      transportRequest: 'MDDK900016',
      description: 'Test View',
      ddlSource: 'define view...'
    });
    
    const calls = tracker.getCalls('ViewBuilder.create');
    expect(calls).toHaveLength(1);
    expect(calls[0].transportRequest).toBe('MDDK900016');
    
    // Restore
    ViewBuilder.prototype.create = originalCreate;
  });
  
  it('should update transportRequest when builder is reused', async () => {
    const mockConnection = createMockConnection();
    const client = new CrudClient(mockConnection);
    
    // First create
    await client.createView({
      viewName: 'Z_TEST_VIEW',
      packageName: 'Z_TEST_PKG',
      transportRequest: 'OLD_REQUEST',
      description: 'Test View',
      ddlSource: 'define view...'
    });
    
    // Second create with new transportRequest
    await client.createView({
      viewName: 'Z_TEST_VIEW',
      packageName: 'Z_TEST_PKG',
      transportRequest: 'NEW_REQUEST',
      description: 'Test View',
      ddlSource: 'define view...'
    });
    
    // Verify second call used new transportRequest
    const builder = (client as any).crudState.viewBuilder;
    expect(builder.config.transportRequest).toBe('NEW_REQUEST');
  });
});
```

#### Example 3: Low-level createView() parameter passing

```typescript
describe('createView() low-level function parameter passing', () => {
  it('should include transportRequest in URL when provided', async () => {
    const mockConnection = createMockConnection();
    let capturedUrl = '';
    
    mockConnection.makeAdtRequest = jest.fn().mockImplementation((config) => {
      capturedUrl = config.url;
      return Promise.resolve({ status: 201, data: '' });
    });
    
    await createView(mockConnection, {
      view_name: 'Z_TEST_VIEW',
      package_name: 'Z_TEST_PKG',
      transport_request: 'MDDK900016',
      description: 'Test View'
    });
    
    expect(capturedUrl).toContain('corrNr=MDDK900016');
    expect(capturedUrl).toContain('/sap/bc/adt/ddic/ddl/sources');
  });
  
  it('should not include transportRequest in URL when not provided', async () => {
    const mockConnection = createMockConnection();
    let capturedUrl = '';
    
    mockConnection.makeAdtRequest = jest.fn().mockImplementation((config) => {
      capturedUrl = config.url;
      return Promise.resolve({ status: 201, data: '' });
    });
    
    await createView(mockConnection, {
      view_name: 'Z_TEST_VIEW',
      package_name: 'Z_TEST_PKG',
      description: 'Test View'
    });
    
    expect(capturedUrl).not.toContain('corrNr=');
    expect(capturedUrl).toBe('/sap/bc/adt/ddic/ddl/sources');
  });
  
  it('should handle empty string transportRequest correctly', async () => {
    const mockConnection = createMockConnection();
    let capturedUrl = '';
    
    mockConnection.makeAdtRequest = jest.fn().mockImplementation((config) => {
      capturedUrl = config.url;
      return Promise.resolve({ status: 201, data: '' });
    });
    
    await createView(mockConnection, {
      view_name: 'Z_TEST_VIEW',
      package_name: 'Z_TEST_PKG',
      transport_request: '',
      description: 'Test View'
    });
    
    expect(capturedUrl).not.toContain('corrNr=');
  });
});
```

### 5. Test Coverage Goals

- **100% coverage** for parameter passing in create operations
- **100% coverage** for parameter passing in update operations
- **100% coverage** for builder reuse scenarios
- **Edge case coverage**: undefined, null, empty string values
- **Integration coverage**: Full chain from handler to low-level function

### 6. Implementation Checklist

#### Infrastructure
- [ ] Create `ParameterTracker` utility class
- [ ] Create mock connection factory
- [ ] Create mock builder helpers
- [ ] Create parameter assertion helpers
- [ ] Create base test class with common setup

#### View Tests
- [ ] ViewBuilder.create() parameter tests
- [ ] ViewBuilder.update() parameter tests
- [ ] ViewBuilder builder reuse tests
- [ ] CrudClient.createView() parameter tests
- [ ] CrudClient.updateView() parameter tests
- [ ] CrudClient builder reuse tests
- [ ] createView() low-level function tests

#### Other Object Types
- [ ] Class parameter passing tests
- [ ] Table parameter passing tests
- [ ] Structure parameter passing tests
- [ ] Interface parameter passing tests
- [ ] Program parameter passing tests
- [ ] FunctionModule parameter passing tests
- [ ] FunctionGroup parameter passing tests
- [ ] DataElement parameter passing tests
- [ ] Domain parameter passing tests

#### Integration Tests
- [ ] Full chain parameter passing tests
- [ ] Builder reuse integration tests
- [ ] Regression tests for known issues

### 7. Success Criteria

1. All parameter passing tests pass
2. No parameters are lost in the call chain
3. Builder reuse correctly updates parameters
4. Edge cases are handled correctly
5. Test coverage meets goals (100% for parameter passing)
6. Tests catch regressions before they reach production

### 8. Maintenance

- Run parameter passing tests as part of CI/CD pipeline
- Add new tests when new parameters are added
- Review test coverage regularly
- Update tests when architecture changes

## Related Issues

- Issue: `transportRequest` parameter lost in CreateView operation
- Fix: Updated all `get*Builder` methods to update `transportRequest` when builder is reused

## Notes

- Tests should be fast (unit tests, not integration tests)
- Use mocks to avoid actual HTTP calls
- Focus on parameter passing, not business logic
- Tests should be maintainable and easy to extend
