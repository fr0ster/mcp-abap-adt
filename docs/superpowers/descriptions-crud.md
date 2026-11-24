# Tool descriptions, CRUD (plan step 10.6, after the query measurement): old and new

Each create, update and delete tool states its function alone: what it writes for its object, the transport last; the write's verdict is no longer stated.

### CreateBehaviorDefinition

| Old | New |
| --- | --- |
| Creates a RAP behavior definition for a root entity in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Creates a managed, unmanaged, abstract or projection RAP behavior definition for a root entity in a package, recorded in the transport given. |

### DeleteBehaviorDefinition

| Old | New |
| --- | --- |
| Deletes a RAP behavior definition, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes a RAP behavior definition, recorded in the transport given. |

### UpdateBehaviorDefinition

| Old | New |
| --- | --- |
| Updates the source code of an existing RAP behavior definition, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing RAP behavior definition, activating it when asked, recorded in the transport given. |

### CreateBehaviorImplementation

| Old | New |
| --- | --- |
| Creates the RAP behavior implementation class of a behavior definition in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates the RAP behavior implementation class of a behavior definition in a package, with its description, recorded in the transport given. |

### DeleteBehaviorImplementation

| Old | New |
| --- | --- |
| Deletes a RAP behavior implementation class, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes a RAP behavior implementation class, recorded in the transport given. |

### UpdateBehaviorImplementation

| Old | New |
| --- | --- |
| Updates the implementations of an existing RAP behavior implementation class, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the implementations of an existing RAP behavior implementation class, activating it when asked, recorded in the transport given. |

### CreateClass

| Old | New |
| --- | --- |
| Creates an ABAP class in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an ABAP class in a package, with its description, its superclass and its FINAL and CREATE PROTECTED settings, recorded in the transport given. |

### DeleteClass

| Old | New |
| --- | --- |
| Deletes an ABAP class, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP class, recorded in the transport given. |

### DeleteLocalDefinitions

| Old | New |
| --- | --- |
| Clears the local definitions of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed. | Clears the local definitions of an ABAP class, activating the class when asked. |

### DeleteLocalMacros

| Old | New |
| --- | --- |
| Clears the local macros of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed. | Clears the local macros of an ABAP class, activating the class when asked. |

### DeleteLocalTestClass

| Old | New |
| --- | --- |
| Clears the local test classes of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed. | Clears the local test classes of an ABAP class, activating the class when asked. |

### DeleteLocalTypes

| Old | New |
| --- | --- |
| Clears the local types of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed. | Clears the local types of an ABAP class, activating the class when asked. |

### UpdateClass

| Old | New |
| --- | --- |
| Updates the source code of an existing ABAP class, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing ABAP class, activating it when asked, recorded in the transport given. |

### UpdateLocalDefinitions

| Old | New |
| --- | --- |
| Updates the local definitions of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the local definitions of an existing ABAP class, activating the class when asked, recorded in the transport given. |

### UpdateLocalMacros

| Old | New |
| --- | --- |
| Updates the local macros of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the local macros of an existing ABAP class, activating the class when asked, recorded in the transport given. |

### UpdateLocalTestClass

| Old | New |
| --- | --- |
| Updates the local test classes of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the local test classes of an existing ABAP class, activating the class when asked, recorded in the transport given. |

### UpdateLocalTypes

| Old | New |
| --- | --- |
| Updates the local types of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the local types of an existing ABAP class, activating the class when asked, recorded in the transport given. |

### CreateDataElement

| Old | New |
| --- | --- |
| Creates an ABAP data element in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Creates an ABAP data element in a package, typed by a domain, a built-in type or a reference, with its labels and search help, recorded in the transport given. |

### DeleteDataElement

| Old | New |
| --- | --- |
| Deletes an ABAP data element, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP data element, recorded in the transport given. |

### UpdateDataElement

| Old | New |
| --- | --- |
| Updates the properties of an existing ABAP data element, replacing them whole and activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the type, labels, search help and SET/GET parameter of an existing ABAP data element, replacing them whole and activating it when asked. |

### CreateDdl

| Old | New |
| --- | --- |
| Creates a CDS view or classic DDL view in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates a CDS view or classic DDL view in a package, with its description, recorded in the transport given. |

### DeleteDdl

| Old | New |
| --- | --- |
| Deletes a CDS view or classic DDL view, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes a CDS view or classic DDL view, recorded in the transport given. |

### UpdateDdl

| Old | New |
| --- | --- |
| Updates the DDL source of an existing CDS view or classic DDL view, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the DDL source of an existing CDS view or classic DDL view, activating it when asked, recorded in the transport given. |

### CreateMetadataExtension

| Old | New |
| --- | --- |
| Creates a CDS metadata extension in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Creates a CDS metadata extension in a package, with its description, activating it when asked, recorded in the transport given. |

### UpdateMetadataExtension

| Old | New |
| --- | --- |
| Updates the source code of an existing CDS metadata extension, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing CDS metadata extension, activating it when asked, recorded in the transport given. |

### CreateDomain

| Old | New |
| --- | --- |
| Creates an ABAP domain in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Creates an ABAP domain in a package, with its data type, length, decimals, conversion exit, value table and fixed values, recorded in the transport given. |

### DeleteDomain

| Old | New |
| --- | --- |
| Deletes an ABAP domain, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP domain, recorded in the transport given. |

### UpdateDomain

| Old | New |
| --- | --- |
| Updates the properties of an existing ABAP domain, replacing them whole and activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the data type, length, decimals, conversion exit, value table and fixed values of an existing ABAP domain, replacing them whole. |

### CreateFunctionGroup

| Old | New |
| --- | --- |
| Creates an ABAP function group in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an ABAP function group in a package, with its description, activating it when asked, recorded in the transport given. |

### CreateFunctionModule

| Old | New |
| --- | --- |
| Creates an ABAP function module in an existing function group, with its description, recorded in the transport given. Whether SAP took the change. | Creates an ABAP function module in an existing function group, with its description, recorded in the transport given. |

### UpdateFunctionGroup

| Old | New |
| --- | --- |
| Updates the description of an existing ABAP function group, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the description of an existing ABAP function group, recorded in the transport given. |

### UpdateFunctionModule

| Old | New |
| --- | --- |
| Updates the source code of an existing ABAP function module, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing ABAP function module in its function group, activating it when asked, recorded in the transport given. |

### DeleteFunctionGroup

| Old | New |
| --- | --- |
| Deletes an ABAP function group, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP function group, recorded in the transport given. |

### CreateFunctionInclude

| Old | New |
| --- | --- |
| Creates an include in an existing ABAP function group, with its description, recorded in the transport given. Whether SAP took the change. | Creates an include in an existing ABAP function group, with its description, recorded in the transport given. |

### DeleteFunctionInclude

| Old | New |
| --- | --- |
| Deletes an include of an ABAP function group, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an include of an ABAP function group, recorded in the transport given. |

### DeleteFunctionModule

| Old | New |
| --- | --- |
| Deletes an ABAP function module, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP function module, recorded in the transport given. |

### CreateInclude

| Old | New |
| --- | --- |
| Creates an ABAP include in a package, with its description and the comment header SAP writes into it, recorded in the transport given. Whether SAP took the change. | Creates an ABAP include in a package, with its description and the comment header SAP writes into it, recorded in the transport given. |

### DeleteInclude

| Old | New |
| --- | --- |
| Deletes an ABAP include, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP include, recorded in the transport given. |

### UpdateInclude

| Old | New |
| --- | --- |
| Updates the source code of an existing ABAP include, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing ABAP include, activating it when asked, recorded in the transport given. |

### UpdateIncludeMetadata

| Old | New |
| --- | --- |
| Updates the stored metadata of an existing ABAP include, replacing it whole, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the stored metadata of an existing ABAP include, replacing it whole, recorded in the transport given. |

### CreateInterface

| Old | New |
| --- | --- |
| Creates an ABAP interface in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an ABAP interface in a package, with its description, recorded in the transport given. |

### DeleteInterface

| Old | New |
| --- | --- |
| Deletes an ABAP interface, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP interface, recorded in the transport given. |

### UpdateInterface

| Old | New |
| --- | --- |
| Updates the source code of an existing ABAP interface, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing ABAP interface, activating it when asked, recorded in the transport given. |

### CreateMessageClass

| Old | New |
| --- | --- |
| Creates an ABAP message class (T100) in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an ABAP message class (T100) in a package, with its description, recorded in the transport given. |

### CreateMessageClassMessage

| Old | New |
| --- | --- |
| Creates a message, with its number and text, in an existing ABAP message class (T100), recorded in the transport given. Whether SAP took the change. | Creates a message in an existing ABAP message class (T100), with its number, text and self-explanatory flag, recorded in the transport given. |

### DeleteMessageClass

| Old | New |
| --- | --- |
| Deletes an ABAP message class (T100) with all its messages, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP message class (T100) with all its messages, recorded in the transport given. |

### DeleteMessageClassMessage

| Old | New |
| --- | --- |
| Deletes one message, by its number, from an ABAP message class (T100), keeping the class and its other messages. Whether SAP deleted the message, the message class, the message number and a sentence saying so. | Deletes one message, by its number, from an ABAP message class (T100), keeping the class and its other messages. |

### UpdateMessageClass

| Old | New |
| --- | --- |
| Updates the description of an existing ABAP message class (T100), recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the description of an existing ABAP message class (T100), recorded in the transport given. |

### UpdateMessageClassMessage

| Old | New |
| --- | --- |
| Updates the text and flags of a message in an ABAP message class (T100), creating the message when the class lacks it, recorded in the transport given. Whether SAP took the change. | Updates the text and flags of a message in an ABAP message class (T100), creating the message when the class lacks it, recorded in the transport given. |

### DeleteMetadataExtension

| Old | New |
| --- | --- |
| Deletes a CDS metadata extension, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes a CDS metadata extension, recorded in the transport given. |

### DeletePackage

| Old | New |
| --- | --- |
| Deletes an ABAP package, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP package, recorded in the transport given. |

### UpdatePackage

| Old | New |
| --- | --- |
| Updates the description of an existing ABAP package, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the description of an existing ABAP package, recorded in the transport given. |

### CreateProgram

| Old | New |
| --- | --- |
| Creates an ABAP program (report) in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an executable ABAP program (report) in a package, with its description and application area, recorded in the transport given. |

### DeleteProgram

| Old | New |
| --- | --- |
| Deletes an ABAP program (report), recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP program (report), recorded in the transport given. |

### UpdateProgram

| Old | New |
| --- | --- |
| Updates the source code of an existing ABAP program (report), activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing ABAP program (report), activating it when asked, recorded in the transport given. |

### CreateServiceBinding

| Old | New |
| --- | --- |
| Creates an OData service binding (V2 or V4, UI or Web API) for a service definition in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an OData V2 or V4 service binding, UI or Web API, for a service definition in a package, with its service name and version. |

### DeleteServiceBinding

| Old | New |
| --- | --- |
| Deletes an OData service binding, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an OData service binding, recorded in the transport given. |

### UpdateServiceBinding

| Old | New |
| --- | --- |
| Updates the publication state of an existing OData service binding, publishing or unpublishing its service. Whether SAP made the change or started it, whether it has completed or runs in the background, SAP's severity, SAP's status text, what a started change means for the service and a lock left held when its release failed. | Updates the publication state of an existing OData service binding, publishing or unpublishing its service. |

### CreateServiceDefinition

| Old | New |
| --- | --- |
| Creates a service definition exposing CDS views as an OData service in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Creates a service definition exposing CDS views as an OData service in a package, with its source code when given, activating it when asked. |

### DeleteServiceDefinition

| Old | New |
| --- | --- |
| Deletes a service definition, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes a service definition, recorded in the transport given. |

### UpdateServiceDefinition

| Old | New |
| --- | --- |
| Updates the source code of an existing service definition, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the source code of an existing service definition, activating it when asked, recorded in the transport given. |

### CreateStructure

| Old | New |
| --- | --- |
| Creates an ABAP structure in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Creates an ABAP structure in a package, with its description, activating it when asked, recorded in the transport given. |

### DeleteStructure

| Old | New |
| --- | --- |
| Deletes an ABAP structure, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP structure, recorded in the transport given. |

### UpdateStructure

| Old | New |
| --- | --- |
| Updates the DDL source of an existing ABAP structure, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the DDL source of an existing ABAP structure, which defines its components, activating it when asked, recorded in the transport given. |

### CreateTable

| Old | New |
| --- | --- |
| Creates an ABAP database table in a package, with its description, recorded in the transport given. Whether SAP took the change. | Creates an ABAP database table by its name in a package, recorded in the transport given. |

### DeleteTable

| Old | New |
| --- | --- |
| Deletes an ABAP database table, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP database table, recorded in the transport given. |

### UpdateTable

| Old | New |
| --- | --- |
| Updates the DDL source of an existing ABAP database table, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed. | Updates the DDL source of an existing ABAP database table, which defines its key, components and delivery class, activating it when asked. |

### UpdateTableSettings

| Old | New |
| --- | --- |
| Updates the technical settings of an existing ABAP database table, each setting given over the stored one, activating the table when asked. Whether SAP took the change and a lock left held when its release failed. | Updates the technical settings of an existing ABAP database table, its data class, size category, buffering and logging, each given over the stored one. |

### CreateTableType

| Old | New |
| --- | --- |
| Creates an ABAP table type in a package, with the type it holds, its access type and primary key, activating it when asked, recorded in the transport given. Whether SAP took the change, a lock left held when its release failed, the version its stored definition was read at and SAP's failure when that read failed. | Creates an ABAP table type in a package, with the type it holds, its access type and primary key, activating it when asked, recorded in the transport given. |

### DeleteTableType

| Old | New |
| --- | --- |
| Deletes an ABAP table type, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it. | Deletes an ABAP table type, recorded in the transport given. |

### UpdateTableType

| Old | New |
| --- | --- |
| Updates the definition of an existing ABAP table type : its description, the type it holds, its access type and primary key, activating it when asked. Whether SAP took the change, a lock left held when its release failed, the version its stored definition was read at and SAP's failure when that read failed. | Updates the definition of an existing ABAP table type: its description, the type it holds, its access type and primary key, activating it when asked. |

### UpdateTextElements

| Old | New |
| --- | --- |
| Updates the text elements of an existing ABAP program, function group or class, each part given replacing its stored one, activating the object when asked. Whether SAP took the change and a lock left held when its release failed. For each part SAP saved: its name and what was saved. | Updates the text elements of an existing ABAP program, function group or class, each part given replacing its stored one, activating the object when asked. |

### CreateCdsUnitTest

| Old | New |
| --- | --- |
| Creates an ABAP Unit test class for a CDS view in a package, from the test class source given, once the view supports CDS test doubles. Whether SAP took the change. | Creates an ABAP Unit test class for a CDS view in a package, from the test class source given, once the view supports CDS test doubles. |

### CreateFunctionGroupUnitTest

| Old | New |
| --- | --- |
| Creates the ABAP Unit test classes of an ABAP function group from the test class source given, in a test include activated with the group. Whether SAP took the change. | Creates the ABAP Unit test classes of an ABAP function group from the test class source given, in a test include activated with the group. |

### CreateProgramUnitTest

| Old | New |
| --- | --- |
| Creates the ABAP Unit test classes of an ABAP report from the test class source given, in a test include of the report, and activates the report. Whether SAP took the change. | Creates the ABAP Unit test classes of an ABAP report from the test class source given, in a test include of the report, and activates the report. |

### CreateUnitTest

| Old | New |
| --- | --- |
| Creates the ABAP Unit test classes of an ABAP class from the test class source given, as its local test classes, and activates the class. Whether SAP took the change. | Creates the ABAP Unit test classes of an ABAP class from the test class source given, as its local test classes, and activates the class. |

### DeleteCdsUnitTest

| Old | New |
| --- | --- |
| Deletes a CDS view test class, with the ABAP Unit test classes it holds. Whether SAP deleted the object, its name and SAP's message about it. | Deletes a CDS view test class, with the ABAP Unit test classes it holds. |

### DeleteUnitTest

| Old | New |
| --- | --- |
| Deletes the ABAP Unit test classes of an ABAP class, keeping the class. Whether SAP took the change. | Deletes the ABAP Unit test classes of an ABAP class, keeping the class. |

### UpdateCdsUnitTest

| Old | New |
| --- | --- |
| Updates the ABAP Unit test classes of a CDS view test class from the test class source given, activating it, recorded in the transport given. Whether SAP took the change. | Updates the ABAP Unit test classes of a CDS view test class from the test class source given, activating it, recorded in the transport given. |

### UpdateFunctionGroupUnitTest

| Old | New |
| --- | --- |
| Updates the ABAP Unit test classes of an ABAP function group from the test class source given, activating the group, recorded in the transport given. Whether SAP took the change. | Updates the ABAP Unit test classes of an ABAP function group from the test class source given, activating the group, recorded in the transport given. |

### UpdateProgramUnitTest

| Old | New |
| --- | --- |
| Updates the ABAP Unit test classes of an ABAP report from the test class source given, activating the report, recorded in the transport given. Whether SAP took the change. | Updates the ABAP Unit test classes of an ABAP report from the test class source given, activating the report, recorded in the transport given. |

### UpdateUnitTest

| Old | New |
| --- | --- |
| Updates the ABAP Unit test classes of an ABAP class from the test class source given, activating the class, recorded in the transport given. Whether SAP took the change. | Updates the ABAP Unit test classes of an ABAP class from the test class source given, activating the class, recorded in the transport given. |

## The low-level writes (served on the low-level surface, outside the tool pages)

### UpdateBehaviorDefinitionLow

| Old | New |
| --- | --- |
| [low-level] Updates the source code of an existing RAP behavior definition, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the source code of an existing RAP behavior definition, under a lock the caller holds. |

### UpdateClassLow

| Old | New |
| --- | --- |
| [low-level] Updates the source code of an existing ABAP class, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the source code of an existing ABAP class, under a lock the caller holds. |

### UpdateDataElementLow

| Old | New |
| --- | --- |
| [low-level] Updates the properties of an existing ABAP data element, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the type, labels, search help and SET/GET parameter of an existing ABAP data element, under a lock the caller holds. |

### UpdateDdlLow

| Old | New |
| --- | --- |
| [low-level] Updates the DDL source of an existing CDS view or classic DDL view, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the DDL source of an existing CDS view or classic DDL view, under a lock the caller holds. |

### UpdateDomainLow

| Old | New |
| --- | --- |
| [low-level] Updates the properties of an existing ABAP domain, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the data type, length, decimals, conversion exit, value table and fixed values of an existing ABAP domain, under a lock the caller holds. |

### UpdateFunctionModuleLow

| Old | New |
| --- | --- |
| [low-level] Updates the source code of an existing ABAP function module, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the source code of an existing ABAP function module in its function group, under a lock the caller holds. |

### UpdateInterfaceLow

| Old | New |
| --- | --- |
| [low-level] Updates the source code of an existing ABAP interface, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the source code of an existing ABAP interface, under a lock the caller holds. |

### UpdateMetadataExtensionLow

| Old | New |
| --- | --- |
| [low-level] Updates the source code of an existing CDS metadata extension, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the source code of an existing CDS metadata extension, under a lock the caller holds. |

### UpdatePackageLow

| Old | New |
| --- | --- |
| [low-level] Updates the description of an existing ABAP package, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the description of an existing ABAP package, under a lock the caller holds. |

### UpdateProgramLow

| Old | New |
| --- | --- |
| [low-level] Updates the source code of an existing ABAP program (report), under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the source code of an existing ABAP program (report), under a lock the caller holds. |

### UpdateStructureLow

| Old | New |
| --- | --- |
| [low-level] Updates the DDL source of an existing ABAP structure, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the DDL source of an existing ABAP structure, which defines its components, under a lock the caller holds. |

### UpdateTableLow

| Old | New |
| --- | --- |
| [low-level] Updates the DDL source of an existing ABAP database table, under a lock the caller holds. Whether SAP took the change. | [low-level] Updates the DDL source of an existing ABAP database table, which defines its key, components and delivery class, under a lock the caller holds. |
