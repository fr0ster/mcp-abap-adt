/**
 * The ADT client contract this server accepts (#216): the factories it calls
 * and, on each factory's answer, the capability atoms whose members it calls —
 * composed from `@mcp-abap-adt/interfaces-adt` alone, never from the
 * implementation package. Each factory is generic over its result-set
 * contract, as the library's is, so a `resultsFor(…)` set flows through
 * with the same inference.
 *
 * **Composed per variant from the type tables.** A factory is part of the
 * contract only where the variant's table serves its API (`ServedOn`), and a
 * member the library gates by an operation only where the variant's table
 * lists that operation for one of the API's codes (`PerformedOn`). The
 * default variant, `AdtModernVariant`, gets what both modern tables serve;
 * a call the variant does not serve does not compile.
 *
 * The implementation the server takes (`GuardedAdtClient` in `clients.ts`,
 * an `AdtClient`) is assigned to this contract there; the compiler checks
 * that it satisfies it.
 */
import type {
  AdtApiName,
  AdtModernVariant,
  AdtOperation,
  AdtPerformingVariantsIn,
  AdtServingVariantsIn,
  AdtVariant,
  IAccessControlConfig,
  IAccessControlResults,
  IAdtActivatable,
  IAdtAnalyseOptions,
  IAdtCheckable,
  IAdtCreatable,
  IAdtDataPreview,
  IAdtDeletable,
  IAdtEnhancementHost,
  IAdtError,
  IAdtGroupLifecycle,
  IAdtIncludeEnhancementHost,
  IAdtLockable,
  IAdtMetadataReadable,
  IAdtMetadataUpdatable,
  IAdtObjectAccess,
  IAdtObjectProperties,
  IAdtReadable,
  IAdtRepositoryStructure,
  IAdtRequest,
  IAdtResponse,
  IAdtSearchObjectsParamsOf,
  IAdtServiceBindingTypes,
  IAdtServiceGroupReadable,
  IAdtTransportMoveObjects,
  IAdtTransportObjectActions,
  IAdtTransportSearchConfigurations,
  IAdtTransportSortAndCompress,
  IAdtTypeCatalogue,
  IAdtTypedGroupLifecycle,
  IAdtTypedWhereUsed,
  IAdtTypeTables,
  IAdtUpdatable,
  IAdtValidatable,
  IAdtVersionable,
  IAdtVirtualFolders,
  IAdtWhereUsed,
  IAnalyse,
  IAppendStructureConfig,
  IAppendStructureResults,
  IBehaviorDefinitionConfig,
  IBehaviorDefinitionResults,
  IBehaviorImplementationConfig,
  ICdsTestDoubleCheckable,
  IClassConfig,
  IClassResults,
  IDataElementConfig,
  IDataElementResults,
  IDdlConfig,
  IDdlResults,
  IDomainConfig,
  IDomainResults,
  IEnhancementConfig,
  IEnhancementResults,
  IFunctionGroupConfig,
  IFunctionGroupResults,
  IFunctionIncludeConfig,
  IFunctionIncludeResults,
  IFunctionModuleConfig,
  IFunctionModuleResults,
  IIncludeConfig,
  IIncludeResults,
  IInterfaceConfig,
  IInterfaceResults,
  ILocalDefinitionsConfig,
  ILocalMacrosConfig,
  ILocalTestClassConfig,
  ILocalTypesConfig,
  IMessageClassConfig,
  IMessageClassMessageConfig,
  IMessageClassMessageResults,
  IMessageClassResults,
  IMetadataExtensionConfig,
  IMetadataExtensionResults,
  IPackageConfig,
  IPackageResults,
  IProgramConfig,
  IProgramResults,
  IServiceBindingConfig,
  IServiceBindingPublicationConfig,
  IServiceDefinitionConfig,
  IServiceDefinitionResults,
  IServiceResults,
  IStructureConfig,
  IStructureResults,
  ITableConfig,
  ITableResults,
  ITableTypeConfig,
  ITableTypeResults,
  ITransformationConfig,
  ITransformationResults,
  ITransportConfig,
  ITransportResults,
  IUtilResults,
} from '@mcp-abap-adt/interfaces-adt';

/**
 * `T` where every variant of `V` is one whose table lists operation `Op`
 * for one of API `A`'s codes; nothing otherwise.
 */
type PerformedOn<
  V extends AdtVariant,
  A extends AdtApiName,
  Op extends AdtOperation,
  T,
> = [V] extends [AdtPerformingVariantsIn<IAdtTypeTables, A, Op>] ? T : unknown;

/** `T` where every variant of `V` is one whose table serves API `A`; nothing otherwise. */
type ServedOn<V extends AdtVariant, A extends AdtApiName, T> = [V] extends [
  AdtServingVariantsIn<IAdtTypeTables, A>,
]
  ? T
  : unknown;

/** What the server calls on `getClass()`'s answer. */
export type ClassApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtEnhancementHost<
  IClassConfig,
  ReturnType<R['enhancementElements']>,
  ReturnType<R['enhancementOptions']>
> &
  IAdtCreatable<IClassConfig, ReturnType<R['created']>> &
  IAdtReadable<IClassConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IClassConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IClassConfig>, ReturnType<R['updated']>> &
  Omit<
    IAdtDeletable<
      IClassConfig,
      ReturnType<R['deletion']>,
      ReturnType<R['deletionCheck']>
    >,
    'checkDeletion'
  > &
  PerformedOn<
    V,
    'class',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IClassConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IClassConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IClassConfig, ReturnType<R['check']>> &
  IAdtActivatable<IClassConfig, ReturnType<R['activation']>> &
  IAdtLockable<IClassConfig> &
  IAdtVersionable<
    IClassConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/**
 * What the server calls on `getProgram()`'s answer. A program is created,
 * changed, activated, locked and deleted only where the variant's table lists
 * the operation (`ADT_TYPES_ONPREM`; ABAP cloud reads, checks and lists
 * versions only), so those members are gated here, per table, even where the
 * library leaves them ungated.
 */
export type ProgramApi<
  R extends IProgramResults,
  V extends AdtVariant,
> = IAdtEnhancementHost<
  IProgramConfig,
  ReturnType<R['enhancementElements']>,
  ReturnType<R['enhancementOptions']>
> &
  PerformedOn<
    V,
    'program',
    'create',
    IAdtCreatable<IProgramConfig, ReturnType<R['created']>>
  > &
  IAdtReadable<IProgramConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IProgramConfig, ReturnType<R['metadata']>> &
  PerformedOn<
    V,
    'program',
    'update',
    IAdtUpdatable<Partial<IProgramConfig>, ReturnType<R['updated']>>
  > &
  PerformedOn<
    V,
    'program',
    'delete',
    Omit<
      IAdtDeletable<
        IProgramConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'program',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IProgramConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'program',
    'validate',
    IAdtValidatable<IProgramConfig, ReturnType<R['validation']>>
  > &
  IAdtCheckable<IProgramConfig, ReturnType<R['check']>> &
  PerformedOn<
    V,
    'program',
    'activate',
    IAdtActivatable<IProgramConfig, ReturnType<R['activation']>>
  > &
  PerformedOn<V, 'program', 'lock', IAdtLockable<IProgramConfig>> &
  IAdtVersionable<
    IProgramConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/**
 * What the server calls on `getInclude()`'s answer. An include is created,
 * changed, activated, locked and deleted only where the variant's table lists
 * the operation (`ADT_TYPES_ONPREM`; ABAP cloud reads it only), so those
 * members are gated here, per table.
 */
export type IncludeApi<
  R extends IIncludeResults,
  V extends AdtVariant,
> = IAdtIncludeEnhancementHost<
  IIncludeConfig,
  ReturnType<R['enhancementElements']>,
  ReturnType<R['enhancementOptions']>
> &
  PerformedOn<
    V,
    'include',
    'create',
    IAdtCreatable<IIncludeConfig, ReturnType<R['created']>>
  > &
  IAdtReadable<IIncludeConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IIncludeConfig, ReturnType<R['metadata']>> &
  PerformedOn<
    V,
    'include',
    'update',
    IAdtUpdatable<Partial<IIncludeConfig>, ReturnType<R['updated']>>
  > &
  PerformedOn<
    V,
    'include',
    'delete',
    Omit<
      IAdtDeletable<
        IIncludeConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'include',
    'activate',
    IAdtActivatable<IIncludeConfig, ReturnType<R['activation']>>
  > &
  PerformedOn<V, 'include', 'lock', IAdtLockable<IIncludeConfig>>;

/** What the server calls on `getInterface()`'s answer. */
export type InterfaceApi<
  R extends IInterfaceResults,
  V extends AdtVariant,
> = IAdtCreatable<IInterfaceConfig, ReturnType<R['created']>> &
  IAdtReadable<IInterfaceConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IInterfaceConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IInterfaceConfig>, ReturnType<R['updated']>> &
  Omit<
    IAdtDeletable<
      IInterfaceConfig,
      ReturnType<R['deletion']>,
      ReturnType<R['deletionCheck']>
    >,
    'checkDeletion'
  > &
  PerformedOn<
    V,
    'interface',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IInterfaceConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IInterfaceConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IInterfaceConfig, ReturnType<R['check']>> &
  IAdtActivatable<IInterfaceConfig, ReturnType<R['activation']>> &
  IAdtLockable<IInterfaceConfig> &
  IAdtVersionable<
    IInterfaceConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/** What the server calls on `getDomain()`'s answer. */
export type DomainApi<
  R extends IDomainResults,
  V extends AdtVariant,
> = IAdtCreatable<IDomainConfig, ReturnType<R['created']>> &
  IAdtMetadataReadable<IDomainConfig, ReturnType<R['metadata']>> &
  IAdtMetadataUpdatable<
    Partial<IDomainConfig>,
    ReturnType<R['metadataUpdated']>
  > &
  IAdtDeletable<
    IDomainConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IDomainConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IDomainConfig, ReturnType<R['check']>> &
  IAdtActivatable<IDomainConfig, ReturnType<R['activation']>> &
  IAdtLockable<IDomainConfig>;

/** What the server calls on `getDataElement()`'s answer. */
export type DataElementApi<
  R extends IDataElementResults,
  V extends AdtVariant,
> = IAdtCreatable<IDataElementConfig, ReturnType<R['created']>> &
  IAdtMetadataReadable<IDataElementConfig, ReturnType<R['metadata']>> &
  IAdtMetadataUpdatable<
    Partial<IDataElementConfig>,
    ReturnType<R['metadataUpdated']>
  > &
  IAdtDeletable<
    IDataElementConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IDataElementConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IDataElementConfig, ReturnType<R['check']>> &
  IAdtActivatable<IDataElementConfig, ReturnType<R['activation']>> &
  IAdtLockable<IDataElementConfig>;

/** What the server calls on `getStructure()`'s answer. */
export type StructureApi<
  R extends IStructureResults,
  V extends AdtVariant,
> = IAdtCreatable<IStructureConfig, ReturnType<R['created']>> &
  IAdtReadable<IStructureConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IStructureConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IStructureConfig>, ReturnType<R['updated']>> &
  IAdtDeletable<
    IStructureConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IStructureConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IStructureConfig, ReturnType<R['check']>> &
  IAdtActivatable<IStructureConfig, ReturnType<R['activation']>> &
  IAdtLockable<IStructureConfig> &
  IAdtVersionable<
    IStructureConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/** What the server calls on `getTable()`'s answer. */
export type TableApi<
  R extends ITableResults,
  V extends AdtVariant,
> = IAdtCreatable<ITableConfig, ReturnType<R['created']>> &
  IAdtReadable<ITableConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<ITableConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<ITableConfig>, ReturnType<R['updated']>> &
  IAdtDeletable<
    ITableConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<ITableConfig, ReturnType<R['validation']>> &
  IAdtCheckable<ITableConfig, ReturnType<R['check']>> &
  IAdtActivatable<ITableConfig, ReturnType<R['activation']>> &
  IAdtLockable<ITableConfig> &
  IAdtVersionable<
    ITableConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/** What the server calls on `getTableType()`'s answer. */
export type DdicTableTypeApi<
  R extends ITableTypeResults,
  V extends AdtVariant,
> = IAdtMetadataReadable<ITableTypeConfig, ReturnType<R['metadata']>>;

/** What the server calls on `getDdl()`'s answer. */
export type DdlApi<R extends IDdlResults, V extends AdtVariant> = IAdtCreatable<
  IDdlConfig,
  ReturnType<R['created']>
> &
  IAdtReadable<IDdlConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IDdlConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IDdlConfig>, ReturnType<R['updated']>> &
  Omit<
    IAdtDeletable<
      IDdlConfig,
      ReturnType<R['deletion']>,
      ReturnType<R['deletionCheck']>
    >,
    'checkDeletion'
  > &
  PerformedOn<
    V,
    'ddl',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IDdlConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IDdlConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IDdlConfig, ReturnType<R['check']>> &
  IAdtActivatable<IDdlConfig, ReturnType<R['activation']>> &
  IAdtLockable<IDdlConfig> &
  PerformedOn<
    V,
    'ddl',
    'versions',
    Pick<
      IAdtVersionable<
        IDdlConfig,
        ReturnType<R['versions']>,
        ReturnType<R['versionSource']>
      >,
      'getVersions'
    >
  > &
  PerformedOn<
    V,
    'ddl',
    'versions',
    Pick<
      IAdtVersionable<
        IDdlConfig,
        ReturnType<R['versions']>,
        ReturnType<R['versionSource']>
      >,
      'getVersionSource'
    >
  > &
  PerformedOn<
    V,
    'ddl',
    'checkCdsTestDoubles',
    Pick<
      ICdsTestDoubleCheckable<ReturnType<R['testDoubles']>>,
      'checkCdsTestDoubles'
    >
  >;

/** What the server calls on `getFunctionGroup()`'s answer. */
export type FunctionGroupApi<
  R extends IFunctionGroupResults,
  V extends AdtVariant,
> = IAdtEnhancementHost<
  IFunctionGroupConfig,
  ReturnType<R['enhancementElements']>,
  ReturnType<R['enhancementOptions']>
> &
  IAdtCreatable<IFunctionGroupConfig, ReturnType<R['created']>> &
  IAdtMetadataReadable<IFunctionGroupConfig, ReturnType<R['metadata']>> &
  PerformedOn<
    V,
    'functionGroup',
    'updateMetadata',
    Pick<
      IAdtMetadataUpdatable<
        Partial<IFunctionGroupConfig>,
        ReturnType<R['metadataUpdated']>
      >,
      'updateMetadata'
    >
  > &
  Omit<
    IAdtDeletable<
      IFunctionGroupConfig,
      ReturnType<R['deletion']>,
      ReturnType<R['deletionCheck']>
    >,
    'checkDeletion'
  > &
  PerformedOn<
    V,
    'functionGroup',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IFunctionGroupConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IFunctionGroupConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IFunctionGroupConfig, ReturnType<R['check']>> &
  IAdtActivatable<IFunctionGroupConfig, ReturnType<R['activation']>> &
  IAdtLockable<IFunctionGroupConfig>;

/** What the server calls on `getFunctionModule()`'s answer. */
export type FunctionModuleApi<
  R extends IFunctionModuleResults,
  V extends AdtVariant,
> = IAdtCreatable<IFunctionModuleConfig, ReturnType<R['created']>> &
  IAdtReadable<IFunctionModuleConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IFunctionModuleConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IFunctionModuleConfig>, ReturnType<R['updated']>> &
  Omit<
    IAdtDeletable<
      IFunctionModuleConfig,
      ReturnType<R['deletion']>,
      ReturnType<R['deletionCheck']>
    >,
    'checkDeletion'
  > &
  PerformedOn<
    V,
    'functionModule',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IFunctionModuleConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IFunctionModuleConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IFunctionModuleConfig, ReturnType<R['check']>> &
  IAdtActivatable<IFunctionModuleConfig, ReturnType<R['activation']>> &
  IAdtLockable<IFunctionModuleConfig> &
  IAdtVersionable<
    IFunctionModuleConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/** What the server calls on `getFunctionInclude()`'s answer. */
export type FunctionIncludeApi<
  R extends IFunctionIncludeResults,
  V extends AdtVariant,
> = IAdtCreatable<IFunctionIncludeConfig, ReturnType<R['created']>> &
  IAdtReadable<IFunctionIncludeConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IFunctionIncludeConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IFunctionIncludeConfig>, ReturnType<R['updated']>> &
  PerformedOn<
    V,
    'functionInclude',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IFunctionIncludeConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'functionInclude',
    'delete',
    Pick<
      IAdtDeletable<
        IFunctionIncludeConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'delete'
    >
  > &
  IAdtActivatable<IFunctionIncludeConfig, ReturnType<R['activation']>> &
  IAdtLockable<IFunctionIncludeConfig>;

/** What the server calls on `getPackage()`'s answer. */
export type PackageApi<
  R extends IPackageResults,
  V extends AdtVariant,
> = IAdtCreatable<IPackageConfig, ReturnType<R['created']>> &
  IAdtMetadataReadable<IPackageConfig, ReturnType<R['metadata']>> &
  IAdtMetadataUpdatable<
    Partial<IPackageConfig>,
    ReturnType<R['metadataUpdated']>
  > &
  IAdtDeletable<
    IPackageConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IPackageConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IPackageConfig, ReturnType<R['check']>> &
  IAdtLockable<IPackageConfig>;

/** What the server calls on `getMessageClass()`'s answer. */
export type MessageClassApi<
  R extends IMessageClassResults,
  V extends AdtVariant,
> = IAdtCreatable<IMessageClassConfig, ReturnType<R['created']>> &
  IAdtMetadataReadable<IMessageClassConfig, ReturnType<R['metadata']>> &
  PerformedOn<
    V,
    'messageClass',
    'updateMetadata',
    Pick<
      IAdtMetadataUpdatable<
        Partial<IMessageClassConfig>,
        ReturnType<R['metadataUpdated']>
      >,
      'updateMetadata'
    >
  > &
  Omit<
    IAdtDeletable<
      IMessageClassConfig,
      ReturnType<R['deletion']>,
      ReturnType<R['deletionCheck']>
    >,
    'checkDeletion'
  > &
  PerformedOn<
    V,
    'messageClass',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IMessageClassConfig,
        ReturnType<R['deletion']>,
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtLockable<IMessageClassConfig>;

/** What the server calls on `getMessageClassMessage()`'s answer. */
export type MessageClassMessageApi<
  R extends IMessageClassMessageResults,
  V extends AdtVariant,
> = IAdtCreatable<IMessageClassMessageConfig, ReturnType<R['written']>> &
  IAdtReadable<IMessageClassMessageConfig, ReturnType<R['read']>> &
  IAdtUpdatable<Partial<IMessageClassMessageConfig>, ReturnType<R['written']>>;

/** What the server calls on `getAccessControl()`'s answer. */
export type AccessControlApi<
  R extends IAccessControlResults,
  V extends AdtVariant,
> = IAdtCreatable<IAccessControlConfig, ReturnType<R['created']>> &
  IAdtMetadataReadable<IAccessControlConfig, ReturnType<R['metadata']>>;

/** What the server calls on `getTransformation()`'s answer. */
export type TransformationApi<
  R extends ITransformationResults,
  V extends AdtVariant,
> = IAdtCreatable<ITransformationConfig, ReturnType<R['created']>>;

/** What the server calls on `getServiceDefinition()`'s answer. */
export type ServiceDefinitionApi<
  R extends IServiceDefinitionResults,
  V extends AdtVariant,
> = IAdtCreatable<IServiceDefinitionConfig, ReturnType<R['created']>> &
  IAdtReadable<IServiceDefinitionConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IServiceDefinitionConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IServiceDefinitionConfig>, ReturnType<R['updated']>> &
  IAdtDeletable<
    IServiceDefinitionConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtCheckable<IServiceDefinitionConfig, ReturnType<R['check']>> &
  IAdtActivatable<IServiceDefinitionConfig, ReturnType<R['activation']>> &
  IAdtLockable<IServiceDefinitionConfig>;

/** What the server calls on `getAppendStructure()`'s answer. */
export type AppendStructureApi<
  R extends IAppendStructureResults,
  V extends AdtVariant,
> = IAdtCreatable<IAppendStructureConfig, ReturnType<R['created']>> &
  IAdtReadable<IAppendStructureConfig, ReturnType<R['source']>> &
  IAdtUpdatable<Partial<IAppendStructureConfig>, ReturnType<R['updated']>> &
  IAdtLockable<IAppendStructureConfig>;

/** What the server calls on `getServiceBinding()`'s answer. */
export type ServiceBindingApi<
  R extends IServiceResults,
  V extends AdtVariant,
> = IAdtCreatable<IServiceBindingConfig, ReturnType<R['created']>> &
  IAdtReadable<IServiceBindingConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IServiceBindingConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<IServiceBindingPublicationConfig, ReturnType<R['updated']>> &
  IAdtDeletable<
    IServiceBindingConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IServiceBindingConfig, ReturnType<R['validation']>> &
  IAdtActivatable<IServiceBindingConfig, ReturnType<R['activation']>> &
  IAdtLockable<IServiceBindingConfig> &
  IAdtServiceBindingTypes<ReturnType<R['bindingTypes']>> &
  IAdtServiceGroupReadable<ReturnType<R['odata']>>;

/** What the server calls on `getBehaviorDefinition()`'s answer. */
export type BehaviorDefinitionApi<
  R extends IBehaviorDefinitionResults,
  V extends AdtVariant,
> = IAdtCreatable<IBehaviorDefinitionConfig, ReturnType<R['created']>> &
  IAdtReadable<IBehaviorDefinitionConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IBehaviorDefinitionConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IBehaviorDefinitionConfig>, ReturnType<R['updated']>> &
  IAdtDeletable<
    IBehaviorDefinitionConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IBehaviorDefinitionConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IBehaviorDefinitionConfig, ReturnType<R['check']>> &
  IAdtActivatable<IBehaviorDefinitionConfig, ReturnType<R['activation']>> &
  IAdtLockable<IBehaviorDefinitionConfig> &
  IAdtVersionable<
    IBehaviorDefinitionConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/** What the server calls on `getBehaviorImplementation()`'s answer. */
export type BehaviorImplementationApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtCreatable<IBehaviorImplementationConfig, ReturnType<R['created']>> &
  IAdtReadable<IBehaviorImplementationConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<
    IBehaviorImplementationConfig,
    ReturnType<R['metadata']>
  > &
  IAdtUpdatable<
    Partial<IBehaviorImplementationConfig>,
    ReturnType<R['updated']>
  > &
  IAdtDeletable<
    IBehaviorImplementationConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IBehaviorImplementationConfig, ReturnType<R['validation']>> &
  IAdtActivatable<IBehaviorImplementationConfig, ReturnType<R['activation']>> &
  IAdtLockable<IBehaviorImplementationConfig>;

/** What the server calls on `getMetadataExtension()`'s answer. */
export type MetadataExtensionApi<
  R extends IMetadataExtensionResults,
  V extends AdtVariant,
> = IAdtCreatable<IMetadataExtensionConfig, ReturnType<R['created']>> &
  IAdtReadable<IMetadataExtensionConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IMetadataExtensionConfig, ReturnType<R['metadata']>> &
  IAdtUpdatable<Partial<IMetadataExtensionConfig>, ReturnType<R['updated']>> &
  IAdtDeletable<
    IMetadataExtensionConfig,
    ReturnType<R['deletion']>,
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IMetadataExtensionConfig, ReturnType<R['validation']>> &
  IAdtCheckable<IMetadataExtensionConfig, ReturnType<R['check']>> &
  IAdtActivatable<IMetadataExtensionConfig, ReturnType<R['activation']>> &
  IAdtLockable<IMetadataExtensionConfig> &
  IAdtVersionable<
    IMetadataExtensionConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>
  >;

/** What the server calls on `getEnhancement()`'s answer. */
export type EnhancementApi<
  R extends IEnhancementResults,
  V extends AdtVariant,
> = IAdtReadable<IEnhancementConfig, ReturnType<R['source']>> &
  IAdtMetadataReadable<IEnhancementConfig, ReturnType<R['metadata']>>;

/** What the server calls on `getRequest()`'s answer. */
export type RequestApi<
  R extends ITransportResults,
  V extends AdtVariant,
> = PerformedOn<
  V,
  'request',
  'create',
  Pick<IAdtCreatable<ITransportConfig, ReturnType<R['created']>>, 'create'>
> &
  PerformedOn<
    V,
    'request',
    'delete',
    Pick<
      IAdtDeletable<
        ITransportConfig,
        ReturnType<R['deleted']>,
        ReturnType<R['deletionCheck']>
      >,
      'delete'
    >
  > &
  IAdtRequest<ReturnType<R['list']>> &
  PerformedOn<
    V,
    'request',
    'removeObject',
    Pick<
      IAdtTransportObjectActions<
        ReturnType<R['removedObject']>,
        ReturnType<R['addedObject']>,
        ReturnType<R['createdTask']>,
        ReturnType<R['actionLog']>,
        ReturnType<R['objects']>,
        ReturnType<R['taskTypeChanged']>
      >,
      'removeObject'
    >
  > &
  PerformedOn<
    V,
    'request',
    'addObject',
    Pick<
      IAdtTransportObjectActions<
        ReturnType<R['removedObject']>,
        ReturnType<R['addedObject']>,
        ReturnType<R['createdTask']>,
        ReturnType<R['actionLog']>,
        ReturnType<R['objects']>,
        ReturnType<R['taskTypeChanged']>
      >,
      'addObject'
    >
  > &
  PerformedOn<
    V,
    'request',
    'createTask',
    Pick<
      IAdtTransportObjectActions<
        ReturnType<R['removedObject']>,
        ReturnType<R['addedObject']>,
        ReturnType<R['createdTask']>,
        ReturnType<R['actionLog']>,
        ReturnType<R['objects']>,
        ReturnType<R['taskTypeChanged']>
      >,
      'createTask'
    >
  > &
  PerformedOn<
    V,
    'request',
    'readActionLog',
    Pick<
      IAdtTransportObjectActions<
        ReturnType<R['removedObject']>,
        ReturnType<R['addedObject']>,
        ReturnType<R['createdTask']>,
        ReturnType<R['actionLog']>,
        ReturnType<R['objects']>,
        ReturnType<R['taskTypeChanged']>
      >,
      'readActionLog'
    >
  > &
  PerformedOn<
    V,
    'request',
    'changeTaskType',
    Pick<
      IAdtTransportObjectActions<
        ReturnType<R['removedObject']>,
        ReturnType<R['addedObject']>,
        ReturnType<R['createdTask']>,
        ReturnType<R['actionLog']>,
        ReturnType<R['objects']>,
        ReturnType<R['taskTypeChanged']>
      >,
      'changeTaskType'
    >
  > &
  PerformedOn<
    V,
    'request',
    'readObjects',
    Pick<
      IAdtTransportObjectActions<
        ReturnType<R['removedObject']>,
        ReturnType<R['addedObject']>,
        ReturnType<R['createdTask']>,
        ReturnType<R['actionLog']>,
        ReturnType<R['objects']>,
        ReturnType<R['taskTypeChanged']>
      >,
      'readObjects'
    >
  > &
  PerformedOn<
    V,
    'request',
    'sortAndCompress',
    Pick<
      IAdtTransportSortAndCompress<ReturnType<R['sortedAndCompressed']>>,
      'sortAndCompress'
    >
  > &
  PerformedOn<
    V,
    'request',
    'moveObjects',
    Pick<IAdtTransportMoveObjects<ReturnType<R['movedObjects']>>, 'moveObjects'>
  > &
  PerformedOn<
    V,
    'request',
    'searchConfigurations',
    Pick<
      IAdtTransportSearchConfigurations<ReturnType<R['searchConfigurations']>>,
      'searchConfigurations'
    >
  >;

/** What the server calls on `getLocalTestClass()`'s answer. */
export type LocalTestClassApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtReadable<ILocalTestClassConfig, ReturnType<R['source']>> &
  IAdtUpdatable<Partial<ILocalTestClassConfig>, ReturnType<R['updated']>> &
  IAdtActivatable<ILocalTestClassConfig, ReturnType<R['activation']>> &
  IAdtLockable<IClassConfig>;

/** What the server calls on `getLocalTypes()`'s answer. */
export type LocalTypesApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtReadable<ILocalTypesConfig, ReturnType<R['source']>> &
  IAdtUpdatable<Partial<ILocalTypesConfig>, ReturnType<R['updated']>> &
  IAdtActivatable<ILocalTypesConfig, ReturnType<R['activation']>> &
  IAdtLockable<IClassConfig>;

/** What the server calls on `getLocalDefinitions()`'s answer. */
export type LocalDefinitionsApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtReadable<ILocalDefinitionsConfig, ReturnType<R['source']>> &
  IAdtUpdatable<Partial<ILocalDefinitionsConfig>, ReturnType<R['updated']>> &
  IAdtActivatable<ILocalDefinitionsConfig, ReturnType<R['activation']>> &
  IAdtLockable<IClassConfig>;

/** What the server calls on `getLocalMacros()`'s answer. */
export type LocalMacrosApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtReadable<ILocalMacrosConfig, ReturnType<R['source']>> &
  IAdtUpdatable<Partial<ILocalMacrosConfig>, ReturnType<R['updated']>> &
  IAdtActivatable<ILocalMacrosConfig, ReturnType<R['activation']>> &
  IAdtLockable<IClassConfig>;

/**
 * The repository search of variant `V`: `IAdtObjectSearch`'s member, its
 * filter the search names every variant of `V` takes
 * (`IAdtSearchObjectsParamsOf<V>`, interfaces-adt 24) — a name of the
 * release's object types list, not a code.
 */
export interface IServerObjectSearch<TSearch, V extends AdtVariant> {
  search<E extends IAdtError>(
    criteria: IAdtSearchObjectsParamsOf<V>,
    options: IAdtAnalyseOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<TSearch, E>>;
  search(
    criteria: IAdtSearchObjectsParamsOf<V>,
    options?: IAdtAnalyseOptions,
  ): Promise<IAdtResponse<TSearch>>;
}

/**
 * What the server calls on `getUtils()`'s answer. Where-used and the group
 * members are the typed atoms of variant `V` (`IAdtTypedWhereUsed`,
 * `IAdtTypedGroupLifecycle`): their references take the codes each request
 * serves on `V` and require `parentName` where the table names a parent.
 */
export type UtilsApi<
  R extends IUtilResults,
  V extends AdtVariant,
> = IServerObjectSearch<ReturnType<R['search']>, V> &
  IAdtTypedWhereUsed<
    ReturnType<R['whereUsed']>,
    ReturnType<R['whereUsedScope']>,
    V
  > &
  Pick<
    IAdtWhereUsed<ReturnType<R['whereUsed']>, ReturnType<R['whereUsedScope']>>,
    'modifyWhereUsedScope'
  > &
  IAdtVirtualFolders<ReturnType<R['folders']>> &
  IAdtTypeCatalogue<ReturnType<R['types']>> &
  IAdtRepositoryStructure<
    ReturnType<R['node']>,
    ReturnType<R['objectStructure']>
  > &
  Pick<
    IAdtGroupLifecycle<
      ReturnType<R['inactive']>,
      ReturnType<R['activation']>,
      ReturnType<R['run']>,
      ReturnType<R['results']>,
      ReturnType<R['deletionCheck']>,
      ReturnType<R['deletion']>
    >,
    'getInactiveObjects' | 'getActivationRun' | 'getActivationResults'
  > &
  IAdtTypedGroupLifecycle<
    ReturnType<R['activation']>,
    ReturnType<R['deletionCheck']>,
    ReturnType<R['deletion']>,
    V
  > &
  IAdtDataPreview<
    ReturnType<R['query']>,
    ReturnType<R['columns']>,
    ReturnType<R['contents']>
  > &
  IAdtObjectAccess<
    ReturnType<R['source']>,
    ReturnType<R['metadata']>,
    ReturnType<R['include']>
  > &
  IAdtObjectProperties<ReturnType<R['objectProperties']>>;

export type IServerAdtClient<V extends AdtVariant = AdtModernVariant> =
  ServedOn<
    V,
    'class',
    {
      getClass<R extends IClassResults>(results: R): ClassApi<R, V>;
    }
  > &
    ServedOn<
      V,
      'program',
      {
        getProgram<R extends IProgramResults>(results: R): ProgramApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'include',
      {
        getInclude<R extends IIncludeResults>(results: R): IncludeApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'interface',
      {
        getInterface<R extends IInterfaceResults>(
          results: R,
        ): InterfaceApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'domain',
      {
        getDomain<R extends IDomainResults>(results: R): DomainApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'dataElement',
      {
        getDataElement<R extends IDataElementResults>(
          results: R,
        ): DataElementApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'structure',
      {
        getStructure<R extends IStructureResults>(
          results: R,
        ): StructureApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'table',
      {
        getTable<R extends ITableResults>(results: R): TableApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'tableType',
      {
        getTableType<R extends ITableTypeResults>(
          results: R,
        ): DdicTableTypeApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'ddl',
      {
        getDdl<R extends IDdlResults>(results: R): DdlApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'functionGroup',
      {
        getFunctionGroup<R extends IFunctionGroupResults>(
          results: R,
        ): FunctionGroupApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'functionModule',
      {
        getFunctionModule<R extends IFunctionModuleResults>(
          results: R,
        ): FunctionModuleApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'functionInclude',
      {
        getFunctionInclude<R extends IFunctionIncludeResults>(
          results: R,
        ): FunctionIncludeApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'package',
      {
        getPackage<R extends IPackageResults>(results: R): PackageApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'messageClass',
      {
        getMessageClass<R extends IMessageClassResults>(
          results: R,
        ): MessageClassApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'messageClassMessage',
      {
        getMessageClassMessage<R extends IMessageClassMessageResults>(
          results: R,
        ): MessageClassMessageApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'accessControl',
      {
        getAccessControl<R extends IAccessControlResults>(
          results: R,
        ): AccessControlApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'transformation',
      {
        getTransformation<R extends ITransformationResults>(
          results: R,
        ): TransformationApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'serviceDefinition',
      {
        getServiceDefinition<R extends IServiceDefinitionResults>(
          results: R,
        ): ServiceDefinitionApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'appendStructure',
      {
        getAppendStructure<R extends IAppendStructureResults>(
          results: R,
        ): AppendStructureApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'serviceBinding',
      {
        getServiceBinding<R extends IServiceResults>(
          results: R,
        ): ServiceBindingApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'behaviorDefinition',
      {
        getBehaviorDefinition<R extends IBehaviorDefinitionResults>(
          results: R,
        ): BehaviorDefinitionApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'behaviorImplementation',
      {
        getBehaviorImplementation<R extends IClassResults>(
          results: R,
        ): BehaviorImplementationApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'metadataExtension',
      {
        getMetadataExtension<R extends IMetadataExtensionResults>(
          results: R,
        ): MetadataExtensionApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'enhancement',
      {
        getEnhancement<R extends IEnhancementResults>(
          results: R,
        ): EnhancementApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'request',
      {
        getRequest<R extends ITransportResults>(results: R): RequestApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'localTestClass',
      {
        getLocalTestClass<R extends IClassResults>(
          results: R,
        ): LocalTestClassApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'localTypes',
      {
        getLocalTypes<R extends IClassResults>(results: R): LocalTypesApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'localDefinitions',
      {
        getLocalDefinitions<R extends IClassResults>(
          results: R,
        ): LocalDefinitionsApi<R, V>;
      }
    > &
    ServedOn<
      V,
      'localMacros',
      {
        getLocalMacros<R extends IClassResults>(
          results: R,
        ): LocalMacrosApi<R, V>;
      }
    > & {
      getUtils<R extends IUtilResults>(results: R): UtilsApi<R, V>;
    };
