# Available Tools Reference - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

## Summary

- Total tools: 353
- Read-only tools: 64
- High-level tools: 165
- Low-level tools: 124

- Compact tools: 22 (included in High-level group)

## Handler Sets

- `readonly` -> [Read-Only Group](#read-only-group)
- `high` -> [High-Level Group](#high-level-group)
- `low` -> [Low-Level Group](#low-level-group)
- `compact` -> [High-Level / Compact](#high-level-compact)

## Navigation

- [Compact Set](#high-level-compact)
- [Read-Only Group](#read-only-group)
  - [Behavior Definition](#read-only-behavior-definition)
    - [ReadBehaviorDefinition](#readbehaviordefinition-read-only-behavior-definition)
  - [Behavior Implementation](#read-only-behavior-implementation)
    - [ReadBehaviorImplementation](#readbehaviorimplementation-read-only-behavior-implementation)
  - [Class](#read-only-class)
    - [ReadClass](#readclass-read-only-class)
  - [Common](#read-only-common)
    - [GetObjectVersionDiff](#getobjectversiondiff-read-only-common)
    - [GetObjectVersions](#getobjectversions-read-only-common)
    - [GetObjectVersionSource](#getobjectversionsource-read-only-common)
  - [Data Element](#read-only-data-element)
    - [ReadDataElement](#readdataelement-read-only-data-element)
  - [Ddl](#read-only-ddl)
    - [ReadDdl](#readddl-read-only-ddl)
  - [Domain](#read-only-domain)
    - [ReadDomain](#readdomain-read-only-domain)
  - [Enhancement](#read-only-enhancement)
    - [GetEnhancementImpl](#getenhancementimpl-read-only-enhancement)
    - [GetEnhancements](#getenhancements-read-only-enhancement)
    - [GetEnhancementSpot](#getenhancementspot-read-only-enhancement)
  - [Function Group](#read-only-function-group)
    - [ReadFunctionGroup](#readfunctiongroup-read-only-function-group)
  - [Function Include](#read-only-function-include)
    - [ListFunctionGroupIncludes](#listfunctiongroupincludes-read-only-function-include)
    - [ListFunctionModules](#listfunctionmodules-read-only-function-include)
    - [ReadFunctionInclude](#readfunctioninclude-read-only-function-include)
  - [Function Module](#read-only-function-module)
    - [ReadFunctionModule](#readfunctionmodule-read-only-function-module)
  - [Include](#read-only-include)
    - [GetInclude](#getinclude-read-only-include)
    - [GetIncludesList](#getincludeslist-read-only-include)
  - [Interface](#read-only-interface)
    - [ReadInterface](#readinterface-read-only-interface)
  - [Message Class](#read-only-message-class)
    - [ReadMessageClass](#readmessageclass-read-only-message-class)
    - [ReadMessageClassMessage](#readmessageclassmessage-read-only-message-class)
  - [Metadata Extension](#read-only-metadata-extension)
    - [ReadMetadataExtension](#readmetadataextension-read-only-metadata-extension)
  - [Package](#read-only-package)
    - [GetPackageContents](#getpackagecontents-read-only-package)
    - [ReadPackage](#readpackage-read-only-package)
  - [Program](#read-only-program)
    - [ReadProgram](#readprogram-read-only-program)
  - [Search](#read-only-search)
    - [GetObjectsByType](#getobjectsbytype-read-only-search)
    - [GetObjectsList](#getobjectslist-read-only-search)
    - [SearchObject](#searchobject-read-only-search)
  - [Service Binding](#read-only-service-binding)
    - [ReadServiceBinding](#readservicebinding-read-only-service-binding)
  - [Service Definition](#read-only-service-definition)
    - [ReadServiceDefinition](#readservicedefinition-read-only-service-definition)
  - [Structure](#read-only-structure)
    - [GetStructuresList](#getstructureslist-read-only-structure)
    - [ReadStructure](#readstructure-read-only-structure)
  - [System](#read-only-system)
    - [DescribeByList](#describebylist-read-only-system)
    - [GetAbapAST](#getabapast-read-only-system)
    - [GetAbapSemanticAnalysis](#getabapsemanticanalysis-read-only-system)
    - [GetAbapSystemSymbols](#getabapsystemsymbols-read-only-system)
    - [GetAdtTypes](#getadttypes-read-only-system)
    - [GetInactiveObjects](#getinactiveobjects-read-only-system)
    - [GetObjectInfo](#getobjectinfo-read-only-system)
    - [GetObjectNodeFromCache](#getobjectnodefromcache-read-only-system)
    - [GetObjectStructure](#getobjectstructure-read-only-system)
    - [GetSession](#getsession-read-only-system)
    - [GetSqlQuery](#getsqlquery-read-only-system)
    - [GetTransaction](#gettransaction-read-only-system)
    - [GetTypeInfo](#gettypeinfo-read-only-system)
    - [GetWhereUsed](#getwhereused-read-only-system)
    - [RuntimeAnalyzeProfilerTrace](#runtimeanalyzeprofilertrace-read-only-system)
    - [RuntimeCreateProfilerTraceParameters](#runtimecreateprofilertraceparameters-read-only-system)
    - [RuntimeGetDumpById](#runtimegetdumpbyid-read-only-system)
    - [RuntimeGetGatewayErrorLog](#runtimegetgatewayerrorlog-read-only-system)
    - [RuntimeGetProfilerTraceData](#runtimegetprofilertracedata-read-only-system)
    - [RuntimeListFeeds](#runtimelistfeeds-read-only-system)
    - [RuntimeListProfilerTraceFiles](#runtimelistprofilertracefiles-read-only-system)
    - [RuntimeListSystemMessages](#runtimelistsystemmessages-read-only-system)
    - [RuntimeRunClass](#runtimerunclass-read-only-system)
    - [RuntimeRunClassWithProfiling](#runtimerunclasswithprofiling-read-only-system)
    - [RuntimeRunProgram](#runtimerunprogram-read-only-system)
    - [RuntimeRunProgramWithProfiling](#runtimerunprogramwithprofiling-read-only-system)
    - [SearchSource](#searchsource-read-only-system)
  - [Table](#read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
    - [ReadTable](#readtable-read-only-table)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ListTransports](#listtransports-read-only-transport)
- [High-Level Group](#high-level-group)
  - [Behavior Definition](#high-level-behavior-definition)
    - [CheckBehaviorDefinition](#checkbehaviordefinition-high-level-behavior-definition)
    - [CreateBehaviorDefinition](#createbehaviordefinition-high-level-behavior-definition)
    - [DeleteBehaviorDefinition](#deletebehaviordefinition-high-level-behavior-definition)
    - [GetBehaviorDefinition](#getbehaviordefinition-high-level-behavior-definition)
    - [UpdateBehaviorDefinition](#updatebehaviordefinition-high-level-behavior-definition)
  - [Behavior Implementation](#high-level-behavior-implementation)
    - [CreateBehaviorImplementation](#createbehaviorimplementation-high-level-behavior-implementation)
    - [DeleteBehaviorImplementation](#deletebehaviorimplementation-high-level-behavior-implementation)
    - [GetBehaviorImplementation](#getbehaviorimplementation-high-level-behavior-implementation)
    - [UpdateBehaviorImplementation](#updatebehaviorimplementation-high-level-behavior-implementation)
  - [Class](#high-level-class)
    - [CheckClass](#checkclass-high-level-class)
    - [CreateClass](#createclass-high-level-class)
    - [DeleteClass](#deleteclass-high-level-class)
    - [DeleteLocalDefinitions](#deletelocaldefinitions-high-level-class)
    - [DeleteLocalMacros](#deletelocalmacros-high-level-class)
    - [DeleteLocalTestClass](#deletelocaltestclass-high-level-class)
    - [DeleteLocalTypes](#deletelocaltypes-high-level-class)
    - [GetClass](#getclass-high-level-class)
    - [GetLocalDefinitions](#getlocaldefinitions-high-level-class)
    - [GetLocalMacros](#getlocalmacros-high-level-class)
    - [GetLocalTestClass](#getlocaltestclass-high-level-class)
    - [GetLocalTypes](#getlocaltypes-high-level-class)
    - [UpdateClass](#updateclass-high-level-class)
    - [UpdateLocalDefinitions](#updatelocaldefinitions-high-level-class)
    - [UpdateLocalMacros](#updatelocalmacros-high-level-class)
    - [UpdateLocalTestClass](#updatelocaltestclass-high-level-class)
    - [UpdateLocalTypes](#updatelocaltypes-high-level-class)
  - [Common](#high-level-common)
    - [ActivateObjects](#activateobjects-high-level-common)
    - [GetBehaviorDefinitionVersionDiff](#getbehaviordefinitionversiondiff-high-level-common)
    - [GetBehaviorDefinitionVersions](#getbehaviordefinitionversions-high-level-common)
    - [GetBehaviorDefinitionVersionSource](#getbehaviordefinitionversionsource-high-level-common)
    - [GetClassVersionDiff](#getclassversiondiff-high-level-common)
    - [GetClassVersions](#getclassversions-high-level-common)
    - [GetClassVersionSource](#getclassversionsource-high-level-common)
    - [GetDdlVersionDiff](#getddlversiondiff-high-level-common)
    - [GetDdlVersions](#getddlversions-high-level-common)
    - [GetDdlVersionSource](#getddlversionsource-high-level-common)
    - [GetFunctionModuleVersionDiff](#getfunctionmoduleversiondiff-high-level-common)
    - [GetFunctionModuleVersions](#getfunctionmoduleversions-high-level-common)
    - [GetFunctionModuleVersionSource](#getfunctionmoduleversionsource-high-level-common)
    - [GetInterfaceVersionDiff](#getinterfaceversiondiff-high-level-common)
    - [GetInterfaceVersions](#getinterfaceversions-high-level-common)
    - [GetInterfaceVersionSource](#getinterfaceversionsource-high-level-common)
    - [GetMetadataExtensionVersionDiff](#getmetadataextensionversiondiff-high-level-common)
    - [GetMetadataExtensionVersions](#getmetadataextensionversions-high-level-common)
    - [GetMetadataExtensionVersionSource](#getmetadataextensionversionsource-high-level-common)
    - [GetProgramVersionDiff](#getprogramversiondiff-high-level-common)
    - [GetProgramVersions](#getprogramversions-high-level-common)
    - [GetProgramVersionSource](#getprogramversionsource-high-level-common)
    - [GetStructureVersionDiff](#getstructureversiondiff-high-level-common)
    - [GetStructureVersions](#getstructureversions-high-level-common)
    - [GetStructureVersionSource](#getstructureversionsource-high-level-common)
    - [GetTableVersionDiff](#gettableversiondiff-high-level-common)
    - [GetTableVersions](#gettableversions-high-level-common)
    - [GetTableVersionSource](#gettableversionsource-high-level-common)
  - [Compact](#high-level-compact)
    - [HandlerActivate](#handleractivate-high-level-compact)
    - [HandlerCdsUnitTestResult](#handlercdsunittestresult-high-level-compact)
    - [HandlerCdsUnitTestStatus](#handlercdsunitteststatus-high-level-compact)
    - [HandlerCheckRun](#handlercheckrun-high-level-compact)
    - [HandlerCreate](#handlercreate-high-level-compact)
    - [HandlerDelete](#handlerdelete-high-level-compact)
    - [HandlerDumpList](#handlerdumplist-high-level-compact)
    - [HandlerDumpView](#handlerdumpview-high-level-compact)
    - [HandlerGet](#handlerget-high-level-compact)
    - [HandlerLock](#handlerlock-high-level-compact)
    - [HandlerProfileList](#handlerprofilelist-high-level-compact)
    - [HandlerProfileRun](#handlerprofilerun-high-level-compact)
    - [HandlerProfileView](#handlerprofileview-high-level-compact)
    - [HandlerServiceBindingListTypes](#handlerservicebindinglisttypes-high-level-compact)
    - [HandlerServiceBindingValidate](#handlerservicebindingvalidate-high-level-compact)
    - [HandlerTransportCreate](#handlertransportcreate-high-level-compact)
    - [HandlerUnitTestResult](#handlerunittestresult-high-level-compact)
    - [HandlerUnitTestRun](#handlerunittestrun-high-level-compact)
    - [HandlerUnitTestStatus](#handlerunitteststatus-high-level-compact)
    - [HandlerUnlock](#handlerunlock-high-level-compact)
    - [HandlerUpdate](#handlerupdate-high-level-compact)
    - [HandlerValidate](#handlervalidate-high-level-compact)
  - [Data Element](#high-level-data-element)
    - [CheckDataElement](#checkdataelement-high-level-data-element)
    - [CreateDataElement](#createdataelement-high-level-data-element)
    - [DeleteDataElement](#deletedataelement-high-level-data-element)
    - [GetDataElement](#getdataelement-high-level-data-element)
    - [UpdateDataElement](#updatedataelement-high-level-data-element)
  - [Ddl](#high-level-ddl)
    - [CheckDdl](#checkddl-high-level-ddl)
    - [CreateDdl](#createddl-high-level-ddl)
    - [DeleteDdl](#deleteddl-high-level-ddl)
    - [GetDdl](#getddl-high-level-ddl)
    - [UpdateDdl](#updateddl-high-level-ddl)
  - [Ddlx](#high-level-ddlx)
    - [CheckMetadataExtension](#checkmetadataextension-high-level-ddlx)
    - [CreateMetadataExtension](#createmetadataextension-high-level-ddlx)
    - [UpdateMetadataExtension](#updatemetadataextension-high-level-ddlx)
  - [Domain](#high-level-domain)
    - [CheckDomain](#checkdomain-high-level-domain)
    - [CreateDomain](#createdomain-high-level-domain)
    - [DeleteDomain](#deletedomain-high-level-domain)
    - [GetDomain](#getdomain-high-level-domain)
    - [UpdateDomain](#updatedomain-high-level-domain)
  - [Function](#high-level-function)
    - [CheckFunctionGroup](#checkfunctiongroup-high-level-function)
    - [CheckFunctionModule](#checkfunctionmodule-high-level-function)
    - [CreateFunctionGroup](#createfunctiongroup-high-level-function)
    - [CreateFunctionModule](#createfunctionmodule-high-level-function)
    - [UpdateFunctionGroup](#updatefunctiongroup-high-level-function)
    - [UpdateFunctionModule](#updatefunctionmodule-high-level-function)
  - [Function Group](#high-level-function-group)
    - [DeleteFunctionGroup](#deletefunctiongroup-high-level-function-group)
    - [GetFunctionGroup](#getfunctiongroup-high-level-function-group)
  - [Function Include](#high-level-function-include)
    - [CreateFunctionInclude](#createfunctioninclude-high-level-function-include)
    - [DeleteFunctionInclude](#deletefunctioninclude-high-level-function-include)
    - [UpdateFunctionInclude](#updatefunctioninclude-high-level-function-include)
  - [Function Module](#high-level-function-module)
    - [DeleteFunctionModule](#deletefunctionmodule-high-level-function-module)
    - [GetFunctionModule](#getfunctionmodule-high-level-function-module)
  - [Interface](#high-level-interface)
    - [CheckInterface](#checkinterface-high-level-interface)
    - [CreateInterface](#createinterface-high-level-interface)
    - [DeleteInterface](#deleteinterface-high-level-interface)
    - [GetInterface](#getinterface-high-level-interface)
    - [UpdateInterface](#updateinterface-high-level-interface)
  - [Message Class](#high-level-message-class)
    - [CreateMessageClass](#createmessageclass-high-level-message-class)
    - [CreateMessageClassMessage](#createmessageclassmessage-high-level-message-class)
    - [DeleteMessageClass](#deletemessageclass-high-level-message-class)
    - [DeleteMessageClassMessage](#deletemessageclassmessage-high-level-message-class)
    - [GetMessageClass](#getmessageclass-high-level-message-class)
    - [GetMessageClassMessage](#getmessageclassmessage-high-level-message-class)
    - [UpdateMessageClass](#updatemessageclass-high-level-message-class)
    - [UpdateMessageClassMessage](#updatemessageclassmessage-high-level-message-class)
  - [Metadata Extension](#high-level-metadata-extension)
    - [DeleteMetadataExtension](#deletemetadataextension-high-level-metadata-extension)
    - [GetMetadataExtension](#getmetadataextension-high-level-metadata-extension)
  - [Package](#high-level-package)
    - [CheckPackage](#checkpackage-high-level-package)
    - [CreatePackage](#createpackage-high-level-package)
    - [GetPackage](#getpackage-high-level-package)
  - [Program](#high-level-program)
    - [CheckProgram](#checkprogram-high-level-program)
    - [CreateProgram](#createprogram-high-level-program)
    - [DeleteProgram](#deleteprogram-high-level-program)
    - [GetProgram](#getprogram-high-level-program)
    - [UpdateProgram](#updateprogram-high-level-program)
  - [Service Binding](#high-level-service-binding)
    - [CreateServiceBinding](#createservicebinding-high-level-service-binding)
    - [DeleteServiceBinding](#deleteservicebinding-high-level-service-binding)
    - [GetServiceBinding](#getservicebinding-high-level-service-binding)
    - [ListServiceBindingTypes](#listservicebindingtypes-high-level-service-binding)
    - [UpdateServiceBinding](#updateservicebinding-high-level-service-binding)
    - [ValidateServiceBinding](#validateservicebinding-high-level-service-binding)
  - [Service Definition](#high-level-service-definition)
    - [CreateServiceDefinition](#createservicedefinition-high-level-service-definition)
    - [DeleteServiceDefinition](#deleteservicedefinition-high-level-service-definition)
    - [GetServiceDefinition](#getservicedefinition-high-level-service-definition)
    - [UpdateServiceDefinition](#updateservicedefinition-high-level-service-definition)
  - [Structure](#high-level-structure)
    - [CheckStructure](#checkstructure-high-level-structure)
    - [CreateStructure](#createstructure-high-level-structure)
    - [DeleteStructure](#deletestructure-high-level-structure)
    - [GetStructure](#getstructure-high-level-structure)
    - [UpdateStructure](#updatestructure-high-level-structure)
  - [System](#high-level-system)
    - [GetPackageTree](#getpackagetree-high-level-system)
  - [Table](#high-level-table)
    - [CheckTable](#checktable-high-level-table)
    - [CreateTable](#createtable-high-level-table)
    - [DeleteTable](#deletetable-high-level-table)
    - [GetTable](#gettable-high-level-table)
    - [UpdateTable](#updatetable-high-level-table)
  - [Transport](#high-level-transport)
    - [CreateTransport](#createtransport-high-level-transport)
  - [Unit Test](#high-level-unit-test)
    - [CreateCdsUnitTest](#createcdsunittest-high-level-unit-test)
    - [CreateUnitTest](#createunittest-high-level-unit-test)
    - [DeleteCdsUnitTest](#deletecdsunittest-high-level-unit-test)
    - [DeleteUnitTest](#deleteunittest-high-level-unit-test)
    - [GetCdsUnitTest](#getcdsunittest-high-level-unit-test)
    - [GetCdsUnitTestResult](#getcdsunittestresult-high-level-unit-test)
    - [GetCdsUnitTestStatus](#getcdsunitteststatus-high-level-unit-test)
    - [GetUnitTest](#getunittest-high-level-unit-test)
    - [GetUnitTestResult](#getunittestresult-high-level-unit-test)
    - [GetUnitTestStatus](#getunitteststatus-high-level-unit-test)
    - [RunUnitTest](#rununittest-high-level-unit-test)
    - [UpdateCdsUnitTest](#updatecdsunittest-high-level-unit-test)
    - [UpdateUnitTest](#updateunittest-high-level-unit-test)
- [Low-Level Group](#low-level-group)
  - [Behavior Definition](#low-level-behavior-definition)
    - [ActivateBehaviorDefinitionLow](#activatebehaviordefinitionlow-low-level-behavior-definition)
    - [CheckBdefLow](#checkbdeflow-low-level-behavior-definition)
    - [CreateBehaviorDefinitionLow](#createbehaviordefinitionlow-low-level-behavior-definition)
    - [DeleteBehaviorDefinitionLow](#deletebehaviordefinitionlow-low-level-behavior-definition)
    - [LockBehaviorDefinitionLow](#lockbehaviordefinitionlow-low-level-behavior-definition)
    - [UnlockBehaviorDefinitionLow](#unlockbehaviordefinitionlow-low-level-behavior-definition)
    - [UpdateBehaviorDefinitionLow](#updatebehaviordefinitionlow-low-level-behavior-definition)
    - [ValidateBehaviorDefinitionLow](#validatebehaviordefinitionlow-low-level-behavior-definition)
  - [Behavior Implementation](#low-level-behavior-implementation)
    - [CreateBehaviorImplementationLow](#createbehaviorimplementationlow-low-level-behavior-implementation)
    - [LockBehaviorImplementationLow](#lockbehaviorimplementationlow-low-level-behavior-implementation)
    - [ValidateBehaviorImplementationLow](#validatebehaviorimplementationlow-low-level-behavior-implementation)
  - [Class](#low-level-class)
    - [ActivateClassLow](#activateclasslow-low-level-class)
    - [ActivateClassTestClassesLow](#activateclasstestclasseslow-low-level-class)
    - [CheckClassLow](#checkclasslow-low-level-class)
    - [CreateClassLow](#createclasslow-low-level-class)
    - [DeleteClassLow](#deleteclasslow-low-level-class)
    - [GetClassUnitTestResultLow](#getclassunittestresultlow-low-level-class)
    - [GetClassUnitTestStatusLow](#getclassunitteststatuslow-low-level-class)
    - [LockClassLow](#lockclasslow-low-level-class)
    - [LockClassTestClassesLow](#lockclasstestclasseslow-low-level-class)
    - [RunClassUnitTestsLow](#runclassunittestslow-low-level-class)
    - [UnlockClassLow](#unlockclasslow-low-level-class)
    - [UnlockClassTestClassesLow](#unlockclasstestclasseslow-low-level-class)
    - [UpdateClassLow](#updateclasslow-low-level-class)
    - [UpdateClassTestClassesLow](#updateclasstestclasseslow-low-level-class)
    - [ValidateClassLow](#validateclasslow-low-level-class)
  - [Common](#low-level-common)
    - [ActivateObjectLow](#activateobjectlow-low-level-common)
    - [CheckObjectLow](#checkobjectlow-low-level-common)
    - [DeleteObjectLow](#deleteobjectlow-low-level-common)
    - [LockObjectLow](#lockobjectlow-low-level-common)
    - [UnlockObjectLow](#unlockobjectlow-low-level-common)
    - [ValidateObjectLow](#validateobjectlow-low-level-common)
  - [Data Element](#low-level-data-element)
    - [ActivateDataElementLow](#activatedataelementlow-low-level-data-element)
    - [CheckDataElementLow](#checkdataelementlow-low-level-data-element)
    - [CreateDataElementLow](#createdataelementlow-low-level-data-element)
    - [DeleteDataElementLow](#deletedataelementlow-low-level-data-element)
    - [LockDataElementLow](#lockdataelementlow-low-level-data-element)
    - [UnlockDataElementLow](#unlockdataelementlow-low-level-data-element)
    - [UpdateDataElementLow](#updatedataelementlow-low-level-data-element)
    - [ValidateDataElementLow](#validatedataelementlow-low-level-data-element)
  - [Ddl](#low-level-ddl)
    - [ActivateDdlLow](#activateddllow-low-level-ddl)
    - [CheckDdlLow](#checkddllow-low-level-ddl)
    - [CreateDdlLow](#createddllow-low-level-ddl)
    - [DeleteDdlLow](#deleteddllow-low-level-ddl)
    - [LockDdlLow](#lockddllow-low-level-ddl)
    - [UnlockDdlLow](#unlockddllow-low-level-ddl)
    - [UpdateDdlLow](#updateddllow-low-level-ddl)
    - [ValidateDdlLow](#validateddllow-low-level-ddl)
  - [Ddlx](#low-level-ddlx)
    - [ActivateMetadataExtensionLow](#activatemetadataextensionlow-low-level-ddlx)
    - [CheckMetadataExtensionLow](#checkmetadataextensionlow-low-level-ddlx)
    - [CreateMetadataExtensionLow](#createmetadataextensionlow-low-level-ddlx)
    - [DeleteMetadataExtensionLow](#deletemetadataextensionlow-low-level-ddlx)
    - [LockMetadataExtensionLow](#lockmetadataextensionlow-low-level-ddlx)
    - [UnlockMetadataExtensionLow](#unlockmetadataextensionlow-low-level-ddlx)
    - [UpdateMetadataExtensionLow](#updatemetadataextensionlow-low-level-ddlx)
    - [ValidateMetadataExtensionLow](#validatemetadataextensionlow-low-level-ddlx)
  - [Domain](#low-level-domain)
    - [ActivateDomainLow](#activatedomainlow-low-level-domain)
    - [CheckDomainLow](#checkdomainlow-low-level-domain)
    - [CreateDomainLow](#createdomainlow-low-level-domain)
    - [DeleteDomainLow](#deletedomainlow-low-level-domain)
    - [LockDomainLow](#lockdomainlow-low-level-domain)
    - [UnlockDomainLow](#unlockdomainlow-low-level-domain)
    - [UpdateDomainLow](#updatedomainlow-low-level-domain)
    - [ValidateDomainLow](#validatedomainlow-low-level-domain)
  - [Function](#low-level-function)
    - [ActivateFunctionGroupLow](#activatefunctiongrouplow-low-level-function)
    - [ActivateFunctionModuleLow](#activatefunctionmodulelow-low-level-function)
    - [CheckFunctionGroupLow](#checkfunctiongrouplow-low-level-function)
    - [CheckFunctionModuleLow](#checkfunctionmodulelow-low-level-function)
    - [CreateFunctionGroupLow](#createfunctiongrouplow-low-level-function)
    - [CreateFunctionModuleLow](#createfunctionmodulelow-low-level-function)
    - [DeleteFunctionGroupLow](#deletefunctiongrouplow-low-level-function)
    - [DeleteFunctionModuleLow](#deletefunctionmodulelow-low-level-function)
    - [LockFunctionGroupLow](#lockfunctiongrouplow-low-level-function)
    - [LockFunctionModuleLow](#lockfunctionmodulelow-low-level-function)
    - [UnlockFunctionGroupLow](#unlockfunctiongrouplow-low-level-function)
    - [UnlockFunctionModuleLow](#unlockfunctionmodulelow-low-level-function)
    - [UpdateFunctionModuleLow](#updatefunctionmodulelow-low-level-function)
    - [ValidateFunctionGroupLow](#validatefunctiongrouplow-low-level-function)
    - [ValidateFunctionModuleLow](#validatefunctionmodulelow-low-level-function)
  - [Interface](#low-level-interface)
    - [ActivateInterfaceLow](#activateinterfacelow-low-level-interface)
    - [CheckInterfaceLow](#checkinterfacelow-low-level-interface)
    - [CreateInterfaceLow](#createinterfacelow-low-level-interface)
    - [DeleteInterfaceLow](#deleteinterfacelow-low-level-interface)
    - [LockInterfaceLow](#lockinterfacelow-low-level-interface)
    - [UnlockInterfaceLow](#unlockinterfacelow-low-level-interface)
    - [UpdateInterfaceLow](#updateinterfacelow-low-level-interface)
    - [ValidateInterfaceLow](#validateinterfacelow-low-level-interface)
  - [Package](#low-level-package)
    - [CheckPackageLow](#checkpackagelow-low-level-package)
    - [CreatePackageLow](#createpackagelow-low-level-package)
    - [DeletePackageLow](#deletepackagelow-low-level-package)
    - [LockPackageLow](#lockpackagelow-low-level-package)
    - [UnlockPackageLow](#unlockpackagelow-low-level-package)
    - [UpdatePackageLow](#updatepackagelow-low-level-package)
    - [ValidatePackageLow](#validatepackagelow-low-level-package)
  - [Program](#low-level-program)
    - [ActivateProgramLow](#activateprogramlow-low-level-program)
    - [CheckProgramLow](#checkprogramlow-low-level-program)
    - [CreateProgramLow](#createprogramlow-low-level-program)
    - [DeleteProgramLow](#deleteprogramlow-low-level-program)
    - [LockProgramLow](#lockprogramlow-low-level-program)
    - [UnlockProgramLow](#unlockprogramlow-low-level-program)
    - [UpdateProgramLow](#updateprogramlow-low-level-program)
    - [ValidateProgramLow](#validateprogramlow-low-level-program)
  - [Service Binding](#low-level-service-binding)
    - [ActivateServiceBindingLow](#activateservicebindinglow-low-level-service-binding)
  - [Service Definition](#low-level-service-definition)
    - [ActivateServiceDefinitionLow](#activateservicedefinitionlow-low-level-service-definition)
  - [Structure](#low-level-structure)
    - [ActivateStructureLow](#activatestructurelow-low-level-structure)
    - [CheckStructureLow](#checkstructurelow-low-level-structure)
    - [CreateStructureLow](#createstructurelow-low-level-structure)
    - [DeleteStructureLow](#deletestructurelow-low-level-structure)
    - [LockStructureLow](#lockstructurelow-low-level-structure)
    - [UnlockStructureLow](#unlockstructurelow-low-level-structure)
    - [UpdateStructureLow](#updatestructurelow-low-level-structure)
    - [ValidateStructureLow](#validatestructurelow-low-level-structure)
  - [System](#low-level-system)
    - [GetNodeStructureLow](#getnodestructurelow-low-level-system)
    - [GetObjectStructureLow](#getobjectstructurelow-low-level-system)
    - [GetVirtualFoldersLow](#getvirtualfolderslow-low-level-system)
  - [Table](#low-level-table)
    - [ActivateTableLow](#activatetablelow-low-level-table)
    - [CheckTableLow](#checktablelow-low-level-table)
    - [CreateTableLow](#createtablelow-low-level-table)
    - [DeleteTableLow](#deletetablelow-low-level-table)
    - [LockTableLow](#locktablelow-low-level-table)
    - [UnlockTableLow](#unlocktablelow-low-level-table)
    - [UpdateTableLow](#updatetablelow-low-level-table)
    - [ValidateTableLow](#validatetablelow-low-level-table)
  - [Transport](#low-level-transport)
    - [CreateTransportLow](#createtransportlow-low-level-transport)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-behavior-definition"></a>
### Read-Only / Behavior Definition

<a id="readbehaviordefinition-read-only-behavior-definition"></a>
#### ReadBehaviorDefinition (Read-Only / Behavior Definition)
**Description:** Operation: Read, Create, Update. Subject: BehaviorDefinition. Will be useful for reading, creating, or updating behavior definition. [read-only] Read ABAP RAP behavior definition (BDEF) source code and metadata. Answers: "show behavior definition", "display BDEF source", "view RAP behavior X", "get behavior definition code". Returns source code, package, responsible, description.

**Source:** `src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - Behavior definition name (e.g., Z_MY_BDEF).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-behavior-implementation"></a>
### Read-Only / Behavior Implementation

<a id="readbehaviorimplementation-read-only-behavior-implementation"></a>
#### ReadBehaviorImplementation (Read-Only / Behavior Implementation)
**Description:** [read-only] Read ABAP RAP behavior implementation source code and metadata. Answers: "show behavior implementation", "display behavior pool code", "view RAP implementation X". Returns source code, package, responsible, description.

**Source:** `src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - Behavior implementation name (e.g., ZBP_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-class"></a>
### Read-Only / Class

<a id="readclass-read-only-class"></a>
#### ReadClass (Read-Only / Class)
**Description:** Operation: Read, Create, Update. Subject: Class. Will be useful for reading, creating, or updating class. [read-only] Read ABAP class source code and metadata. Answers: "show class code", "display class source", "view class definition/implementation", "get class X". Returns source code, package, responsible, description.

**Source:** `src/handlers/class/readonly/handleReadClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-common"></a>
### Read-Only / Common

<a id="getobjectversiondiff-read-only-common"></a>
#### GetObjectVersionDiff (Read-Only / Common)
**Description:** [read-only] Compute a unified diff between two object versions. Pass the two opaque content_uris from GetObjectVersions entries; returns the unified diff (jsdiff) of their sources.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionDiff.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetObjectVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetObjectVersions entry).
- `object_type` (string, required) - Object type (same value used in GetObjectVersions).

---

<a id="getobjectversions-read-only-common"></a>
#### GetObjectVersions (Read-Only / Common)
**Description:** [read-only] List the version history of an ABAP object. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version source via GetObjectVersionSource.

**Source:** `src/handlers/common/readonly/handleGetObjectVersions.ts`

**Parameters:**
- `function_group_name` (string, optional) - Owning function group name. Required when object_type is function_module.
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, ZIF_MY_INTERFACE, Z_MY_TABLE).
- `object_type` (string, required) - Object type.

---

<a id="getobjectversionsource-read-only-common"></a>
#### GetObjectVersionSource (Read-Only / Common)
**Description:** [read-only] Fetch the source code of a specific object version. Pass the opaque content_uri from a GetObjectVersions entry.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionSource.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetObjectVersions version entry.
- `object_type` (string, required) - Object type (same value used in GetObjectVersions).

---

<a id="read-only-data-element"></a>
### Read-Only / Data Element

<a id="readdataelement-read-only-data-element"></a>
#### ReadDataElement (Read-Only / Data Element)
**Description:** Operation: Read, Create, Update. Subject: DataElement. Will be useful for reading, creating, or updating data element. [read-only] Read ABAP data element definition and metadata. Answers: "show data element X", "display data element properties", "view DTEL definition", "get data element type". Returns definition, domain, package, responsible, description.

**Source:** `src/handlers/data_element/readonly/handleReadDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-ddl"></a>
### Read-Only / Ddl

<a id="readddl-read-only-ddl"></a>
#### ReadDdl (Read-Only / Ddl)
**Description:** Operation: Read, Create, Update. Subject: DDL source. Will be useful for reading, creating, or updating a DDL source. [read-only] Read ABAP CDS view source code and metadata. Answers: "show CDS view source", "display view definition", "view CDS X", "get CDS code". Returns source code, package, responsible, description.

**Source:** `src/handlers/ddl/readonly/handleReadDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_VIEW).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-domain"></a>
### Read-Only / Domain

<a id="readdomain-read-only-domain"></a>
#### ReadDomain (Read-Only / Domain)
**Description:** Operation: Read, Create, Update. Subject: Domain. Will be useful for reading, creating, or updating domain. [read-only] Read ABAP domain definition and metadata. Answers: "show domain X", "display domain fixed values", "view domain definition", "get domain properties". Returns definition, fixed values, package, responsible, description.

**Source:** `src/handlers/domain/readonly/handleReadDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-enhancement"></a>
### Read-Only / Enhancement

<a id="getenhancementimpl-read-only-enhancement"></a>
#### GetEnhancementImpl (Read-Only / Enhancement)
**Description:** [read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts`

**Parameters:**
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="getenhancements-read-only-enhancement"></a>
#### GetEnhancements (Read-Only / Enhancement)
**Description:** [read-only] Retrieve a list of enhancements for a given ABAP object.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancements.ts`

**Parameters:**
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - [read-only] Type of the ABAP object

---

<a id="getenhancementspot-read-only-enhancement"></a>
#### GetEnhancementSpot (Read-Only / Enhancement)
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="read-only-function-group"></a>
### Read-Only / Function Group

<a id="readfunctiongroup-read-only-function-group"></a>
#### ReadFunctionGroup (Read-Only / Function Group)
**Description:** [read-only] Read ABAP function group source code and metadata. Answers: "show function group code", "display FUGR source", "view function group X", "get function group includes". Returns source code, package, responsible, description.

**Source:** `src/handlers/function_group/readonly/handleReadFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_MY_FG).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-function-include"></a>
### Read-Only / Function Include

<a id="listfunctiongroupincludes-read-only-function-include"></a>
#### ListFunctionGroupIncludes (Read-Only / Function Include)
**Description:** [read-only] List the includes (TOP, custom) of an ABAP function group.

**Source:** `src/handlers/function_include/readonly/handleListFunctionGroupIncludes.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_MY_FG).

---

<a id="listfunctionmodules-read-only-function-include"></a>
#### ListFunctionModules (Read-Only / Function Include)
**Description:** [read-only] List the function modules of an ABAP function group.

**Source:** `src/handlers/function_include/readonly/handleListFunctionModules.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_MY_FG).

---

<a id="readfunctioninclude-read-only-function-include"></a>
#### ReadFunctionInclude (Read-Only / Function Include)
**Description:** [read-only] Read ABAP function group include source code and metadata. Answers: "show function group include code", "display include source", "view include of function group". Returns source code and include metadata.

**Source:** `src/handlers/function_include/readonly/handleReadFunctionInclude.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the include (e.g., Z_MY_FG).
- `include_name` (string, required) - Include name (e.g., LZ_MY_FGTOP, LZ_MY_FGU01).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-function-module"></a>
### Read-Only / Function Module

<a id="readfunctionmodule-read-only-function-module"></a>
#### ReadFunctionModule (Read-Only / Function Module)
**Description:** Operation: Read, Create, Update. Subject: FunctionModule. Will be useful for reading, creating, or updating function module. [read-only] Read ABAP function module source code and metadata. Answers: "show function module code", "display FM source", "view function X", "get function module implementation". Returns source code, package, responsible, description.

**Source:** `src/handlers/function_module/readonly/handleReadFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module (e.g., Z_MY_FG).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FM).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-include"></a>
### Read-Only / Include

<a id="getinclude-read-only-include"></a>
#### GetInclude (Read-Only / Include)
**Description:** [read-only] Read ANY single ABAP include source by name, from anywhere in the repository (an include may live outside any single program tree). This is the correct tool for include names (PROG/I) — ReadProgram does not read includes.

**Source:** `src/handlers/include/readonly/handleGetInclude.ts`

**Parameters:**
- None

---

<a id="getincludeslist-read-only-include"></a>
#### GetIncludesList (Read-Only / Include)
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include.

**Source:** `src/handlers/include/readonly/handleGetIncludesList.ts`

**Parameters:**
- `detailed` (boolean, optional (default: false)) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `object_name` (string, required) - Name of the ABAP program or include
- `object_type` (string, required) - [read-only] ADT object type of the parent. Only these four values are supported: 'PROG/P' (program), 'PROG/I' (include), 'FUGR' (function group), 'CLAS/OC' (class). Any other value is rejected by the schema.
- `timeout` (number, optional) - [read-only] Timeout in ms for each ADT request.

---

<a id="read-only-interface"></a>
### Read-Only / Interface

<a id="readinterface-read-only-interface"></a>
#### ReadInterface (Read-Only / Interface)
**Description:** Operation: Read, Create, Update. Subject: Interface. Will be useful for reading, creating, or updating interface. [read-only] Read ABAP interface source code and metadata. Answers: "show interface code", "display interface definition", "view interface X", "get interface source". Returns source code, package, responsible, description.

**Source:** `src/handlers/interface/readonly/handleReadInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-message-class"></a>
### Read-Only / Message Class

<a id="readmessageclass-read-only-message-class"></a>
#### ReadMessageClass (Read-Only / Message Class)
**Description:** Operation: Read. Subject: Message Class (MSAG). Will be useful for reading a message class and its messages. [read-only] Read an ABAP message class (T100) with all of its messages. Answers: "show message class X", "list messages of message class", "display message text 001 of class". Returns name, description, package, master language and the array of messages (msgno, msgtext, self-explanatory, description).

**Source:** `src/handlers/message_class/readonly/handleReadMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).

---

<a id="readmessageclassmessage-read-only-message-class"></a>
#### ReadMessageClassMessage (Read-Only / Message Class)
**Description:** Operation: Read. Subject: a single message inside a Message Class (MSAG). [read-only] Read one message (by number) from an ABAP message class. Answers: "show message 001 of class ZMY_MSGS", "get text of message". Returns msgno, msgtext, self-explanatory flag and description.

**Source:** `src/handlers/message_class/readonly/handleReadMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="read-only-metadata-extension"></a>
### Read-Only / Metadata Extension

<a id="readmetadataextension-read-only-metadata-extension"></a>
#### ReadMetadataExtension (Read-Only / Metadata Extension)
**Description:** Operation: Read, Create, Update. Subject: MetadataExtension. Will be useful for reading, creating, or updating metadata extension. [read-only] Read ABAP metadata extension (DDLX) source code and metadata. Answers: "show metadata extension", "display DDLX source", "view UI annotations", "get metadata extension X". Returns source code, package, responsible, description.

**Source:** `src/handlers/metadata_extension/readonly/handleReadMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - Metadata extension name (e.g., Z_MY_DDLX).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-package"></a>
### Read-Only / Package

<a id="getpackagecontents-read-only-package"></a>
#### GetPackageContents (Read-Only / Package)
**Description:** [read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- None

---

<a id="readpackage-read-only-package"></a>
#### ReadPackage (Read-Only / Package)
**Description:** [read-only] Read ABAP package definition and metadata. Answers: "show package X", "display package properties", "view package contents", "get package info". Returns definition, super-package, responsible, description.

**Source:** `src/handlers/package/readonly/handleReadPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., Z_MY_PACKAGE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-program"></a>
### Read-Only / Program

<a id="readprogram-read-only-program"></a>
#### ReadProgram (Read-Only / Program)
**Description:** [read-only] Read a MAIN ABAP program (report) source code and metadata by name. Works ONLY for main programs (adtcore type PROG/P); NOT for includes — use GetInclude for include source. Include names (PROG/I) and other object types are rejected with error "invalid_object_type". Answers: "show program code", "display report source", "view program X", "get program source". Returns source code, package, responsible, description.

**Source:** `src/handlers/program/readonly/handleReadProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="getobjectsbytype-read-only-search"></a>
#### GetObjectsByType (Read-Only / Search)
**Description:** [read-only] Retrieves all ABAP objects of a specific type (classes, tables, programs, interfaces, etc.) under a given parent node. Useful for listing all objects of one type within a package or composite object.

**Source:** `src/handlers/search/readonly/handleGetObjectsByType.ts`

**Parameters:**
- `format` (string, optional) - [read-only] Output format: 'raw' or 'parsed'
- `node_id` (string, required) - [read-only] Node ID
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions

---

<a id="getobjectslist-read-only-search"></a>
#### GetObjectsList (Read-Only / Search)
**Description:** [read-only] Recursively retrieves all child ABAP repository objects for a given parent — programs (PROG), function groups (FUGR), classes (CLAS), packages (DEVC), and other composite objects — including nested includes and subcomponents.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional (default: true))) - [read-only] Include short descriptions (default: true)

---

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Search ABAP repository by object name or wildcard pattern (e.g. 'ZOK*'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by type (PROG, CLAS, INTF, DEVC, TABL, DDLS, DTEL, FUGR, SRVD, SRVB, BDEF, DDLX, etc.).

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 'MARA*')
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 'TABL', 'CLAS/OC')

---

<a id="read-only-service-binding"></a>
### Read-Only / Service Binding

<a id="readservicebinding-read-only-service-binding"></a>
#### ReadServiceBinding (Read-Only / Service Binding)
**Description:** Operation: Read, Create, Update. Subject: ServiceBinding. Will be useful for reading, creating, or updating service binding. [read-only] Read ABAP service binding (SRVB) payload and metadata. Answers: "show service binding", "display SRVB config", "view service binding X", "get OData service binding". Returns payload, package, responsible, description.

**Source:** `src/handlers/service_binding/readonly/handleReadServiceBinding.ts`

**Parameters:**
- `service_binding_name` (string, required) - Service binding name (e.g., ZUI_MY_BINDING).

---

<a id="read-only-service-definition"></a>
### Read-Only / Service Definition

<a id="readservicedefinition-read-only-service-definition"></a>
#### ReadServiceDefinition (Read-Only / Service Definition)
**Description:** Operation: Read, Create, Update. Subject: ServiceDefinition. Will be useful for reading, creating, or updating service definition. [read-only] Read ABAP service definition (SRVD) source code and metadata. Answers: "show service definition", "display SRVD source", "view service definition X", "get service exposure". Returns source code, package, responsible, description.

**Source:** `src/handlers/service_definition/readonly/handleReadServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - Service definition name (e.g., Z_MY_SRVD).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-structure"></a>
### Read-Only / Structure

<a id="getstructureslist-read-only-structure"></a>
#### GetStructuresList (Read-Only / Structure)
**Description:** [read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree.

**Source:** `src/handlers/structure/readonly/handleGetStructuresList.ts`

**Parameters:**
- `include_extensions` (boolean, optional (default: true)) - [read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `timeout` (number, optional) - [read-only] Timeout in ms for each ADT request.
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="readstructure-read-only-structure"></a>
#### ReadStructure (Read-Only / Structure)
**Description:** Operation: Read, Create, Update. Subject: Structure. Will be useful for reading, creating, or updating structure. [read-only] Read ABAP structure definition and metadata. Answers: "show structure fields", "display structure X", "view structure definition", "get structure components". Returns field list, package, responsible, description.

**Source:** `src/handlers/structure/readonly/handleReadStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-system"></a>
### Read-Only / System

<a id="describebylist-read-only-system"></a>
#### DescribeByList (Read-Only / System)
**Description:** [read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `objects` (array, required) - [read-only] Object name (required, must be valid ABAP object name or mask)

---

<a id="getabapast-read-only-system"></a>
#### GetAbapAST (Read-Only / System)
**Description:** [read-only] Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Source:** `src/handlers/system/readonly/handleGetAbapAST.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to parse

---

<a id="getabapsemanticanalysis-read-only-system"></a>
#### GetAbapSemanticAnalysis (Read-Only / System)
**Description:** [read-only] Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Source:** `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze

---

<a id="getabapsystemsymbols-read-only-system"></a>
#### GetAbapSystemSymbols (Read-Only / System)
**Description:** [read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.

**Source:** `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze and resolve symbols for

---

<a id="getadttypes-read-only-system"></a>
#### GetAdtTypes (Read-Only / System)
**Description:** [read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `validate_type` (string, optional) - Type name to validate (optional)

---

<a id="getinactiveobjects-read-only-system"></a>
#### GetInactiveObjects (Read-Only / System)
**Description:** [read-only] Get a list of inactive ABAP objects — modified but not yet activated, pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- None

---

<a id="getobjectinfo-read-only-system"></a>
#### GetObjectInfo (Read-Only / System)
**Description:** [read-only] Return ABAP object tree structure for packages (DEVC), classes (CLAS), programs (PROG), function groups (FUGR), and other objects. Shows root, group nodes, and terminal leaves up to maxDepth. Enrich each node with description and package via SearchObject if enrich=true.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type)
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)

---

<a id="getobjectnodefromcache-read-only-system"></a>
#### GetObjectNodeFromCache (Read-Only / System)
**Description:** [read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.

**Source:** `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`

**Parameters:**
- `object_name` (string, required) - [read-only] Object name
- `object_type` (string, required) - [read-only] Object type
- `tech_name` (string, required) - [read-only] Technical name

---

<a id="getobjectstructure-read-only-system"></a>
#### GetObjectStructure (Read-Only / System)
**Description:** [read-only] Retrieve ADT object structure as a compact JSON tree.

**Source:** `src/handlers/system/readonly/handleGetObjectStructure.ts`

**Parameters:**
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)
- `objecttype` (string, required) - ADT object type (e.g. DDLS/DF)

---

<a id="getsession-read-only-system"></a>
#### GetSession (Read-Only / System)
**Description:** [read-only] Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.

**Source:** `src/handlers/system/readonly/handleGetSession.ts`

**Parameters:**
- `force_new` (boolean, optional) - Force creation of a new session even if one exists. Default: false

---

<a id="getsqlquery-read-only-system"></a>
#### GetSqlQuery (Read-Only / System)
**Description:** [read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute

---

<a id="gettransaction-read-only-system"></a>
#### GetTransaction (Read-Only / System)
**Description:** [read-only] Retrieve ABAP transaction (t-code) details — program, screen, authorization object, and transaction type (dialog, report, OO).

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `transaction_name` (string, required) - Name of the ABAP transaction

---

<a id="gettypeinfo-read-only-system"></a>
#### GetTypeInfo (Read-Only / System)
**Description:** [read-only] Retrieve ABAP type information for domains (DOMA), data elements (DTEL), table types, and structures. Returns field definitions, value ranges, fixed values, and DDIC metadata.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `include_structure_fallback` (boolean, optional (default: true)) - When true (default), tries DDIC structure lookup only if type lookup returns 404/empty.
- `type_name` (string, required) - Name of the ABAP type

---

<a id="getwhereused-read-only-system"></a>
#### GetWhereUsed (Read-Only / System)
**Description:** [read-only] Search where-used references — find all objects that reference or depend on a given ABAP object. Answers: "where is X used", "who calls X", "what depends on X", "show usages of X". Returns referencing objects with types and packages. Supports a fixed set of object types (see object_type). Object types outside the supported list (e.g. RAP behavior definitions, service definitions/bindings, BAdI, search helps, message classes, classic DDIC views) are NOT supported and will fail.

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Parameters:**
- `disable_types` (array, optional) - Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.
- `enable_all_types` (boolean, optional (default: false)) - If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.
- `enable_only_types` (array, optional) - Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.
- `object_name` (string, required) - Name of the ABAP object. For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).
- `object_type` (string, required) - Type of the ABAP object. Case-insensitive. Accepts either a human alias or an ADT type code. Supported values: 'class' / 'clas/oc', 'interface' / 'intf/if', 'program' / 'prog/p', 'include', 'function' / 'functiongroup' / 'fugr' (function group), 'functionmodule' / 'function_module' / 'fugr/ff' (function module — see object_name format), 'package' / 'devc/k', 'table' / 'tabl/dt', 'structure' / 'stru/dt', 'domain' / 'doma/dd', 'dataelement' / 'dtel', 'view' / 'ddls/df' (CDS DDL source only — classic DDIC views are not supported). Any other value throws 'Unsupported object type'.

---

<a id="runtimeanalyzeprofilertrace-read-only-system"></a>
#### RuntimeAnalyzeProfilerTrace (Read-Only / System)
**Description:** [runtime] Read profiler trace view and return compact analysis summary (totals + top entries).

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts`

**Parameters:**
- `top` (number, optional) - Number of top rows for summary. Default: 10.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full trace URI.
- `view` (string, optional (default: hitlist)) - 
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimecreateprofilertraceparameters-read-only-system"></a>
#### RuntimeCreateProfilerTraceParameters (Read-Only / System)
**Description:** [runtime] Create ABAP profiler trace parameters and return profilerId (URI) for profiled execution.

**Source:** `src/handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `description` (string, required) - Human-readable trace description.
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimegetdumpbyid-read-only-system"></a>
#### RuntimeGetDumpById (Read-Only / System)
**Description:** [runtime] Read a specific ABAP runtime dump by its ID. First use RuntimeListFeeds to find dumps and get their IDs, then pass dump_id here to read the full dump content.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `dump_id` (string, required) - Full runtime dump ID (e.g. from RuntimeListFeeds).
- `response_mode` (string, optional (default: both)) - Controls what is returned: "payload" — full parsed dump data, "summary" — compact key facts only (title, exception, program, line, user, date…), "both" — summary + full payload.
- `view` (string, optional (default: default)) - Dump view mode: default payload, summary section, or formatted long text.

---

<a id="runtimegetgatewayerrorlog-read-only-system"></a>
#### RuntimeGetGatewayErrorLog (Read-Only / System)
**Description:** [runtime] List SAP Gateway error log (/IWFND/ERROR_LOG) or get error detail. Returns structured entries with type, shortText, transactionId, dateTime, username. With error_url returns full detail including serviceInfo, errorContext, sourceCode, callStack.

**Source:** `src/handlers/system/readonly/handleRuntimeGetGatewayErrorLog.ts`

**Parameters:**
- `error_url` (string, optional) - Feed URL of a specific error entry (from a previous list response link field). When provided, returns detailed error info instead of listing.
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of errors to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter errors by SAP username.

---

<a id="runtimegetprofilertracedata-read-only-system"></a>
#### RuntimeGetProfilerTraceData (Read-Only / System)
**Description:** [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold (for statements view).
- `id` (number, optional) - Statement node ID (for statements view).
- `trace_id_or_uri` (string, required) - Profiler trace ID or full ADT trace URI.
- `view` (string, required) - Trace view to retrieve.
- `with_details` (boolean, optional) - Include statement details (for statements view).
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimelistfeeds-read-only-system"></a>
#### RuntimeListFeeds (Read-Only / System)
**Description:** [runtime] List available ADT runtime feeds or read a specific feed type. Feed types: dumps, system_messages, gateway_errors. Without feed_type returns available feed descriptors.

**Source:** `src/handlers/system/readonly/handleRuntimeListFeeds.ts`

**Parameters:**
- `feed_type` (string, optional (default: descriptors)) - Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of entries to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter feed entries by SAP username.

---

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [runtime] List ABAP profiler trace files available in ADT runtime. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts`

**Parameters:**
- None

---

<a id="runtimelistsystemmessages-read-only-system"></a>
#### RuntimeListSystemMessages (Read-Only / System)
**Description:** [runtime] List SM02 system messages. Returns structured entries with id, title, text, severity, validity period, and author.

**Source:** `src/handlers/system/readonly/handleRuntimeListSystemMessages.ts`

**Parameters:**
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of messages to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter by author username.

---

<a id="runtimerunclass-read-only-system"></a>
#### RuntimeRunClass (Read-Only / System)
**Description:** [runtime] Execute an ABAP class implementing if_oo_adt_classrun and return its output. Set profile=true to also capture a profiler trace (returns profilerId/traceId alongside output).

**Source:** `src/handlers/system/readonly/handleRuntimeRunClass.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `class_name` (string, required) - ABAP class name to execute.
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `max_trace_attempts` (integer, optional) - Max polling attempts to resolve traceId after execution (default 5). Only used when profile=true.
- `profile` (boolean, optional) - When true, run with the profiler and resolve the resulting traceId. Default false.
- `sql_trace` (boolean, optional) - 
- `trace_lookup_uris` (array, optional) - Additional URIs to consult when resolving the trace (advanced, profile=true).
- `trace_retry_delay_ms` (integer, optional) - Delay in ms between trace polling attempts (default 2000). Only used when profile=true.
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimerunclasswithprofiling-read-only-system"></a>
#### RuntimeRunClassWithProfiling (Read-Only / System)
**Description:** [runtime][deprecated] Execute ABAP class with profiler enabled and return created profilerId + traceId. Prefer RuntimeRunClass with profile=true; this tool is kept for backward compatibility and will be removed in a future major release.

**Source:** `src/handlers/system/readonly/handleRuntimeRunClassWithProfiling.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `class_name` (string, required) - ABAP class name to execute.
- `description` (string, optional) - Profiler trace description.
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `max_trace_attempts` (integer, optional) - Max polling attempts to resolve traceId after execution (default 5). Increase for slow systems (e.g. SAP trial cloud).
- `sql_trace` (boolean, optional) - 
- `trace_lookup_uris` (array, optional) - Additional URIs to consult when resolving the trace (advanced).
- `trace_retry_delay_ms` (integer, optional) - Delay in ms between trace polling attempts (default 2000).
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimerunprogram-read-only-system"></a>
#### RuntimeRunProgram (Read-Only / System)
**Description:** [runtime] Execute an ABAP program (report) and return its output. Set profile=true to also start a profiler trace; use RuntimeListProfilerTraceFiles afterwards to locate the trace (program execution is fire-and-forget, so traceId is not returned synchronously).

**Source:** `src/handlers/system/readonly/handleRuntimeRunProgram.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `profile` (boolean, optional) - When true, run with the profiler. Default false. Trace must be located afterwards via RuntimeListProfilerTraceFiles — program execution does not return traceId synchronously.
- `program_name` (string, required) - ABAP program name to execute.
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimerunprogramwithprofiling-read-only-system"></a>
#### RuntimeRunProgramWithProfiling (Read-Only / System)
**Description:** [runtime][deprecated] Execute ABAP program with profiler enabled and return created profilerId. Prefer RuntimeRunProgram with profile=true; this tool is kept for backward compatibility and will be removed in a future major release.

**Source:** `src/handlers/system/readonly/handleRuntimeRunProgramWithProfiling.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `description` (string, optional) - Profiler trace description.
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `program_name` (string, required) - ABAP program name to execute.
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="searchsource-read-only-system"></a>
#### SearchSource (Read-Only / System)
**Description:** [read-only] Search ABAP source text inside one or more packages (programs, function groups, classes). Onprem-only (cloud lacks an indexed source-search endpoint). `packages` accepts `*` masks (Z*, ZFI_*, /NS/Z*) alongside exact names; mask resolution is best-effort and scoped to the ADT repository-search result window — there is no guarantee that every matching package is scanned. If you need certainty, pass concrete package names. When using masks, narrow the mask itself and use `object_types`, `object_filter`, and `max_objects` as scan-target controls that apply after package resolution. Comments are searched by default; set exclude_comments=true to drop col-1 `*` and full-line `"` comments. The `version` parameter affects PROG and CLAS main include reads only — FUGR subinclude reads always go against the active version (the include endpoint exposes no version selector). `truncated.by_object_cap` means at least one object had MORE hits than `max_hits_per_object`, so that object's hits were capped — it is NOT a limit on the number of objects scanned. The object-count limit is `max_objects` (which sets `truncated.by_max_objects`). To avoid `by_object_cap`, raise `max_hits_per_object`. `concurrency` is capped at 16 per call. Run only ONE SearchSource per destination at a time — multiple parallel SearchSource calls against the same SAP system saturate the scan backend and can make all of them time out. Prefer combining terms into a single call over parallel calls.

**Source:** `src/handlers/system/readonly/handleSearchSource.ts`

**Parameters:**
- None

---

<a id="read-only-table"></a>
### Read-Only / Table

<a id="gettablecontents-read-only-table"></a>
#### GetTableContents (Read-Only / Table)
**Description:** [read-only] Retrieve contents (data preview) of an ABAP database table or CDS view. Returns rows of data like SE16/SE16N.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Parameters:**
- None

---

<a id="readtable-read-only-table"></a>
#### ReadTable (Read-Only / Table)
**Description:** Operation: Read, Create, Update. Subject: Table. Will be useful for reading, creating, or updating table. [read-only] Read ABAP table definition and metadata. Answers: "show table fields", "display table structure", "view table X", "get table definition". Returns field list, package, responsible, description.

**Source:** `src/handlers/table/readonly/handleReadTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-transport"></a>
### Read-Only / Transport

<a id="gettransport-read-only-transport"></a>
#### GetTransport (Read-Only / Transport)
**Description:** [read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.

**Source:** `src/handlers/transport/readonly/handleGetTransport.ts`

**Parameters:**
- `include_objects` (boolean, optional (default: true))) - Include list of objects in transport (default: true)
- `include_tasks` (boolean, optional (default: true))) - Include list of tasks in transport (default: true)
- `transport_number` (string, required) - Transport request number (e.g., E19K905635, DEVK905123)

---

<a id="listtransports-read-only-transport"></a>
#### ListTransports (Read-Only / Transport)
**Description:** [read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests.

**Source:** `src/handlers/transport/readonly/handleListTransports.ts`

**Parameters:**
- `modifiable_only` (boolean, optional) - Only return modifiable (not yet released) transports. Default: true.
- `user` (string, optional) - SAP user name. If not provided, returns transports for the current user.

---

<a id="high-level-group"></a>
## High-Level Group

<a id="high-level-behavior-definition"></a>
### High-Level / Behavior Definition

<a id="checkbehaviordefinition-high-level-behavior-definition"></a>
#### CheckBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Perform syntax check on an ABAP behavior definition (BDEF). Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/behavior_definition/high/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).

---

<a id="createbehaviordefinition-high-level-behavior-definition"></a>
#### CreateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Operation: Create. Subject: BehaviorDefinition. Will be useful for creating behavior definition. Create a new ABAP Behavior Definition (BDEF) in SAP system. Creates the behavior definition object in initial state.

**Source:** `src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `implementation_type` (string, required) - Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `name` (string, required) - Behavior Definition name (usually same as Root Entity name)
- `package_name` (string, required) - Package name
- `root_entity` (string, required) - Root Entity name (CDS View name)
- `transport_request` (string, optional) - Transport request number

---

<a id="deletebehaviordefinition-high-level-behavior-definition"></a>
#### DeleteBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Delete an ABAP behavior definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getbehaviordefinition-high-level-behavior-definition"></a>
#### GetBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Retrieve ABAP behavior definition definition. Supports reading active or inactive version.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatebehaviordefinition-high-level-behavior-definition"></a>
#### UpdateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Operation: Update, Create. Subject: BehaviorDefinition. Will be useful for updating or creating behavior definition. Update source code of an existing ABAP Behavior Definition (BDEF). Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).
- `name` (string, required) - Behavior Definition name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="high-level-behavior-implementation"></a>
### High-Level / Behavior Implementation

<a id="createbehaviorimplementation-high-level-behavior-implementation"></a>
#### CreateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Create a new ABAP behavior implementation class for a behavior definition. Creates the object in initial state. Use UpdateBehaviorImplementation to set implementation code afterwards.

**Source:** `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations).
- `description` (string, optional) - Class description. If not provided, class_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletebehaviorimplementation-high-level-behavior-implementation"></a>
#### DeleteBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Delete an ABAP behavior implementation from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getbehaviorimplementation-high-level-behavior-implementation"></a>
#### GetBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Retrieve ABAP behavior implementation definition. Supports reading active or inactive version.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatebehaviorimplementation-high-level-behavior-implementation"></a>
#### UpdateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Update source code of an existing ABAP behavior implementation class. Updates both main source (with FOR BEHAVIOR OF clause) and implementations include. Uses stateful session with proper lock/unlock mechanism.

**Source:** `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate behavior implementation after update. Default: true.
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Must match the behavior definition used when creating the class.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system.
- `implementation_code` (string, required) - Implementation code for the implementations include. Contains the actual behavior implementation methods.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-class"></a>
### High-Level / Class

<a id="checkclass-high-level-class"></a>
#### CheckClass (High-Level / Class)
**Description:** Perform syntax check on an ABAP class. Can check existing class (active/inactive) or validate hypothetical source code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/class/high/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active.

---

<a id="createclass-high-level-class"></a>
#### CreateClass (High-Level / Class)
**Description:** Operation: Create. Subject: Class. Will be useful for creating class. Create a new ABAP class in SAP system. Creates the class object in initial state.

**Source:** `src/handlers/class/high/handleCreateClass.ts`

**Parameters:**
- `abstract` (boolean, optional) - Mark class as abstract. Default: false
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001).
- `create_protected` (boolean, optional) - Protected constructor. Default: false
- `description` (string, optional) - Class description (defaults to class_name).
- `final` (boolean, optional) - Mark class as final. Default: false
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP).
- `superclass` (string, optional) - Optional superclass name.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="deleteclass-high-level-class"></a>
#### DeleteClass (High-Level / Class)
**Description:** Delete an ABAP class from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/class/high/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="deletelocaldefinitions-high-level-class"></a>
#### DeleteLocalDefinitions (High-Level / Class)
**Description:** Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalDefinitions.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

<a id="deletelocalmacros-high-level-class"></a>
#### DeleteLocalMacros (High-Level / Class)
**Description:** Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleDeleteLocalMacros.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

<a id="deletelocaltestclass-high-level-class"></a>
#### DeleteLocalTestClass (High-Level / Class)
**Description:** Delete a local test class from an ABAP class by clearing the testclasses include. Manages lock, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleDeleteLocalTestClass.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

<a id="deletelocaltypes-high-level-class"></a>
#### DeleteLocalTypes (High-Level / Class)
**Description:** Delete local types from an ABAP class by clearing the implementations include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalTypes.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

<a id="getclass-high-level-class"></a>
#### GetClass (High-Level / Class)
**Description:** Retrieve ABAP class source code. Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocaldefinitions-high-level-class"></a>
#### GetLocalDefinitions (High-Level / Class)
**Description:** Retrieve local definitions source code from a class (definitions include). Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalDefinitions.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocalmacros-high-level-class"></a>
#### GetLocalMacros (High-Level / Class)
**Description:** Retrieve local macros source code from a class (macros include). Supports reading active or inactive version. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleGetLocalMacros.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocaltestclass-high-level-class"></a>
#### GetLocalTestClass (High-Level / Class)
**Description:** Retrieve local test class source code from a class. Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalTestClass.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocaltypes-high-level-class"></a>
#### GetLocalTypes (High-Level / Class)
**Description:** Retrieve local types source code from a class (implementations include). Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalTypes.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateclass-high-level-class"></a>
#### UpdateClass (High-Level / Class)
**Description:** Operation: Update, Create. Subject: Class. Will be useful for updating or creating class. Update source code of an existing ABAP class. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/class/high/handleUpdateClass.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001).
- `source_code` (string, required) - Complete ABAP class source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="updatelocaldefinitions-high-level-class"></a>
#### UpdateLocalDefinitions (High-Level / Class)
**Description:** Update local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleUpdateLocalDefinitions.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `definitions_code` (string, required) - Updated source code for local definitions.
- `transport_request` (string, optional) - Transport request number.

---

<a id="updatelocalmacros-high-level-class"></a>
#### UpdateLocalMacros (High-Level / Class)
**Description:** Update local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleUpdateLocalMacros.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `macros_code` (string, required) - Updated source code for local macros.
- `transport_request` (string, optional) - Transport request number.

---

<a id="updatelocaltestclass-high-level-class"></a>
#### UpdateLocalTestClass (High-Level / Class)
**Description:** Update a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleUpdateLocalTestClass.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `test_class_code` (string, required) - Updated source code for the local test class.
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

<a id="updatelocaltypes-high-level-class"></a>
#### UpdateLocalTypes (High-Level / Class)
**Description:** Update local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleUpdateLocalTypes.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `local_types_code` (string, required) - Updated source code for local types.
- `transport_request` (string, optional) - Transport request number.

---

<a id="high-level-common"></a>
### High-Level / Common

<a id="activateobjects-high-level-common"></a>
#### ActivateObjects (High-Level / Common)
**Description:** Activate one or multiple ABAP repository objects. Use after Create/Update when objects remain inactive, or for group activation of related objects (e.g., domains + data elements + tables together). Works with any object type.

**Source:** `src/handlers/common/high/handleActivateObjects.ts`

**Parameters:**
- `objects` (array, required) - Array of objects to activate. Each object must have 'name' and 'type'.
- `preaudit` (boolean, optional) - Request pre-audit before activation. Default: true

---

<a id="getbehaviordefinitionversiondiff-high-level-common"></a>
#### GetBehaviorDefinitionVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two RAP behavior definition versions, by their content_uris (taken from GetBehaviorDefinitionVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetBehaviorDefinitionVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetBehaviorDefinitionVersions entry).

---

<a id="getbehaviordefinitionversions-high-level-common"></a>
#### GetBehaviorDefinitionVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a RAP behavior definition. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetBehaviorDefinitionVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - RAP behavior definition name.

---

<a id="getbehaviordefinitionversionsource-high-level-common"></a>
#### GetBehaviorDefinitionVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific RAP behavior definition version by its content_uri (taken from a GetBehaviorDefinitionVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetBehaviorDefinitionVersions entry.

---

<a id="getclassversiondiff-high-level-common"></a>
#### GetClassVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP class versions, by their content_uris (taken from GetClassVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetClassVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetClassVersions entry).

---

<a id="getclassversions-high-level-common"></a>
#### GetClassVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP class. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetClassVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `class_name` (string, required) - ABAP class name.

---

<a id="getclassversionsource-high-level-common"></a>
#### GetClassVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP class version by its content_uri (taken from a GetClassVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetClassVersions entry.

---

<a id="getddlversiondiff-high-level-common"></a>
#### GetDdlVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two CDS view (DDL source) versions, by their content_uris (taken from GetDdlVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetDdlVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetDdlVersions entry).

---

<a id="getddlversions-high-level-common"></a>
#### GetDdlVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a CDS view (DDL source). Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetDdlVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view (DDL source) name.

---

<a id="getddlversionsource-high-level-common"></a>
#### GetDdlVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific CDS view (DDL source) version by its content_uri (taken from a GetDdlVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetDdlVersions entry.

---

<a id="getfunctionmoduleversiondiff-high-level-common"></a>
#### GetFunctionModuleVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP function module versions, by their content_uris (taken from GetFunctionModuleVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetFunctionModuleVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetFunctionModuleVersions entry).

---

<a id="getfunctionmoduleversions-high-level-common"></a>
#### GetFunctionModuleVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP function module. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetFunctionModuleVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `function_group_name` (string, required) - Owning function group name (required).
- `function_module_name` (string, required) - ABAP function module name.

---

<a id="getfunctionmoduleversionsource-high-level-common"></a>
#### GetFunctionModuleVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP function module version by its content_uri (taken from a GetFunctionModuleVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetFunctionModuleVersions entry.

---

<a id="getinterfaceversiondiff-high-level-common"></a>
#### GetInterfaceVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP interface versions, by their content_uris (taken from GetInterfaceVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetInterfaceVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetInterfaceVersions entry).

---

<a id="getinterfaceversions-high-level-common"></a>
#### GetInterfaceVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP interface. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetInterfaceVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `interface_name` (string, required) - ABAP interface name.

---

<a id="getinterfaceversionsource-high-level-common"></a>
#### GetInterfaceVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP interface version by its content_uri (taken from a GetInterfaceVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetInterfaceVersions entry.

---

<a id="getmetadataextensionversiondiff-high-level-common"></a>
#### GetMetadataExtensionVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two CDS metadata extension versions, by their content_uris (taken from GetMetadataExtensionVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetMetadataExtensionVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetMetadataExtensionVersions entry).

---

<a id="getmetadataextensionversions-high-level-common"></a>
#### GetMetadataExtensionVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a CDS metadata extension. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetMetadataExtensionVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - CDS metadata extension name.

---

<a id="getmetadataextensionversionsource-high-level-common"></a>
#### GetMetadataExtensionVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific CDS metadata extension version by its content_uri (taken from a GetMetadataExtensionVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetMetadataExtensionVersions entry.

---

<a id="getprogramversiondiff-high-level-common"></a>
#### GetProgramVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP program versions, by their content_uris (taken from GetProgramVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetProgramVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetProgramVersions entry).

---

<a id="getprogramversions-high-level-common"></a>
#### GetProgramVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP program. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetProgramVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `program_name` (string, required) - ABAP program name.

---

<a id="getprogramversionsource-high-level-common"></a>
#### GetProgramVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP program version by its content_uri (taken from a GetProgramVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetProgramVersions entry.

---

<a id="getstructureversiondiff-high-level-common"></a>
#### GetStructureVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP structure versions, by their content_uris (taken from GetStructureVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetStructureVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetStructureVersions entry).

---

<a id="getstructureversions-high-level-common"></a>
#### GetStructureVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP structure. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetStructureVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `structure_name` (string, required) - ABAP structure name.

---

<a id="getstructureversionsource-high-level-common"></a>
#### GetStructureVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP structure version by its content_uri (taken from a GetStructureVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetStructureVersions entry.

---

<a id="gettableversiondiff-high-level-common"></a>
#### GetTableVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP table versions, by their content_uris (taken from GetTableVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetTableVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetTableVersions entry).

---

<a id="gettableversions-high-level-common"></a>
#### GetTableVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP table. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetTableVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `table_name` (string, required) - ABAP table name.

---

<a id="gettableversionsource-high-level-common"></a>
#### GetTableVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP table version by its content_uri (taken from a GetTableVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetTableVersions entry.

---

<a id="high-level-compact"></a>
### High-Level / Compact

<a id="handleractivate-high-level-compact"></a>
#### HandlerActivate (High-Level / Compact)
**Description:** Activate operation. Single mode(object_name*, object_adt_type*). Batch mode(objects[].name*, objects[].type*).

**Source:** `src/handlers/compact/high/handleHandlerActivate.ts`

**Parameters:**
- `object_adt_type` (string, optional) - ADT object type code (e.g. CLAS/OC, PROG/P). Required for single-object activation form.
- `object_name` (string, optional) - Object name for single-object activation form.
- `object_type` (any, optional) - 
- `objects` (array, optional) - Explicit objects list for batch activation.
- `preaudit` (boolean, optional) - Run pre-audit checks before activation.

---

<a id="handlercdsunittestresult-high-level-compact"></a>
#### HandlerCdsUnitTestResult (High-Level / Compact)
**Description:** CDS unit test result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerCdsUnitTestResult.ts`

**Parameters:**
- `aggregate` (boolean, optional) - Aggregate profiling data.
- `all_db_events` (boolean, optional) - Trace all DB events.
- `all_dynpro_events` (boolean, optional) - Trace dynpro events.
- `all_internal_table_events` (boolean, optional) - Trace internal table events.
- `all_misc_abap_statements` (boolean, optional) - Trace miscellaneous ABAP statements.
- `all_procedural_units` (boolean, optional) - Trace all procedural units.
- `all_system_kernel_events` (boolean, optional) - Trace system kernel events.
- `amdp_trace` (boolean, optional) - Enable AMDP tracing.
- `class_name` (string, optional) - Class name for profiling.
- `description` (string, optional) - Profiler run description.
- `explicit_on_off` (boolean, optional) - Use explicit on/off trace sections.
- `max_size_for_trace_file` (number, optional) - Maximum trace file size.
- `max_time_for_tracing` (number, optional) - Maximum tracing time.
- `program_name` (string, optional) - Program name for profiling.
- `sql_trace` (boolean, optional) - Enable SQL trace.
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - Enable RFC tracing.

---

<a id="handlercdsunitteststatus-high-level-compact"></a>
#### HandlerCdsUnitTestStatus (High-Level / Compact)
**Description:** CDS unit test status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerCdsUnitTestStatus.ts`

**Parameters:**
- `aggregate` (boolean, optional) - Aggregate profiling data.
- `all_db_events` (boolean, optional) - Trace all DB events.
- `all_dynpro_events` (boolean, optional) - Trace dynpro events.
- `all_internal_table_events` (boolean, optional) - Trace internal table events.
- `all_misc_abap_statements` (boolean, optional) - Trace miscellaneous ABAP statements.
- `all_procedural_units` (boolean, optional) - Trace all procedural units.
- `all_system_kernel_events` (boolean, optional) - Trace system kernel events.
- `amdp_trace` (boolean, optional) - Enable AMDP tracing.
- `class_name` (string, optional) - Class name for profiling.
- `description` (string, optional) - Profiler run description.
- `explicit_on_off` (boolean, optional) - Use explicit on/off trace sections.
- `max_size_for_trace_file` (number, optional) - Maximum trace file size.
- `max_time_for_tracing` (number, optional) - Maximum tracing time.
- `program_name` (string, optional) - Program name for profiling.
- `sql_trace` (boolean, optional) - Enable SQL trace.
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - Enable RFC tracing.

---

<a id="handlercheckrun-high-level-compact"></a>
#### HandlerCheckRun (High-Level / Compact)
**Description:** CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Source:** `src/handlers/compact/high/handleHandlerCheckRun.ts`

**Parameters:**
- `session_id` (string, optional) - Optional ADT session id for stateful check flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful check flow.
- `version` (string, optional (default: active)) - Version to syntax-check.

---

<a id="handlercreate-high-level-compact"></a>
#### HandlerCreate (High-Level / Compact)
**Description:** Create operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*), UNIT_TEST(tests*), CDS_UNIT_TEST(class_name*, package_name*, cds_view_name*).

**Source:** `src/handlers/compact/high/handleHandlerCreate.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate object after create.
- `application` (string, optional) - Domain application area.
- `behavior_definition` (string, optional) - Referenced behavior definition name (behavior implementation create).
- `cds_view_name` (string, optional) - CDS view name to validate for unit test doubles.
- `class_name` (string, optional) - ABAP class name.
- `conversion_exit` (string, optional) - Conversion exit name.
- `data_element_name` (string, optional) - Data element name.
- `datatype` (string, optional) - ABAP data type.
- `ddl_name` (string, optional) - DDL source name (CDS view, AMDP table function, etc.).
- `decimals` (number, optional) - Decimal places.
- `description` (string, optional) - Human-readable object description.
- `domain_name` (string, optional) - ABAP domain name.
- `fields` (array, optional) - Structure fields (for STRUCTURE create).
- `fixed_values` (array, optional) - Domain fixed values list.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `implementation_type` (string, optional) - Behavior definition implementation type.
- `interface_name` (string, optional) - Interface name.
- `length` (number, optional) - Length for typed artifacts.
- `lowercase` (boolean, optional) - Allow lowercase values (domain setting).
- `name` (string, optional) - Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `object_type` (any, required) - 
- `package_name` (string, optional) - ABAP package name.
- `program_name` (string, optional) - ABAP program name.
- `program_type` (string, optional) - ABAP program type.
- `root_entity` (string, optional) - Root CDS entity name (behavior definition create).
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `sign_exists` (boolean, optional) - Allow signed values (domain setting).
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `tests` (array, optional) - Container/test class pairs (for UNIT_TEST create).
- `transport_request` (string, optional) - Transport request id (if required by system).
- `value_table` (string, optional) - Foreign key value table.

---

<a id="handlerdelete-high-level-compact"></a>
#### HandlerDelete (High-Level / Compact)
**Description:** Delete operation. object_type required: DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*).

**Source:** `src/handlers/compact/high/handleHandlerDelete.ts`

**Parameters:**
- `behavior_definition_name` (string, optional) - Behavior definition name.
- `behavior_implementation_name` (string, optional) - Behavior implementation name.
- `class_name` (string, optional) - ABAP class name.
- `data_element_name` (string, optional) - Data element name.
- `ddl_name` (string, optional) - DDL source name (CDS view, AMDP table function, etc.).
- `domain_name` (string, optional) - ABAP domain name.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `interface_name` (string, optional) - Interface name.
- `metadata_extension_name` (string, optional) - Metadata extension name.
- `object_type` (any, required) - 
- `program_name` (string, optional) - ABAP program name.
- `run_id` (string, optional) - Unit test run id (UNIT_TEST delete).
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `transport_request` (string, optional) - Transport request id (if required by system).

---

<a id="handlerdumplist-high-level-compact"></a>
#### HandlerDumpList (High-Level / Compact)
**Description:** Runtime dump list. object_type: not used. Required: none. Optional: user, top, from, to. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerDumpList.ts`

**Parameters:**
- `from` (string, optional) - Start of time range (YYYYMMDDHHMMSS).
- `to` (string, optional) - End of time range (YYYYMMDDHHMMSS).
- `top` (number, optional) - Limit number of returned dumps.
- `user` (string, optional) - Filter dumps by user.

---

<a id="handlerdumpview-high-level-compact"></a>
#### HandlerDumpView (High-Level / Compact)
**Description:** Runtime dump view. object_type: not used. Required: dump_id*. Optional: view(default|summary|formatted). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerDumpView.ts`

**Parameters:**
- `dump_id` (string, required) - Runtime dump id.
- `view` (string, optional (default: default)) - Dump rendering mode.

---

<a id="handlerget-high-level-compact"></a>
#### HandlerGet (High-Level / Compact)
**Description:** Read operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Source:** `src/handlers/compact/high/handleHandlerGet.ts`

**Parameters:**
- `behavior_definition_name` (string, optional) - Behavior definition name.
- `behavior_implementation_name` (string, optional) - Behavior implementation name.
- `class_name` (string, optional) - Class name.
- `data_element_name` (string, optional) - Data element name.
- `ddl_name` (string, optional) - DDL source name.
- `domain_name` (string, optional) - Domain name.
- `function_group_name` (string, optional) - Function group name.
- `function_module_name` (string, optional) - Function module name.
- `interface_name` (string, optional) - Interface name.
- `metadata_extension_name` (string, optional) - Metadata extension name.
- `object_type` (any, required) - 
- `package_name` (string, optional) - Package name.
- `program_name` (string, optional) - Program name.
- `response_format` (string, optional) - Response format for SERVICE_BINDING reads.
- `run_id` (string, optional) - Unit test run id.
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `version` (any, optional) - 

---

<a id="handlerlock-high-level-compact"></a>
#### HandlerLock (High-Level / Compact)
**Description:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Source:** `src/handlers/compact/high/handleHandlerLock.ts`

**Parameters:**
- `session_id` (string, optional) - Optional ADT session id for stateful lock flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful lock flow.
- `super_package` (string, optional) - Super package context when relevant.

---

<a id="handlerprofilelist-high-level-compact"></a>
#### HandlerProfileList (High-Level / Compact)
**Description:** Runtime profiling list. object_type: not used. Required: none. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileList.ts`

**Parameters:**
- See schema reference `compactProfileListSchema` in source file

---

<a id="handlerprofilerun-high-level-compact"></a>
#### HandlerProfileRun (High-Level / Compact)
**Description:** Runtime profiling run. object_type: not used. Required: target_type*(CLASS|PROGRAM) + class_name* for CLASS or program_name* for PROGRAM. Optional profiling flags and description. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileRun.ts`

**Parameters:**
- `aggregate` (boolean, optional) - Aggregate profiling data.
- `all_db_events` (boolean, optional) - Trace all DB events.
- `all_dynpro_events` (boolean, optional) - Trace dynpro events.
- `all_internal_table_events` (boolean, optional) - Trace internal table events.
- `all_misc_abap_statements` (boolean, optional) - Trace miscellaneous ABAP statements.
- `all_procedural_units` (boolean, optional) - Trace all procedural units.
- `all_system_kernel_events` (boolean, optional) - Trace system kernel events.
- `amdp_trace` (boolean, optional) - Enable AMDP tracing.
- `class_name` (string, optional) - Class name for profiling.
- `description` (string, optional) - Profiler run description.
- `explicit_on_off` (boolean, optional) - Use explicit on/off trace sections.
- `max_size_for_trace_file` (number, optional) - Maximum trace file size.
- `max_time_for_tracing` (number, optional) - Maximum tracing time.
- `program_name` (string, optional) - Program name for profiling.
- `sql_trace` (boolean, optional) - Enable SQL trace.
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - Enable RFC tracing.

---

<a id="handlerprofileview-high-level-compact"></a>
#### HandlerProfileView (High-Level / Compact)
**Description:** Runtime profiling view. object_type: not used. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileView.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold.
- `id` (number, optional) - Optional statement/access id.
- `trace_id_or_uri` (string, required) - Profiler trace id or URI.
- `view` (string, required) - Profiler trace view kind.
- `with_details` (boolean, optional) - Include detailed payload.
- `with_system_events` (boolean, optional) - Include system events in analysis.

---

<a id="handlerservicebindinglisttypes-high-level-compact"></a>
#### HandlerServiceBindingListTypes (High-Level / Compact)
**Description:** Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingListTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Response format for protocol types list.

---

<a id="handlerservicebindingvalidate-high-level-compact"></a>
#### HandlerServiceBindingValidate (High-Level / Compact)
**Description:** Service binding validate before create. object_type: not used. Required: service_binding_name*, service_definition_name*. Optional: service_binding_version, package_name, description. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingValidate.ts`

**Parameters:**
- `description` (string, optional) - Binding description.
- `package_name` (string, optional) - Target package name.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version.
- `service_definition_name` (string, required) - Service definition name to pair with binding.

---

<a id="handlertransportcreate-high-level-compact"></a>
#### HandlerTransportCreate (High-Level / Compact)
**Description:** Transport create. object_type: not used. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerTransportCreate.ts`

**Parameters:**
- `description` (string, required) - Transport description.
- `owner` (string, optional) - Transport owner user.
- `target_system` (string, optional) - Target system id.
- `transport_type` (string, optional (default: workbench)) - Transport type.

---

<a id="handlerunittestresult-high-level-compact"></a>
#### HandlerUnitTestResult (High-Level / Compact)
**Description:** ABAP Unit result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format.
- `run_id` (string, required) - Unit test run id.
- `with_navigation_uris` (boolean, optional (default: false)) - Include ADT navigation URIs in the result payload.

---

<a id="handlerunittestrun-high-level-compact"></a>
#### HandlerUnitTestRun (High-Level / Compact)
**Description:** ABAP Unit run. object_type: not used. Required: tests[]{container_class*, test_class*}. Optional: title, context, scope, risk_level, duration. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestRun.ts`

**Parameters:**
- `context` (string, optional) - Run context label.
- `duration` (object, optional) - Allowed duration classes.
- `risk_level` (object, optional) - Allowed risk levels.
- `scope` (object, optional) - ABAP Unit scope flags.
- `tests` (array, required) - List of test classes to run.
- `title` (string, optional) - Run title shown in ABAP Unit logs.

---

<a id="handlerunitteststatus-high-level-compact"></a>
#### HandlerUnitTestStatus (High-Level / Compact)
**Description:** ABAP Unit status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Unit test run id.
- `with_long_polling` (boolean, optional (default: true)) - Use long polling while waiting for completion.

---

<a id="handlerunlock-high-level-compact"></a>
#### HandlerUnlock (High-Level / Compact)
**Description:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*, session_id*), PROGRAM(object_name*, lock_handle*, session_id*), INTERFACE(object_name*, lock_handle*, session_id*), FUNCTION_GROUP(object_name*, lock_handle*, session_id*), FUNCTION_MODULE(object_name*, lock_handle*, session_id*), TABLE(object_name*, lock_handle*, session_id*), STRUCTURE(object_name*, lock_handle*, session_id*), DDL(object_name*, lock_handle*, session_id*), DOMAIN(object_name*, lock_handle*, session_id*), DATA_ELEMENT(object_name*, lock_handle*, session_id*), PACKAGE(object_name*, lock_handle*, session_id*), BEHAVIOR_DEFINITION(object_name*, lock_handle*, session_id*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*, session_id*), METADATA_EXTENSION(object_name*, lock_handle*, session_id*).

**Source:** `src/handlers/compact/high/handleHandlerUnlock.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle returned by lock.
- `session_id` (string, required) - ADT session id used during lock.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful unlock flow.

---

<a id="handlerupdate-high-level-compact"></a>
#### HandlerUpdate (High-Level / Compact)
**Description:** Update operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, source_code*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, implementation_code*), METADATA_EXTENSION(name*, source_code*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*, test_class_source*).

**Source:** `src/handlers/compact/high/handleHandlerUpdate.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate object after update.
- `behavior_definition` (string, optional) - Referenced behavior definition name (behavior implementation update).
- `binding_variant` (string, optional) - Service binding variant (service binding update).
- `class_name` (string, optional) - ABAP class name.
- `conversion_exit` (string, optional) - Conversion exit name.
- `data_element_name` (string, optional) - Data element name.
- `datatype` (string, optional) - ABAP data type.
- `ddl_code` (string, optional) - Complete DDL source code (for TABLE/STRUCTURE update).
- `ddl_name` (string, optional) - DDL source name (CDS view, AMDP table function, etc.).
- `ddl_source` (string, optional) - Complete DDL source code (for DDL update).
- `decimals` (number, optional) - Decimal places.
- `definitions_code` (string, optional) - Updated source for class local definitions.
- `description` (string, optional) - Human-readable object description.
- `desired_publication_state` (string, optional) - Target publication state (service binding update).
- `domain_name` (string, optional) - ABAP domain name.
- `fixed_values` (array, optional) - Domain fixed values list.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `implementation_code` (string, optional) - Behavior implementation methods source code.
- `interface_name` (string, optional) - Interface name.
- `length` (number, optional) - Length for typed artifacts.
- `local_types_code` (string, optional) - Updated source for class local types.
- `lowercase` (boolean, optional) - Allow lowercase values (domain setting).
- `macros_code` (string, optional) - Updated source for class local macros.
- `name` (string, optional) - Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `object_type` (any, required) - 
- `package_name` (string, optional) - ABAP package name.
- `program_name` (string, optional) - ABAP program name.
- `run_id` (string, optional) - Unit test run id (UNIT_TEST update).
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `service_name` (string, optional) - Published service name (service binding update).
- `sign_exists` (boolean, optional) - Allow signed values (domain setting).
- `source_code` (string, optional) - ABAP source code payload.
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `test_class_code` (string, optional) - Updated source for the local test class.
- `test_class_source` (string, optional) - Updated local test class source (CDS_UNIT_TEST update).
- `transport_request` (string, optional) - Transport request id (if required by system).
- `value_table` (string, optional) - Foreign key value table.

---

<a id="handlervalidate-high-level-compact"></a>
#### HandlerValidate (High-Level / Compact)
**Description:** Validate before create only. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).

**Source:** `src/handlers/compact/high/handleHandlerValidate.ts`

**Parameters:**
- `behavior_definition` (string, optional) - Optional behavior definition name, used when validating behavior implementation.
- `description` (string, optional) - Optional object description used during validation.
- `implementation_type` (string, optional) - Optional implementation type, used for behavior implementation validation.
- `object_name` (string, required) - Required object name. For SERVICE_BINDING this is the service binding name.
- `object_type` (string, required) - Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `package_name` (string, optional) - Optional package context for validation (especially for create scenarios).
- `root_entity` (string, optional) - Optional CDS root entity name, used for behavior-related validation.
- `service_binding_version` (string, optional) - Optional service binding version for SERVICE_BINDING.
- `service_definition_name` (string, optional) - Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `session_id` (string, optional) - Optional ADT session id for stateful validation flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful validation flow.

---

<a id="high-level-data-element"></a>
### High-Level / Data Element

<a id="checkdataelement-high-level-data-element"></a>
#### CheckDataElement (High-Level / Data Element)
**Description:** Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/data_element/high/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZDE_MY_ELEMENT).

---

<a id="createdataelement-high-level-data-element"></a>
#### CreateDataElement (High-Level / Data Element)
**Description:** Operation: Create. Subject: DataElement. Will be useful for creating data element. Create a new ABAP data element in SAP system. Creates the data element object in initial state.

**Source:** `src/handlers/data_element/high/handleCreateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.
- `data_type` (string, optional (default: CHAR)) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'.
- `decimals` (number, optional (default: 0)) - Decimal places. Usually inherited from domain.
- `description` (string, optional) - Data element description. If not provided, data_element_name will be used.
- `heading_label` (string, optional) - Heading field label (max 55 chars). Applied during update step after creation.
- `length` (number, optional (default: 100)) - Data type length. Usually inherited from domain.
- `long_label` (string, optional) - Long field label (max 40 chars). Applied during update step after creation.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `medium_label` (string, optional) - Medium field label (max 20 chars). Applied during update step after creation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `search_help` (string, optional) - Search help name. Applied during update step after creation.
- `search_help_parameter` (string, optional) - Search help parameter. Applied during update step after creation.
- `set_get_parameter` (string, optional) - Set/Get parameter ID. Applied during update step after creation.
- `short_label` (string, optional) - Short field label (max 10 chars). Applied during update step after creation.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.
- `type_name` (string, optional) - Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')

---

<a id="deletedataelement-high-level-data-element"></a>
#### DeleteDataElement (High-Level / Data Element)
**Description:** Delete an ABAP data element from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/data_element/high/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getdataelement-high-level-data-element"></a>
#### GetDataElement (High-Level / Data Element)
**Description:** Retrieve ABAP data element definition. Supports reading active or inactive version.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatedataelement-high-level-data-element"></a>
#### UpdateDataElement (High-Level / Data Element)
**Description:** Operation: Update, Create. Subject: DataElement. Will be useful for updating or creating data element. Update an existing ABAP data element. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.

**Source:** `src/handlers/data_element/high/handleUpdateDataElement.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate data element after update (default: true)
- `data_element_name` (string, required) - Data element name to update (e.g., ZZ_TEST_DTEL_01)
- `data_type` (string, optional) - Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType
- `decimals` (number, optional) - Decimals - for predefinedAbapType or refToPredefinedAbapType
- `description` (string, optional) - New data element description
- `field_label_heading` (string, optional) - Heading field label (max 55 chars)
- `field_label_long` (string, optional) - Long field label (max 40 chars)
- `field_label_medium` (string, optional) - Medium field label (max 20 chars)
- `field_label_short` (string, optional) - Short field label (max 10 chars)
- `length` (number, optional) - Length - for predefinedAbapType or refToPredefinedAbapType
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `search_help` (string, optional) - Search help name
- `search_help_parameter` (string, optional) - Search help parameter
- `set_get_parameter` (string, optional) - Set/Get parameter ID
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType
- `type_name` (string, optional) - Type name: domain name, data element name, or class name (depending on type_kind)

---

<a id="high-level-ddl"></a>
### High-Level / Ddl

<a id="checkddl-high-level-ddl"></a>
#### CheckDdl (High-Level / Ddl)
**Description:** Perform syntax check on an ABAP CDS view. Can check existing view (active/inactive) or validate hypothetical DDL source. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddl/high/handleCheckDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view name to check, passed as ddl_name (e.g., ZI_MY_VIEW).
- `ddl_source` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: inactive.

---

<a id="createddl-high-level-ddl"></a>
#### CreateDdl (High-Level / Ddl)
**Description:** Operation: Create. Subject: DDL source. Will be useful for creating a DDL source. Create a new CDS View or Classic View in SAP system. Creates the DDL source object in initial state. Use UpdateDdl to set DDL source code.

**Source:** `src/handlers/ddl/high/handleCreateDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).
- `description` (string, optional) - Optional description (defaults to ddl_name).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="deleteddl-high-level-ddl"></a>
#### DeleteDdl (High-Level / Ddl)
**Description:** Delete a DDL source from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/ddl/high/handleDeleteDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_VIEW).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getddl-high-level-ddl"></a>
#### GetDdl (High-Level / Ddl)
**Description:** Retrieve ABAP DDL source definition. Supports reading active or inactive version.

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_VIEW).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateddl-high-level-ddl"></a>
#### UpdateDdl (High-Level / Ddl)
**Description:** Operation: Update, Create. Subject: DDL source. Will be useful for updating or creating a DDL source. Update DDL source code of an existing CDS View or Classic View. Locks, updates, unlocks, and optionally activates. Use CreateDdl to create a new DDL source.

**Source:** `src/handlers/ddl/high/handleUpdateDdl.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `ddl_name` (string, required) - DDL source name (e.g., ZOK_R_TEST_0002).
- `ddl_source` (string, required) - Complete DDL source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="high-level-ddlx"></a>
### High-Level / Ddlx

<a id="checkmetadataextension-high-level-ddlx"></a>
#### CheckMetadataExtension (High-Level / Ddlx)
**Description:** Perform syntax check on an ABAP metadata extension (DDLX). Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddlx/high/handleCheckMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - Metadata extension name (e.g., ZC_MY_DDLX).

---

<a id="createmetadataextension-high-level-ddlx"></a>
#### CreateMetadataExtension (High-Level / Ddlx)
**Description:** Operation: Create. Subject: MetadataExtension. Will be useful for creating metadata extension. Create a new ABAP Metadata Extension (DDLX) in SAP system. Creates the metadata extension object in initial state.

**Source:** `src/handlers/ddlx/high/handleCreateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `name` (string, required) - Metadata Extension name
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number

---

<a id="updatemetadataextension-high-level-ddlx"></a>
#### UpdateMetadataExtension (High-Level / Ddlx)
**Description:** Operation: Update, Create. Subject: MetadataExtension. Will be useful for updating or creating metadata extension. Update source code of an existing ABAP Metadata Extension (DDLX). Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally.
- `name` (string, required) - Metadata Extension name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="high-level-domain"></a>
### High-Level / Domain

<a id="checkdomain-high-level-domain"></a>
#### CheckDomain (High-Level / Domain)
**Description:** Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/domain/high/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZDM_MY_DOMAIN).

---

<a id="createdomain-high-level-domain"></a>
#### CreateDomain (High-Level / Domain)
**Description:** Operation: Create. Subject: Domain. Will be useful for creating domain. Create a new ABAP domain in SAP system. Creates the domain object in initial state.

**Source:** `src/handlers/domain/high/handleCreateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - (optional) Activate domain after creation (default: true)
- `conversion_exit` (string, optional) - (optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional (default: CHAR)) - (optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional (default: 0)) - (optional) Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - (optional) Domain description. If not provided, domain_name will be used.
- `domain_name` (string, required) - Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.
- `fixed_values` (array, optional) - (optional) Array of fixed values for domain value range
- `length` (number, optional (default: 100)) - (optional) Field length (max depends on datatype)
- `lowercase` (boolean, optional (default: false)) - (optional) Allow lowercase input
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, optional) - (optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `sign_exists` (boolean, optional (default: false)) - (optional) Field has sign (+/-)
- `transport_request` (string, optional) - (optional) Transport request number (e.g., E19K905635). Required for transportable packages.
- `value_table` (string, optional) - (optional) Value table name for foreign key relationship

---

<a id="deletedomain-high-level-domain"></a>
#### DeleteDomain (High-Level / Domain)
**Description:** Delete an ABAP domain from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/domain/high/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getdomain-high-level-domain"></a>
#### GetDomain (High-Level / Domain)
**Description:** Retrieve ABAP domain definition. Supports reading active or inactive version.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatedomain-high-level-domain"></a>
#### UpdateDomain (High-Level / Domain)
**Description:** Operation: Update, Create. Subject: Domain. Will be useful for updating or creating domain. Update an existing ABAP domain. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.

**Source:** `src/handlers/domain/high/handleUpdateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate domain after update (default: true)
- `conversion_exit` (string, optional) - Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional) - Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - New domain description (optional)
- `domain_name` (string, required) - Domain name to update (e.g., ZZ_TEST_0001)
- `fixed_values` (array, optional) - Array of fixed values for domain value range
- `length` (number, optional) - Field length (max depends on datatype)
- `lowercase` (boolean, optional) - Allow lowercase input
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `sign_exists` (boolean, optional) - Field has sign (+/-)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `value_table` (string, optional) - Value table name for foreign key relationship

---

<a id="high-level-function"></a>
### High-Level / Function

<a id="checkfunctiongroup-high-level-function"></a>
#### CheckFunctionGroup (High-Level / Function)
**Description:** Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFGRP_MY_GROUP).

---

<a id="checkfunctionmodule-high-level-function"></a>
#### CheckFunctionModule (High-Level / Function)
**Description:** Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module.
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: active.

---

<a id="createfunctiongroup-high-level-function"></a>
#### CreateFunctionGroup (High-Level / Function)
**Description:** Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.

**Source:** `src/handlers/function/high/handleCreateFunctionGroup.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function group after creation. Default: true. Set to false for batch operations.
- `description` (string, optional) - Function group description. If not provided, function_group_name will be used.
- `function_group_name` (string, required) - Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="createfunctionmodule-high-level-function"></a>
#### CreateFunctionModule (High-Level / Function)
**Description:** Operation: Create. Subject: FunctionModule. Will be useful for creating function module. Create a new ABAP function module within an existing function group. Creates the function module in initial state.

**Source:** `src/handlers/function/high/handleCreateFunctionModule.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the function module
- `function_group_name` (string, required) - Parent function group name (e.g., ZTEST_FG_001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="updatefunctiongroup-high-level-function"></a>
#### UpdateFunctionGroup (High-Level / Function)
**Description:** Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don't have source code to update directly. Uses stateful session with proper lock/unlock mechanism.

**Source:** `src/handlers/function/high/handleUpdateFunctionGroup.ts`

**Parameters:**
- `description` (string, required) - New description for the function group.
- `function_group_name` (string, required) - Function group name (e.g., ZTEST_FG_001). Must exist in the system.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="updatefunctionmodule-high-level-function"></a>
#### UpdateFunctionModule (High-Level / Function)
**Description:** Operation: Update, Create. Subject: FunctionModule. Will be useful for updating or creating function module. Update source code of an existing ABAP function module. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/function/high/handleUpdateFunctionModule.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function module after source update. Default: false. Set to true to activate immediately.
- `function_group_name` (string, required) - Function group name containing the function module (e.g., ZOK_FG_MCP01).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist.
- `source_code` (string, required) - Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable function modules.

---

<a id="high-level-function-group"></a>
### High-Level / Function Group

<a id="deletefunctiongroup-high-level-function-group"></a>
#### DeleteFunctionGroup (High-Level / Function Group)
**Description:** Delete an ABAP function group from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_group/high/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getfunctiongroup-high-level-function-group"></a>
#### GetFunctionGroup (High-Level / Function Group)
**Description:** Retrieve ABAP function group definition. Supports reading active or inactive version.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-function-include"></a>
### High-Level / Function Include

<a id="createfunctioninclude-high-level-function-include"></a>
#### CreateFunctionInclude (High-Level / Function Include)
**Description:** Operation: Create. Subject: FunctionInclude. Will be useful for creating function group include. Create a new ABAP include within an existing function group. Creates the include in initial state.

**Source:** `src/handlers/function_include/high/handleCreateFunctionInclude.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the include
- `function_group_name` (string, required) - Parent function group name (e.g., ZTEST_FG_001)
- `include_name` (string, required) - Include name (e.g., LZTEST_FG_001F01).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletefunctioninclude-high-level-function-include"></a>
#### DeleteFunctionInclude (High-Level / Function Include)
**Description:** Delete an ABAP function group include from the SAP system. Note: function module includes must be deleted via the Function Builder; the backend rejects such deletions. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_include/high/handleDeleteFunctionInclude.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the include (e.g., Z_MY_FG).
- `include_name` (string, required) - Include name (e.g., LZ_MY_FGF01).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="updatefunctioninclude-high-level-function-include"></a>
#### UpdateFunctionInclude (High-Level / Function Include)
**Description:** Operation: Update. Subject: FunctionInclude. Will be useful for updating a function group include. Update source code of an existing ABAP function group include.

**Source:** `src/handlers/function_include/high/handleUpdateFunctionInclude.ts`

**Parameters:**
- `activate` (boolean, optional (default: false)) - Activate the include after the source update. Default: false. Set true to make the updated source the active version immediately.
- `function_group_name` (string, required) - Function group name containing the include (e.g., ZOK_FG_MCP01).
- `include_name` (string, required) - Include name (e.g., LZOK_FG_MCP01F01). Include must already exist.
- `source_code` (string, required) - Complete ABAP include source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable includes.

---

<a id="high-level-function-module"></a>
### High-Level / Function Module

<a id="deletefunctionmodule-high-level-function-module"></a>
#### DeleteFunctionModule (High-Level / Function Module)
**Description:** Delete an ABAP function module from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_module/high/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).
- `function_module_name` (string, required) - FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getfunctionmodule-high-level-function-module"></a>
#### GetFunctionModule (High-Level / Function Module)
**Description:** Retrieve ABAP function module definition. Supports reading active or inactive version.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).
- `function_module_name` (string, required) - FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-interface"></a>
### High-Level / Interface

<a id="checkinterface-high-level-interface"></a>
#### CheckInterface (High-Level / Interface)
**Description:** Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/interface/high/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).

---

<a id="createinterface-high-level-interface"></a>
#### CreateInterface (High-Level / Interface)
**Description:** Operation: Create. Subject: Interface. Will be useful for creating interface. Create a new ABAP interface in SAP system. Creates the interface object in initial state.

**Source:** `src/handlers/interface/high/handleCreateInterface.ts`

**Parameters:**
- `description` (string, optional) - Interface description. If not provided, interface_name will be used.
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteinterface-high-level-interface"></a>
#### DeleteInterface (High-Level / Interface)
**Description:** Delete an ABAP interface from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/interface/high/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_INTERFACE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getinterface-high-level-interface"></a>
#### GetInterface (High-Level / Interface)
**Description:** Retrieve ABAP interface definition. Supports reading active or inactive version.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_INTERFACE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateinterface-high-level-interface"></a>
#### UpdateInterface (High-Level / Interface)
**Description:** Operation: Update, Create. Subject: Interface. Will be useful for updating or creating interface. Update source code of an existing ABAP interface. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/interface/high/handleUpdateInterface.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate interface after update. Default: true.
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system.
- `source_code` (string, required) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-message-class"></a>
### High-Level / Message Class

<a id="createmessageclass-high-level-message-class"></a>
#### CreateMessageClass (High-Level / Message Class)
**Description:** Operation: Create. Subject: Message Class (MSAG). Create a new ABAP message class (T100) shell. Individual messages are added afterwards with CreateMessageClassMessage. Message classes are not activated.

**Source:** `src/handlers/message_class/high/handleCreateMessageClass.ts`

**Parameters:**
- `description` (string, optional) - (optional) Short description. If not provided, message_class_name is used.
- `master_language` (string, optional) - (optional) Master/original language (e.g. "EN", "DE"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZMY_PKG, $TMP for local objects).
- `transport_request` (string, optional) - (optional) Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="createmessageclassmessage-high-level-message-class"></a>
#### CreateMessageClassMessage (High-Level / Message Class)
**Description:** Operation: Create. Subject: a single message inside a Message Class (MSAG). Add a message (number + text) to an existing ABAP message class (T100). The parent class must exist first (CreateMessageClass).

**Source:** `src/handlers/message_class/high/handleCreateMessageClassMessage.ts`

**Parameters:**
- `description` (string, optional) - (optional) Long description for the message.
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").
- `msgtext` (string, required) - Message text. May contain placeholders &1 &2 &3 &4 (or &).
- `self_explanatory` (boolean, optional (default: false)) - (optional) Mark the message as self-explanatory (no long text needed). Default: false.
- `transport_request` (string, optional) - (optional) Transport request number. Required for transportable objects.

---

<a id="deletemessageclass-high-level-message-class"></a>
#### DeleteMessageClass (High-Level / Message Class)
**Description:** Delete an ABAP message class (MSAG) and all of its messages from the SAP system. Includes a deletion check before the actual deletion. Transport request required for transportable objects, optional for local ($TMP).

**Source:** `src/handlers/message_class/high/handleDeleteMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects, optional for local ($TMP).

---

<a id="deletemessageclassmessage-high-level-message-class"></a>
#### DeleteMessageClassMessage (High-Level / Message Class)
**Description:** Operation: Delete. Subject: a single message inside a Message Class (MSAG). Remove one message (by number) from an ABAP message class (T100), keeping the class and its other messages. Transport request required for transportable objects.

**Source:** `src/handlers/message_class/high/handleDeleteMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number to delete (e.g., "001").
- `transport_request` (string, optional) - Transport request number. Required for transportable objects, optional for local ($TMP).

---

<a id="getmessageclass-high-level-message-class"></a>
#### GetMessageClass (High-Level / Message Class)
**Description:** Retrieve an ABAP message class (MSAG/T100) with its messages: name, description, package, master language and the message list (msgno, msgtext, self-explanatory).

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).

---

<a id="getmessageclassmessage-high-level-message-class"></a>
#### GetMessageClassMessage (High-Level / Message Class)
**Description:** Retrieve a single message (by number) from an ABAP message class (MSAG/T100). Returns msgno, msgtext, self-explanatory flag and description.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="updatemessageclass-high-level-message-class"></a>
#### UpdateMessageClass (High-Level / Message Class)
**Description:** Operation: Update. Subject: Message Class (MSAG). Update a message class header (e.g. its description). To add or change individual messages use CreateMessageClassMessage / UpdateMessageClassMessage.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClass.ts`

**Parameters:**
- `description` (string, required) - New short description for the message class.
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).
- `transport_request` (string, optional) - (optional) Transport request number. Required for transportable objects.

---

<a id="updatemessageclassmessage-high-level-message-class"></a>
#### UpdateMessageClassMessage (High-Level / Message Class)
**Description:** Operation: Update. Subject: a single message inside a Message Class (MSAG). Change the text / flags of an existing message in an ABAP message class (T100). Upserts the message if it does not exist yet.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClassMessage.ts`

**Parameters:**
- `description` (string, optional) - (optional) Long description for the message.
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").
- `msgtext` (string, required) - New message text. May contain placeholders &1 &2 &3 &4 (or &).
- `self_explanatory` (boolean, optional) - (optional) Mark the message as self-explanatory.
- `transport_request` (string, optional) - (optional) Transport request number. Required for transportable objects.

---

<a id="high-level-metadata-extension"></a>
### High-Level / Metadata Extension

<a id="deletemetadataextension-high-level-metadata-extension"></a>
#### DeleteMetadataExtension (High-Level / Metadata Extension)
**Description:** Delete an ABAP metadata extension from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getmetadataextension-high-level-metadata-extension"></a>
#### GetMetadataExtension (High-Level / Metadata Extension)
**Description:** Retrieve ABAP metadata extension definition. Supports reading active or inactive version.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-package"></a>
### High-Level / Package

<a id="checkpackage-high-level-package"></a>
#### CheckPackage (High-Level / Package)
**Description:** Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/package/high/handleCheckPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZMY_PACKAGE).
- `super_package` (string, required) - Super package name (parent package).

---

<a id="createpackage-high-level-package"></a>
#### CreatePackage (High-Level / Package)
**Description:** Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.

**Source:** `src/handlers/package/high/handleCreatePackage.ts`

**Parameters:**
- None

---

<a id="getpackage-high-level-package"></a>
#### GetPackage (High-Level / Package)
**Description:** Retrieve ABAP package metadata (description, super-package, etc.). Supports reading active or inactive version.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., Z_MY_PACKAGE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-program"></a>
### High-Level / Program

<a id="checkprogram-high-level-program"></a>
#### CheckProgram (High-Level / Program)
**Description:** Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Not available on cloud.

**Source:** `src/handlers/program/high/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., ZMCP_MY_PROGRAM).

---

<a id="createprogram-high-level-program"></a>
#### CreateProgram (High-Level / Program)
**Description:** Operation: Create. Subject: Program. Will be useful for creating program. Create a new ABAP program (report) in SAP system. Creates the program object in initial state.

**Source:** `src/handlers/program/high/handleCreateProgram.ts`

**Parameters:**
- `application` (string, optional) - Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'
- `description` (string, optional) - Program description. If not provided, program_name will be used.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).
- `program_type` (string, optional) - Program type: 'executable' (Report), 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool'. Default: 'executable'
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteprogram-high-level-program"></a>
#### DeleteProgram (High-Level / Program)
**Description:** Delete an ABAP program from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/program/high/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getprogram-high-level-program"></a>
#### GetProgram (High-Level / Program)
**Description:** Retrieve ABAP program definition. Supports reading active or inactive version.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateprogram-high-level-program"></a>
#### UpdateProgram (High-Level / Program)
**Description:** Operation: Update, Create. Subject: Program. Will be useful for updating or creating program. Update source code of an existing ABAP program. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/program/high/handleUpdateProgram.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="high-level-service-binding"></a>
### High-Level / Service Binding

<a id="createservicebinding-high-level-service-binding"></a>
#### CreateServiceBinding (High-Level / Service Binding)
**Description:** Operation: Create. Subject: ServiceBinding. Will be useful for creating service binding. Create a new ABAP service binding in SAP system. Creates the service binding object in initial state.

**Source:** `src/handlers/service_binding/high/handleCreateServiceBinding.ts`

**Parameters:**
- `activate` (boolean, optional (default: true)) - Activate service binding after create. Default: true.
- `binding_variant` (string, optional (default: ODATA_V4_UI)) - Service binding variant. ODATA_V4_UI = OData V4 for Fiori Elements, ODATA_V4_WEB_API = OData V4 Web API, ODATA_V2_UI = OData V2 for Fiori Elements, ODATA_V2_WEB_API = OData V2 Web API.
- `description` (string, optional) - Optional description. Defaults to service_binding_name when omitted.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - ABAP package name.
- `response_format` (string, optional (default: xml)) - 
- `service_binding_name` (string, required) - Service binding name.
- `service_definition_name` (string, required) - Referenced service definition name.
- `service_name` (string, optional) - Published service name. Default: service_binding_name if omitted.
- `service_version` (string, optional) - Published service version. Default: 0001.
- `transport_request` (string, optional) - Optional transport request for transport checks.

---

<a id="deleteservicebinding-high-level-service-binding"></a>
#### DeleteServiceBinding (High-Level / Service Binding)
**Description:** Delete ABAP service binding via ADT Business Services endpoint.

**Source:** `src/handlers/service_binding/high/handleDeleteServiceBinding.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - 
- `service_binding_name` (string, required) - Service binding name to delete.
- `transport_request` (string, optional) - Optional transport request for deletion transport flow.

---

<a id="getservicebinding-high-level-service-binding"></a>
#### GetServiceBinding (High-Level / Service Binding)
**Description:** Retrieve ABAP service binding source/metadata by name via ADT Business Services endpoint.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name (for example: ZUI_MY_BINDING). Case-insensitive.

---

<a id="listservicebindingtypes-high-level-service-binding"></a>
#### ListServiceBindingTypes (High-Level / Service Binding)
**Description:** List available service binding types (for example ODataV2/ODataV4) from ADT Business Services endpoint.

**Source:** `src/handlers/service_binding/high/handleListServiceBindingTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - 

---

<a id="updateservicebinding-high-level-service-binding"></a>
#### UpdateServiceBinding (High-Level / Service Binding)
**Description:** Operation: Update, Create. Subject: ServiceBinding. Will be useful for updating or creating service binding. Update publication state of an existing ABAP service binding.

**Source:** `src/handlers/service_binding/high/handleUpdateServiceBinding.ts`

**Parameters:**
- `binding_variant` (string, required (default: ODATA_V4_UI)) - Service binding variant. Determines OData version for publish/unpublish routing.
- `desired_publication_state` (string, required) - Target publication state.
- `response_format` (string, optional (default: xml)) - 
- `service_binding_name` (string, required) - Service binding name to update.
- `service_name` (string, required) - Published service name.
- `service_version` (string, optional) - Published service version. Optional.

---

<a id="validateservicebinding-high-level-service-binding"></a>
#### ValidateServiceBinding (High-Level / Service Binding)
**Description:** Validate service binding parameters (name, service definition, package, version) via ADT validation endpoint.

**Source:** `src/handlers/service_binding/high/handleValidateServiceBinding.ts`

**Parameters:**
- `description` (string, optional) - Optional description used during validation.
- `package_name` (string, optional) - ABAP package for the binding.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version (for example: 1.0).
- `service_definition_name` (string, required) - Service definition linked to binding.

---

<a id="high-level-service-definition"></a>
### High-Level / Service Definition

<a id="createservicedefinition-high-level-service-definition"></a>
#### CreateServiceDefinition (High-Level / Service Definition)
**Description:** Operation: Create. Subject: ServiceDefinition. Will be useful for creating service definition. Create a new ABAP service definition in SAP system. Creates the service definition object in initial state.

**Source:** `src/handlers/service_definition/high/handleCreateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after creation. Default: true.
- `description` (string, optional) - Service definition description. If not provided, service_definition_name will be used.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `service_definition_name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE). Must follow SAP naming conventions (start with Z or Y).
- `source_code` (string, optional) - Service definition source code (optional). If not provided, a minimal template will be created.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteservicedefinition-high-level-service-definition"></a>
#### DeleteServiceDefinition (High-Level / Service Definition)
**Description:** Delete an ABAP service definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/service_definition/high/handleDeleteServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getservicedefinition-high-level-service-definition"></a>
#### GetServiceDefinition (High-Level / Service Definition)
**Description:** Retrieve ABAP service definition definition. Supports reading active or inactive version.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateservicedefinition-high-level-service-definition"></a>
#### UpdateServiceDefinition (High-Level / Service Definition)
**Description:** Operation: Update, Create. Subject: ServiceDefinition. Will be useful for updating or creating service definition. Update source code of an existing ABAP service definition. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after update. Default: true.
- `service_definition_name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system.
- `source_code` (string, required) - Complete service definition source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-structure"></a>
### High-Level / Structure

<a id="checkstructure-high-level-structure"></a>
#### CheckStructure (High-Level / Structure)
**Description:** Perform syntax check on an ABAP structure. Can check existing structure (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/structure/high/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `structure_name` (string, required) - Structure name (e.g., ZST_MY_STRUCTURE).
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: inactive.

---

<a id="createstructure-high-level-structure"></a>
#### CreateStructure (High-Level / Structure)
**Description:** Operation: Create. Subject: Structure. Will be useful for creating structure. Create a new ABAP structure in SAP system. Creates the structure object in initial state.

**Source:** `src/handlers/structure/high/handleCreateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `description` (string, optional) - Structure description. If not provided, structure_name will be used.
- `fields` (array, required (default: 0)) - Array of structure fields
- `includes` (array, optional) - Include other structures in this structure
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletestructure-high-level-structure"></a>
#### DeleteStructure (High-Level / Structure)
**Description:** Delete an ABAP structure from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/structure/high/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getstructure-high-level-structure"></a>
#### GetStructure (High-Level / Structure)
**Description:** Retrieve ABAP structure definition. Supports reading active or inactive version.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatestructure-high-level-structure"></a>
#### UpdateStructure (High-Level / Structure)
**Description:** Operation: Update, Create. Subject: Structure. Will be useful for updating or creating structure. Update DDL source code of an existing ABAP structure. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/structure/high/handleUpdateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for structure. Example: '@EndUserText.label : \'My Structure\' @AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : abap.clnt not null; id : abap.char(10); name : abap.char(255); }'
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-system"></a>
### High-Level / System

<a id="getpackagetree-high-level-system"></a>
#### GetPackageTree (High-Level / System)
**Description:** [high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `include_descriptions` (boolean, optional (default: true)) - Include object descriptions in response. Default: true
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, required) - Package name (e.g., "ZMY_PACKAGE")

---

<a id="high-level-table"></a>
### High-Level / Table

<a id="checktable-high-level-table"></a>
#### CheckTable (High-Level / Table)
**Description:** Perform syntax check on an ABAP table. Can check existing table (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/table/high/handleCheckTable.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `table_name` (string, required) - Table name (e.g., ZMCP_MY_TABLE).
- `version` (string, optional) - Version to check: 'active', 'inactive', or 'new'. Default: new.

---

<a id="createtable-high-level-table"></a>
#### CreateTable (High-Level / Table)
**Description:** Operation: Create. Subject: Table. Will be useful for creating table. Create a new ABAP table in SAP system. Creates the table object in initial state.

**Source:** `src/handlers/table/high/handleCreateTable.ts`

**Parameters:**
- `description` (string, optional) - Table description for validation and creation.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `table_name` (string, required) - Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletetable-high-level-table"></a>
#### DeleteTable (High-Level / Table)
**Description:** Delete an ABAP table from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/table/high/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="gettable-high-level-table"></a>
#### GetTable (High-Level / Table)
**Description:** Retrieve ABAP table definition. Supports reading active or inactive version.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatetable-high-level-table"></a>
#### UpdateTable (High-Level / Table)
**Description:** Operation: Update, Create. Subject: Table. Will be useful for updating or creating table. Update DDL source code of an existing ABAP table. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/table/high/handleUpdateTable.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate table after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for table. Example: '@EndUserText.label : \'My Table\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'
- `table_name` (string, required) - Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-transport"></a>
### High-Level / Transport

<a id="createtransport-high-level-transport"></a>
#### CreateTransport (High-Level / Transport)
**Description:** Create a new ABAP transport request in SAP system for development objects.

**Source:** `src/handlers/transport/high/handleCreateTransport.ts`

**Parameters:**
- `description` (string, required) - Transport request description (mandatory)
- `owner` (string, optional) - Transport owner (optional, defaults to current user)
- `target_system` (string, optional) - Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'
- `transport_type` (string, optional (default: workbench)) - Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)

---

<a id="high-level-unit-test"></a>
### High-Level / Unit Test

<a id="createcdsunittest-high-level-unit-test"></a>
#### CreateCdsUnitTest (High-Level / Unit Test)
**Description:** Create a CDS unit test class with CDS validation. Creates the test class in initial state.

**Source:** `src/handlers/unit_test/high/handleCreateCdsUnitTest.ts`

**Parameters:**
- `cds_view_name` (string, required) - CDS view name to validate for unit test doubles.
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `description` (string, optional) - Optional description for the global test class.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_PKG_01, $TMP).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="createunittest-high-level-unit-test"></a>
#### CreateUnitTest (High-Level / Unit Test)
**Description:** Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.

**Source:** `src/handlers/unit_test/high/handleCreateUnitTest.ts`

**Parameters:**
- `context` (string, optional) - Optional context string shown in SAP tools.
- `duration` (object, optional) - 
- `risk_level` (object, optional) - 
- `scope` (object, optional) - 
- `tests` (array, required) - List of container/test class pairs to execute.
- `title` (string, optional) - Optional title for the ABAP Unit run.

---

<a id="deletecdsunittest-high-level-unit-test"></a>
#### DeleteCdsUnitTest (High-Level / Unit Test)
**Description:** Delete a CDS unit test class (global class).

**Source:** `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="deleteunittest-high-level-unit-test"></a>
#### DeleteUnitTest (High-Level / Unit Test)
**Description:** Delete an ABAP Unit test run. Note: ADT does not support deleting unit test runs and will return an error.

**Source:** `src/handlers/unit_test/high/handleDeleteUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by CreateUnitTest/RunUnitTest.

---

<a id="getcdsunittest-high-level-unit-test"></a>
#### GetCdsUnitTest (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run status and result for a previously started run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.

---

<a id="getcdsunittestresult-high-level-unit-test"></a>
#### GetCdsUnitTestResult (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run result for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

<a id="getcdsunitteststatus-high-level-unit-test"></a>
#### GetCdsUnitTestStatus (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="getunittest-high-level-unit-test"></a>
#### GetUnitTest (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run status and result for a previously started run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunUnitTest.

---

<a id="getunittestresult-high-level-unit-test"></a>
#### GetUnitTestResult (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run result for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

<a id="getunitteststatus-high-level-unit-test"></a>
#### GetUnitTestStatus (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="rununittest-high-level-unit-test"></a>
#### RunUnitTest (High-Level / Unit Test)
**Description:** Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.

**Source:** `src/handlers/unit_test/high/handleRunUnitTest.ts`

**Parameters:**
- `context` (string, optional) - Optional context string shown in SAP tools.
- `duration` (object, optional) - 
- `risk_level` (object, optional) - 
- `scope` (object, optional) - 
- `tests` (array, required) - List of container/test class pairs to execute.
- `title` (string, optional) - Optional title for the ABAP Unit run.

---

<a id="updatecdsunittest-high-level-unit-test"></a>
#### UpdateCdsUnitTest (High-Level / Unit Test)
**Description:** Update a CDS unit test class local test class source code.

**Source:** `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `test_class_source` (string, required) - Updated local test class ABAP source code.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="updateunittest-high-level-unit-test"></a>
#### UpdateUnitTest (High-Level / Unit Test)
**Description:** Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.

**Source:** `src/handlers/unit_test/high/handleUpdateUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by CreateUnitTest/RunUnitTest.

---

<a id="low-level-group"></a>
## Low-Level Group

<a id="low-level-behavior-definition"></a>
### Low-Level / Behavior Definition

<a id="activatebehaviordefinitionlow-low-level-behavior-definition"></a>
#### ActivateBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** Operation: Activate, Create, Update. Subject: BehaviorDefinition. Will be useful for activating, creating, or updating behavior definition. [low-level] Activate an ABAP behavior definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleActivateBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - Behavior definition name (root entity, e.g., ZI_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkbdeflow-low-level-behavior-definition"></a>
#### CheckBdefLow (Low-Level / Behavior Definition)
**Description:** [low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createbehaviordefinitionlow-low-level-behavior-definition"></a>
#### CreateBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Create a new ABAP Behavior Definition. - use CreateBehaviorDefinition (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/behavior_definition/low/handleCreateBehaviorDefinition.ts`

**Parameters:**
- `description` (string, required) - Behavior Definition description.
- `implementation_type` (string, required) - Implementation type: 'Managed', 'Unmanaged', 'Abstract', or 'Projection'.
- `name` (string, required) - Behavior Definition name (e.g., ZI_MY_BDEF).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `root_entity` (string, required) - Root entity name (e.g., ZI_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required.

---

<a id="deletebehaviordefinitionlow-low-level-behavior-definition"></a>
#### DeleteBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_definition/low/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockbehaviordefinitionlow-low-level-behavior-definition"></a>
#### LockBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Lock an ABAP behavior definition for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/behavior_definition/low/handleLockBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockbehaviordefinitionlow-low-level-behavior-definition"></a>
#### UnlockBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Unlock an ABAP behavior definition after modification. Must use the same session_id and lock_handle from LockBehaviorDefinition operation.

**Source:** `src/handlers/behavior_definition/low/handleUnlockBehaviorDefinition.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockBehaviorDefinition operation.
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, required) - Session ID from LockBehaviorDefinition operation. Must be the same as used in LockBehaviorDefinition.
- `session_state` (object, optional) - Session state from LockBehaviorDefinition (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatebehaviordefinitionlow-low-level-behavior-definition"></a>
#### UpdateBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/behavior_definition/low/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `name` (string, required) - Behavior definition name (e.g., ZOK_C_TEST_0001). Behavior definition must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete behavior definition source code.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="validatebehaviordefinitionlow-low-level-behavior-definition"></a>
#### ValidateBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Validate an ABAP behavior definition name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleValidateBehaviorDefinition.ts`

**Parameters:**
- `description` (string, required) - BehaviorDefinition description. Required for validation.
- `implementation_type` (string, required) - Implementation type: 'Managed', 'Unmanaged', 'Abstract', or 'Projection'.
- `name` (string, required) - BehaviorDefinition name to validate (e.g., ZI_MY_BDEF).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `root_entity` (string, required) - Root entity name (e.g., ZI_MY_ENTITY). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-behavior-implementation"></a>
### Low-Level / Behavior Implementation

<a id="createbehaviorimplementationlow-low-level-behavior-implementation"></a>
#### CreateBehaviorImplementationLow (Low-Level / Behavior Implementation)
**Description:** [low-level] Create a new ABAP behavior implementation class with full workflow (create, lock, update main source, update implementations, unlock, activate). - use CreateBehaviorImplementation (high-level) for additional validation.

**Source:** `src/handlers/behavior_implementation/low/handleCreateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Required.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions.
- `description` (string, required) - Class description.
- `implementation_code` (string, optional) - Implementation code for the implementations include (optional).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="lockbehaviorimplementationlow-low-level-behavior-implementation"></a>
#### LockBehaviorImplementationLow (Low-Level / Behavior Implementation)
**Description:** [low-level] Lock an ABAP behavior implementation class for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/behavior_implementation/low/handleLockBehaviorImplementation.ts`

**Parameters:**
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatebehaviorimplementationlow-low-level-behavior-implementation"></a>
#### ValidateBehaviorImplementationLow (Low-Level / Behavior Implementation)
**Description:** [low-level] Validate an ABAP behavior implementation class name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_implementation/low/handleValidateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Required for validation.
- `class_name` (string, required) - Behavior Implementation class name to validate (e.g., ZBP_MY_ENTITY).
- `description` (string, required) - Class description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-class"></a>
### Low-Level / Class

<a id="activateclasslow-low-level-class"></a>
#### ActivateClassLow (Low-Level / Class)
**Description:** Operation: Activate, Create, Update. Subject: Class. Will be useful for activating, creating, or updating class. [low-level] Activate an ABAP class. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleActivateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="activateclasstestclasseslow-low-level-class"></a>
#### ActivateClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Activate ABAP Unit test classes include for an existing class. Should be executed after updating and unlocking test classes.

**Source:** `src/handlers/class/low/handleActivateClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `test_class_name` (string, optional) - Optional ABAP Unit test class name (e.g., LTCL_MY_CLASS). Defaults to auto-detected value.

---

<a id="checkclasslow-low-level-class"></a>
#### CheckClassLow (Low-Level / Class)
**Description:** [low-level] Perform syntax check on an ABAP class. Can check existing class (active/inactive) or hypothetical source code. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active

---

<a id="createclasslow-low-level-class"></a>
#### CreateClassLow (Low-Level / Class)
**Description:** [low-level] Create a new ABAP class. - use CreateClass (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/class/low/handleCreateClass.ts`

**Parameters:**
- `abstract` (boolean, optional (default: false).)) - Mark class as abstract (optional, default: false).
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions.
- `create_protected` (boolean, optional (default: false).)) - Create protected section (optional, default: false).
- `description` (string, required) - Class description.
- `final` (boolean, optional (default: false).)) - Mark class as final (optional, default: false).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `superclass` (string, optional) - Superclass name (optional).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteclasslow-low-level-class"></a>
#### DeleteClassLow (Low-Level / Class)
**Description:** [low-level] Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/class/low/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getclassunittestresultlow-low-level-class"></a>
#### GetClassUnitTestResultLow (Low-Level / Class)
**Description:** [low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.

**Source:** `src/handlers/class/low/handleGetClassUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Preferred response format. Defaults to 'abapunit'.
- `run_id` (string, required) - Run identifier returned by RunClassUnitTestsLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_navigation_uris` (boolean, optional) - Optional flag to request navigation URIs in SAP response (default true).

---

<a id="getclassunitteststatuslow-low-level-class"></a>
#### GetClassUnitTestStatusLow (Low-Level / Class)
**Description:** [low-level] Retrieve ABAP Unit run status XML for a previously started run_id.

**Source:** `src/handlers/class/low/handleGetClassUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunClassUnitTestsLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_long_polling` (boolean, optional) - Optional flag to enable SAP long-polling (default true).

---

<a id="lockclasslow-low-level-class"></a>
#### LockClassLow (Low-Level / Class)
**Description:** [low-level] Lock an ABAP class for modification. Uses session from HandlerContext. Returns lock handle that must be used in subsequent update/unlock operations.

**Source:** `src/handlers/class/low/handleLockClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).

---

<a id="lockclasstestclasseslow-low-level-class"></a>
#### LockClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Lock ABAP Unit test classes include (CLAS/OC testclasses) for the specified class. Returns a test_classes_lock_handle for subsequent update/unlock operations using the same session.

**Source:** `src/handlers/class/low/handleLockClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="runclassunittestslow-low-level-class"></a>
#### RunClassUnitTestsLow (Low-Level / Class)
**Description:** [low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.

**Source:** `src/handlers/class/low/handleRunClassUnitTests.ts`

**Parameters:**
- `context` (string, optional) - Optional context string shown in SAP tools.
- `duration` (object, optional) - 
- `risk_level` (object, optional) - 
- `scope` (object, optional) - 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `tests` (array, required) - List of container/test class pairs to execute.
- `title` (string, optional) - Optional title for the ABAP Unit run.

---

<a id="unlockclasslow-low-level-class"></a>
#### UnlockClassLow (Low-Level / Class)
**Description:** [low-level] Unlock an ABAP class after modification. Uses session from HandlerContext. Must use the same lock_handle from LockClass operation.

**Source:** `src/handlers/class/low/handleUnlockClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle from LockClass operation.

---

<a id="unlockclasstestclasseslow-low-level-class"></a>
#### UnlockClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Unlock ABAP Unit test classes include for a class using the test_classes_lock_handle obtained from LockClassTestClassesLow.

**Source:** `src/handlers/class/low/handleUnlockClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle returned by LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateclasslow-low-level-class"></a>
#### UpdateClassLow (Low-Level / Class)
**Description:** [low-level] Update source code of an existing ABAP class. Uses session from HandlerContext. Requires lock handle from LockClass operation. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/class/low/handleUpdateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.
- `lock_handle` (string, required) - Lock handle from LockClass operation. Required for update operation.
- `source_code` (string, required) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.

---

<a id="updateclasstestclasseslow-low-level-class"></a>
#### UpdateClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Upload ABAP Unit test include source code for an existing class. Requires test_classes_lock_handle from LockClassTestClassesLow.

**Source:** `src/handlers/class/low/handleUpdateClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Test classes lock handle from LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `test_class_source` (string, required) - Complete ABAP Unit test class source code.

---

<a id="validateclasslow-low-level-class"></a>
#### ValidateClassLow (Low-Level / Class)
**Description:** [low-level] Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleValidateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name to validate (e.g., ZCL_MY_CLASS)
- `description` (string, required) - Description for validation (required).
- `package_name` (string, required) - Package name for validation (required).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `superclass` (string, optional) - Optional superclass name for validation (e.g., CL_OBJECT)

---

<a id="low-level-common"></a>
### Low-Level / Common

<a id="activateobjectlow-low-level-common"></a>
#### ActivateObjectLow (Low-Level / Common)
**Description:** [low-level] Activate one or multiple ABAP repository objects. Works with any object type; URI is auto-generated from name and type.

**Source:** `src/handlers/common/low/handleActivateObject.ts`

**Parameters:**
- `objects` (array, required) - Array of objects to activate. Each object must have 'name' and 'type'. URI is optional.
- `preaudit` (boolean, optional) - Request pre-audit before activation. Default: true

---

<a id="checkobjectlow-low-level-common"></a>
#### CheckObjectLow (Low-Level / Common)
**Description:** [low-level] Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/common/low/handleCheckObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)
- `object_type` (string, required) - Object type
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 'active' or 'inactive' (default active)

---

<a id="deleteobjectlow-low-level-common"></a>
#### DeleteObjectLow (Low-Level / Common)
**Description:** [low-level] Delete an ABAP object via ADT deletion API. Transport request optional for $TMP objects. Note: object_type "program" is onprem/legacy only — calling it on ABAP Cloud will fail.

**Source:** `src/handlers/common/low/handleDeleteObject.ts`

**Parameters:**
- `function_group_name` (string, optional) - Required only for function_module type
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS)
- `object_type` (string, required) - Object type. Supported: class, program (onprem/legacy only), interface, function_group, function_module, table, structure, ddl, domain, data_element, behavior_definition, metadata_extension. Also accepts ADT codes (clas/oc, prog/p, intf/oi, fugr/f, fugr/ff, tabl/dt, ttyp/st, ddls/df, doma/dm, dtel/de, bdef/bd, ddlx/ex).
- `transport_request` (string, optional) - Transport request number

---

<a id="lockobjectlow-low-level-common"></a>
#### LockObjectLow (Low-Level / Common)
**Description:** [low-level] Lock an ABAP object for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/common/low/handleLockObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME
- `object_type` (string, required) - Object type
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, optional) - Super package (required for package locking)

---

<a id="unlockobjectlow-low-level-common"></a>
#### UnlockObjectLow (Low-Level / Common)
**Description:** [low-level] Unlock an ABAP object after modification. Must use the same session_id and lock_handle from the LockObject operation.

**Source:** `src/handlers/common/low/handleUnlockObject.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME
- `object_type` (string, required) - Object type
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same session.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validateobjectlow-low-level-common"></a>
#### ValidateObjectLow (Low-Level / Common)
**Description:** [low-level] Validate an ABAP object name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/common/low/handleValidateObject.ts`

**Parameters:**
- `behavior_definition` (string, optional) - Optional behavior definition name (required for behavior_implementation validation)
- `description` (string, optional) - Optional description for validation
- `implementation_type` (string, optional) - Implementation type: 'Managed', 'Unmanaged', or 'External' (required for behavior_definition validation)
- `object_name` (string, required) - Object name to validate (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE)
- `object_type` (string, required) - Object type: 'class', 'program', 'interface', 'function_group', 'table', 'structure', 'ddl', 'domain', 'data_element', 'package', 'behavior_definition', 'behavior_implementation', 'metadata_extension'
- `package_name` (string, optional) - Optional package name for validation
- `root_entity` (string, optional) - Root entity name (required for behavior_definition validation)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-data-element"></a>
### Low-Level / Data Element

<a id="activatedataelementlow-low-level-data-element"></a>
#### ActivateDataElementLow (Low-Level / Data Element)
**Description:** Operation: Activate, Create, Update. Subject: DataElement. Will be useful for activating, creating, or updating data element. [low-level] Activate an ABAP data element. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleActivateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZDT_MY_ELEMENT).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkdataelementlow-low-level-data-element"></a>
#### CheckDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createdataelementlow-low-level-data-element"></a>
#### CreateDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Create a new ABAP data element. - use CreateDataElement (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/data_element/low/handleCreateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `data_type` (string, optional) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'E' or 'domain'.
- `decimals` (number, optional) - Decimal places (for predefinedAbapType or refToPredefinedAbapType)
- `description` (string, required) - DataElement description.
- `length` (number, optional) - Data type length (for predefinedAbapType or refToPredefinedAbapType)
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional) - Type kind: 'E' for domain-based, 'P' for predefined type, etc.
- `type_name` (string, optional) - Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')

---

<a id="deletedataelementlow-low-level-data-element"></a>
#### DeleteDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/data_element/low/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockdataelementlow-low-level-data-element"></a>
#### LockDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Lock an ABAP data element for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/data_element/low/handleLockDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockdataelementlow-low-level-data-element"></a>
#### UnlockDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Unlock an ABAP data element after modification. Must use the same session_id and lock_handle from LockDataElement operation.

**Source:** `src/handlers/data_element/low/handleUnlockDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDataElement operation.
- `session_id` (string, required) - Session ID from LockDataElement operation. Must be the same as used in LockDataElement.
- `session_state` (object, optional) - Session state from LockDataElement (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatedataelementlow-low-level-data-element"></a>
#### UpdateDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/data_element/low/handleUpdateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZOK_E_TEST_0001). Data element must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `properties` (object, required) - Data element properties object. Can include: description, type_name, type_kind, data_type, field_label_short, field_label_medium, field_label_long, etc.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatedataelementlow-low-level-data-element"></a>
#### ValidateDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Validate an ABAP data element name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleValidateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name to validate (e.g., Z_MY_PROGRAM).
- `description` (string, required) - DataElement description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-ddl"></a>
### Low-Level / Ddl

<a id="activateddllow-low-level-ddl"></a>
#### ActivateDdlLow (Low-Level / Ddl)
**Description:** Operation: Activate, Create, Update. Subject: DDL source. Will be useful for activating, creating, or updating a DDL source. [low-level] Activate an ABAP DDL source (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddl/low/handleActivateDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., ZVW_MY_VIEW).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkddllow-low-level-ddl"></a>
#### CheckDdlLow (Low-Level / Ddl)
**Description:** [low-level] Perform syntax check on an ABAP DDL source. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_source is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/ddl/low/handleCheckDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_PROGRAM).
- `ddl_source` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: inactive

---

<a id="createddllow-low-level-ddl"></a>
#### CreateDdlLow (Low-Level / Ddl)
**Description:** [low-level] Create a new ABAP DDL source. - use CreateDdl (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/ddl/low/handleCreateDdl.ts`

**Parameters:**
- `application` (string, optional (default: *').)) - Application area (optional, default: '*').
- `ddl_name` (string, required) - DDL source name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - DDL source description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteddllow-low-level-ddl"></a>
#### DeleteDdlLow (Low-Level / Ddl)
**Description:** [low-level] Delete a DDL source from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/ddl/low/handleDeleteDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockddllow-low-level-ddl"></a>
#### LockDdlLow (Low-Level / Ddl)
**Description:** [low-level] Lock a DDL source for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/ddl/low/handleLockDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockddllow-low-level-ddl"></a>
#### UnlockDdlLow (Low-Level / Ddl)
**Description:** [low-level] Unlock an ABAP DDL source after modification. Must use the same session_id and lock_handle from LockDdlLow operation.

**Source:** `src/handlers/ddl/low/handleUnlockDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDdlLow operation.
- `session_id` (string, required) - Session ID from LockDdlLow operation. Must be the same as used in LockDdlLow.
- `session_state` (object, optional) - Session state from LockDdlLow (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateddllow-low-level-ddl"></a>
#### UpdateDdlLow (Low-Level / Ddl)
**Description:** [low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockDdlLow. - use UpdateDdl (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/ddl/low/handleUpdateDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., ZOK_R_TEST_0002). DDL source must already exist.
- `ddl_source` (string, required) - Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement.
- `lock_handle` (string, required) - Lock handle from LockDdlLow. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validateddllow-low-level-ddl"></a>
#### ValidateDdlLow (Low-Level / Ddl)
**Description:** [low-level] Validate an ABAP DDL source name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddl/low/handleValidateDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name to validate (e.g., Z_MY_PROGRAM).
- `description` (string, required) - DDL source description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-ddlx"></a>
### Low-Level / Ddlx

<a id="activatemetadataextensionlow-low-level-ddlx"></a>
#### ActivateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** Operation: Activate, Create, Update. Subject: MetadataExtension. Will be useful for activating, creating, or updating metadata extension. [low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleActivateMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - Metadata extension name (e.g., ZC_MY_EXTENSION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkmetadataextensionlow-low-level-ddlx"></a>
#### CheckMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleCheckMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createmetadataextensionlow-low-level-ddlx"></a>
#### CreateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Create a new ABAP Metadata Extension. - use CreateMetadataExtension (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/ddlx/low/handleCreateMetadataExtension.ts`

**Parameters:**
- `description` (string, required) - Metadata Extension description.
- `master_language` (string, optional) - Master language (optional, e.g., 'EN').
- `name` (string, required) - Metadata Extension name (e.g., ZI_MY_DDLX).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional for local objects.

---

<a id="deletemetadataextensionlow-low-level-ddlx"></a>
#### DeleteMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/ddlx/low/handleDeleteMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockmetadataextensionlow-low-level-ddlx"></a>
#### LockMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Lock an ABAP metadata extension for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/ddlx/low/handleLockMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockmetadataextensionlow-low-level-ddlx"></a>
#### UnlockMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Unlock an ABAP metadata extension after modification. Must use the same session_id and lock_handle from LockMetadataExtension operation.

**Source:** `src/handlers/ddlx/low/handleUnlockMetadataExtension.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockMetadataExtension operation.
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `session_id` (string, required) - Session ID from LockMetadataExtension operation. Must be the same as used in LockMetadataExtension.
- `session_state` (object, optional) - Session state from LockMetadataExtension (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatemetadataextensionlow-low-level-ddlx"></a>
#### UpdateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Update source code of an existing ABAP metadata extension. Requires lock handle from LockObject. - use UpdateMetadataExtension (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/ddlx/low/handleUpdateMetadataExtension.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `name` (string, required) - Metadata extension name (e.g., ZOK_C_TEST_0001). Metadata extension must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete metadata extension source code.

---

<a id="validatemetadataextensionlow-low-level-ddlx"></a>
#### ValidateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Validate an ABAP metadata extension name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleValidateMetadataExtension.ts`

**Parameters:**
- `description` (string, required) - MetadataExtension description.
- `name` (string, required) - MetadataExtension name to validate (e.g., ZI_MY_DDLX).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-domain"></a>
### Low-Level / Domain

<a id="activatedomainlow-low-level-domain"></a>
#### ActivateDomainLow (Low-Level / Domain)
**Description:** Operation: Activate, Create, Update. Subject: Domain. Will be useful for activating, creating, or updating domain. [low-level] Activate an ABAP domain. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleActivateDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZDM_MY_DOMAIN).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkdomainlow-low-level-domain"></a>
#### CheckDomainLow (Low-Level / Domain)
**Description:** [low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createdomainlow-low-level-domain"></a>
#### CreateDomainLow (Low-Level / Domain)
**Description:** [low-level] Create a new ABAP domain. - use CreateDomain (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/domain/low/handleCreateDomain.ts`

**Parameters:**
- `description` (string, required) - Domain description.
- `domain_name` (string, required) - Domain name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletedomainlow-low-level-domain"></a>
#### DeleteDomainLow (Low-Level / Domain)
**Description:** [low-level] Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/domain/low/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockdomainlow-low-level-domain"></a>
#### LockDomainLow (Low-Level / Domain)
**Description:** [low-level] Lock an ABAP domain for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/domain/low/handleLockDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockdomainlow-low-level-domain"></a>
#### UnlockDomainLow (Low-Level / Domain)
**Description:** [low-level] Unlock an ABAP domain after modification. Must use the same session_id and lock_handle from LockDomain operation.

**Source:** `src/handlers/domain/low/handleUnlockDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDomain operation.
- `session_id` (string, required) - Session ID from LockDomain operation. Must be the same as used in LockDomain.
- `session_state` (object, optional) - Session state from LockDomain (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatedomainlow-low-level-domain"></a>
#### UpdateDomainLow (Low-Level / Domain)
**Description:** [low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/domain/low/handleUpdateDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZOK_D_TEST_0001). Domain must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `properties` (object, required) - Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatedomainlow-low-level-domain"></a>
#### ValidateDomainLow (Low-Level / Domain)
**Description:** [low-level] Validate an ABAP domain name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleValidateDomain.ts`

**Parameters:**
- `description` (string, required) - Domain description (required for validation).
- `domain_name` (string, required) - Domain name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (required for validation).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-function"></a>
### Low-Level / Function

<a id="activatefunctiongrouplow-low-level-function"></a>
#### ActivateFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Activate an ABAP function group. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleActivateFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="activatefunctionmodulelow-low-level-function"></a>
#### ActivateFunctionModuleLow (Low-Level / Function)
**Description:** Operation: Activate, Create, Update. Subject: FunctionModule. Will be useful for activating, creating, or updating function module. [low-level] Activate an ABAP function module. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleActivateFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `function_module_name` (string, required) - Function module name (e.g., Z_FM_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkfunctiongrouplow-low-level-function"></a>
#### CheckFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkfunctionmodulelow-low-level-function"></a>
#### CheckFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleCheckFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active

---

<a id="createfunctiongrouplow-low-level-function"></a>
#### CreateFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Create a new ABAP function group. - use CreateFunctionGroup (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/function/low/handleCreateFunctionGroup.ts`

**Parameters:**
- `description` (string, required) - Function group description.
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="createfunctionmodulelow-low-level-function"></a>
#### CreateFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Create a new ABAP function module. - use CreateFunctionModule (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/function/low/handleCreateFunctionModule.ts`

**Parameters:**
- `description` (string, required) - Function module description.
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletefunctiongrouplow-low-level-function"></a>
#### DeleteFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/function/low/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="deletefunctionmodulelow-low-level-function"></a>
#### DeleteFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/function/low/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockfunctiongrouplow-low-level-function"></a>
#### LockFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Lock an ABAP function group for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/function/low/handleLockFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="lockfunctionmodulelow-low-level-function"></a>
#### LockFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Lock an ABAP function module for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/function/low/handleLockFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockfunctiongrouplow-low-level-function"></a>
#### UnlockFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Unlock an ABAP function group after modification. Must use the same session_id and lock_handle from LockFunctionGroup operation.

**Source:** `src/handlers/function/low/handleUnlockFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockFunctionGroup operation.
- `session_id` (string, required) - Session ID from LockFunctionGroup operation. Must be the same as used in LockFunctionGroup.
- `session_state` (object, optional) - Session state from LockFunctionGroup (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockfunctionmodulelow-low-level-function"></a>
#### UnlockFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Unlock an ABAP function module after modification. Must use the same session_id and lock_handle from LockFunctionModule operation.

**Source:** `src/handlers/function/low/handleUnlockFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `lock_handle` (string, required) - Lock handle from LockFunctionModule operation.
- `session_id` (string, required) - Session ID from LockFunctionModule operation. Must be the same as used in LockFunctionModule.
- `session_state` (object, optional) - Session state from LockFunctionModule (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatefunctionmodulelow-low-level-function"></a>
#### UpdateFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/function/low/handleUpdateFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module (e.g., Z_TEST_FG).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM). Function module must already exist.
- `lock_handle` (string, required) - Lock handle from LockFunctionModule. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP function module source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects locked in a request.

---

<a id="validatefunctiongrouplow-low-level-function"></a>
#### ValidateFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleValidateFunctionGroup.ts`

**Parameters:**
- `description` (string, optional) - Optional description for validation
- `function_group_name` (string, required) - FunctionGroup name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, optional) - Package name for validation (optional but recommended).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatefunctionmodulelow-low-level-function"></a>
#### ValidateFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleValidateFunctionModule.ts`

**Parameters:**
- `description` (string, optional) - Optional description for validation
- `function_group_name` (string, required) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name to validate (e.g., Z_TEST_FM)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-interface"></a>
### Low-Level / Interface

<a id="activateinterfacelow-low-level-interface"></a>
#### ActivateInterfaceLow (Low-Level / Interface)
**Description:** Operation: Activate, Create, Update. Subject: Interface. Will be useful for activating, creating, or updating interface. [low-level] Activate an ABAP interface. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleActivateInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkinterfacelow-low-level-interface"></a>
#### CheckInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createinterfacelow-low-level-interface"></a>
#### CreateInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Create a new ABAP interface. - use CreateInterface (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/interface/low/handleCreateInterface.ts`

**Parameters:**
- `description` (string, required) - Interface description.
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteinterfacelow-low-level-interface"></a>
#### DeleteInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/interface/low/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockinterfacelow-low-level-interface"></a>
#### LockInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Lock an ABAP interface for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/interface/low/handleLockInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockinterfacelow-low-level-interface"></a>
#### UnlockInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Unlock an ABAP interface after modification. Must use the same session_id and lock_handle from LockInterface operation.

**Source:** `src/handlers/interface/low/handleUnlockInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockInterface operation.
- `session_id` (string, required) - Session ID from LockInterface operation. Must be the same as used in LockInterface.
- `session_state` (object, optional) - Session state from LockInterface (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateinterfacelow-low-level-interface"></a>
#### UpdateInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/interface/low/handleUpdateInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE). Interface must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP interface source code.

---

<a id="validateinterfacelow-low-level-interface"></a>
#### ValidateInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Validate an ABAP interface name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleValidateInterface.ts`

**Parameters:**
- `description` (string, required) - Interface description. Required for validation.
- `interface_name` (string, required) - Interface name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-package"></a>
### Low-Level / Package

<a id="checkpackagelow-low-level-package"></a>
#### CheckPackageLow (Low-Level / Package)
**Description:** [low-level] Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/package/low/handleCheckPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.

---

<a id="createpackagelow-low-level-package"></a>
#### CreatePackageLow (Low-Level / Package)
**Description:** [low-level] Create a new ABAP package. - use CreatePackage (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/package/low/handleCreatePackage.ts`

**Parameters:**
- `application_component` (string, optional) - Application component (e.g., BC-ABA).
- `description` (string, required) - Package description.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions.
- `package_type` (string, optional) - Package type (development/structure). Defaults to development.
- `record_changes` (boolean, optional) - Enable change recording for the package. Required for transportable packages (non-$TMP). Default: false.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `software_component` (string, optional) - Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.
- `transport_layer` (string, optional) - Transport layer (e.g., ZDEV). Required for transportable packages.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletepackagelow-low-level-package"></a>
#### DeletePackageLow (Low-Level / Package)
**Description:** [low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/package/low/handleDeletePackage.ts`

**Parameters:**
- `connection_config` (object, optional) - Optional SAP connection config to create a fresh connection for deletion. Useful when the existing connection config is unavailable.
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.
- `package_name` (string, required) - Package name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockpackagelow-low-level-package"></a>
#### LockPackageLow (Low-Level / Package)
**Description:** [low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. Requires super_package.

**Source:** `src/handlers/package/low/handleLockPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.

---

<a id="unlockpackagelow-low-level-package"></a>
#### UnlockPackageLow (Low-Level / Package)
**Description:** [low-level] Unlock an ABAP package after modification. Requires lock handle from LockObject and superPackage. - must use the same session_id and lock_handle from LockObject.

**Source:** `src/handlers/package/low/handleUnlockPackage.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same as used in LockObject.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.

---

<a id="updatepackagelow-low-level-package"></a>
#### UpdatePackageLow (Low-Level / Package)
**Description:** [low-level] Update description of an existing ABAP package. Requires lock handle from LockObject and superPackage. - use UpdatePackageSource for full workflow with lock/unlock.

**Source:** `src/handlers/package/low/handleUpdatePackage.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.
- `updated_description` (string, required) - New description for the package.

---

<a id="validatepackagelow-low-level-package"></a>
#### ValidatePackageLow (Low-Level / Package)
**Description:** [low-level] Validate an ABAP package name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/package/low/handleValidatePackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Parent (super) package name. The new package will be created under this package.

---

<a id="low-level-program"></a>
### Low-Level / Program

<a id="activateprogramlow-low-level-program"></a>
#### ActivateProgramLow (Low-Level / Program)
**Description:** Operation: Activate, Create, Update. Subject: Program. Will be useful for activating, creating, or updating program. [low-level] Activate an ABAP program. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleActivateProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkprogramlow-low-level-program"></a>
#### CheckProgramLow (Low-Level / Program)
**Description:** [low-level] Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createprogramlow-low-level-program"></a>
#### CreateProgramLow (Low-Level / Program)
**Description:** [low-level] Create a new ABAP program. - use CreateProgram (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/program/low/handleCreateProgram.ts`

**Parameters:**
- `application` (string, optional (default: *').)) - Application area (optional, default: '*').
- `description` (string, required) - Program description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `program_type` (string, optional) - Program type: 'executable', 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool' (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteprogramlow-low-level-program"></a>
#### DeleteProgramLow (Low-Level / Program)
**Description:** [low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/program/low/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockprogramlow-low-level-program"></a>
#### LockProgramLow (Low-Level / Program)
**Description:** [low-level] Lock an ABAP program for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/program/low/handleLockProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockprogramlow-low-level-program"></a>
#### UnlockProgramLow (Low-Level / Program)
**Description:** [low-level] Unlock an ABAP program after modification. Must use the same session_id and lock_handle from LockProgram operation.

**Source:** `src/handlers/program/low/handleUnlockProgram.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockProgram operation.
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, required) - Session ID from LockProgram operation. Must be the same as used in LockProgram.
- `session_state` (object, optional) - Session state from LockProgram (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateprogramlow-low-level-program"></a>
#### UpdateProgramLow (Low-Level / Program)
**Description:** [low-level] Update source code of an existing ABAP program. Requires lock handle from LockObject. - use UpdateProgram (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/program/low/handleUpdateProgram.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM). Program must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP program source code.

---

<a id="validateprogramlow-low-level-program"></a>
#### ValidateProgramLow (Low-Level / Program)
**Description:** [low-level] Validate an ABAP program name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleValidateProgram.ts`

**Parameters:**
- `description` (string, required) - Program description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `program_name` (string, required) - Program name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-service-binding"></a>
### Low-Level / Service Binding

<a id="activateservicebindinglow-low-level-service-binding"></a>
#### ActivateServiceBindingLow (Low-Level / Service Binding)
**Description:** Operation: Activate, Create, Update. Subject: ServiceBinding. Will be useful for activating, creating, or updating service binding. [low-level] Activate an ABAP service binding. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/service_binding/low/handleActivateServiceBinding.ts`

**Parameters:**
- `name` (string, required) - Service binding name (e.g., ZSB_MY_SERVICE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-service-definition"></a>
### Low-Level / Service Definition

<a id="activateservicedefinitionlow-low-level-service-definition"></a>
#### ActivateServiceDefinitionLow (Low-Level / Service Definition)
**Description:** Operation: Activate, Create, Update. Subject: ServiceDefinition. Will be useful for activating, creating, or updating service definition. [low-level] Activate an ABAP service definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/service_definition/low/handleActivateServiceDefinition.ts`

**Parameters:**
- `name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-structure"></a>
### Low-Level / Structure

<a id="activatestructurelow-low-level-structure"></a>
#### ActivateStructureLow (Low-Level / Structure)
**Description:** Operation: Activate, Create, Update. Subject: Structure. Will be useful for activating, creating, or updating structure. [low-level] Activate an ABAP structure. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/structure/low/handleActivateStructure.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., ZST_MY_STRUCTURE).

---

<a id="checkstructurelow-low-level-structure"></a>
#### CheckStructureLow (Low-Level / Structure)
**Description:** [low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/structure/low/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: inactive

---

<a id="createstructurelow-low-level-structure"></a>
#### CreateStructureLow (Low-Level / Structure)
**Description:** [low-level] Create a new ABAP structure. - use CreateStructure (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/structure/low/handleCreateStructure.ts`

**Parameters:**
- `application` (string, optional (default: *').)) - Application area (optional, default: '*').
- `description` (string, required) - Structure description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `structure_type` (string, optional) - Structure type: 'executable', 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool' (optional).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletestructurelow-low-level-structure"></a>
#### DeleteStructureLow (Low-Level / Structure)
**Description:** [low-level] Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/structure/low/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockstructurelow-low-level-structure"></a>
#### LockStructureLow (Low-Level / Structure)
**Description:** [low-level] Lock an ABAP structure for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/structure/low/handleLockStructure.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).

---

<a id="unlockstructurelow-low-level-structure"></a>
#### UnlockStructureLow (Low-Level / Structure)
**Description:** [low-level] Unlock an ABAP structure after modification. Must use the same session_id and lock_handle from LockStructure operation.

**Source:** `src/handlers/structure/low/handleUnlockStructure.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockStructure operation.
- `session_id` (string, required) - Session ID from LockStructure operation. Must be the same as used in LockStructure.
- `session_state` (object, optional) - Session state from LockStructure (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).

---

<a id="updatestructurelow-low-level-structure"></a>
#### UpdateStructureLow (Low-Level / Structure)
**Description:** [low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.

**Source:** `src/handlers/structure/low/handleUpdateStructure.ts`

**Parameters:**
- `ddl_code` (string, required) - Complete DDL source code for the structure definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.

---

<a id="validatestructurelow-low-level-structure"></a>
#### ValidateStructureLow (Low-Level / Structure)
**Description:** [low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/structure/low/handleValidateStructure.ts`

**Parameters:**
- `description` (string, required) - Structure description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name to validate (e.g., Z_MY_PROGRAM).

---

<a id="low-level-system"></a>
### Low-Level / System

<a id="getnodestructurelow-low-level-system"></a>
#### GetNodeStructureLow (Low-Level / System)
**Description:** [low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/system/low/handleGetNodeStructure.ts`

**Parameters:**
- `node_id` (string, optional (default: 0000" for root). Use to fetch child nodes.)) - Optional node ID (default: "0000" for root). Use to fetch child nodes.
- `parent_name` (string, required) - Parent object name
- `parent_type` (string, required) - Parent object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K")
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_short_descriptions` (boolean, optional (default: true)) - Include short descriptions in response

---

<a id="getobjectstructurelow-low-level-system"></a>
#### GetObjectStructureLow (Low-Level / System)
**Description:** [low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/system/low/handleGetObjectStructure.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., "ZMY_CLASS", "ZMY_PROGRAM")
- `object_type` (string, required) - Object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K", "DDLS/DF")
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="getvirtualfolderslow-low-level-system"></a>
#### GetVirtualFoldersLow (Low-Level / System)
**Description:** [low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.

**Source:** `src/handlers/system/low/handleGetVirtualFolders.ts`

**Parameters:**
- `facet_order` (array, optional (default: ['package)) - Order of facets in response (e.g., ["package", "group", "type"]). Default: ["package", "group", "type"]
- `ignore_short_descriptions` (boolean, optional (default: false)) - Ignore short descriptions in response
- `object_search_pattern` (string, optional (default: *)) - Object search pattern (e.g., "*", "Z*", "ZCL_*"). Default: "*"
- `preselection` (array, optional) - Optional preselection filters (facet-value pairs for filtering)
- `with_versions` (boolean, optional (default: false)) - Include version information in response

---

<a id="low-level-table"></a>
### Low-Level / Table

<a id="activatetablelow-low-level-table"></a>
#### ActivateTableLow (Low-Level / Table)
**Description:** Operation: Activate, Create, Update. Subject: Table. Will be useful for activating, creating, or updating table. [low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/table/low/handleActivateTable.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZTB_MY_TABLE).

---

<a id="checktablelow-low-level-table"></a>
#### CheckTableLow (Low-Level / Table)
**Description:** [low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Requires session_id for stateful operations. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/table/low/handleCheckTable.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `reporter` (string, optional) - Check reporter: 'tableStatusCheck' or 'abapCheckRun'. Default: abapCheckRun
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE)
- `version` (string, optional) - Version to check: 'active' (last activated), 'inactive' (current unsaved), or 'new' (for new code validation). Default: new

---

<a id="createtablelow-low-level-table"></a>
#### CreateTableLow (Low-Level / Table)
**Description:** [low-level] Create a new ABAP table. - use CreateTable (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/table/low/handleCreateTable.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZT_TEST_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletetablelow-low-level-table"></a>
#### DeleteTableLow (Low-Level / Table)
**Description:** [low-level] Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/table/low/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="locktablelow-low-level-table"></a>
#### LockTableLow (Low-Level / Table)
**Description:** [low-level] Lock an ABAP table for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/table/low/handleLockTable.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).

---

<a id="unlocktablelow-low-level-table"></a>
#### UnlockTableLow (Low-Level / Table)
**Description:** [low-level] Unlock an ABAP table after modification. Must use the same session_id and lock_handle from LockTable operation.

**Source:** `src/handlers/table/low/handleUnlockTable.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockTable operation.
- `session_id` (string, required) - Session ID from LockTable operation. Must be the same as used in LockTable.
- `session_state` (object, optional) - Session state from LockTable (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).

---

<a id="updatetablelow-low-level-table"></a>
#### UpdateTableLow (Low-Level / Table)
**Description:** [low-level] Update DDL source code of an existing ABAP table. Requires lock handle from LockObject. - use CreateTable for full workflow with lock/unlock.

**Source:** `src/handlers/table/low/handleUpdateTable.ts`

**Parameters:**
- `ddl_code` (string, required) - Complete DDL source code for the table definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZOK_T_TEST_0001). Table must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="validatetablelow-low-level-table"></a>
#### ValidateTableLow (Low-Level / Table)
**Description:** [low-level] Validate an ABAP table name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/table/low/handleValidateTable.ts`

**Parameters:**
- `description` (string, required) - Table description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name to validate (e.g., Z_MY_TABLE)

---

<a id="low-level-transport"></a>
### Low-Level / Transport

<a id="createtransportlow-low-level-transport"></a>
#### CreateTransportLow (Low-Level / Transport)
**Description:** [low-level] Create a new ABAP transport request.

**Source:** `src/handlers/transport/low/handleCreateTransport.ts`

**Parameters:**
- `description` (string, required) - Transport request description.
- `transport_type` (string, optional (default: workbench').)) - Transport type: 'workbench' or 'customizing' (optional, default: 'workbench').

---

*Last updated: 2026-07-22*
