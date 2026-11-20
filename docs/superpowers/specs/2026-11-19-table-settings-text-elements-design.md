# Table technical settings and text elements as tools — design

## Changes since approval (2026-11-20, for the owner's approval)

Read from the published contract: interfaces-adt 30.1.0 (`IAdtTableSettings.ts`), adt-clients 46.1.0
(README, CHANGELOG at tag `adt-clients-v46.1.0`, MIGRATION-46), adt-strategies 0.26.0.

1. **Versions:** `interfaces-adt ^30.1.0`, `adt-clients ^46.1.0`, `adt-strategies ^0.26.0`;
   `adt-clients-legacy` (0.11.1) stays out.
2. **`isWritableByAMDP` per variant, by type:** required in a cloud write, forbidden on premise
   (`ITableSettingsOf<V>`, `ITableSettingsChangesOf<V>`). The tool's `is_writable_by_amdp` stays
   optional on cloud (the patch keeps the value read) and absent on premise.
3. **The cloud guard follows the client instance.** The server's cloud client
   (`GuardedAdtClientCloud extends AdtClientCloud`, `src/lib/clients.ts`) already constructs the
   handler with `variant: 'cloud'`. The two settings handlers take `adtClientOf(connection)`, narrow
   on `variant`, and read with `cloudTableSettings` on cloud and `tableSettings` on premise. Neither
   takes the variant-generic `createAdtClient`.
4. **The patch's `translation` takes `value` only.** The tool gains an optional `translation: string`
   (the translation value). The other three attributes are kept as read.
5. **`area_key_fields` only with buffering type `G`.** It is allowed beside `type: 'G'`, or with no
   type given (the type is kept). The zod schema refuses it beside another type, mirroring
   `ITableBufferingChange`. A kept type that is not `G` is the library's refusal before the PUT,
   passed through.
6. **Patch headers:** `{ accept: TABLE_SETTINGS_MEDIA_TYPE }` only. The library sets the content type
   (`contentType?: never`), so the call does not use the `withAdtHeaders` pair.
7. **`patchMetadata` refusals before the PUT** are answered as the library's failure, passed through
   unchanged: a read without an ETag, a document missing a required setting (a count past the safe
   integers included), an `areaKeyFields` change whose merged type is not `G`, and on cloud a read
   without the flag. Empty changes do not compile, and the zod boundary refuses them in the model's
   arguments.
8. **DT 771 (cloud).** A table writable by AMDP must have buffering `N`, logging off and no
   replacement object, or its activation is refused (Code, cloud: `CL_DDACT_TABL_CHECK_TCHSET_CL` →
   `chk_writable_amdp_usage` → `RADTTCHK` FORM `chk_writable_amdp_usage`, only with
   `allowed_for_amdp_write = 'X'`; Measured, cloud, in the 46.1.0 live run: 200 with an `E`
   message, the table left inactive; on premise there is no such check, Code; adt-clients 46.1.0
   CHANGELOG, "SAP's rule, documented"). UpdateTableSettings answers that refusal as SAP's
   (`analyseActivation` refuses any `E` message). **Decision for approval:** the cloud description of
   `is_writable_by_amdp` states the rule, because it changes whether this call's activation succeeds.
9. **Function groups on cloud** are measured and served (T10). The adt-clients live case runs on
   both systems.
10. **The class-pool inactive entry needs no handling.** `still_inactive` already carries `uri` and
    `parent_uri` (`src/lib/answer.ts`), and the server matches the run's references by uri
    (`stillInactiveAmong`, `activationRun.ts`). The `PROG/PX {CLASS}====CP` entry is therefore found
    by its uri, with no name matching and no description line of its own.
11. **The `patchMetadata` contract is the published one** (below). It replaces the earlier "to be
    built there" sketch.
12. **Compact HandlerUpdate writes under the caller's lock; the four types gain HandlerLock/HandlerUnlock
    (owner's compact rule).** One operation per compact handler: HandlerGet reads, HandlerUpdate writes
    under the caller's `lock_handle` (`TABLE_SETTINGS`: `patchMetadata`; the text elements: one PUT per
    part given), HandlerLock/HandlerUnlock take the TABT settings lock and the TEXT lock, HandlerActivate
    activates the text elements, and a table's settings are activated with the `TABLE`. The table
    below ("→ UpdateTableSettings", "→ UpdateTextElements") is replaced by this.

## Intent

Expose two ADT sub-resources the server cannot reach today, in one change:

- a table's **technical settings** (`TABL/DTT`, `/sap/bc/adt/ddic/db/settings/{name}`) — read, and
  write **non-default** values. The complaint seen in Eclipse is Eclipse's own client-side check,
  raised for any table, not an SAP refusal (owner); the server activates tables with SAP's default
  settings (Measured, S6). The tool exists to set values other than the defaults;
- the **text elements** of programs, function groups and classes (`PROG/PX`, `CLAS/OCX`,
  `/sap/bc/adt/textelements/{programs|functiongroups|classes}/{name}`) — text symbols, selection
  texts and list/column headings; full read and write.

And make activation and where-used reach the text elements.

The library side is published: `@mcp-abap-adt/adt-clients` 46.0.0 (`getTableSettings()`,
`getTextElements()`, `textElementsActivationReferences`, where-used `container`),
`adt-strategies` 0.25.0 (`tableSettings`, `textSymbols`, `selectionTexts`, `textHeadings`),
`interfaces-adt` 30.0.0.

## Decided (owner)

- Full sets: `GetTableSettings`, `UpdateTableSettings`. Compact: object type `TABLE_SETTINGS` in
  `HandlerGet` and `HandlerUpdate`. The read-only build: the Get only.
- Text elements ship with the table settings, in this PR. Scope: symbols, selection texts and
  headings for programs and function groups; symbols only for classes. Full read and write.
- `ActivateObjects` must activate an object together with its text elements (today `[PROG/P]`
  after a text write answers "still inactive PROG/P and PROG/PX"). **Explicit codes:**
  `ActivateObjects` takes `PROG/PX` and `CLAS/OCX` as ordinary references, and `PROG/PX` with
  `parentName` is a function group's text elements. `UpdateTextElements` with `activate: true`
  activates the object together with its text elements. Nothing is added automatically to any
  other activation.
- **The partial settings write lives in adt-clients.** All CRUD, read-patch-write included, is
  adt-clients'. A new minor, adt-clients **46.1.0**, gets the method below; the server only calls
  it. `UpdateTableSettings` waits for 46.1.0 on the registry (see Dependency).
- **Function groups' text elements are served on onprem and on cloud** (T10).
- **Compact:** `TABLE_SETTINGS`, `PROGRAM_TEXT_ELEMENTS`, `FUNCTION_GROUP_TEXT_ELEMENTS`,
  `CLASS_TEXT_ELEMENTS`.
- `TABL/DTT` stays out of where-used: SAP does not serve it (W4).
- The unused `adt-clients-legacy` dependency is dropped: the server imports nothing from it.
- `activate` on the new update tools is a **required** boolean: the existing update tools have no
  single convention (some default to `true`, some to `false`, some have none), so no implicit
  default.

## Facts the design rests on

Every statement about SAP behaviour carries its ground: **Code** (handler class, method, quoted
line), **Measured** (system, request, status), or **unverified** — and every unverified one is in
"To verify in SAP handlers". Sources are the research notes of 2026-11-19 (`sap-handler/` in the
session scratchpad: `table-settings.md` (TS), `texts-translation.md` (TT), their raw answers in
`raw/`, `raw-te/`, `raw-v/`) and the recorded discovery of adt-clients' corpus
(`corpus/adt/discovery/`). The handler sources behind S2, S3, S5, S8, W1, T3, T6, T7 and T11 were
read on both systems (TS §14, TT §14, `raw-v/code-{onprem,cloud}/`); the rest of the Code lines were
read on premise.

### Table settings

- **S1 Own resource, v2 only.** Measured onprem: `GET /sap/bc/adt/ddic/db/settings/sflight` with the
  v2 Accept → 200, a v1 Accept → 406 SADT_RESOURCE 037 (TS §3, `raw/onprem-get-sflight-v2.txt`,
  `-v1.txt`). Measured cloud: discovery lists the collection accepting v2 and text/html only; an
  existing table's GET → 200 with an ETag (TS §8 "Cloud reads", `raw/cloud-read2.txt`).
- **S2 Own lock, `TABT`, apart from the table's.** Code, both systems:
  `CL_TABT_WB_PERSIST->if_wb_object_persist~lock` (l. 136–139), `CALL FUNCTION 'ENQUEUE_ESDICT' …
  objtype = cl_tabt_object_data=>co_sub_transport_type`, `co_sub_transport_type … VALUE 'TABT'`
  (`CL_TABT_OBJECT_DATA`; TS §2, §14 V3). Measured, both systems: with the table locked
  (`/ddic/tables/{t}?_action=LOCK` → 200) a settings LOCK → 200, and in the reverse order → 200; all
  four UNLOCKs → 200 (`raw-v/{onprem,cloud}/04–11`). A clash between two users is SAP's enqueue
  refusal, passed through to the model as SAP answers it, with no handling of its own; not measured
  with two users (the tests run as one SAP user by rule).
- **S3 The PUT writes every settings field from the document; a field left out is reset.** Code,
  both systems: `CL_TABT_WB_PERSIST->move_adt_to_ddv` (l. 215–238) sets `tabart`, `tabkat`,
  `bufallow` (blank → `'N'`), `pufferung`, `schfeldanz` (only `IF e_dd09l_wa-pufferung = 'G'`),
  `roworcolst = …storage_type`, `sharingtype`, `load_unit`, `uebersetz = …translation-value`,
  `protokoll = …logging_enabled`, and on cloud also `e_dd09l_wa-allowed_for_amdp_write =
  i_object_data-content-is_writable_by_amdp.` (l. 238); `save` then calls `DDIF_TABT_PUT name
  dd09l_wa`. Measured, both systems: a PUT with `storageType C`, `loggingEnabled true` and (cloud)
  `isWritableByAMDP true` → read back with those values; then a minimal PUT → `storageType` empty,
  `loggingEnabled false`, cloud `isWritableByAMDP false` (`raw-v/{onprem,cloud}/27–34`; earlier
  `raw/onprem-trial2.txt` lines 29 → 52, `raw/cloud-trial2.txt` lines 47 → 70).
- **S4 `adtcore:description` required.** Measured, both systems: a PUT without it → 400
  `ExceptionInvalidData` "The description is missing for {table}", `SWB_TOOL/019`
  (`raw/onprem-trial.txt`; `raw-v/{onprem,cloud}/13`).
- **S5 `ts:translation` may be absent; when present it carries all four attributes.** Code, both
  systems: `SDDIC_ADT_TTAB` writes `<ts:translation>` with four `tt:attribute`s (`ts:value`,
  `ts:isVisible`, `ts:isEditable`, `ts:granularity`) inside a `tt:cond`;
  `CL_ADT_REST_ST_HANDLER->if_adt_rest_content_handler~deserialize`, `catch cx_st_error into
  data(st_error). raise_adt_deserialize_exc( st_error )` → `cx_adt_rest_data_invalid`, T100 `00/001`
  with the ST text and `XML_PATH` (TS §14 V5). Measured, both systems: `<ts:translation ts:value=""/>`
  → 400 `00/001` "…isVisible…", `XML_PATH ts:tableSettings(1)ts:translation(4)`;
  `<ts:translation/>` → 400 `00/001` "…value…"; all four attributes → 200; element absent → 200
  (`raw-v/{onprem,cloud}/15–26`). Since `uebersetz` is written from it (S3), an absent element
  resets the translation value. adt-clients 46.0.0's README ("SAP refuses a write without one") is
  wrong; 46.1.0 corrects it.
- **S6 Defaults with the table; activation of the table activates them.** Measured both:
  `CreateTable` → settings GET → 200 `version="new"`, APPL0 / 0 / N; activating the table alone
  (`POST /sap/bc/adt/activation?method=activate`, one `TABL/DT` reference) → 200
  `activationExecuted="true"`, settings then `active`; after a settings PUT the same table-only
  activation → settings `active` with the written values (TS §8 steps 1, 2, 4, 5). An activation of
  `TABL/DTT` alone was never sent.
- **S7 `isWritableByAMDP` is cloud's, and the cloud PUT writes it.** Measured: present in every cloud
  read, absent on premise (`raw/cloud-trial2.txt`); Code: in the cloud `SDDIC_ADT_TTAB` and
  `move_adt_to_ddv` (l. 238, S3), not in the on-premise ones (TS §14). Leaving it out of a cloud PUT
  resets it to `false` (Measured, S3). So a cloud write carries it: interfaces-adt 30.1.0 types it
  required in a cloud write and forbidden on premise (`ITableSettingsOf<V>`), and `patchMetadata`
  keeps the value read unless the change names it. The guard holds through `AdtClientCloud` (the
  server's cloud client), whose handler refuses a cloud read without the flag (adt-clients 46.1.0).
- **S8 The data class is not limited to the value help; activation judges it.** Code, both systems:
  `CL_TABT_DATA_CLASS_VH->get_named_items` selects `dartt JOIN ddart … WHERE ( b~ddclass = 'STD' )`
  — standard classes only. Measured, both systems: `…/settings/dataClass/values` → APPL0, APPL1,
  APPL2, DDIM, DFACT, DODS, …; PUT `USER` → 200, read back `USER`; PUT a 6-character value → 400
  `00/001` (the TABART length, `XML_PATH …dataClassCategory(1)`); PUT `ZZNOP` (no such class) → 200,
  stored; activating the table then → 200 `activationExecuted="true"` with an error message
  "Activation was cancelled." / "Value in field Data Class (value ZZNOP not permitted)", table and
  settings stay inactive (`raw-v/v6/{onprem,cloud}/45–50`). So the tool takes any data class, and an
  activation is judged by its messages, not by `activationExecuted` alone (`analyseActivation`).
- **S9 Not on 7.40.** Measured (recorded discovery): `system-description-basis-740--03-discovery`
  has no `/sap/bc/adt/ddic/db/settings` (0 occurrences; checked 2026-11-19).
- **S10 If-Match.** Measured, both systems: PUT with `If-Match` and the content type without charset
  → 200; with `; charset=utf-8` → 412 `SADT_RESOURCE/043`; with charset and no `If-Match` → 200
  (`ts-etag-onprem.txt`, `ts-etag-cloud.txt`; TS §14 V11).

### Text elements

- **T1 Parts per kind.** Code onprem: `CL_SEDX_ADT_RES_TEXTELEMENT->get_properties`,
  `case global_type-objtype_tr. when 'CLAS'. append … co_source-symbols … when 'PROG'. … symbols …
  selections … headings. when 'FUGR' or 'FUGS' or 'FUGX'. … symbols … selections … headings.`
  (`cls-sedx-res-textelement.abap:251-262`). Measured cloud: a function group's properties list the
  three parts (TT §13.2).
- **T2 Own lock, `TEXT`.** A clash between two users is SAP's refusal, passed through as SAP answers
  it; not measured with two users (one SAP user by rule). Code onprem: `lcl_access_permission->modify`,
  `cl_adt_lock_handle=>get_instance( 'TEXT' )` and `RS_ACCESS_PERMISSION … object_class = 'TEXT'`
  (`sedx-locals.abap:330-345`). Measured both: `POST /textelements/{kind}/{n}?_action=LOCK&accessMode=MODIFY`
  → 200 `IS_LOCAL=X`; UNLOCK → 200 (TT §8, §10 step 08, §13.3). Cloud's lock answers
  `MODIFICATION_SUPPORT=NoModification` and the PUT still saves (Measured cloud, TT §8, §13.3).
- **T3 A write replaces the whole part.** Code, both systems: `lcl_textpool->save` deletes the
  symbols missing from the body (`read table i_tpool-text_elements … check sy-subrc <> 0. delete tpool
  index del_index.`); `update_header`: `if sy-subrc = 0 and i_tpool-&1 is initial. delete tpool
  index sy-tabix.` (TT §12.3, §14 V7). Measured: onprem symbols 001+002 then 001 alone → 002 gone (TT
  §8); cloud the same, and headings 1–3 then column 2 empty and column 3 left out → both empty
  (`raw-v/cloud/65, 69, 73`).
- **T4 Original language only.** Code onprem: `lcl_textpool->read` reads `masterlang` from TADIR and
  calls `RS_TEXTPOOL_READ … language = master_language`; `save` calls
  `RPY_TEXTELEMENTS_INSERT_AIE … language = tadir-masterlang` (`sedx-locals.abap:30-50, 174-200`).
  Measured: PUT under `sap-language: RU` (onprem) / `DE` (cloud) → written to the original pool
  (TT §8).
- **T5 The save is inactive and puts the object in the working area.** Measured onprem: after a
  selections PUT the inactive list holds `PROG/P` and `PROG/PX` (TT §10, step 26); after a function
  group's PUT `FUGR/F` and `PROG/PX` `SAPL{GROUP}` (TT §12.1). Measured cloud: the same pair for a
  function group (TT §13.4).
- **T6 Activation names the pair.** Measured: onprem program — program URI + text-elements URI →
  `activationExecuted="true"`, inactive list empty (TT §8, §10 steps 38-39); onprem, after a later
  change, the text-elements URI alone (TT §10 steps 51-52); onprem function group — `{FUGR/F}` +
  `{PROG/PX, /textelements/functiongroups/{g}}`, and `{PROG/PX, te-uri}` alone, either name (TT §12.1);
  cloud function group — the pair (TT §13.4); cloud class — class URI + text-elements URI (TT §8);
  onprem class — properties `adtcore:type="CLAS/OCX"`, LOCK/PUT/UNLOCK → 200, the inactive list
  names the part **`PROG/PX` with the class pool name (`{CLASS}====CP`)** next to `CLAS/OC`,
  `{CLAS/OC, /oo/classes/{c}}` + `{CLAS/OCX, /textelements/classes/{c}}` → `activationExecuted="true"`,
  both leave the list (`raw-v/onprem/56–64, 73`). Code, both systems:
  `CL_SEDX_ADT_SRC_UTIL=>get_type_and_name_from_uri`, `when 'classes'. … objtype_tr = 'CLAS'.
  subtype_wb = swbm_c_type_cls_textelement. e_rept_name = cl_oo_classname_service=>get_classpool_name(
  … )` (TT §14 V8). The inactive list carries the entry's `uri` (`/textelements/classes/{c}`) and
  `parentUri`, so it is matched by uri (adt-clients 46.1.0 recorded answer).
  `ActivateObjects [{PROG/P}]` alone after a text write → "no activation ran; still inactive PROG/P
  and PROG/PX" (Measured onprem, TT §8).
- **T7 Refusals on the write, the same on both systems.** Measured onprem and cloud, with the Code
  lines (TT §10, §12.2, §14 V9): selection name over 8 → 406 `SEDX_ADT/102`
  (`if strlen( key ) > 8. message e102(sedx_adt) with key 8`); selection text over 30 → 406
  `SEDX_ADT/110`, nothing saved; a symbol line without `=` in its first four characters (key
  `0001`) → 406 `SEDX_ADT/106`; a headings key outside the five → 406 `SEDX_ADT/101`; a symbol text
  longer than its `@MaxLength` → 406 `DS/512` "Text elements contain errors", nothing saved
  (`map_source_to_textpool_data`, `perform check_textentry in program saplsetxp … message e512(ds)`;
  `raw-v/onprem/66, 68`, `raw-v/cloud/75, 77`); an unknown selection name → 200, stored
  (`raw-v/cloud/79–93`).
- **T8 Selection text with `@DDICReference`.** Measured onprem: the text written is replaced by the
  dictionary label (TT §10).
- **T9 Versions.** Measured onprem: no parameter = `workingArea` = `inactive`; `active` = the last
  activated (TT §10 table, §12.4; case-insensitive, unknown values read the working area). Measured
  cloud: `?version=active` after activation returns the new symbol (TT §13.5).
- **T10 Function groups on cloud.** Measured cloud (TT §13, `raw-te/cloud-fugr/`): create in a local
  package with no transport → success; properties → 200 `adtcore:type="FUGR/PX"`; symbols, selections
  → 200; headings → 200 with five empty keys; LOCK, PUT symbols, UNLOCK → 200; the pair activation →
  `activationExecuted="true"`; where-used → 200 `globalType="PROG/PX"`.
- **T11 Programs on cloud.** Measured cloud: delivered programs' text elements read → 200 (TT
  §12.5, §12.6). A write to a delivered program: Code only, nothing locked or written — the cloud
  `CL_SEDX_ADT_RES_TEXTELEMENT->lock` runs `access_permission->modify( )` (`RS_ACCESS_PERMISSION …
  mode = swbm_c_op_modify … object_class = 'TEXT'`; `when 6 or 7 or 8.` → `cx_adt_res_no_authorization`,
  `when others.` → `cx_adt_res_no_access`), then `RS_EXTEND_CHECK … if extend_mod = abap_true. …
  message s533(eu) … raise exception type cx_adt_res_no_access`; cloud's `RS_ACCESS_PERMISSION` adds
  `cl_eui_object_blocklist=>…is_access_restricted( … ) … MESSAGE e607` (TT §14 V10). Code only; never
  measured on a delivered object, by rule (no write to SAP-delivered objects). The tool passes SAP's
  refusal through; the cloud write schema leaves `program` out.
- **T12 Not on 7.40.** Measured (recorded discovery): `system-description-basis-740--03-discovery`
  has no `/textelements` (TT §9; 0 occurrences, checked 2026-11-19).

### Where-used

- **W1 Served by registration, not by type.** Code onprem: `CL_RIS_ADT_RES_REFERENCES->post`,
  `IF i_referenced_object-referencing_object_types IS INITIAL. … build_not_supported( … ) ELSE. …
  get_results( … )` — an unsupported type is 200 with "not supported" and 0 results (TT §11).
- **W2 `PROG/PX`.** Measured: onprem `/textelements/programs/{p}` and `/textelements/functiongroups/{g}`
  → 200 `globalType="PROG/PX"`, scope offered (TT §11); cloud programs (TT §12.6) and function groups
  (TT §13.6) → 200 `globalType="PROG/PX"`.
- **W3 `CLAS/OCX`.** Measured both: 200, "Where-Used List is not supported for Text Element: Class.",
  0 results (TT §11).
- **W4 `TABL/DTT` not served.** Measured, both systems:
  `POST /repository/informationsystem/usageReferences?uri=/sap/bc/adt/ddic/db/settings/{t}` → 200,
  `globalType="TABL/DTT"`, "Where-Used List is not supported for Technical Table Settings.", 0
  results, on an own and an existing table (`raw-v/onprem/47–52`, `raw-v/cloud/51–56`). Code, both
  systems: `CL_RIS_ADT_RES_REFERENCES->get_ref_result_from_ref_object`, the W1 branch.

## Tools

Names follow the full set's verbs; every update tool does lock → write → unlock in one call
(see Locking). Descriptions below are the intended text: functional, nothing concrete named.

### GetTableSettings (full; read-only build too)

- **Description:** "[read-only] Reads the technical settings of the database table named by
  table_name: data class, size category, buffering, storage type, sharing type, load unit,
  translation, logging, and the table's description, at the version asked."
- **Parameters:** `table_name: string` (required); `version: 'active' | 'inactive' | 'workingArea'`
  (optional, default `active`; `READ_VERSION_FIELD`).
- **Returns:** `{ table_name, version, description, data_class, size_category, buffering: { allowed,
  type, area_key_fields }, storage_type, sharing_type, load_unit, translation: { value, is_visible,
  is_editable, granularity }, logging_enabled, is_writable_by_amdp? }` — the last on cloud (S7).
  Read through `adtClientOf(connection)`, narrowed on `variant`: `cloudTableSettings` on cloud (the
  flag a `boolean`; a cloud read without it is refused) and `tableSettings` on premise.
- **Served:** `ReadOnlyHandlersGroup` (every full binary, `-ro` included); `available_in:
  ['onprem', 'cloud']` (S1; 7.40 S9).

### UpdateTableSettings (full)

- **Description:** "Writes technical settings of the existing database table named by table_name:
  the settings given replace the stored ones, the rest keep their current values. Locks the
  settings, writes, unlocks, and activates the table when activate is true."
- **Parameters:** `table_name: string` (required); each optional — `data_class: string`,
  `size_category: string`, `buffering: { allowed?: string, type?: string, area_key_fields?:
  number }`, `storage_type: string`, `sharing_type: string`, `load_unit: string`,
  `logging_enabled: boolean`, `translation: string` (the translation value; its other three
  attributes are kept as read), on cloud also `is_writable_by_amdp: boolean` (S7; its description
  states DT 771: a table writable by AMDP is activated with buffering `N`, logging off and no
  replacement object). `buffering.area_key_fields` goes beside `type: 'G'` or with no `type`
  (`ITableBufferingChange`);
  `transport_request?: string` ("not a task");
  `activate: boolean` (required); `...DETAIL_SHAPE`. At least one setting is required
  (schema refinement). The value help's data classes and size categories
  (`TABLE_DATA_CLASSES`, `TABLE_SIZE_CATEGORIES`) are listed in the descriptions, not enforced as an
  enum: SAP takes any data class and judges it at activation (S8), so the activation's messages
  decide whether it ran.
- **Returns:** the settings as written (the PUT's answer, `terseWrite` by default), plus the
  activation's messages when activated.
- **Served:** `HighLevelHandlersGroup`; `available_in: ['onprem', 'cloud']`.
- **How it writes:** `adtClientOf(connection)`, narrowed on `variant` (the cloud client on cloud,
  so the cloud guard holds), then lock (`getTableSettings().lock`) → `patchMetadata` with the given
  fields and `headers: { accept: TABLE_SETTINGS_MEDIA_TYPE }` → unlock → activate the table when
  `activate` is true. The read, the overlay and the guarded PUT are the library's; the server holds
  no merge of its own.

#### `patchMetadata` (published: interfaces-adt 30.1.0, adt-clients 46.1.0)

```ts
patchMetadata(
  config: ITableSettingsPatchConfig<V>,   // { tableName, transportRequest?, changes: ITableSettingsChangesOf<V> }
  options: { headers: IAdtTableSettingsPatchHeaders } // { accept: TABLE_SETTINGS_MEDIA_TYPE; contentType?: never }
    & IAdtTableSettingsPatchOptions<E>    // lockHandle required; source, ifMatch: never
    & { analyse?: IAnalyse<E> },
): Promise<IAdtResponse<TMetadataUpdated, E>>;
```

- `ITableSettingsChangesOf<V>` takes at least one of `dataClassCategory`, `sizeCategory`,
  `buffering` (`ITableBufferingChange`: `areaKeyFields` only beside `type: 'G'` or with no type),
  `storageType`, `sharingType`, `loadUnit`, `translation: { value }`, `loggingEnabled`, and on cloud
  `isWritableByAMDP`. `{}` does not compile.
- Under the caller's lock it sends one GET (`?version=inactive`, with its ETag) and one PUT of the
  whole document. The PUT carries the named changes overlaid, every other setting and the
  description as read, `isWritableByAMDP` as read unless named, `If-Match`, and the media type
  without a charset (S3, S4, S7, S10).
- Thrown before any request: an empty lock handle, or a change set whose top-level fields are all
  absent. Answered as a failure carrying the read, before the PUT: a read without an ETag, a
  document without every setting the write needs, a non-`G` merged type beside an `areaKeyFields`
  change, and on a declared cloud handler a read without the flag. Nothing is retried.

### GetTextElements (full; read-only build too)

- **Description:** "[read-only] Reads the text elements of the program, function group or class
  named by object_name: text symbols (key, text, maximum length), selection texts (name, text,
  whether the text comes from the dictionary) and list and column headings, in the original
  language, at the version asked. A class has text symbols only."
  (Parts T1, language T4, dictionary text T8, versions T9.)
- **Parameters:** `object_kind: 'program' | 'function_group' | 'class'` (required); `object_name:
  string` (required); `parts?: ('symbols' | 'selections' | 'headings')[]` (default: every part the
  kind has; `selections` and `headings` refused for `class` by the schema); `version?` as above.
- **Returns:** `{ object_kind, object_name, version, symbols?: [{ key, text, max_length }],
  selections?: [{ name, text, ddic_reference }], headings?: { list_header, column_header_1 …
  column_header_4 } }` — one request per part asked.
- **Served:** `ReadOnlyHandlersGroup`; `available_in: ['onprem', 'cloud']`; every kind on both
  (onprem T1–T6; cloud: class T6, function group T10, program read T11; 7.40 T12).

### UpdateTextElements (full)

- **Description:** "Writes the text elements of the existing program, function group or class named
  by object_name, in its original language. Each part given replaces that part's whole list:
  entries left out of it are deleted. Locks the text elements, writes each part given, unlocks, and
  activates the object together with its text elements when activate is true."
- **Parameters:** `object_kind` and `object_name` as above; at least one of
  `symbols: [{ key: string (up to 3 characters), text: string, max_length: number }]`,
  `selections: [{ name: string (up to 8 characters), text: string (up to 30 characters),
  ddic_reference?: boolean }]`, `headings: { list_header?, column_header_1? … column_header_4? }`
  (strings; an empty or missing heading is deleted); `transport_request?`; `activate: boolean`
  (required); `...DETAIL_SHAPE`. The limits are stated in the descriptions and left to SAP's own
  refusal (406 `SEDX_ADT/101`, `/102`, `/106`, `/110`, T7), which reaches the model as it is.
- **Returns:** per part written, the list SAP saved (its answer echoes it); the activation's
  messages when activated; on a failed part, the parts written before it (saved inactive) and the
  failure.
- **Served:** `HighLevelHandlersGroup`; `available_in: ['onprem', 'cloud']`. On cloud the schema
  takes `object_kind: 'class' | 'function_group'` (`byVariant`; T6, T10); `program` is left out on
  cloud (T11).

### Compact

| compact type | HandlerGet | HandlerUpdate | HandlerActivate |
|---|---|---|---|
| `TABLE_SETTINGS` | → GetTableSettings (`object_name` = table) | → UpdateTableSettings (settings fields as above) | — (activate the `TABLE`) |
| `PROGRAM_TEXT_ELEMENTS` | → GetTextElements, kind `program` | → UpdateTextElements | `PROG/PX` |
| `FUNCTION_GROUP_TEXT_ELEMENTS` | → GetTextElements, kind `function_group` | → UpdateTextElements | `PROG/PX` at `functiongroups` |
| `CLASS_TEXT_ELEMENTS` | → GetTextElements, kind `class` | → UpdateTextElements | `CLAS/OCX` |

Wiring:
`CompactObjectType` gains the members; `COMPACT_READ_ROUTES` / `COMPACT_UPDATE_ROUTES` route them
(`{ api: 'tableSettings', operation: 'readMetadata' | 'updateMetadata' }`, `{ api: 'textElements',
operation: 'read' | 'update' }`); `compactReadRouterMap` (`compact-readonly-entries`) and
`compactWriteRoutes` (`compact-modify`) map them to the full handlers through `defineTool`, as
`LOCAL_TYPES` does. HandlerGet's `part` takes `symbols | selections | headings` for the text-element
types; `version` is HandlerGet's. On cloud, `COMPACT_UPDATE.cloud` filters out
`PROGRAM_TEXT_ELEMENTS` only (T11). The read-only compact binaries get the
HandlerGet members only.

## Parameters per system kind

| | onprem | cloud | legacy (7.40) |
|---|---|---|---|
| GetTableSettings / UpdateTableSettings | all fields (S1–S6, S8, S10) | all fields and `is_writable_by_amdp` (S1–S8, S10) | not served (S9) |
| GetTextElements | program, function group, class (T1–T9) | program (T11), function group (T10), class (T6) | not served (T12) |
| UpdateTextElements | program, function group, class (T5, T6) | function group (T10), class (T6); program left out (T11) | not served (T12) |
| ActivateObjects `PROG/PX` | program, function group via `parentName` (T6) | function group via `parentName` (T10) | not served (T12) |
| ActivateObjects `CLAS/OCX` | yes (T6) | yes (T6) | not served (T12) |
| GetWhereUsed `PROG/PX` + `container` | program, function group (W2) | program, function group (W2) | not served (T12) |

**Legacy.** The full tools are filtered by `available_in` (legacy is its own kind there). The compact
projections read legacy as onprem (`statedSystemKind`), so the four new compact types are refused
by the handler before any request on a stated `legacy` system, in fixed words naming the system
kind — the answer adt-clients-legacy gives (`AdtClientLegacy` refuses both factories). The server
builds no `AdtClientLegacy` today, so the dependency is dropped.

## ActivateObjects and the text elements

| option | what it does | for | against |
|---|---|---|---|
| **A. Automatic pairing** | every `PROG/P`, `FUGR/F`, `CLAS/OC` in the request also sends its text elements' reference | the model names only the object; matches "activate together" literally | changes the wire of every program, function group and class activation (single activation becomes a group one); a reference to text elements with nothing inactive is unmeasured; on cloud every class activation grows |
| **B. Explicit codes** (decided) | `objects[].type` takes `PROG/PX` and `CLAS/OCX` (the library lists them as activation codes, and the server's projection must list them anyway); `PROG/PX` with `parentName` is a function group's text elements (address `/textelements/functiongroups/{parentName}`; T6, T10); `still_inactive` names them, so the next call names both; the update tools' `activate: true` pairs them themselves (`textElementsActivationReferences`); the class-pool `PROG/PX {CLASS}====CP` entry of `still_inactive` carries its `uri`/`parent_uri` and is matched by uri like every other (T6) | explicit, measured (the pair, and the text elements alone, both activated: T6), no change to any existing activation | the model names two objects after a text write by `ActivateObjects` |
| **C. Pair from the inactive list** | before activating, read the inactive objects and add the text elements of the objects named | automatic only where needed | one extra request per activation; a second read deciding what is sent |

Decided: **B**. HandlerActivate gets the same through the three text-element compact types.
The main-type shorthand keeps its meaning: `PROG/PX`, `CLAS/OCX` and `TABL/DTT` never stand for a
main type (otherwise `CLAS` becomes ambiguous in activation and in the table codes, and `PROG`
resolves to `PROG/PX` in cloud activation — see break 5).

## Where-used

`GetWhereUsed` (and HandlerSystem's `where_used`, and each `objects[]` entry) gain
`container?: 'program' | 'function_group'`, required when `object_type` is `PROG/PX` and refused
with any other type (schema refinement, the library's rule). The code reaches the library as
`{ object_type: 'PROG/PX', container: 'program' | 'functionGroup' }`; every other code goes as
`Exclude<AdtWhereUsedCode, 'PROG/PX'>` (W2). `CLAS/OCX` is not a where-used code (W3; the library
excludes it). The `object_type` description lists `PROG/PX` with "a program's or a function group's text
elements; container says which".

## Locking

Every update tool is one atomic call: lock → write → unlock, through `withLock`, then an optional
activation after the unlock (`carryCleanup`). A refused release is reported as `left_locked`, as
today. Only LOCK and UNLOCK go stateful (the library's lock registry); the read under the lock and
the PUT are stateless.

- **UpdateTableSettings** locks the settings (`getTableSettings().lock`, ESDICT `TABT`, S2), never the
  table: inside, `patchMetadata` (adt-clients 46.1.0: its read, overlay and guarded PUT) → unlock →
  `getTable().activate` when `activate` is true.
- **UpdateTextElements** locks the text elements at the object's address (`getTextElements().lock`,
  `TEXT`, T2): inside, one `update` per part given → unlock → `utils.activateObjects(
  textElementsActivationReferences(object))` when `activate` is true (T6). The cloud lock's
  `NoModification` is not a refusal (T2).
- `tools/stateful-sites.json` is unchanged: no new `setSessionType` site in the server.

## Tests

New tests are node:test only, each listed in `tools/node-test-files.json` (the build and the runner
read only that list); no Jest file is added. Existing Jest tests that enumerate tools or codes
(descriptions, compact completeness, projections) are updated where they are.

**Unit** (`src/__tests__/unit/…`, an ADT stand-in as `draft/getObjectDraft.test.ts` does, answers
from adt-clients' recorded corpus `*settings*` / `*text-*` where they exist):

- GetTableSettings: request and projection; 404 passed through.
- UpdateTableSettings: lock → `patchMetadata` with exactly the given fields → unlock, in order;
  unlock after a refused patch; activation only after a clean unlock and only when `activate` is
  true; `left_locked` on a refused release. (The overlay itself is tested in adt-clients.)
- GetTextElements: one read per part, default parts per kind; `class` with `selections` refused by
  the schema.
- UpdateTextElements: one lock, one PUT per part, one unlock; the cloud schema takes `class` and
  `function_group`;
  the activation names the pair (function group at `functiongroups`).
- ActivateObjects / HandlerActivate: `PROG/PX`, `CLAS/OCX` accepted; `PROG/PX` + `parentName` sent at
  the function group's address; `CLAS` and cloud `PROG` keep their main-type meaning.
- GetWhereUsed / HandlerSystem: `container` required with `PROG/PX`, refused otherwise, sent as the
  library's `container`.
- Compact: the four types routed in HandlerGet / HandlerUpdate; refused on a stated `legacy`
  system before any request; absent from the read-only HandlerUpdate.
- Descriptions: the literal scan (`toolDescriptionsCarryNoLiterals`) covers the new tools.

**Integration** (`liveSuite`, `liveCall`, own objects created and deleted by the suite, every lock
released by its own handle):

- `high/table/TableSettingsHandlers.test.ts`, `['onprem', 'cloud']`: create a table → write
  non-default settings → activate → GetTableSettings `active` reads them; the same through compact
  `TABLE_SETTINGS`; delete.
- `high/textElements/TextElementsHandlers.test.ts`: onprem — a program (all three parts), a function
  group (symbols), a class (symbols): write, read `inactive`, activate with the update tool, read
  `active`, whole-list replace deletes a left-out entry; cloud — a class and a function group
  (symbols) write/read/activate, and the read of a delivered program named by the test config (never
  a literal in the file). Compact text-element types the same.
- `coverage/activateObjectsRefusal.live.test.ts` and `coverage/activatePerType.live.test.ts`: after a
  text write, `[PROG/P]` alone names `PROG/PX` in `still_inactive`; the pair activates; a function
  group's `PROG/PX` + `parentName` activates.
- `readOnly/system/WhereUsedHandlers.test.ts`: `PROG/PX` with each container, on both (W2).
- The test config gains the sections these suites read (`testConfigSections.test.ts` checks the
  template).

## What the 46.x install breaks

Installed from the registry (`adt-clients` 46.0.0, `adt-strategies` 0.25.0, `adt-clients-legacy`
0.11.0, `interfaces-adt` 30.0.0); the lockfile holds no `"link": true`, and every entry resolves
from the registry; one copy of interfaces-adt. `npm run build` stops at the root `tsc`;
`test:check` (all packages) finds the same 12 plus one, on 46.0.0 and again on 46.1.0 /
interfaces-adt 30.1.0 / adt-strategies 0.26.0 (re-run 2026-11-20):

1. `WHERE_USED_CODES` (onprem, cloud): missing `TABL/DTT`, `PROG/PX` (`Complete`). Fix: add `PROG/PX`;
   `TABL/DTT` excluded by type (`Exclude<WhereUsedCode<V>, 'TABL/DTT'>` in the projection): not
   served (W4).
2. `ACTIVATION_CODES` (onprem, cloud): missing `PROG/PX`, `CLAS/OCX`. Fix: add them (option B).
3. `TABLE_CODES`: missing `TABL/DTT`, `PROG/PX`, `CLAS/OCX`. Fix: add them.
4. `whereUsedList.ts:228,245`, `handleGetWhereUsed.ts:555,564,598,600`: a variable of the whole
   where-used union no longer compiles (`PROG/PX` needs `container`). Fix: the `PROG/PX` branch with
   its container, the rest typed `Exclude<…, 'PROG/PX'>` (Where-used above).
5. `adtBoundary.typecheck.ts:188`: unused `@ts-expect-error` — with `PROG/PX` in cloud activation,
   `PROG` became one code there. Fix: the sub-resource codes stay out of main-type resolution, so
   the expectation holds again (and `CLAS` stays unambiguous).

`compact-modify/package.json` and `server-runtime/package.json` move `interfaces-adt` to `^30.0.0`
with the root. `adt-clients-legacy` is removed from the install. The install is not committed yet.

## Dependency

Published and installed from the registry: interfaces-adt 30.1.0, adt-clients 46.1.0 and
adt-strategies 0.26.0. The lockfile has no `"link": true` and every entry resolves from the registry.
adt-clients 46.1.0 also corrects its test skip for function groups on cloud, which was unverified
and is contradicted by T10.

## To verify in SAP handlers

Closed by the owner's answer or by measurement: V1 (Eclipse client check (owner); the server activates tables with SAP's default settings, Measured S6), V2 (W4), V3 (S2), V4 (S4), V5
(S5), V6 (S8), V7 (T3), V8 (T6), V9 (T7), V11 (S10). Closed by rule: V12 (a two-user lock clash is SAP's enqueue refusal, passed through; not measured
with two users — S2, T2), V13 (Code only; never measured on a delivered object, by rule — T11).
Nothing is open.

