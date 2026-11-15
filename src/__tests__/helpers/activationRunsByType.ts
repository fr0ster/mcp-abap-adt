/**
 * The results of activation runs measured on premise and on the cloud
 * (2026-11-15): for each object type, a run of one good and one broken
 * object, activated together. The documents are SAP's, reduced to what the
 * reading of a run uses — `chkl:properties` and each `msg` with its
 * `objDescr`, `type`, `line`, `href`, `code` and words — and the object names
 * replaced. SAP names the object of every error message by its `href`: the
 * object's uri, or a part of it (`…/source/main#start=…`); a function
 * module's is the module's own uri, under its group.
 */

/** One measured run. */
export interface MeasuredRun {
  readonly system: 'onprem' | 'cloud';
  /** The type code both objects of the run have. */
  readonly kind: string;
  /** The run's objects, the good one first. */
  readonly references: readonly {
    readonly name: string;
    readonly uri: string;
  }[];
  /** The function group of a run of function modules. */
  readonly parent?: string;
  /** The results document, as the run answered it. */
  readonly results: string;
  /** Its `activationExecuted`. */
  readonly executed: boolean;
  /** The object an error message is about. */
  readonly broken: string;
}

export const MEASURED_RUNS: readonly MeasuredRun[] = [
  {
    system: 'onprem',
    kind: 'INTF',
    references: [
      {
        name: 'ZOBJ_INTF_GOOD',
        uri: '/sap/bc/adt/oo/interfaces/zobj_intf_good',
      },
      {
        name: 'ZOBJ_INTF_BROKEN',
        uri: '/sap/bc/adt/oo/interfaces/zobj_intf_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="Interface ZOBJ_INTF_BROKEN, Interface Section" type="E" line="1" href="/sap/bc/adt/oo/interfaces/zobj_intf_broken/source/main#start=2,36" code="MESSAGE(GTH)"><shortText><txt>Type "ZOBJ_INTF_NOTYPE" is unknown.</txt></shortText></msg></chkl:messages>',
    executed: false,
    broken: 'ZOBJ_INTF_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'DDLS',
    references: [
      {
        name: 'ZOBJ_DDLS_GOOD',
        uri: '/sap/bc/adt/ddic/ddl/sources/zobj_ddls_good',
      },
      {
        name: 'ZOBJ_DDLS_BROKEN',
        uri: '/sap/bc/adt/ddic/ddl/sources/zobj_ddls_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="" type="W" line="0" href="" code="D0(302)"><shortText><txt> =========================================================================</txt></shortText></msg><msg objDescr="DDLS ZOBJ_DDLS_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/ddl/sources/zobj_ddls_broken" code="SDDL_PARSER_MSG(064)"><shortText><txt>The data type "chr" is unknown or is not supported</txt></shortText></msg><msg objDescr="DDLS ZOBJ_DDLS_BROKEN was not activated" type="E" line="2" href="/sap/bc/adt/ddic/ddl/sources/zobj_ddls_broken" code="D0(408)"><shortText><txt>DDLS ZOBJ_DDLS_BROKEN was not activated</txt></shortText></msg><msg objDescr="Data Definition ZOBJ_DDLS_BROKEN" type="E" line="3" href="/sap/bc/adt/ddic/ddl/sources/zobj_ddls_broken/source/main#start=4,11" code="SDDL_PARSER_MSG(064)"><shortText><txt>The data type "chr" is unknown or is not supported</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_DDLS_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'DOMA',
    references: [
      {
        name: 'ZOBJ_DOMA_GOOD',
        uri: '/sap/bc/adt/ddic/domains/zobj_doma_good',
      },
      {
        name: 'ZOBJ_DOMA_BROKEN',
        uri: '/sap/bc/adt/ddic/domains/zobj_doma_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="" type="W" line="0" href="" code="ED(064)"><shortText><txt> No next/previous object found</txt></shortText></msg><msg objDescr="DOMA ZOBJ_DOMA_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/domains/zobj_doma_broken" code="DO(195)"><shortText><txt>Fixed value/limit ABC for data type NUMC must be a whole positive number</txt></shortText></msg><msg objDescr="DOMA ZOBJ_DOMA_BROKEN was not activated" type="E" line="2" href="/sap/bc/adt/ddic/domains/zobj_doma_broken" code="D0(408)"><shortText><txt>DOMA ZOBJ_DOMA_BROKEN was not activated</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_DOMA_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'DTEL',
    references: [
      {
        name: 'ZOBJ_DTEL_GOOD',
        uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_good',
      },
      {
        name: 'ZOBJ_DTEL_BROKEN',
        uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="" type="W" line="0" href="" code="ED(064)"><shortText><txt> No next/previous object found</txt></shortText></msg><msg objDescr="DTEL ZOBJ_DTEL_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/dataelements/zobj_dtel_broken" code="DO(315)"><shortText><txt>No active domain ZOBJ_DTEL_NODOM available</txt></shortText></msg><msg objDescr="DTEL ZOBJ_DTEL_BROKEN was not activated" type="E" line="2" href="/sap/bc/adt/ddic/dataelements/zobj_dtel_broken" code="D0(408)"><shortText><txt>DTEL ZOBJ_DTEL_BROKEN was not activated</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_DTEL_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'TABL/DS',
    references: [
      {
        name: 'ZOBJ_TABL_GOOD',
        uri: '/sap/bc/adt/ddic/structures/zobj_tabl_good',
      },
      {
        name: 'ZOBJ_TABL_BROKEN',
        uri: '/sap/bc/adt/ddic/structures/zobj_tabl_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="" type="W" line="0" href="" code="ED(064)"><shortText><txt> No next/previous object found</txt></shortText></msg><msg objDescr="Structure ZOBJ_TABL_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main#start=3,17;end=3,29" code="DT(005)"><shortText><txt>Nametab for table ZOBJ_TABL_BROKEN cannot be generated</txt></shortText></msg><msg objDescr="Structure ZOBJ_TABL_BROKEN" type="E" line="2" href="/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main#start=3,17;end=3,29" code="D0(408)"><shortText><txt>TABL ZOBJ_TABL_BROKEN was not activated</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_TABL_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'TABL/DT',
    references: [
      { name: 'ZOBJ_TABL_GOOD', uri: '/sap/bc/adt/ddic/tables/zobj_tabl_good' },
      {
        name: 'ZOBJ_TABL_BROKEN',
        uri: '/sap/bc/adt/ddic/tables/zobj_tabl_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="" type="W" line="0" href="" code="ED(064)"><shortText><txt> No next/previous object found</txt></shortText></msg><msg objDescr="Database Table ZOBJ_TABL_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/tables/zobj_tabl_broken/source/main#start=6,13;end=6,25" code="DT(005)"><shortText><txt>Nametab for table ZOBJ_TABL_BROKEN cannot be generated</txt></shortText></msg><msg objDescr="Database Table ZOBJ_TABL_BROKEN" type="E" line="2" href="/sap/bc/adt/ddic/tables/zobj_tabl_broken/source/main#start=6,13;end=6,25" code="D0(408)"><shortText><txt>TABL ZOBJ_TABL_BROKEN was not activated</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_TABL_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'FUGR/FF',
    references: [
      {
        name: 'ZOBJ_FUGR_GOOD',
        uri: '/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_good',
      },
      {
        name: 'ZOBJ_FUGR_BROKEN',
        uri: '/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_broken',
      },
    ],
    parent: 'ZOBJ_FUGR_GROUP',
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="Function Module ZOBJ_FUGR_BROKEN" type="E" line="1" href="/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_broken/source/main#start=5,2;end=5,6" code="MESSAGE(G13)"><shortText><txt>The statement "DAAT" is not expected. A correct similar statement is "DATA".</txt></shortText></msg><msg objDescr="Function Module ZOBJ_FUGR_BROKEN" type="E" line="2" href="/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_broken/source/main#start=6,2;end=6,4" code="MESSAGE(GTU)"><shortText><txt>Field "LV" is unknown.</txt></shortText></msg></chkl:messages>',
    executed: false,
    broken: 'ZOBJ_FUGR_BROKEN',
  },
  {
    system: 'onprem',
    kind: 'PROG/P',
    references: [
      {
        name: 'ZOBJ_PROG_GOOD',
        uri: '/sap/bc/adt/programs/programs/zobj_prog_good',
      },
      {
        name: 'ZOBJ_PROG_BROKEN',
        uri: '/sap/bc/adt/programs/programs/zobj_prog_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/><msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg><msg objDescr="Program ZOBJ_PROG_BROKEN" type="E" line="1" href="/sap/bc/adt/programs/programs/zobj_prog_broken/source/main#start=2,0;end=2,4" code="MESSAGE(G13)"><shortText><txt>The statement "DAAT" is not expected. A correct similar statement is "DATA".</txt></shortText></msg><msg objDescr="Program ZOBJ_PROG_BROKEN" type="E" line="2" href="/sap/bc/adt/programs/programs/zobj_prog_broken/source/main#start=3,0;end=3,2" code="MESSAGE(GTU)"><shortText><txt>Field "LV" is unknown.</txt></shortText></msg></chkl:messages>',
    executed: false,
    broken: 'ZOBJ_PROG_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'INTF',
    references: [
      {
        name: 'ZOBJ_INTF_GOOD',
        uri: '/sap/bc/adt/oo/interfaces/zobj_intf_good',
      },
      {
        name: 'ZOBJ_INTF_BROKEN',
        uri: '/sap/bc/adt/oo/interfaces/zobj_intf_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/><msg objDescr="Interface ZOBJ_INTF_BROKEN, Interface Section" type="E" line="1" href="/sap/bc/adt/oo/interfaces/zobj_intf_broken/source/main#start=2,36" code="MESSAGE(GTH)"><shortText><txt>Type "ZOBJ_INTF_NOTYPE" is unknown.</txt></shortText></msg></chkl:messages>',
    executed: false,
    broken: 'ZOBJ_INTF_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'DDLS',
    references: [
      {
        name: 'ZOBJ_DDLS_GOOD',
        uri: '/sap/bc/adt/ddic/ddl/sources/zobj_ddls_good',
      },
      {
        name: 'ZOBJ_DDLS_BROKEN',
        uri: '/sap/bc/adt/ddic/ddl/sources/zobj_ddls_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="Data Definition ZOBJ_DDLS_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/ddl/sources/zobj_ddls_broken/source/main#start=4,11" code="SDDL_PARSER_MSG(064)"><shortText><txt>The data type "chr" is unknown or is not supported</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_DDLS_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'DOMA',
    references: [
      {
        name: 'ZOBJ_DOMA_GOOD',
        uri: '/sap/bc/adt/ddic/domains/zobj_doma_good',
      },
      {
        name: 'ZOBJ_DOMA_BROKEN',
        uri: '/sap/bc/adt/ddic/domains/zobj_doma_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="DOMA ZOBJ_DOMA_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/domains/zobj_doma_broken" code="DO(195)"><shortText><txt>Fixed value/limit ABC for data type NUMC must be a whole positive number</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_DOMA_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'DTEL',
    references: [
      {
        name: 'ZOBJ_DTEL_GOOD',
        uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_good',
      },
      {
        name: 'ZOBJ_DTEL_BROKEN',
        uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="DTEL ZOBJ_DTEL_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/dataelements/zobj_dtel_broken" code="DO(315)"><shortText><txt>No active domain ZOBJ_DTEL_NODOM available</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_DTEL_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'TABL/DS',
    references: [
      {
        name: 'ZOBJ_TABL_GOOD',
        uri: '/sap/bc/adt/ddic/structures/zobj_tabl_good',
      },
      {
        name: 'ZOBJ_TABL_BROKEN',
        uri: '/sap/bc/adt/ddic/structures/zobj_tabl_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="Structure ZOBJ_TABL_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main#start=3,17;end=3,29" code="DT(005)"><shortText><txt>Nametab for table ZOBJ_TABL_BROKEN cannot be generated</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_TABL_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'TABL/DT',
    references: [
      { name: 'ZOBJ_TABL_GOOD', uri: '/sap/bc/adt/ddic/tables/zobj_tabl_good' },
      {
        name: 'ZOBJ_TABL_BROKEN',
        uri: '/sap/bc/adt/ddic/tables/zobj_tabl_broken',
      },
    ],
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="false"/><msg objDescr="Database Table ZOBJ_TABL_BROKEN" type="E" line="1" href="/sap/bc/adt/ddic/tables/zobj_tabl_broken/source/main#start=6,13;end=6,25" code="DT(005)"><shortText><txt>Nametab for table ZOBJ_TABL_BROKEN cannot be generated</txt></shortText></msg><msg objDescr="" type="W" line="2" href="" code="DT(494)"><shortText><txt>Primary key should have type INVERTED INDIVIDUAL on the database</txt></shortText></msg><msg objDescr="" type="W" line="3" href="" code="DT(005)"><shortText><txt>Nametab for table ZOBJ_TABL_BROKEN cannot be generated</txt></shortText></msg><msg objDescr="" type="W" line="4" href="" code="DT(494)"><shortText><txt>Primary key should have type INVERTED INDIVIDUAL on the database</txt></shortText></msg></chkl:messages>',
    executed: true,
    broken: 'ZOBJ_TABL_BROKEN',
  },
  {
    system: 'cloud',
    kind: 'FUGR/FF',
    references: [
      {
        name: 'ZOBJ_FUGR_GOOD',
        uri: '/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_good',
      },
      {
        name: 'ZOBJ_FUGR_BROKEN',
        uri: '/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_broken',
      },
    ],
    parent: 'ZOBJ_FUGR_GROUP',
    results:
      '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/><msg objDescr="Function Module ZOBJ_FUGR_BROKEN" type="E" line="1" href="/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_broken/source/main#start=5,2;end=5,6" code="MESSAGE(G13)"><shortText><txt>The statement "DAAT" is not expected. A correct similar statement is "DATA".</txt></shortText></msg><msg objDescr="Function Module ZOBJ_FUGR_BROKEN" type="E" line="2" href="/sap/bc/adt/functions/groups/zobj_fugr_group/fmodules/zobj_fugr_broken/source/main#start=6,2;end=6,4" code="MESSAGE(GTU)"><shortText><txt>Field "LV" is unknown.</txt></shortText></msg></chkl:messages>',
    executed: false,
    broken: 'ZOBJ_FUGR_BROKEN',
  },
];
