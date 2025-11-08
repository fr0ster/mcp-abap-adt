# MCP ABAP ADT Development Roadmap

## Priority: Critical (P0)

### 1. CreateClass ⭐⭐⭐
**Status:** ✅ COMPLETED  
**Priority:** Highest - Most frequently created ABAP object  
**Complexity:** High - Requires stateful session, lock management  
**Dependencies:** None  
**Implementation Notes:**
- Use stateful session pattern (like CreateView)
- Eclipse ADT workflow:
  1. POST /sap/bc/adt/oo/classes - Create class metadata
  2. LOCK - Acquire lock handle
  3. PUT source sections (public, protected, private, implementation)
  4. UNLOCK - Release lock
  5. Activate class
- Cookie management via BaseAbapConnection (automatic)
- Support: public/protected/private sections, interfaces, superclass

### 2. CreateProgram ⭐⭐⭐
**Status:** ✅ COMPLETED  
**Priority:** High - Basic ABAP object type  
**Complexity:** Medium - Similar to CreateView but simpler  
**Dependencies:** None  
**Implementation Notes:**
- Stateful session required
- Eclipse ADT workflow:
  1. POST /sap/bc/adt/programs/programs - Create program
  2. LOCK program
  3. PUT /source/main - Upload source code
  4. UNLOCK program
  5. Activate
- Program types: executable, include, module pool, function group
- Cookie management automatic

### 3. ActivateObject ⭐⭐
**Status:** ✅ COMPLETED  
**Priority:** High - Universal activation for any object  
**Complexity:** Low - Single API call  
**Dependencies:** None  
**Implementation Notes:**
- POST /sap/bc/adt/activation with object URI
- No session required (stateless)
- Can activate multiple objects in batch
- Returns activation messages/warnings
- Useful for post-creation activation or re-activation

---

## 🎉 P0 Priorities: ALL COMPLETED (3/3)

All critical P0 features have been implemented and tested:
- ✅ CreateClass - Full OO class creation with inheritance, final, abstract
- ✅ CreateProgram - Program creation with multiple types (Executable, Include, Module Pool)
- ✅ ActivateObject - Universal activation for any ABAP object

---

## 🎉 P1 Priorities: PARTIALLY COMPLETED (2/3)

High-priority features for interface management:
- ✅ CreateInterface - Full interface creation with methods, events, types
- ✅ UpdateInterfaceSource - Update existing interface source code
- ⏳ DeleteObject - Not yet started (planned for next sprint)
- ⏳ CheckObject - Not yet started (planned for next sprint)

---

## Priority: High (P1)

### 4. CreateInterface ⭐⭐
**Status:** ✅ COMPLETED  
**Priority:** Medium-High  
**Complexity:** Medium - Similar to CreateClass  
**Dependencies:** CreateClass pattern  
**Implementation Notes:**
- ✅ Stateful session pattern implemented
- ✅ Eclipse ADT workflow: POST metadata, LOCK, PUT source, UNLOCK, ACTIVATE
- ✅ Only public section (no protected/private)
- ✅ Interface methods/events/types supported
- ✅ Full test coverage with ZIF_TEST_MCP_01

### 5. UpdateInterfaceSource ⭐⭐
**Status:** ✅ COMPLETED  
**Priority:** Medium-High  
**Complexity:** Medium - Update existing interface  
**Dependencies:** CreateInterface pattern  
**Implementation Notes:**
- ✅ Stateful session with lock/unlock mechanism
- ✅ Lock handle + corrNr in URL parameters
- ✅ Optional activation after update
- ✅ Full test coverage

### 6. DeleteObject ⭐⭐
**Status:** Not Started  
**Priority:** Medium-High - Cleanup and testing  
**Complexity:** Medium - Requires transport handling  
**Dependencies:** None  
**Implementation Notes:**
- DELETE /sap/bc/adt/{object_type}/{object_name}
- Must specify transport request for transportable objects
- Some objects require cascade deletion
- Return confirmation and dependencies

### 6. CheckObject ⭐
**Status:** Not Started  
**Priority:** Medium - Syntax validation  
**Complexity:** Low  
**Dependencies:** None  
**Implementation Notes:**
- POST /sap/bc/adt/checkruns
- Returns syntax errors, warnings, messages
- No activation, just validation
- Useful before activation

## Priority: Medium (P2)

### 7. CreateFunctionModule ⭐
**Status:** Not Started  
**Priority:** Medium  
**Complexity:** High - Complex structure  
**Dependencies:** CreateFunctionGroup  
**Implementation Notes:**
- Must exist in function group
- Stateful session for source + parameters
- Import/Export/Changing/Tables parameters
- Exceptions definition

### 8. CreateFunctionGroup ⭐
**Status:** Not Started  
**Priority:** Medium  
**Complexity:** Medium  
**Dependencies:** None  
**Implementation Notes:**
- Container for function modules
- Includes: TOP include, UXX includes
- Stateful session pattern

### 9. CreatePackage
**Status:** Not Started  
**Priority:** Medium-Low  
**Complexity:** Medium  
**Dependencies:** None  
**Implementation Notes:**
- Package hierarchy support
- Software component assignment
- Package interfaces definition

## Priority: Low (P3)

### 10. CreateBDEF
**Status:** Not Started  
**Priority:** Low - RAP specific  
**Complexity:** Very High  
**Dependencies:** CDS Views  
**Implementation Notes:**
- Behavior Definition for RAP
- Complex syntax and structure
- Requires deep RAP knowledge

### 11. GetMessageClass
**Status:** Not Started  
**Priority:** Low  
**Complexity:** Low  
**Implementation Notes:**
- GET /sap/bc/adt/messageclass/{class_name}
- Returns message numbers and texts

### 12. ReleaseTransport
**Status:** Not Started  
**Priority:** Low - Transport management  
**Complexity:** Medium  
**Dependencies:** GetTransport  
**Implementation Notes:**
- POST action to release transport
- Validation required
- Documentation mandatory in production systems

## Technical Debt & Improvements

### Session Management Pattern
**Status:** In Progress  
**Current:** Implemented in CreateView  
**Action Items:**
- Extract `makeAdtRequestWithSession` to shared utility
- Document stateful session pattern
- Add session timeout handling
- Reuse in all Create handlers

### Cookie Management
**Status:** ✅ Complete  
**Implementation:** BaseAbapConnection handles automatically  
**Notes:**
- All handlers inherit cookie management
- No manual cookie handling needed
- Session maintained via SAP_SESSIONID cookie

### Lock Handle Management
**Status:** ✅ Complete in CreateView  
**Pattern:** Lock → Modify → Unlock → Activate  
**Notes:**
- Lock handle must stay within same session
- Automatic unlock on error (try/finally)
- Reuse pattern in all Create handlers

## Implementation Order

**Phase 1 (Critical):**
1. CreateClass - 2 weeks
2. CreateProgram - 1 week  
3. ActivateObject - 3 days

**Phase 2 (High Priority):**
4. CreateInterface - 1 week
5. DeleteObject - 1 week
6. CheckObject - 3 days

**Phase 3 (Nice to Have):**
7. CreateFunctionModule + CreateFunctionGroup - 2 weeks
8. CreatePackage - 1 week

**Phase 4 (Future):**
9. CreateBDEF - 2 weeks (requires RAP expertise)
10. Additional Get functions - as needed

## Success Criteria

Each Create handler must:
- ✅ Use stateful session pattern (`sap-adt-connection-id`)
- ✅ Cookie management via BaseAbapConnection (automatic)
- ✅ Proper lock handle management (acquire → use → release)
- ✅ Error handling with automatic unlock
- ✅ Step-by-step logging (Create → Lock → Modify → Unlock → Activate)
- ✅ Activation warnings capture
- ✅ Comprehensive tests with real SAP system
- ✅ Documentation in AVAILABLE_TOOLS.md
- ✅ Example usage in test-config.yaml

---

## 🔄 Architecture Improvement: Separate Create and Update Operations

### Current State
Current Create* handlers perform **both operations** in one call:
1. POST - Create object metadata
2. LOCK - Acquire lock handle  
3. PUT - Upload source code
4. UNLOCK - Release lock
5. ACTIVATE - Activate object (optional)

This works but combines two distinct operations:
- **Create** (metadata) - stateless POST
- **Update** (source) - stateful LOCK/PUT/UNLOCK

### Proposed Refactoring

#### Option A: Separate Functions (Recommended)
Keep current all-in-one Create* functions AND add separate Update* functions:

**Create Functions** (current, keep as-is):
- `CreateClass` - Full workflow (metadata + source + activate)
- `CreateProgram` - Full workflow
- `CreateView` - Full workflow
- Benefits: Backward compatible, convenient for new objects

**New Update Functions** (to be added - P1 priority):
- `UpdateClassSource` - LOCK → PUT source → UNLOCK
- `UpdateProgramSource` - LOCK → PUT source → UNLOCK  
- `UpdateViewSource` - LOCK → PUT DDL → UNLOCK
- Benefits: Modify existing objects without re-creation

#### Option B: Split Completely (Breaking Change - Not Recommended)
Replace current Create* with two separate operations - breaks existing usage.

### Activation Parameter
Make activation **optional** in both Create and Update:
- `activate: boolean` parameter (default: true for Create, false for Update)
- Allows batch creation without individual activations
- Use `ActivateObject` for batch activation later
- More flexible workflow control

### Implementation Priority
**P1 - Add Update* functions** (Option A):
1. `UpdateClassSource` - Modify existing class source
2. `UpdateProgramSource` - Modify existing program source
3. `UpdateViewSource` - Modify existing view DDL

Keep current Create* functions unchanged for backward compatibility.

### Benefits
- **Flexibility**: Users choose workflow (all-in-one vs. step-by-step)
- **Efficiency**: Update existing objects without metadata re-creation
- **Batch Operations**: Create multiple objects, then batch activate
- **Testability**: Easier to test individual operations
- **Clarity**: Clear separation of concerns (Create vs. Modify)

---

## Notes

- **Stateful Session:** Required for all Create operations to maintain lock handle
- **Cookies:** Handled automatically by BaseAbapConnection, never manual
- **Lock Pattern:** Always Lock → Modify → Unlock, with try/finally for error handling
- **Testing:** All Create handlers must be tested against real SAP system (E19/E23)
- **Eclipse ADT Compliance:** Follow exact Eclipse ADT API workflow for compatibility
