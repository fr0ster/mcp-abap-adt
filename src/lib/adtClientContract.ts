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
  AdtObjectIdentity,
  AdtOperation,
  AdtPerformingVariantsIn,
  AdtReadVersion,
  AdtServingVariantsIn,
  AdtTypeCode,
  AdtVariant,
  IAccessControlConfig,
  IAccessControlResults,
  IAdtActivatable,
  IAdtAnalyseOptions,
  IAdtCheckable,
  IAdtCreatable,
  IAdtDataPreview,
  IAdtDeletable,
  IAdtDiscovery,
  IAdtEnhancementHost,
  IAdtError,
  IAdtGroupLifecycle,
  IAdtIncludeEnhancementHost,
  IAdtLockable,
  IAdtLockFreeUpdatable,
  IAdtMainProgramsReadable,
  IAdtMessageClassMessageLockable,
  IAdtMessageClassMessageUpdatable,
  IAdtMetadataUpdatable,
  IAdtObjectAccess,
  IAdtObjectActivation,
  IAdtObjectProperties,
  IAdtOperationOptions,
  IAdtRepositoryStructure,
  IAdtResponse,
  IAdtSearchObjectsParamsOf,
  IAdtServiceBindingTypes,
  IAdtServiceGroupReadable,
  IAdtTableSettingsPatchable,
  IAdtTextElementsReadable,
  IAdtTextElementsUpdatable,
  IAdtTransportMoveObjects,
  IAdtTransportObjectActions,
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
  IReadOptions,
  IServiceBindingConfig,
  IServiceBindingPublicationConfig,
  IServiceDefinitionConfig,
  IServiceDefinitionResults,
  IServiceResults,
  IStructureConfig,
  IStructureResults,
  ITableConfig,
  ITableResults,
  ITableSettingsConfig,
  ITableSettingsResults,
  ITableTypeConfig,
  ITableTypeResults,
  ITextElementsConfig,
  ITextElementsResults,
  ITransformationConfig,
  ITransformationResults,
  ITransportConfig,
  ITransportResults,
  IUtilResults,
  MessageClassMessageAddress,
} from '@mcp-abap-adt/interfaces-adt';

/**
 * `IAdtReadable` as the server calls it: the version stated on every read
 * (the owner, 2026-11-01). ADT answers a read without a version from the
 * working area, and adt-clients sends exactly the version it is given, so a
 * read that names none does not compile here.
 */
interface StatedReadable<TConfig, TSource, TRequired extends keyof TConfig> {
  read<E extends IAdtError>(
    config: AdtObjectIdentity<TConfig, TRequired>,
    version: AdtReadVersion,
    options: { withLongPolling?: boolean } & IAdtOperationOptions<E> & {
        analyse: IAnalyse<E>;
      },
  ): Promise<IAdtResponse<TSource, E | IAdtError>>;
  read(
    config: AdtObjectIdentity<TConfig, TRequired>,
    version: AdtReadVersion,
    options?: { withLongPolling?: boolean } & IAdtOperationOptions,
  ): Promise<IAdtResponse<TSource>>;
}

/** `IAdtMetadataReadable` as the server calls it: the version stated on every read. */
interface StatedMetadataReadable<
  TConfig,
  TMetadata,
  TRequired extends keyof TConfig,
> {
  readMetadata<E extends IAdtError>(
    config: AdtObjectIdentity<TConfig, TRequired>,
    options: {
      withLongPolling?: boolean;
      version: AdtReadVersion;
    } & IAdtOperationOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<TMetadata, E | IAdtError>>;
  readMetadata(
    config: AdtObjectIdentity<TConfig, TRequired>,
    options: {
      withLongPolling?: boolean;
      version: AdtReadVersion;
    } & IAdtOperationOptions,
  ): Promise<IAdtResponse<TMetadata>>;
}

/**
 * `IAdtObjectAccess` as the server calls it: every source and metadata read,
 * and the address a source read would use, at a stated version. The include
 * source read of the library (`getInclude`) takes no version, so the server
 * reads an include's source through `readObjectSource`.
 */
type ObjectAccess<TSource, TMetadata> = Omit<
  // `never`: the include it would type is `getInclude`'s, omitted here.
  IAdtObjectAccess<TSource, TMetadata, never>,
  | 'readObjectSource'
  | 'readObjectMetadata'
  | 'getObjectSourceUri'
  | 'getInclude'
> & {
  readObjectSource<E extends IAdtError>(
    objectType: Parameters<
      IAdtObjectAccess<TSource, TMetadata, never>['getObjectSourceUri']
    >[0],
    objectName: string,
    functionGroup: string | undefined,
    version: AdtReadVersion,
    options: IReadOptions & IAdtAnalyseOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<TSource, E | IAdtError>>;
  readObjectMetadata<E extends IAdtError>(
    objectType: Parameters<
      IAdtObjectAccess<TSource, TMetadata, never>['supportsSourceCode']
    >[0],
    objectName: string,
    functionGroup: string | undefined,
    options: IReadOptions & {
      version: AdtReadVersion;
    } & IAdtAnalyseOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<TMetadata, E | IAdtError>>;
  getObjectSourceUri(
    objectType: Parameters<
      IAdtObjectAccess<TSource, TMetadata, never>['getObjectSourceUri']
    >[0],
    objectName: string,
    functionGroup: string | undefined,
    version: AdtReadVersion,
  ): string;
};

/**
 * `T` where every variant of `V` is one whose table lists operation `Op`
 * for one of API `A`'s codes; nothing otherwise.
 */
type PerformedOn<
  V extends AdtVariant,
  A extends AdtApiName,
  Op extends AdtOperation,
  T,
> = [V] extends [AdtPerformingVariantsIn<IAdtTypeTables, A, Op>]
  ? T
  : Record<never, never>;

/** `T` where every variant of `V` is one whose table serves API `A`; nothing otherwise. */
type ServedOn<V extends AdtVariant, A extends AdtApiName, T> = [V] extends [
  AdtServingVariantsIn<IAdtTypeTables, A>,
]
  ? T
  : Record<never, never>;

/** What the server calls on `getClass()`'s answer. */
export type ClassApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtEnhancementHost<
  IClassConfig,
  ReturnType<R['enhancementElements']>,
  ReturnType<R['enhancementOptions']>,
  'className'
> &
  IAdtCreatable<IClassConfig, ReturnType<R['created']>> &
  StatedReadable<IClassConfig, ReturnType<R['source']>, 'className'> &
  StatedMetadataReadable<IClassConfig, ReturnType<R['metadata']>, 'className'> &
  IAdtUpdatable<
    Partial<IClassConfig>,
    ReturnType<R['updated']>,
    'className',
    'source'
  > &
  Omit<
    IAdtDeletable<
      IClassConfig,
      ReturnType<R['deletion']>,
      'className',
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
        'className',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IClassConfig, ReturnType<R['validation']>, 'className'> &
  IAdtCheckable<IClassConfig, ReturnType<R['check']>, 'className'> &
  IAdtActivatable<IClassConfig, ReturnType<R['activation']>, 'className'> &
  IAdtLockable<IClassConfig, 'className'> &
  IAdtVersionable<
    IClassConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'className'
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
  ReturnType<R['enhancementOptions']>,
  'programName'
> &
  PerformedOn<
    V,
    'program',
    'create',
    IAdtCreatable<IProgramConfig, ReturnType<R['created']>>
  > &
  StatedReadable<IProgramConfig, ReturnType<R['source']>, 'programName'> &
  StatedMetadataReadable<
    IProgramConfig,
    ReturnType<R['metadata']>,
    'programName'
  > &
  PerformedOn<
    V,
    'program',
    'update',
    IAdtUpdatable<
      Partial<IProgramConfig>,
      ReturnType<R['updated']>,
      'programName',
      'source'
    >
  > &
  PerformedOn<
    V,
    'program',
    'delete',
    Omit<
      IAdtDeletable<
        IProgramConfig,
        ReturnType<R['deletion']>,
        'programName',
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
        'programName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'program',
    'validate',
    IAdtValidatable<
      IProgramConfig,
      ReturnType<R['validation']>,
      'programName' | 'packageName'
    >
  > &
  IAdtCheckable<IProgramConfig, ReturnType<R['check']>, 'programName'> &
  PerformedOn<
    V,
    'program',
    'activate',
    IAdtActivatable<IProgramConfig, ReturnType<R['activation']>, 'programName'>
  > &
  PerformedOn<
    V,
    'program',
    'lock',
    IAdtLockable<IProgramConfig, 'programName'>
  > &
  IAdtVersionable<
    IProgramConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'programName'
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
  ReturnType<R['enhancementOptions']>,
  'includeName'
> &
  PerformedOn<
    V,
    'include',
    'create',
    IAdtCreatable<IIncludeConfig, ReturnType<R['created']>>
  > &
  StatedReadable<IIncludeConfig, ReturnType<R['source']>, 'includeName'> &
  StatedMetadataReadable<
    IIncludeConfig,
    ReturnType<R['metadata']>,
    'includeName'
  > &
  PerformedOn<
    V,
    'include',
    'mainPrograms',
    IAdtMainProgramsReadable<
      IIncludeConfig,
      ReturnType<R['mainPrograms']>,
      'includeName'
    >
  > &
  PerformedOn<
    V,
    'include',
    'update',
    IAdtUpdatable<
      Partial<IIncludeConfig>,
      ReturnType<R['updated']>,
      'includeName',
      'source'
    >
  > &
  PerformedOn<
    V,
    'include',
    'delete',
    Omit<
      IAdtDeletable<
        IIncludeConfig,
        ReturnType<R['deletion']>,
        'includeName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'include',
    'activate',
    IAdtActivatable<IIncludeConfig, ReturnType<R['activation']>, 'includeName'>
  > &
  PerformedOn<
    V,
    'include',
    'updateMetadata',
    IAdtMetadataUpdatable<
      Partial<IIncludeConfig>,
      ReturnType<R['metadataUpdated']>,
      'includeName',
      'source'
    >
  > &
  PerformedOn<
    V,
    'include',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IIncludeConfig,
        ReturnType<R['deletion']>,
        'includeName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'include',
    'validate',
    IAdtValidatable<
      IIncludeConfig,
      ReturnType<R['validation']>,
      'includeName' | 'packageName'
    >
  > &
  PerformedOn<
    V,
    'include',
    'lock',
    IAdtLockable<IIncludeConfig, 'includeName'>
  >;

/** What the server calls on `getInterface()`'s answer. */
export type InterfaceApi<
  R extends IInterfaceResults,
  V extends AdtVariant,
> = IAdtCreatable<IInterfaceConfig, ReturnType<R['created']>> &
  StatedReadable<IInterfaceConfig, ReturnType<R['source']>, 'interfaceName'> &
  StatedMetadataReadable<
    IInterfaceConfig,
    ReturnType<R['metadata']>,
    'interfaceName'
  > &
  IAdtUpdatable<
    Partial<IInterfaceConfig>,
    ReturnType<R['updated']>,
    'interfaceName',
    'source'
  > &
  Omit<
    IAdtDeletable<
      IInterfaceConfig,
      ReturnType<R['deletion']>,
      'interfaceName',
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
        'interfaceName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<
    IInterfaceConfig,
    ReturnType<R['validation']>,
    'interfaceName'
  > &
  IAdtCheckable<IInterfaceConfig, ReturnType<R['check']>, 'interfaceName'> &
  IAdtActivatable<
    IInterfaceConfig,
    ReturnType<R['activation']>,
    'interfaceName'
  > &
  IAdtLockable<IInterfaceConfig, 'interfaceName'> &
  IAdtVersionable<
    IInterfaceConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'interfaceName'
  >;

/** What the server calls on `getDomain()`'s answer. */
export type DomainApi<
  R extends IDomainResults,
  V extends AdtVariant,
> = IAdtCreatable<IDomainConfig, ReturnType<R['created']>> &
  StatedMetadataReadable<
    IDomainConfig,
    ReturnType<R['metadata']>,
    'domainName'
  > &
  IAdtMetadataUpdatable<
    Partial<IDomainConfig>,
    ReturnType<R['metadataUpdated']>,
    'domainName',
    'source'
  > &
  IAdtDeletable<
    IDomainConfig,
    ReturnType<R['deletion']>,
    'domainName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IDomainConfig, ReturnType<R['validation']>, 'domainName'> &
  IAdtCheckable<IDomainConfig, ReturnType<R['check']>, 'domainName'> &
  IAdtActivatable<IDomainConfig, ReturnType<R['activation']>, 'domainName'> &
  IAdtLockable<IDomainConfig, 'domainName'>;

/** What the server calls on `getDataElement()`'s answer. */
export type DataElementApi<
  R extends IDataElementResults,
  V extends AdtVariant,
> = IAdtCreatable<IDataElementConfig, ReturnType<R['created']>> &
  StatedMetadataReadable<
    IDataElementConfig,
    ReturnType<R['metadata']>,
    'dataElementName'
  > &
  IAdtMetadataUpdatable<
    Partial<IDataElementConfig>,
    ReturnType<R['metadataUpdated']>,
    'dataElementName',
    'source'
  > &
  IAdtDeletable<
    IDataElementConfig,
    ReturnType<R['deletion']>,
    'dataElementName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<
    IDataElementConfig,
    ReturnType<R['validation']>,
    'dataElementName'
  > &
  IAdtCheckable<IDataElementConfig, ReturnType<R['check']>, 'dataElementName'> &
  IAdtActivatable<
    IDataElementConfig,
    ReturnType<R['activation']>,
    'dataElementName'
  > &
  IAdtLockable<IDataElementConfig, 'dataElementName'>;

/** What the server calls on `getStructure()`'s answer. */
export type StructureApi<
  R extends IStructureResults,
  V extends AdtVariant,
> = IAdtCreatable<IStructureConfig, ReturnType<R['created']>> &
  StatedReadable<IStructureConfig, ReturnType<R['source']>, 'structureName'> &
  StatedMetadataReadable<
    IStructureConfig,
    ReturnType<R['metadata']>,
    'structureName'
  > &
  IAdtUpdatable<
    Partial<IStructureConfig>,
    ReturnType<R['updated']>,
    'structureName',
    'source'
  > &
  IAdtDeletable<
    IStructureConfig,
    ReturnType<R['deletion']>,
    'structureName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<
    IStructureConfig,
    ReturnType<R['validation']>,
    'structureName'
  > &
  IAdtCheckable<IStructureConfig, ReturnType<R['check']>, 'structureName'> &
  IAdtActivatable<
    IStructureConfig,
    ReturnType<R['activation']>,
    'structureName'
  > &
  IAdtLockable<IStructureConfig, 'structureName'> &
  IAdtVersionable<
    IStructureConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'structureName'
  >;

/** What the server calls on `getTable()`'s answer. */
export type TableApi<
  R extends ITableResults,
  V extends AdtVariant,
> = IAdtCreatable<ITableConfig, ReturnType<R['created']>> &
  StatedReadable<ITableConfig, ReturnType<R['source']>, 'tableName'> &
  StatedMetadataReadable<ITableConfig, ReturnType<R['metadata']>, 'tableName'> &
  IAdtUpdatable<
    Partial<ITableConfig>,
    ReturnType<R['updated']>,
    'tableName',
    'source'
  > &
  IAdtDeletable<
    ITableConfig,
    ReturnType<R['deletion']>,
    'tableName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<ITableConfig, ReturnType<R['validation']>, 'tableName'> &
  IAdtCheckable<ITableConfig, ReturnType<R['check']>, 'tableName'> &
  IAdtActivatable<ITableConfig, ReturnType<R['activation']>, 'tableName'> &
  IAdtLockable<ITableConfig, 'tableName'> &
  IAdtVersionable<
    ITableConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'tableName'
  >;

/**
 * What the server calls on `getTableSettings()`'s answer: the settings read
 * at a stated version, the settings' own lock, and the patch that writes the
 * named settings over the rest as read (adt-clients 46.1.0). The patch is
 * typed by the variant: a cloud change may name `isWritableByAMDP`, an
 * on-premise one may not (interfaces-adt 30.1.0).
 */
export type TableSettingsApi<
  R extends ITableSettingsResults,
  V extends AdtVariant,
> = StatedMetadataReadable<
  ITableSettingsConfig,
  ReturnType<R['metadata']>,
  'tableName'
> &
  IAdtTableSettingsPatchable<
    ReturnType<R['metadataUpdated']>,
    Extract<V, AdtModernVariant>
  > &
  IAdtLockable<ITableSettingsConfig, 'tableName'>;

/**
 * What the server calls on `getTextElements()`'s answer: one part read at a
 * stated version or the working area, one whole part written under the
 * text elements' own lock (`TEXT`), and that lock. Reached through
 * `textElementsClientOf` (`clients.ts`), not `IServerAdtClient`: one more
 * member there makes some of its callers' inferred types too complex for
 * the compiler (TS2590).
 */
export type TextElementsApi<R extends ITextElementsResults> =
  IAdtTextElementsReadable<ReturnType<R['source']>> &
    IAdtTextElementsUpdatable<ReturnType<R['updated']>> &
    IAdtLockable<ITextElementsConfig, 'objectKind' | 'objectName'>;

/** What the server calls on `getTableType()`'s answer. */
export type DdicTableTypeApi<
  R extends ITableTypeResults,
  V extends AdtVariant,
> = PerformedOn<
  V,
  'tableType',
  'create',
  IAdtCreatable<ITableTypeConfig, ReturnType<R['created']>>
> &
  StatedMetadataReadable<
    ITableTypeConfig,
    ReturnType<R['metadata']>,
    'tableTypeName'
  > &
  PerformedOn<
    V,
    'tableType',
    'updateMetadata',
    IAdtMetadataUpdatable<
      Partial<ITableTypeConfig>,
      ReturnType<R['metadataUpdated']>,
      'tableTypeName',
      'source'
    >
  > &
  PerformedOn<
    V,
    'tableType',
    'delete',
    Omit<
      IAdtDeletable<
        ITableTypeConfig,
        ReturnType<R['deletion']>,
        'tableTypeName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'tableType',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        ITableTypeConfig,
        ReturnType<R['deletion']>,
        'tableTypeName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  PerformedOn<
    V,
    'tableType',
    'validate',
    IAdtValidatable<
      ITableTypeConfig,
      ReturnType<R['validation']>,
      'tableTypeName'
    >
  > &
  PerformedOn<
    V,
    'tableType',
    'check',
    IAdtCheckable<ITableTypeConfig, ReturnType<R['check']>, 'tableTypeName'>
  > &
  PerformedOn<
    V,
    'tableType',
    'activate',
    IAdtActivatable<
      ITableTypeConfig,
      ReturnType<R['activation']>,
      'tableTypeName'
    >
  > &
  PerformedOn<
    V,
    'tableType',
    'lock',
    IAdtLockable<ITableTypeConfig, 'tableTypeName'>
  > &
  PerformedOn<
    V,
    'tableType',
    'versions',
    IAdtVersionable<
      ITableTypeConfig,
      ReturnType<R['versions']>,
      ReturnType<R['versionSource']>,
      'tableTypeName'
    >
  >;

/** What the server calls on `getDdl()`'s answer. */
export type DdlApi<R extends IDdlResults, V extends AdtVariant> = IAdtCreatable<
  IDdlConfig,
  ReturnType<R['created']>
> &
  StatedReadable<IDdlConfig, ReturnType<R['source']>, 'ddlName'> &
  StatedMetadataReadable<IDdlConfig, ReturnType<R['metadata']>, 'ddlName'> &
  IAdtUpdatable<
    Partial<IDdlConfig>,
    ReturnType<R['updated']>,
    'ddlName',
    'source'
  > &
  Omit<
    IAdtDeletable<
      IDdlConfig,
      ReturnType<R['deletion']>,
      'ddlName',
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
        'ddlName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<IDdlConfig, ReturnType<R['validation']>, 'ddlName'> &
  IAdtCheckable<IDdlConfig, ReturnType<R['check']>, 'ddlName'> &
  IAdtActivatable<IDdlConfig, ReturnType<R['activation']>, 'ddlName'> &
  IAdtLockable<IDdlConfig, 'ddlName'> &
  PerformedOn<
    V,
    'ddl',
    'versions',
    Pick<
      IAdtVersionable<
        IDdlConfig,
        ReturnType<R['versions']>,
        ReturnType<R['versionSource']>,
        'ddlName'
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
        ReturnType<R['versionSource']>,
        'ddlName'
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
  ReturnType<R['enhancementOptions']>,
  'functionGroupName'
> &
  IAdtCreatable<IFunctionGroupConfig, ReturnType<R['created']>> &
  StatedMetadataReadable<
    IFunctionGroupConfig,
    ReturnType<R['metadata']>,
    'functionGroupName'
  > &
  PerformedOn<
    V,
    'functionGroup',
    'updateMetadata',
    Pick<
      IAdtMetadataUpdatable<
        Partial<IFunctionGroupConfig>,
        ReturnType<R['metadataUpdated']>,
        'functionGroupName',
        'source'
      >,
      'updateMetadata'
    >
  > &
  Omit<
    IAdtDeletable<
      IFunctionGroupConfig,
      ReturnType<R['deletion']>,
      'functionGroupName',
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
        'functionGroupName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtValidatable<
    IFunctionGroupConfig,
    ReturnType<R['validation']>,
    'functionGroupName'
  > &
  IAdtCheckable<
    IFunctionGroupConfig,
    ReturnType<R['check']>,
    'functionGroupName'
  > &
  IAdtActivatable<
    IFunctionGroupConfig,
    ReturnType<R['activation']>,
    'functionGroupName'
  > &
  IAdtLockable<IFunctionGroupConfig, 'functionGroupName'>;

/** What the server calls on `getFunctionModule()`'s answer. */
export type FunctionModuleApi<
  R extends IFunctionModuleResults,
  V extends AdtVariant,
> = IAdtCreatable<IFunctionModuleConfig, ReturnType<R['created']>> &
  StatedReadable<
    IFunctionModuleConfig,
    ReturnType<R['source']>,
    'functionGroupName' | 'functionModuleName'
  > &
  StatedMetadataReadable<
    IFunctionModuleConfig,
    ReturnType<R['metadata']>,
    'functionGroupName' | 'functionModuleName'
  > &
  IAdtUpdatable<
    Partial<IFunctionModuleConfig>,
    ReturnType<R['updated']>,
    'functionGroupName' | 'functionModuleName',
    'source'
  > &
  Omit<
    IAdtDeletable<
      IFunctionModuleConfig,
      ReturnType<R['deletion']>,
      'functionGroupName' | 'functionModuleName',
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
        'functionGroupName' | 'functionModuleName',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  // The validation names its group and states a description: SAP answers
  // `400` without one (measured), and adt-clients 43 types it so.
  IAdtValidatable<
    IFunctionModuleConfig,
    ReturnType<R['validation']>,
    'functionGroupName' | 'functionModuleName' | 'description'
  > &
  IAdtCheckable<
    IFunctionModuleConfig,
    ReturnType<R['check']>,
    'functionGroupName' | 'functionModuleName'
  > &
  IAdtActivatable<
    IFunctionModuleConfig,
    ReturnType<R['activation']>,
    'functionGroupName' | 'functionModuleName'
  > &
  IAdtLockable<
    IFunctionModuleConfig,
    'functionGroupName' | 'functionModuleName'
  > &
  IAdtVersionable<
    IFunctionModuleConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'functionGroupName' | 'functionModuleName'
  >;

/** What the server calls on `getFunctionInclude()`'s answer. */
export type FunctionIncludeApi<
  R extends IFunctionIncludeResults,
  V extends AdtVariant,
> = IAdtCreatable<IFunctionIncludeConfig, ReturnType<R['created']>> &
  StatedReadable<
    IFunctionIncludeConfig,
    ReturnType<R['source']>,
    'functionGroupName' | 'includeName'
  > &
  StatedMetadataReadable<
    IFunctionIncludeConfig,
    ReturnType<R['metadata']>,
    'functionGroupName' | 'includeName'
  > &
  IAdtUpdatable<
    Partial<IFunctionIncludeConfig>,
    ReturnType<R['updated']>,
    'functionGroupName' | 'includeName',
    'source'
  > &
  PerformedOn<
    V,
    'functionInclude',
    'deletionCheck',
    Pick<
      IAdtDeletable<
        IFunctionIncludeConfig,
        ReturnType<R['deletion']>,
        'functionGroupName' | 'includeName',
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
        'functionGroupName' | 'includeName',
        ReturnType<R['deletionCheck']>
      >,
      'delete'
    >
  > &
  IAdtActivatable<
    IFunctionIncludeConfig,
    ReturnType<R['activation']>,
    'functionGroupName' | 'includeName'
  > &
  IAdtLockable<IFunctionIncludeConfig, 'functionGroupName' | 'includeName'>;

/** What the server calls on `getPackage()`'s answer. */
export type PackageApi<
  R extends IPackageResults,
  V extends AdtVariant,
> = IAdtCreatable<IPackageConfig, ReturnType<R['created']>> &
  StatedMetadataReadable<
    IPackageConfig,
    ReturnType<R['metadata']>,
    'packageName'
  > &
  IAdtMetadataUpdatable<
    Partial<IPackageConfig>,
    ReturnType<R['metadataUpdated']>,
    'packageName',
    'source'
  > &
  IAdtDeletable<
    IPackageConfig,
    ReturnType<R['deletion']>,
    'packageName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<IPackageConfig, ReturnType<R['validation']>, 'packageName'> &
  IAdtCheckable<IPackageConfig, ReturnType<R['check']>, 'packageName'> &
  IAdtLockable<IPackageConfig, 'packageName'>;

/** What the server calls on `getMessageClass()`'s answer. */
export type MessageClassApi<
  R extends IMessageClassResults,
  V extends AdtVariant,
> = IAdtCreatable<IMessageClassConfig, ReturnType<R['created']>> &
  StatedMetadataReadable<
    IMessageClassConfig,
    ReturnType<R['metadata']>,
    'name'
  > &
  PerformedOn<
    V,
    'messageClass',
    'updateMetadata',
    Pick<
      IAdtMetadataUpdatable<
        Partial<IMessageClassConfig>,
        ReturnType<R['metadataUpdated']>,
        'name',
        'source'
      >,
      'updateMetadata'
    >
  > &
  Omit<
    IAdtDeletable<
      IMessageClassConfig,
      ReturnType<R['deletion']>,
      'name',
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
        'name',
        ReturnType<R['deletionCheck']>
      >,
      'checkDeletion'
    >
  > &
  IAdtLockable<IMessageClassConfig, 'name'>;

/**
 * What the server calls on `getMessageClassMessage()`'s answer: the class
 * document read for one message, the message's two locks and their release,
 * and the one PUT that upserts or (`removeMessage: true`) removes it
 * (adt-clients 48). The chain around them is the caller's
 * (`lib/messageClassMessageWrite.ts`).
 */
export type MessageClassMessageApi<
  R extends IMessageClassMessageResults,
  V extends AdtVariant,
> = StatedReadable<
  IMessageClassMessageConfig,
  ReturnType<R['read']>,
  MessageClassMessageAddress
> &
  IAdtMessageClassMessageLockable &
  IAdtMessageClassMessageUpdatable<
    ReturnType<R['written']>,
    ReturnType<R['deleted']>
  >;

/** What the server calls on `getAccessControl()`'s answer. */
export type AccessControlApi<
  R extends IAccessControlResults,
  V extends AdtVariant,
> = IAdtCreatable<IAccessControlConfig, ReturnType<R['created']>> &
  StatedMetadataReadable<
    IAccessControlConfig,
    ReturnType<R['metadata']>,
    'accessControlName'
  >;

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
  StatedReadable<
    IServiceDefinitionConfig,
    ReturnType<R['source']>,
    'serviceDefinitionName'
  > &
  StatedMetadataReadable<
    IServiceDefinitionConfig,
    ReturnType<R['metadata']>,
    'serviceDefinitionName'
  > &
  IAdtUpdatable<
    Partial<IServiceDefinitionConfig>,
    ReturnType<R['updated']>,
    'serviceDefinitionName',
    'source'
  > &
  IAdtDeletable<
    IServiceDefinitionConfig,
    ReturnType<R['deletion']>,
    'serviceDefinitionName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtCheckable<
    IServiceDefinitionConfig,
    ReturnType<R['check']>,
    'serviceDefinitionName'
  > &
  IAdtActivatable<
    IServiceDefinitionConfig,
    ReturnType<R['activation']>,
    'serviceDefinitionName'
  > &
  IAdtLockable<IServiceDefinitionConfig, 'serviceDefinitionName'>;

/** What the server calls on `getAppendStructure()`'s answer. */
export type AppendStructureApi<
  R extends IAppendStructureResults,
  V extends AdtVariant,
> = IAdtCreatable<IAppendStructureConfig, ReturnType<R['created']>> &
  StatedReadable<
    IAppendStructureConfig,
    ReturnType<R['source']>,
    'appendStructureName'
  > &
  IAdtUpdatable<
    Partial<IAppendStructureConfig>,
    ReturnType<R['updated']>,
    'appendStructureName',
    'source'
  > &
  IAdtLockable<IAppendStructureConfig, 'appendStructureName'>;

/** What the server calls on `getServiceBinding()`'s answer. */
export type ServiceBindingApi<
  R extends IServiceResults,
  V extends AdtVariant,
> = IAdtCreatable<IServiceBindingConfig, ReturnType<R['created']>> &
  StatedReadable<
    IServiceBindingConfig,
    ReturnType<R['source']>,
    'bindingName'
  > &
  StatedMetadataReadable<
    IServiceBindingConfig,
    ReturnType<R['metadata']>,
    'bindingName'
  > &
  // The publication takes no lock of the caller's (ERRATA): lock-free.
  IAdtLockFreeUpdatable<
    IServiceBindingPublicationConfig,
    ReturnType<R['updated']>,
    'bindingName'
  > &
  IAdtDeletable<
    IServiceBindingConfig,
    ReturnType<R['deletion']>,
    'bindingName',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<
    IServiceBindingConfig,
    ReturnType<R['validation']>,
    'bindingName'
  > &
  IAdtActivatable<
    IServiceBindingConfig,
    ReturnType<R['activation']>,
    'bindingName'
  > &
  IAdtLockable<IServiceBindingConfig, 'bindingName'> &
  IAdtServiceBindingTypes<ReturnType<R['bindingTypes']>> &
  IAdtServiceGroupReadable<ReturnType<R['odata']>>;

/** What the server calls on `getBehaviorDefinition()`'s answer. */
export type BehaviorDefinitionApi<
  R extends IBehaviorDefinitionResults,
  V extends AdtVariant,
> = IAdtCreatable<IBehaviorDefinitionConfig, ReturnType<R['created']>> &
  StatedReadable<IBehaviorDefinitionConfig, ReturnType<R['source']>, 'name'> &
  StatedMetadataReadable<
    IBehaviorDefinitionConfig,
    ReturnType<R['metadata']>,
    'name'
  > &
  IAdtUpdatable<
    Partial<IBehaviorDefinitionConfig>,
    ReturnType<R['updated']>,
    'name',
    'source'
  > &
  IAdtDeletable<
    IBehaviorDefinitionConfig,
    ReturnType<R['deletion']>,
    'name',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<
    IBehaviorDefinitionConfig,
    ReturnType<R['validation']>,
    'name'
  > &
  IAdtCheckable<IBehaviorDefinitionConfig, ReturnType<R['check']>, 'name'> &
  IAdtActivatable<
    IBehaviorDefinitionConfig,
    ReturnType<R['activation']>,
    'name'
  > &
  IAdtLockable<IBehaviorDefinitionConfig, 'name'> &
  IAdtVersionable<
    IBehaviorDefinitionConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'name'
  >;

/** What the server calls on `getBehaviorImplementation()`'s answer. */
export type BehaviorImplementationApi<
  R extends IClassResults,
  V extends AdtVariant,
> = IAdtCreatable<IBehaviorImplementationConfig, ReturnType<R['created']>> &
  StatedReadable<
    IBehaviorImplementationConfig,
    ReturnType<R['source']>,
    'className'
  > &
  StatedMetadataReadable<
    IBehaviorImplementationConfig,
    ReturnType<R['metadata']>,
    'className'
  > &
  IAdtUpdatable<
    Partial<IBehaviorImplementationConfig>,
    ReturnType<R['updated']>,
    'className',
    'source'
  > &
  IAdtDeletable<
    IBehaviorImplementationConfig,
    ReturnType<R['deletion']>,
    'className',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<
    IBehaviorImplementationConfig,
    ReturnType<R['validation']>,
    'className'
  > &
  IAdtActivatable<
    IBehaviorImplementationConfig,
    ReturnType<R['activation']>,
    'className'
  > &
  IAdtLockable<IBehaviorImplementationConfig, 'className'>;

/** What the server calls on `getMetadataExtension()`'s answer. */
export type MetadataExtensionApi<
  R extends IMetadataExtensionResults,
  V extends AdtVariant,
> = IAdtCreatable<IMetadataExtensionConfig, ReturnType<R['created']>> &
  StatedReadable<IMetadataExtensionConfig, ReturnType<R['source']>, 'name'> &
  StatedMetadataReadable<
    IMetadataExtensionConfig,
    ReturnType<R['metadata']>,
    'name'
  > &
  IAdtUpdatable<
    Partial<IMetadataExtensionConfig>,
    ReturnType<R['updated']>,
    'name',
    'source'
  > &
  IAdtDeletable<
    IMetadataExtensionConfig,
    ReturnType<R['deletion']>,
    'name',
    ReturnType<R['deletionCheck']>
  > &
  IAdtValidatable<
    IMetadataExtensionConfig,
    ReturnType<R['validation']>,
    'name'
  > &
  IAdtCheckable<IMetadataExtensionConfig, ReturnType<R['check']>, 'name'> &
  IAdtActivatable<
    IMetadataExtensionConfig,
    ReturnType<R['activation']>,
    'name'
  > &
  IAdtLockable<IMetadataExtensionConfig, 'name'> &
  IAdtVersionable<
    IMetadataExtensionConfig,
    ReturnType<R['versions']>,
    ReturnType<R['versionSource']>,
    'name'
  >;

/** What the server calls on `getEnhancement()`'s answer. */
export type EnhancementApi<
  R extends IEnhancementResults,
  V extends AdtVariant,
> = StatedReadable<
  IEnhancementConfig,
  ReturnType<R['source']>,
  'enhancementName'
> &
  StatedMetadataReadable<
    IEnhancementConfig,
    ReturnType<R['metadata']>,
    'enhancementName' | 'enhancementType'
  >;

/** A request status the listing selects: `D` modifiable, `R` released. */
export type TransportListStatus = 'D' | 'R';

/** A request type the listing selects: `K` workbench, `W` customizing, `T` transport of copies. */
export type TransportListType = 'K' | 'W' | 'T';

/**
 * The transport listing by user, with no saved search configuration: the
 * query SAP's handler reads — `user` (it matches the request owner or a
 * task owner), `requestStatus`, `requestType`, and `releasedFromDate` /
 * `releasedToDate` (`YYYYMMDD`, released requests only; SAP's default is
 * the last 14 days). Each is sent only when given. adt-clients 45.5.3
 * serves it (`IListTransportsQuery`); interfaces-adt 27.4's `IAdtRequest`
 * names the saved search alone, so the server states the form it calls.
 */
export type TransportListQuery = {
  readonly user: string;
  readonly requestStatus: readonly [
    TransportListStatus,
    ...TransportListStatus[],
  ];
  readonly requestType?: readonly [TransportListType, ...TransportListType[]];
  readonly releasedFromDate?: string;
  readonly releasedToDate?: string;
};

/** The listing the server calls: one request, the query by user. */
export interface TransportListing<TList> {
  list<E extends IAdtError>(
    options: TransportListQuery &
      IAdtAnalyseOptions<E> & { analyse: IAnalyse<E> },
  ): Promise<IAdtResponse<TList, E | IAdtError>>;
}

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
        'transportNumber',
        ReturnType<R['deletionCheck']>
      >,
      'delete'
    >
  > &
  TransportListing<ReturnType<R['list']>> &
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
  >;

/** What the server calls on `getLocalTestClass()`'s answer. */
export type LocalTestClassApi<
  R extends IClassResults,
  V extends AdtVariant,
> = StatedReadable<
  ILocalTestClassConfig,
  ReturnType<R['source']>,
  'className'
> &
  IAdtUpdatable<
    Partial<ILocalTestClassConfig>,
    ReturnType<R['updated']>,
    'className'
  > &
  IAdtActivatable<
    ILocalTestClassConfig,
    ReturnType<R['activation']>,
    'className'
  > &
  IAdtLockable<IClassConfig, 'className'>;

/** What the server calls on `getLocalTypes()`'s answer. */
export type LocalTypesApi<
  R extends IClassResults,
  V extends AdtVariant,
> = StatedReadable<ILocalTypesConfig, ReturnType<R['source']>, 'className'> &
  IAdtUpdatable<
    Partial<ILocalTypesConfig>,
    ReturnType<R['updated']>,
    'className'
  > &
  IAdtActivatable<ILocalTypesConfig, ReturnType<R['activation']>, 'className'> &
  IAdtLockable<IClassConfig, 'className'>;

/** What the server calls on `getLocalDefinitions()`'s answer. */
export type LocalDefinitionsApi<
  R extends IClassResults,
  V extends AdtVariant,
> = StatedReadable<
  ILocalDefinitionsConfig,
  ReturnType<R['source']>,
  'className'
> &
  IAdtUpdatable<
    Partial<ILocalDefinitionsConfig>,
    ReturnType<R['updated']>,
    'className'
  > &
  IAdtActivatable<
    ILocalDefinitionsConfig,
    ReturnType<R['activation']>,
    'className'
  > &
  IAdtLockable<IClassConfig, 'className'>;

/** What the server calls on `getLocalMacros()`'s answer. */
export type LocalMacrosApi<
  R extends IClassResults,
  V extends AdtVariant,
> = StatedReadable<ILocalMacrosConfig, ReturnType<R['source']>, 'className'> &
  IAdtUpdatable<
    Partial<ILocalMacrosConfig>,
    ReturnType<R['updated']>,
    'className'
  > &
  IAdtActivatable<
    ILocalMacrosConfig,
    ReturnType<R['activation']>,
    'className'
  > &
  IAdtLockable<IClassConfig, 'className'>;

/**
 * The kinds SAP serves an outline for (`GET <object uri>/objectstructure`):
 * class, interface, program, include and function group — measured on
 * premise and on ABAP cloud (2026-11-04), the program and the include on
 * premise only. The implementation's `AdtOutlineCode` names the same five;
 * interfaces-adt has no outline contract yet, so the list is stated here.
 */
export type ServerOutlineCode = OutlineCodes<
  'CLAS/OC' | 'INTF/OI' | 'PROG/P' | 'PROG/I' | 'FUGR/F'
>;

/** Codes of the tables, as given: what keeps `ServerOutlineCode` to codes. */
type OutlineCodes<C extends AdtTypeCode> = C;

/**
 * An object's outline: one GET, the document as it came (no result slot of
 * interfaces-adt names it, so no reading is injected for it).
 */
export interface IServerObjectOutline {
  getObjectOutline<E extends IAdtError = IAdtError>(
    objectType: ServerOutlineCode,
    objectName: string,
    options?: {
      version?: AdtReadVersion;
      accept?: string;
    } & IAdtAnalyseOptions<E>,
  ): Promise<IAdtResponse<string, E>>;
}

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
  ): Promise<IAdtResponse<TSearch, E | IAdtError>>;
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
  // The synchronous group activation, for a system whose discovery lists no
  // `/activation/runs` (adt-clients 45, fr0ster/mcp-abap-adt#351), and the
  // discovery that says which one the system offers.
  IAdtObjectActivation<ReturnType<R['objectActivation']>, V> &
  IAdtDiscovery<ReturnType<R['discovery']>> &
  IAdtDataPreview<
    ReturnType<R['query']>,
    ReturnType<R['columns']>,
    ReturnType<R['contents']>
  > &
  ObjectAccess<ReturnType<R['source']>, ReturnType<R['metadata']>> &
  IAdtObjectProperties<ReturnType<R['objectProperties']>> &
  IServerObjectOutline;

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
      'tableSettings',
      {
        getTableSettings<R extends ITableSettingsResults>(
          results: R,
        ): TableSettingsApi<R, V>;
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
