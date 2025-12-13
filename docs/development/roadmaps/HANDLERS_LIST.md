# Handlers List

Complete list of all handlers in mcp-abap-adt project.

## Handler Categories

### Object Type Handlers

#### Behavior Definition (BDEF)
- **High-level:**
  - `handleCreateBehaviorDefinition` - Create behavior definition
  - `handleUpdateBehaviorDefinition` - Update behavior definition
- **Low-level:**
  - `handleActivateBehaviorDefinition` - Activate behavior definition
  - `handleCheckBehaviorDefinition` - Check behavior definition
  - `handleCreateBehaviorDefinition` - Create behavior definition
  - `handleDeleteBehaviorDefinition` - Delete behavior definition
  - `handleLockBehaviorDefinition` - Lock behavior definition
  - `handleUnlockBehaviorDefinition` - Unlock behavior definition
  - `handleUpdateBehaviorDefinition` - Update behavior definition
  - `handleValidateBehaviorDefinition` - Validate behavior definition
- **Read-only:**
  - `handleGetBdef` - Get behavior definition

#### Behavior Implementation (BIMPL)
- **High-level:**
  - `handleCreateBehaviorImplementation` - Create behavior implementation
  - `handleUpdateBehaviorImplementation` - Update behavior implementation
- **Low-level:**
  - `handleCreateBehaviorImplementation` - Create behavior implementation
  - `handleLockBehaviorImplementation` - Lock behavior implementation
  - `handleValidateBehaviorImplementation` - Validate behavior implementation

#### Class
- **High-level:**
  - `handleCreateClass` - Create class
  - `handleUpdateClass` - Update class
- **Low-level:**
  - `handleActivateClass` - Activate class
  - `handleActivateClassTestClasses` - Activate class test classes
  - `handleCheckClass` - Check class
  - `handleCreateClass` - Create class
  - `handleDeleteClass` - Delete class
  - `handleGetClassUnitTestResult` - Get class unit test result
  - `handleGetClassUnitTestStatus` - Get class unit test status
  - `handleLockClass` - Lock class
  - `handleLockClassTestClasses` - Lock class test classes
  - `handleRunClassUnitTests` - Run class unit tests
  - `handleUnlockClass` - Unlock class
  - `handleUnlockClassTestClasses` - Unlock class test classes
  - `handleUpdateClass` - Update class
  - `handleUpdateClassTestClasses` - Update class test classes
  - `handleValidateClass` - Validate class
- **Read-only:**
  - `handleGetClass` - Get class

#### Common (Generic Object Operations)
- **Low-level:**
  - `handleActivateObject` - Activate object (generic)
  - `handleCheckObject` - Check object (generic)
  - `handleDeleteObject` - Delete object (generic)
  - `handleLockObject` - Lock object (generic)
  - `handleUnlockObject` - Unlock object (generic)
  - `handleValidateObject` - Validate object (generic)

#### Data Element
- **High-level:**
  - `handleCreateDataElement` - Create data element
  - `handleUpdateDataElement` - Update data element
- **Low-level:**
  - `handleActivateDataElement` - Activate data element
  - `handleCheckDataElement` - Check data element
  - `handleCreateDataElement` - Create data element
  - `handleDeleteDataElement` - Delete data element
  - `handleLockDataElement` - Lock data element
  - `handleUnlockDataElement` - Unlock data element
  - `handleUpdateDataElement` - Update data element
  - `handleValidateDataElement` - Validate data element
- **Read-only:**
  - `handleGetDataElement` - Get data element

#### Domain
- **High-level:**
  - `handleCreateDomain` - Create domain
  - `handleUpdateDomain` - Update domain
- **Low-level:**
  - `handleActivateDomain` - Activate domain
  - `handleCheckDomain` - Check domain
  - `handleCreateDomain` - Create domain
  - `handleDeleteDomain` - Delete domain
  - `handleLockDomain` - Lock domain
  - `handleUnlockDomain` - Unlock domain
  - `handleUpdateDomain` - Update domain
  - `handleValidateDomain` - Validate domain
- **Read-only:**
  - `handleGetDomain` - Get domain

#### Function Group / Function Module
- **High-level:**
  - `handleCreateFunctionGroup` - Create function group
  - `handleCreateFunctionModule` - Create function module
  - `handleUpdateFunctionGroup` - Update function group
  - `handleUpdateFunctionModule` - Update function module
- **Low-level:**
  - `handleActivateFunctionGroup` - Activate function group
  - `handleActivateFunctionModule` - Activate function module
  - `handleCheckFunctionGroup` - Check function group
  - `handleCheckFunctionModule` - Check function module
  - `handleCreateFunctionGroup` - Create function group
  - `handleCreateFunctionModule` - Create function module
  - `handleDeleteFunctionGroup` - Delete function group
  - `handleDeleteFunctionModule` - Delete function module
  - `handleLockFunctionGroup` - Lock function group
  - `handleLockFunctionModule` - Lock function module
  - `handleUnlockFunctionGroup` - Unlock function group
  - `handleUnlockFunctionModule` - Unlock function module
  - `handleUpdateFunctionModule` - Update function module
  - `handleValidateFunctionGroup` - Validate function group
  - `handleValidateFunctionModule` - Validate function module
- **Read-only:**
  - `handleGetFunction` - Get function module
  - `handleGetFunctionGroup` - Get function group

#### Interface
- **High-level:**
  - `handleCreateInterface` - Create interface
  - `handleUpdateInterface` - Update interface
- **Low-level:**
  - `handleActivateInterface` - Activate interface
  - `handleCheckInterface` - Check interface
  - `handleCreateInterface` - Create interface
  - `handleDeleteInterface` - Delete interface
  - `handleLockInterface` - Lock interface
  - `handleUnlockInterface` - Unlock interface
  - `handleUpdateInterface` - Update interface
  - `handleValidateInterface` - Validate interface
- **Read-only:**
  - `handleGetInterface` - Get interface

#### Metadata Extension (DDLX)
- **High-level:**
  - `handleCreateMetadataExtension` - Create metadata extension
  - `handleUpdateMetadataExtension` - Update metadata extension
- **Low-level:**
  - `handleActivateMetadataExtension` - Activate metadata extension
  - `handleCheckMetadataExtension` - Check metadata extension
  - `handleCreateMetadataExtension` - Create metadata extension
  - `handleDeleteMetadataExtension` - Delete metadata extension
  - `handleLockMetadataExtension` - Lock metadata extension
  - `handleUnlockMetadataExtension` - Unlock metadata extension
  - `handleUpdateMetadataExtension` - Update metadata extension
  - `handleValidateMetadataExtension` - Validate metadata extension

#### Package
- **High-level:**
  - `handleCreatePackage` - Create package
- **Low-level:**
  - `handleCheckPackage` - Check package
  - `handleCreatePackage` - Create package
  - `handleDeletePackage` - Delete package
  - `handleLockPackage` - Lock package
  - `handleUnlockPackage` - Unlock package
  - `handleUpdatePackage` - Update package
  - `handleValidatePackage` - Validate package

#### Program
- **High-level:**
  - `handleCreateProgram` - Create program
  - `handleUpdateProgram` - Update program
- **Low-level:**
  - `handleActivateProgram` - Activate program
  - `handleCheckProgram` - Check program
  - `handleCreateProgram` - Create program
  - `handleDeleteProgram` - Delete program
  - `handleLockProgram` - Lock program
  - `handleUnlockProgram` - Unlock program
  - `handleUpdateProgram` - Update program
  - `handleValidateProgram` - Validate program

#### Service Definition
- **High-level:**
  - `handleCreateServiceDefinition` - Create service definition
  - `handleUpdateServiceDefinition` - Update service definition
- **Read-only:**
  - `handleGetServiceDefinition` - Get service definition

#### Structure
- **High-level:**
  - `handleCreateStructure` - Create structure
  - `handleUpdateStructure` - Update structure
- **Low-level:**
  - `handleActivateStructure` - Activate structure
  - `handleCheckStructure` - Check structure
  - `handleCreateStructure` - Create structure
  - `handleDeleteStructure` - Delete structure
  - `handleLockStructure` - Lock structure
  - `handleUnlockStructure` - Unlock structure
  - `handleUpdateStructure` - Update structure
  - `handleValidateStructure` - Validate structure
- **Read-only:**
  - `handleGetStructure` - Get structure

#### Table
- **High-level:**
  - `handleCreateTable` - Create table
  - `handleUpdateTable` - Update table
- **Low-level:**
  - `handleActivateTable` - Activate table
  - `handleCheckTable` - Check table
  - `handleCreateTable` - Create table
  - `handleDeleteTable` - Delete table
  - `handleLockTable` - Lock table
  - `handleUnlockTable` - Unlock table
  - `handleUpdateTable` - Update table
  - `handleValidateTable` - Validate table
- **Read-only:**
  - `handleGetTable` - Get table
  - `handleGetTableContents` - Get table contents

#### View (CDS View)
- **High-level:**
  - `handleCreateView` - Create view
  - `handleUpdateView` - Update view
- **Low-level:**
  - `handleActivateView` - Activate view
  - `handleCheckView` - Check view
  - `handleCreateView` - Create view
  - `handleDeleteView` - Delete view
  - `handleLockView` - Lock view
  - `handleUnlockView` - Unlock view
  - `handleUpdateView` - Update view
  - `handleValidateView` - Validate view
- **Read-only:**
  - `handleGetView` - Get view

### Utility Handlers

#### Enhancement
- **Read-only:**
  - `handleGetEnhancementImpl` - Get enhancement implementation
  - `handleGetEnhancementSpot` - Get enhancement spot
  - `handleGetEnhancements` - Get enhancements

#### Include
- **Read-only:**
  - `handleGetInclude` - Get include
  - `handleGetIncludesList` - Get includes list

#### Search
- **Read-only:**
  - `handleGetObjectsByType` - Get objects by type
  - `handleGetObjectsList` - Get objects list
  - `handleSearchObject` - Search object

#### System
- **Read-only:**
  - `handleDescribeByList` - Describe by list
  - `handleGetAbapAST` - Get ABAP AST
  - `handleGetAbapSemanticAnalysis` - Get ABAP semantic analysis
  - `handleGetAbapSystemSymbols` - Get ABAP system symbols
  - `handleGetAllTypes` - Get all types
  - `handleGetInactiveObjects` - Get inactive objects
  - `handleGetObjectInfo` - Get object info
  - `handleGetObjectNodeFromCache` - Get object node from cache
  - `handleGetObjectStructure` - Get object structure
  - `handleGetSession` - Get session
  - `handleGetSqlQuery` - Get SQL query
  - `handleGetTransaction` - Get transaction
  - `handleGetTypeInfo` - Get type info
  - `handleGetWhereUsed` - Get where used

#### Transport
- **High-level:**
  - `handleCreateTransport` - Create transport
- **Low-level:**
  - `handleCreateTransport` - Create transport

## Statistics

- **Total handlers:** 187
- **Object type handlers:** ~150
- **Utility handlers:** ~37

## Handler Levels

- **High-level:** Use AdtClient, provide unified CRUD operations
- **Low-level:** Direct ADT API calls, specific operations
- **Read-only:** Query operations, no modifications
