# Roadmap: Usage Documentation for MCP Functions

## Overview

This roadmap outlines the creation of comprehensive usage documentation for creating and modifying ABAP objects through MCP function calls, covering both low-level and high-level handlers.

## Goals

1. ✅ Create structured documentation for object creation and modification workflows
2. ✅ Document CRUD operations for simple objects
3. ⏳ Document complex RAP BO creation scenarios with related objects
4. ✅ Emphasize best practices: code checking before update, deferred group activation

## Documentation Structure

```
doc/user-guide/
├── usage/                          # ✅ Created
│   ├── README.md                   # ✅ Created
│   ├── simple-objects/             # ✅ Created
│   │   ├── README.md               # ✅ Created
│   │   ├── classes-high.md         # ✅ Created
│   │   ├── classes-low.md          # ✅ Created
│   │   ├── interfaces-high.md      # ✅ Created
│   │   ├── interfaces-low.md       # ✅ Created
│   │   ├── programs-high.md         # ✅ Created
│   │   ├── programs-low.md          # ✅ Created
│   │   ├── function-groups-high.md  # ✅ Created
│   │   ├── function-groups-low.md   # ✅ Created
│   │   ├── function-modules-high.md # ✅ Created
│   │   ├── function-modules-low.md  # ✅ Created
│   │   ├── tables-high.md          # ✅ Created
│   │   ├── tables-low.md           # ✅ Created
│   │   ├── structures-high.md      # ✅ Created
│   │   ├── structures-low.md       # ✅ Created
│   │   ├── views-high.md           # ✅ Created
│   │   ├── views-low.md            # ✅ Created
│   │   ├── domains-high.md         # ✅ Created
│   │   ├── domains-low.md          # ✅ Created
│   │   ├── data-elements-high.md  # ✅ Created
│   │   ├── data-elements-low.md    # ✅ Created
│   │   ├── service-definitions-high.md # ✅ Created
│   │   └── service-definitions-low.md  # ✅ Created
│   └── rap-business-objects/       # ⏳ Pending
│       ├── README.md               # ⏳ Pending
│       ├── creating-rap-bo.md      # ⏳ Pending
│       └── deferred-activation.md  # ⏳ Pending
```

## Phase 1: Simple Objects CRUD Documentation ✅ COMPLETED

### Scope
Document CRUD operations for standalone objects that don't have complex dependencies.

### Objects Documented ✅
1. ✅ **Classes** (`CLAS/OC`) - `classes-high.md` / `classes-low.md`
2. ✅ **Interfaces** (`INTF/OI`) - `interfaces-high.md` / `interfaces-low.md`
3. ✅ **Programs** (`PROG/P`) - `programs-high.md` / `programs-low.md`
4. ✅ **Function Groups** (`FUGR`) - `function-groups-high.md` / `function-groups-low.md`
5. ✅ **Function Modules** (`FUGR/FF`) - `function-modules-high.md` / `function-modules-low.md`
6. ✅ **Tables** (`TABL/DT`) - `tables-high.md` / `tables-low.md`
7. ✅ **Structures** (`STRU/DS`) - `structures-high.md` / `structures-low.md`
8. ✅ **CDS Views** (`DDLS/DF`) - `views-high.md` / `views-low.md`
9. ✅ **Domains** (`DOMA/DD`) - `domains-high.md` / `domains-low.md`
10. ✅ **Data Elements** (`DTEL/DE`) - `data-elements-high.md` / `data-elements-low.md`
11. ✅ **Service Definitions** (`SRVD/SRVD`) - `service-definitions-high.md` / `service-definitions-low.md`

### Documentation Format ✅

Each object has **two separate files**:
- **`<object>-high.md`**: High-level handler usage (single function call)
- **`<object>-low.md`**: Low-level handler usage (step-by-step workflow)

**Format:**
- Compact, laconic style
- Only exact MCP function calls with parameters
- No unnecessary descriptions
- Clear, no confusion

**Low-Level Workflow (Standard Pattern):**
1. `GetSession` - Obtain session
2. `Validate<Object>Low` - Validate object name
3. `Create<Object>Low` - Create object
4. `Lock<Object>Low` - Lock for modification
5. `Check<Object>Low` - **Check code BEFORE update** (CRITICAL)
6. `Update<Object>Low` - Update object (only if check passed)
7. `Unlock<Object>Low` - Release lock
8. `Check<Object>Low` - Check inactive version after unlock
9. `Activate<Object>Low` or `ActivateObjectLow` - Activate

## Phase 2: RAP Business Objects Documentation ⏳ PENDING

### Scope
Document creation of complete RAP Business Objects with all related objects and dependencies.

### RAP BO Components to Document

1. **Domains** (`DOMA/DD`)
   - Base data types
   - Value ranges
   - Documentation

2. **Data Elements** (`DTEL/DE`)
   - Based on domains
   - Field labels
   - Documentation

3. **Tables** (`TABL/DT`)
   - Root entity table
   - Field definitions using data elements
   - Primary keys
   - Foreign keys

4. **Draft Tables** (`TABL/DT`)
   - Draft-enabled tables
   - Relationship to root table

5. **CDS Views** (`DDLS/DF`)
   - Interface view (projection)
   - Consumption view
   - Composite structures
   - Associations

6. **Behavior Definitions** (`BDEF/BD`)
   - Behavior definition
   - Draft enabled
   - Actions, validations, determinations

7. **Behavior Implementations** (`BDEF/BDO`)
   - Implementation classes
   - Save, modify, delete handlers

8. **Metadata Extensions** (`DDLX/EX`)
   - UI annotations
   - Field labels
   - Field visibility

9. **Service Definitions** (`SRVD/SRVD`)
   - Service binding
   - Service version

### Documentation Structure

#### 1. Overview Section
- What is a RAP BO
- Component relationships
- Creation order and dependencies
- Deferred activation concept

#### 2. Complete RAP BO Creation Workflow

**Step-by-step process:**

1. **Create Domains**
   - Create all required domains
   - **Do NOT activate yet** (deferred activation)

2. **Create Data Elements**
   - Create data elements based on domains
   - **Do NOT activate yet** (deferred activation)

3. **Create Root Table**
   - Create table with fields using data elements
   - Define primary key
   - **Do NOT activate yet** (deferred activation)

4. **Create Draft Table**
   - Create draft table
   - Link to root table
   - **Do NOT activate yet** (deferred activation)

5. **Create CDS Interface View**
   - Create interface CDS view
   - Reference root table
   - Define associations
   - **Do NOT activate yet** (deferred activation)

6. **Create CDS Consumption View**
   - Create consumption view
   - Use composite structure if needed
   - **Do NOT activate yet** (deferred activation)

7. **Create Behavior Definition**
   - Define behavior
   - Enable draft
   - **Do NOT activate yet** (deferred activation)

8. **Create Behavior Implementation**
   - Implement behavior handlers
   - **Do NOT activate yet** (deferred activation)

9. **Create Metadata Extension**
   - Add UI annotations
   - **Do NOT activate yet** (deferred activation)

10. **Deferred Group Activation**
    - Activate all related objects together
    - Use `ActivateObjectLow` with multiple objects
    - Handle activation errors

11. **Create Service Definition**
    - Create service definition
    - Bind to CDS view
    - Activate service definition

#### 3. Low-Level vs High-Level Approach

**Using Low-Level Handlers:**
- Full control over each step
- Explicit session management
- **Must check code before each update**
- Manual deferred activation

**Using High-Level Handlers:**
- Simpler workflow
- Automatic session management
- Built-in code checking
- **Still need deferred activation for related objects**

#### 4. Deferred Group Activation Guide

**Why Deferred Activation?**
- Related objects have dependencies
- Activating individually can cause errors
- Group activation ensures consistency
- Better error handling

**How to Use:**
- Create all objects without activation
- Collect all object references
- Use `ActivateObjectLow` with array of objects
- Handle activation errors and warnings

**Example:**
```json
{
  "objects": [
    { "name": "ZDOMAIN_001", "type": "DOMA/DD" },
    { "name": "ZDTEL_001", "type": "DTEL/DE" },
    { "name": "ZTABL_001", "type": "TABL/DT" },
    { "name": "ZCDS_001", "type": "DDLS/DF" }
  ],
  "preaudit": true
}
```

## Phase 3: Critical Best Practices Documentation ✅ INTEGRATED

### Code Checking Before Update ✅

**Why it's critical:**
- Prevents syntax errors from being saved
- Catches errors early in the workflow
- Required when using low-level handlers

**Workflow (documented in all low-level files):**
1. Lock object
2. **Check new code** (with `sourceCode`/`ddlCode` and `version='inactive'` or `version='new'`)
3. **Only update if check passes**
4. Unlock object
5. Check inactive version (after unlock, without sourceCode)
6. Activate (if needed)

### Deferred Group Activation for Related Objects ✅

**When to use:**
- Objects with dependencies (domains → data elements → tables)
- Composite structures
- RAP BO components
- Any related objects created together

**Pattern (documented in all low-level files):**
1. Create all objects without activation
2. Collect object references
3. Activate as a group using `ActivateObjectLow`
4. Handle activation results

## Implementation Tasks

### Task 1: Create Folder Structure ✅
- [x] Create `doc/user-guide/usage/` folder
- [x] Create `doc/user-guide/usage/simple-objects/` folder
- [x] Create `doc/user-guide/usage/rap-business-objects/` folder

### Task 2: Create README Files ✅
- [x] Create `usage/README.md` with overview
- [x] Create `usage/simple-objects/README.md`
- [ ] Create `usage/rap-business-objects/README.md`

### Task 3: Document Simple Objects (11 objects) ✅
- [x] classes-high.md / classes-low.md
- [x] interfaces-high.md / interfaces-low.md
- [x] programs-high.md / programs-low.md
- [x] function-groups-high.md / function-groups-low.md
- [x] function-modules-high.md / function-modules-low.md
- [x] tables-high.md / tables-low.md
- [x] structures-high.md / structures-low.md
- [x] views-high.md / views-low.md
- [x] domains-high.md / domains-low.md
- [x] data-elements-high.md / data-elements-low.md
- [x] service-definitions-high.md / service-definitions-low.md

**Total: 22 files created (11 objects × 2 files each)**

### Task 4: Document RAP BO Creation ⏳
- [ ] creating-rap-bo.md (complete workflow)
- [ ] deferred-activation.md (detailed guide)

### Task 5: Update Main Documentation ⏳
- [ ] Update `doc/user-guide/README.md` to reference new usage folder
- [ ] Update `doc/user-guide/scenarios/README.md` to distinguish from usage docs

## Documentation Standards ✅

### Code Examples ✅
- ✅ Include both high-level and low-level examples (separate files)
- ✅ Show complete request/response JSON (compact format)
- ✅ Use realistic object names (following SAP conventions)
- ✅ Compact, laconic style - only exact MCP calls

### Structure ✅
- ✅ Clear separation: high-level vs low-level
- ✅ Step-by-step workflows in low-level files
- ✅ No unnecessary descriptions
- ✅ Maximum clarity, no confusion

### Language ✅
- ✅ All documentation in English
- ✅ Clear, concise format
- ✅ Technical accuracy
- ✅ Practical examples

## Progress Summary

### ✅ Completed
- **Phase 1**: All 11 simple objects documented (22 files total)
- **Phase 3**: Best practices integrated into all documentation
- Folder structure created
- README files created

### ⏳ Pending
- **Phase 2**: RAP BO documentation
  - creating-rap-bo.md
  - deferred-activation.md
  - rap-business-objects/README.md
- Main documentation updates

## Notes

- All examples use compact JSON format (single line)
- Each object has separate high/low files for maximum clarity
- Code checking before update is emphasized in all low-level files
- Group activation examples included in all low-level files
- Documentation follows "exact MCP calls only" principle
