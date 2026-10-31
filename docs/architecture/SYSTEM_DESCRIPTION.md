# What a system says about itself

Eclipse ADT asks an ABAP system a fixed set of questions at logon, and the answers
describe that system: which endpoints it serves, which features it has, which object
types it knows and what may be done with each. This document reads those answers for
three releases:

- **S/4HANA 2025 on-premise** (`SAP_BASIS` 816),
- **ABAP cloud (BTP trial)** (`SAP_BASIS` 920 SP05, `SAP_CLOUD` 920),
- **SAP_BASIS 7.40 SP04**.

Every answer quoted here is in the corpus, `tests/fixtures/adt/`, under the cases
`system-description-s4-2025`, `system-description-abap-cloud` and
`system-description-basis-740` (recorded 2026-10-27, read-only; see the corpus
README for what is not verbatim). Every claim carries one label:

- **Measured** — read off the named corpus exchange;
- **Eclipse log** — the owner's Eclipse ADT communication log;
- **Inference** — concluded, not observed.

Exchanges are named by case and step: `s4-2025/07` is
`system-description-s4-2025--07-typestructure`.

## 1. The logon sequences

**Eclipse log.** On a newer system Eclipse sends, in order:

1. `GET /sap/bc/adt/core/discovery`
2. `GET /sap/bc/adt/compatibility/graph`
3. `GET /sap/bc/adt/discovery`
4. `GET /sap/bc/adt/system/components`
5. `GET /sap/bc/adt/repository/informationsystem/objecttypes?maxItemCount=999&name=*&data=usedByProvider`
6. `GET /sap/bc/adt/repository/informationsystem/releasestates?maxItemCount=999&name=*`
7. `POST /sap/bc/adt/repository/typestructure`, no body, Accept
   `application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.RepositoryTypeList`

**Eclipse log.** On 7.40, `core/discovery` answers 404, and Eclipse then asks only
`compatibility/graph`, `discovery` and `typestructure`.

**Measured.** All seven were asked of all three systems:

| Request | S/4HANA 2025 | ABAP cloud | SAP_BASIS 7.40 SP04 |
|---|---|---|---|
| `core/discovery` | 200, 2 161 B | 200, 2 159 B | **200, 0 B, `text/html`** |
| `compatibility/graph` | 200, 32 008 B | 200, 32 008 B | 200, 28 516 B |
| `discovery` | 200, 401 182 B | 200, 444 622 B | 200, 34 603 B |
| `system/components` | 200, 18 969 B | 200, 2 599 B | **200, 0 B, `text/html`** |
| `informationsystem/objecttypes` | 200, 100 415 B | 200, 97 312 B | **404**, `No suitable resource found` |
| `informationsystem/releasestates` | 200, 13 329 B | 200, 13 744 B | **404**, the same text |
| `typestructure` | 200, 492 580 B | 200, 470 556 B | 200, 201 721 B |

**The 7.40 `core/discovery` answer disagrees with the Eclipse log.** Asked with
`Accept: */*` (`basis-740/01`) and with `Accept: application/atomsvc+xml`
(`basis-740/08`), 7.40 answered `200` with an empty `text/html` body, not `404`
(Measured). `system/components` behaves the same (`basis-740/04`, `/09`). What
Eclipse sends that makes the difference is not known: its headers were not recorded
here (Inference: a header Eclipse adds, or a proxy between Eclipse and the system).
Either way the consequence is the same: on 7.40 neither request yields a document,
and a reading that takes `200` for "served" is wrong there.

**Measured.** With no Accept header at all, S/4HANA 2025 refuses
`GET /sap/bc/adt/discovery` with `400` `ExceptionResourceBadRequest`,
`acceptHeaderMissing` (`SADT_RESOURCE`/`034`); observed while recording, not kept as
an exchange. The recorded GETs therefore carry `Accept: */*`.

## 2. `core/discovery` — the short discovery

**What it gives (Measured, `s4-2025/01`, `abap-cloud/01`).** An Atom service
document of four workspaces, one collection each — the services a client needs
before anything else:

| Workspace | Collection |
|---|---|
| Compatibility | `/sap/bc/adt/compatibility/graph` |
| Push Channel | `/sap/bc/apc/sap/adt` (APC WebSocket) |
| ADT Batch Resource | `/sap/bc/adt/communication/batch`, accepts `multipart/mixed` |
| ADT Background Run Resources | `/sap/bc/adt/communication/bgruns/runs`, accepts `application/http` |

The push channel carries two templates: one with the system's own absolute
`wss://` authority, one with `{+uriAuthority}` for a client that reaches the system
under another name:

```xml
<adtcomp:templateLink rel="pushchannel"
  template="wss://abap.example.com:443/sap/bc/apc/sap/adt?channel=amc://system_channels/progress_indicator&amp;channel=amc://adt/request_scoped_messages{&amp;connectionId}"/>
<adtcomp:templateLink rel="pushchannel-variable-uri-authority"
  template="wss://{+uriAuthority}/sap/bc/apc/sap/adt?channel=…"/>
```

**Differences.** S/4HANA 2025 and ABAP cloud carry the same four workspaces; they
differ only in the host and port of the absolute template (Measured). 7.40 gives
no document (section 1).

## 3. `compatibility/graph` — the features

**What it gives (Measured, `*/02`).** `compatibility:graph` with `nodes` and
`edges`. A node is a feature, named by a namespace and a name; an edge says one
feature depends on another, `isObligatory` true or false:

```xml
<node nameSpace="COM.SAP.ADT.RIS" name="allObjectTypes"/>
<node nameSpace="COM.SAP.ADT.WBTYPEREGISTRY" name="fullTypeMetaData"/>
<edge isObligatory="true">
  <sourceNode nameSpace="COM.SAP.ADT.ACTIVATION" name="activate"/>
  <targetNode nameSpace="COM.SAP.ADT.CORE" name="xmlFormat"/>
</edge>
```

**Measured counts.**

| | S/4HANA 2025 | ABAP cloud | 7.40 SP04 |
|---|---|---|---|
| nodes | 207 | 207 | 182 |
| namespaces | 67 | 67 | 61 |
| edges | 105 | 105 | 95 |
| obligatory edges | 55 | 55 | 47 |

**Differences (Measured).**

- S/4HANA 2025 and ABAP cloud answer **byte for byte the same document**.
- 27 nodes are on S/4HANA 2025 and not on 7.40: `ACM.DCLSOURCES:dclSources`, three
  debugger features (`launchFromSystemPrograms`, `reactivateDebuggerInEmbeddedSapgui`,
  `variableValuesEscaped`), two quick fixes (`deleteMembers`,
  `supportEmptyAffectedObjects`), `REST:acceptHeader`, sixteen Web Dynpro features
  (copy, creation, deletion, rename, where-used of plugs) and four `COM.SAP.MTS`
  contract features.
- Two nodes are on 7.40 and not on S/4HANA 2025: `DDIC:domain` and
  `DEBUGGER:abapTraces`.
- `RIS:allObjectTypes` and `WBTYPEREGISTRY:fullTypeMetaData` are on all three — on
  7.40 too, where `objecttypes` answers 404. The graph names a feature, not the
  endpoint Eclipse uses for it (Inference).

## 4. `discovery` — the endpoints

**What it gives (Measured, `*/03`).** The full Atom service document: workspaces
of collections, each collection an `href`, a title, a category (`term`, `scheme`),
on newer releases the media types it accepts (`app:accept`) and URI templates
(`adtcomp:templateLink`):

```xml
<!-- S/4HANA 2025 -->
<app:collection href="/sap/bc/adt/oo/classes">
  <atom:title>Classes</atom:title>
  <app:accept>application/vnd.sap.adt.oo.classes.v4+xml</app:accept>
  <atom:category term="classes" scheme="http://www.sap.com/adt/categories/oo"/>
  <adtcomp:templateLinks xmlns:adtcomp="http://www.sap.com/adt/compatibility"/>
</app:collection>
<!-- 7.40 SP04 -->
<app:collection href="/sap/bc/adt/oo/classes">
  <atom:title>Classes</atom:title>
  <atom:category term="classes" scheme="http://www.sap.com/adt/categories/oo"/>
</app:collection>
```

**Measured counts.**

| | S/4HANA 2025 | ABAP cloud | 7.40 SP04 |
|---|---|---|---|
| size | 401 182 B | 444 622 B | 34 603 B |
| workspaces | 126 | 127 | 36 |
| collections | 831 | 947 | 125 |
| distinct `href`s | 824 | 940 | 124 |
| `templateLink`s | 580 | 603 | 24 |
| `app:accept` | 491 | 549 | **0** |

**Differences (Measured).**

- S/4HANA 2025 and ABAP cloud share 809 `href`s.
- 7.40 shares 113 `href`s with S/4HANA 2025. Its own include
  `/sap/bc/adt/compatibility/graph` (on the newer releases it is in `core/discovery`),
  `/sap/bc/adt/oo/linenumber`, `informationsystem/messagesearch`, three SSCR
  registration collections, four `/sap/bc/cts/…` collections outside `/sap/bc/adt`,
  and an absolute link to the ABAP documentation.
- **7.40 declares no media type for any collection.** A client that negotiates its
  Accept from discovery has nothing to read there.
- 7.40's discovery names collections only; no object type code appears in it
  (Measured; also in the owner's notes).

## 5. `system/components` — the installed software

**What it gives (Measured, `s4-2025/04`, `abap-cloud/04`).** An Atom feed, one entry
per software component: `adtcore:componentType` (a letter) and its description, the
component name as `atom:id`, and `atom:title` as four `;`-separated fields —
release, support package, SP level, description:

```xml
<atom:entry adtcore:componentType="S" adtcore:componentTypeDescription="Netweaver Basis Component">
  <atom:id>SAP_BASIS</atom:id><atom:title>816;n/a;0000;SAP Basis Component</atom:title>
</atom:entry>
```

**Measured counts and differences.**

| | S/4HANA 2025 | ABAP cloud |
|---|---|---|
| components | 92 | 11 |
| `SAP_BASIS` | `816;n/a;0000` | `920;SAPK-92005INSAPBASIS;0005` |
| component types | C, H, I, L, M, N, R (63 application components), S, V, W, X | J, K (developer extensibility), L, M, S, W |

- Type descriptions differ by release for the same letter: `S` is "Netweaver Basis
  Component" on S/4HANA 2025 and "ABAP Platform Basis Component" on ABAP cloud;
  `M` is "Customer developments (standard)" and "Classic Custom Development".
- `HOME` and `LOCAL` carry the release `DEV` on both.
- ABAP cloud lists the developer-extensibility components (type `K`, `J`) of the
  tenant: software components created by users of the system.
- 7.40 gives no document (section 1).

## 6. `informationsystem/objecttypes` — what Eclipse searches by

**What it gives (Measured, `s4-2025/05`, `abap-cloud/05`).**
`nameditem:namedItemList` with `totalItemCount` and one `namedItem` per name a user
types in quick search: `name`, `description`, and `data` as `;`-separated
`key:value` pairs, `type` (the object type code, or `WGRP` for a group) and `usedBy`
(the providers that use the name):

```xml
<nameditem:namedItem>
  <nameditem:name>FUNC</nameditem:name>
  <nameditem:description>Function Module</nameditem:description>
  <nameditem:data>type:FUGR/FF;usedBy:quick_search,source_search</nameditem:data>
</nameditem:namedItem>
```

**What it adds to `typestructure`** (Measured, both releases):

- **The quick-search names.** Most names are the first half of the code
  (`CLAS` → `CLAS/OC`, `DDLS` → `DDLS/DF`, `DEVC` → `DEVC/K`). Six are not:
  `FUNC` → `FUGR/FF`, `REPO` → `PROG/P`, `INCL` → `PROG/I`, `STRU` → `TABL/DS`,
  `DTAB` → `TABL/DT`, `BADI` → `ENHS/XB`. `typestructure` has no such name.
- **`usedBy`.** Every item is used by `quick_search`; all but three by
  `virtual_folders` (`BADI`, `FUNC`, `STOB` are not); one, `FUNC`, also by
  `source_search`.
- **Groups.** Items of type `WGRP` are the categories of `typestructure` in upper
  case (`SOURCE_LIBRARY`, `CORE_DATA_SERVICES`, `DICTIONARY`, …), each description
  listing its member types:

  ```text
  Application Interface Framework

  The following object types belong to the group:
  	AIFA	(Action)
  	AIFD	(Deployment Scenario)
  	…
  ```
- **One code `typestructure` does not carry:** `TABL`, the item for tables and
  structures together, has the bare code `TABL`. On S/4HANA 2025 `AIFA/TYP` is a
  second (it is in ABAP cloud's `typestructure`).

**Measured counts.**

| | S/4HANA 2025 | ABAP cloud | 7.40 SP04 |
|---|---|---|---|
| items (`totalItemCount`) | 386 | 373 | 404 |
| groups (`WGRP`) | 49 | 50 | — |
| type items | 336 | 322 | — |

The type items are fewer than half the `typestructure` types: `objecttypes` lists
what a user searches for, `typestructure` every type the system knows (Measured
counts; the reading is Inference).

## 7. `informationsystem/releasestates` — the API release states

**What it gives (Measured, `s4-2025/06`, `abap-cloud/06`).** The same
`namedItemList`, one item per release state; `data` is
`type=CHAR8B@@##@@longtext=<explanation>`:

```xml
<nameditem:name>USE_IN_CLOUD_DEVELOPMENT</nameditem:name>
<nameditem:description>…</nameditem:description>
<nameditem:data>type=CHAR8B@@##@@longtext=…</nameditem:data>
```

**Measured.** S/4HANA 2025 lists 20 states, ABAP cloud 21: the same 20 plus
`DECOMMISSIONED_AS_REMOTE_API`. The states are `EXTEND_IN_KEY_USER_APPS`,
`USE_IN_KEY_USER_APPS`, `USE_IN_CLOUD_DEVELOPMENT`, `USE_AS_REMOTE_API`,
`MANAGE_CONFIGURATION_CONTENT`, `EXTEND_IN_CLOUD_DEVELOPMENT`,
`DEPRECATED_FOR_KEY_USER_EXTNSN`, `DEPRECATED_FOR_KEY_USER_APPS`,
`DEPRECATED_FOR_CLOUD_DVLPMNT`, `DEPRECATED_AS_REMOTE_API`,
`DEPRECATED_FOR_CONFIGURATION`, `DEPRECATED_FOR_AMDP`,
`HAS_KEY_USER_APPS_SUCCESSOR`, `HAS_CLOUD_DVLPMNT_SUCCESSOR`, `USE_IN_AMDP`,
`DEPRECATED_FOR_CLOUD_DV_EXTNSN`, `USE_IN_CLOUD_DVLPMNT_ACTIVE`,
`DEPRECATED_FOR_CLD_DEV_ACTIVE`, `RELEASED`, `DEPRECATED`. 7.40 answers 404.

## 8. `typestructure` — every object type

**What it gives (Measured, `*/07`).** One `asx:abap` document, `DATA` holding one
`SEU_ADT_OBJECT_TYPE_DESCRIPTOR` per object type. The request is a `POST` with no
body and the typed Accept, as Eclipse sends it (Eclipse log). It is a read: with no body it names nothing
to change (Inference).

```xml
<!-- 7.40 SP04 -->
<SEU_ADT_OBJECT_TYPE_DESCRIPTOR>
  <OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_TYPE_LABEL>Class</OBJECT_TYPE_LABEL>
  <CATEGORY>source_library</CATEGORY><CATEGORY_LABEL>Source Library</CATEGORY_LABEL>
  <URI_TEMPLATE>/sap/bc/adt/vit/wb/object_type/clasoc/object_name/{name}</URI_TEMPLATE>
  <PARENT_OBJECT_TYPE/><OBJNAME_MAXLENGTH>30</OBJNAME_MAXLENGTH>
  <CAPABILITIES><SEU_ACTION>EXECUTE</SEU_ACTION><SEU_ACTION>CREATE</SEU_ACTION><SEU_ACTION>PROFILE</SEU_ACTION></CAPABILITIES>
</SEU_ADT_OBJECT_TYPE_DESCRIPTOR>
<!-- S/4HANA 2025 -->
<SEU_ADT_OBJECT_TYPE_DESCRIPTOR>
  <OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_TYPE_LABEL>Class</OBJECT_TYPE_LABEL>
  <OBJECT_TYPE_LABEL_PLURAL>Classes</OBJECT_TYPE_LABEL_PLURAL>
  <CATEGORY>source_library</CATEGORY><CATEGORY_LABEL>Source Code Library</CATEGORY_LABEL>
  <URI_TEMPLATE>/sap/bc/adt/vit/wb/object_type/clasoc/object_name/{name}</URI_TEMPLATE>
  <PARENT_OBJECT_TYPE/><OBJNAME_MAXLENGTH>30</OBJNAME_MAXLENGTH>
  <CAPABILITIES><SEU_ACTION>EXECUTE</SEU_ACTION><SEU_ACTION>CREATE</SEU_ACTION><SEU_ACTION>PROFILE</SEU_ACTION><SEU_ACTION>INDEX_UPD</SEU_ACTION></CAPABILITIES>
  <USER_AUTHORIZATIONS><SEU_ACTION>CREATE</SEU_ACTION></USER_AUTHORIZATIONS>
  <SCOPES><WVOBJTYPE_SCOPE_ID>AFF_OBJECT_HANDLER</WVOBJTYPE_SCOPE_ID><WVOBJTYPE_SCOPE_ID>AI_EXPLAIN</WVOBJTYPE_SCOPE_ID><WVOBJTYPE_SCOPE_ID>INFOSYSTEM</WVOBJTYPE_SCOPE_ID></SCOPES>
</SEU_ADT_OBJECT_TYPE_DESCRIPTOR>
```

### 8.1 The elements

Every descriptor of a release carries every element of that release, in this order,
empty when it has no value (Measured: each element counted once per descriptor).

| Element | Content | 7.40 SP04 | S/4HANA 2025 | ABAP cloud |
|---|---|---|---|---|
| `OBJECT_TYPE` | the code, `TYPE/SUBTYPE` or a bare type (`SAMT`, `/$TM`) | yes | yes | yes |
| `OBJECT_TYPE_LABEL` | the singular label (may be empty: `DEVC/KG`) | yes | yes | yes |
| `OBJECT_TYPE_LABEL_PLURAL` | the plural label | — | yes | yes |
| `CATEGORY` | the group, lower case; `<none>` when none | yes | yes | yes |
| `CATEGORY_LABEL` | the group's label | yes | yes | yes |
| `URI_TEMPLATE` | `/sap/bc/adt/vit/wb/object_type/<code without />/object_name/{name}`; a subobject's template pads the parent name with 40 encoded blanks (`PROG/I`, `FUGR/FF`) | yes | yes | yes |
| `PARENT_OBJECT_TYPE` | the parent code, mostly empty | yes | yes | yes |
| `OBJNAME_MAXLENGTH` | the longest name allowed | yes | yes | yes |
| `CAPABILITIES` | `SEU_ACTION`s the type supports | yes | yes | yes |
| `USER_AUTHORIZATIONS` | `SEU_ACTION`s the logged-on user may perform | — | yes | yes |
| `SCOPES` | `WVOBJTYPE_SCOPE_ID`s: where the type takes part | — | yes | yes |

Nothing else was found: 8 elements on 7.40, 11 on both newer releases.

### 8.2 The values

**`SEU_ACTION` in `CAPABILITIES`** (Measured; number of types carrying it):

| Action | 7.40 SP04 | S/4HANA 2025 | ABAP cloud |
|---|---|---|---|
| `CREATE` | 56 | 63 | 62 |
| `EXECUTE` | 3 | 3 | 3 |
| `PROFILE` | 5 | 5 | 5 |
| `INDEX_UPD` | — | 60 | 60 |
| `KTD_DOCU` | — | 27 | 26 |
| types with any capability | 56 of 464 | 139 of 721 | 138 of 708 |

**`SEU_ACTION` in `USER_AUTHORIZATIONS`** (Measured): only `CREATE`, on 608 of 721
types on S/4HANA 2025 and 238 of 708 on ABAP cloud. `PROG/P` and `PROG/I` carry it
on S/4HANA 2025 and not on ABAP cloud. The element describes the user who asked, not
the type (Inference from its name and from the cloud's narrower set); the corpus
holds one user's answer per system.

**`WVOBJTYPE_SCOPE_ID` in `SCOPES`** (Measured; number of types carrying it):

| Scope | S/4HANA 2025 | ABAP cloud |
|---|---|---|
| `ADT_CHECKABLE` | 112 | 127 |
| `ADT_REST` | 119 | 133 |
| `AFF_OBJECT_HANDLER` | 70 | 76 |
| `AI_EXPLAIN` | 4 | 6 |
| `DOCUMENTATION` | 27 | 26 |
| `DOCUMENTATION_LINKS` | 3 | 3 |
| `INFOSYSTEM` | 284 | 302 |
| `WB_BROWSERTOOL` | 1 | 2 |
| `WB_EDITORTOOL` | 346 | 339 |
| `WB_INFRASTRUCTURE` | 223 | 217 |
| `WB_OBJECT_PERSIST` | 184 | 197 |
| types with any scope | 505 of 721 | 498 of 708 |

**Categories** (Measured): 20 on 7.40, 49 on S/4HANA 2025, 50 on ABAP cloud (which
adds `apscloudcom`, `apscloudiam`, `observability` and lacks `migproj`, `sit`).
`<none>` holds 187 types on 7.40 and 113 on both newer releases. 7.40 has
`message_classes` and `transactions` categories the newer releases do not.

**Parents** (Measured): `FUGR/FF` and `FUGR/I` have parent `FUGR/F` on all three;
the newer releases add six Web Dynpro parents (`WDCA/YA` → `WDYA/YY`, `WDYN/WQ`,
`WDYN/WW`, `WDYN/WZ`, `WDCC/YG` → `WDYN/YC`, `WDYN/YW` → `WDYN/YD`).

### 8.3 Counts and overlaps

**Measured.** Every code appears once per document.

| | count |
|---|---|
| types on S/4HANA 2025 | 721 |
| types on ABAP cloud | 708 |
| types on 7.40 SP04 | 464 |
| on all three | 439 |
| S/4HANA 2025 and ABAP cloud | 686 |
| S/4HANA 2025 and 7.40 | 442 |
| ABAP cloud and 7.40 | 439 |
| S/4HANA 2025 only | 32 |
| ABAP cloud only | 22 |
| 7.40 only | 22 |
| S/4HANA 2025 and ABAP cloud, not 7.40 | 247 |
| S/4HANA 2025 and 7.40, not ABAP cloud | 3 (`BCCH`, `BCCU`, `SHI3/U`) |
| ABAP cloud and 7.40, not S/4HANA 2025 | 0 |

- **S/4HANA 2025 only:** `EDCC`, `EDCK`, `EDCR`, `EDOI`, `EDOM`, `EDOP`, `EDOT`,
  `OTAT/AT`, `OTBO/BO`, `OTCM/CM`, `OTES/ES`, `OTFL/FL`, `OTRA/RA`, `OTSC/SC`,
  `OTSL/SL`, `PT01/PRO`, `PT02/ARE`, `RMCE`, `RMCT`, `RMRL`, `RMTC`, `SITB`,
  `SITO/TYP`, `SRFA/SA`, `SRFP/SC`, `SRFQ/SQ`, `SRFR/SRF`, `SRFS/SS`, `TRUL/TR`,
  `VCMD`, `VKOI/VKI`, `VKOS/VKS`.
- **ABAP cloud only:** `AIFA/TYP`, `DTIX/DF`, `GSMS/TYP`, `IWNG`, `SCO1`, `SCO2`,
  `SCO3`, `SIA1`, `SIA1/BCB`, `SIA2`, `SIA3`, `SIA5`–`SIA9`, `SIAD`, `SUCO/TYP`,
  `SVIM`, `TXPA/TYP`, `TXPR/TYP`, `TXTT/TYP`.
- **7.40 only:** `ABCD/VD`, `ACCO/KA`, `AUTH/AUT`, `BCSM/{S`, `BCSN/{N`, `BMEF/MF`,
  `BTAG/3A`, `BTTP/3Y`, `COBO/3B`, `COBO/3BC`, `COBO/3BN`, `ENHD/XR`, `ENHT/XY`,
  `IAMA/WA`, `PAIN/3O`, `PAOT/3Q`, `SAMC/ICH`, `SAMT`, `TBD/VA`, `TBD/VO`, `TBD/VP`,
  `TBD/VS`.
- Missing from 7.40 among the common ones: `BDEF/BDO`, `SRVD/SRV`, `SRVB/SVB`,
  `DCLS/DL`, `ENHO/*`.

### 8.4 Standard types side by side

**Measured.** `OBJECT_TYPE_LABEL_PLURAL`, `USER_AUTHORIZATIONS` and `SCOPES` are
absent on 7.40. "Source Code Library" is the `source_library` label on the newer
releases, "Source Library" on 7.40. The URI template of a type is the same on
both newer releases for every shared type, and the same on 7.40 for every shared
type but three (`ECTD/GD`, `SOBJ/MOA`, `SOBJ/MOM`).

| Type | Label | Category | Max | `CAPABILITIES` 7.40 → newer | `USER_AUTHORIZATIONS` S/4 / cloud | `SCOPES` (both newer) |
|---|---|---|---|---|---|---|
| `CLAS/OC` | Class | `source_library` | 30 | EXECUTE CREATE PROFILE → + INDEX_UPD | CREATE / CREATE | AFF_OBJECT_HANDLER AI_EXPLAIN INFOSYSTEM |
| `PROG/P` | Program | `source_library` | 40 | EXECUTE CREATE PROFILE → + INDEX_UPD | CREATE / — | INFOSYSTEM WB_EDITORTOOL |
| `PROG/I` | Include | `source_library` | 40 | CREATE → + INDEX_UPD | CREATE / — | INFOSYSTEM WB_EDITORTOOL |
| `FUGR/F` | Function Group | `source_library` | 26 | CREATE → + INDEX_UPD | CREATE / CREATE | AFF_OBJECT_HANDLER INFOSYSTEM |
| `FUGR/FF` | Function Module, parent `FUGR/F` | `source_library` | 30 | EXECUTE CREATE PROFILE → + INDEX_UPD | CREATE / CREATE | INFOSYSTEM WB_EDITORTOOL |
| `TABL/DS` | Structure | `dictionary` | 30 | CREATE → CREATE | CREATE / CREATE | ADT_CHECKABLE ADT_REST WB_INFRASTRUCTURE WB_OBJECT_PERSIST |
| `TTYP/DA` | Table Type | `dictionary` | 30 | CREATE → CREATE | CREATE / CREATE | ADT_CHECKABLE ADT_REST WB_INFRASTRUCTURE WB_OBJECT_PERSIST |
| `DDLS/DF` | 7.40: "ABAP DDL Source", `dictionary`; newer: "Data Definition", `core_data_services` | see label | 30 | none → KTD_DOCU | CREATE / CREATE | ADT_CHECKABLE ADT_REST AFF_OBJECT_HANDLER AI_EXPLAIN DOCUMENTATION INFOSYSTEM WB_INFRASTRUCTURE WB_OBJECT_PERSIST |
| `BDEF/BDO` | Behavior Definition (absent on 7.40) | `core_data_services` | 30 | — → KTD_DOCU INDEX_UPD | CREATE / CREATE | ADT_CHECKABLE ADT_REST AI_EXPLAIN DOCUMENTATION DOCUMENTATION_LINKS INFOSYSTEM WB_INFRASTRUCTURE WB_OBJECT_PERSIST |

Other maximum lengths (Measured): `TABL/DT` 16, `MSAG/N` 20, `INTF/OI`, `DEVC/K`,
`DTEL/DE`, `DOMA/DD`, `XSLT/VT` 30 on all three; `SRVB/SVB` 40; `SRVD/SRV` 40 on
S/4HANA 2025 and **30 on ABAP cloud**.

## 9. How the answers fit together

- `discovery` says **where** to go: the collections and, on newer releases, the
  media types they accept (Measured).
- `typestructure` says **which objects exist and what may be done with them**: the
  code, its limits, its capabilities, and on newer releases what the user may do and
  where the type takes part (Measured).
- `compatibility/graph` says **which features** the backend has (Measured).
- `objecttypes` adds the names a user searches by and the groups (Measured).

On 7.40 three of them answer: `compatibility/graph`, `discovery` and `typestructure`
(Measured); they are also the three the owner's Eclipse log shows Eclipse asking
there.
