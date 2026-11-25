/**
 * Transport documents as `GET /sap/bc/adt/cts/transportrequests/{number}`
 * answers them, for GetTransport's reads of a request and a task.
 *
 * `EMPTY_TASK` is the document recorded on the cloud system (2026-11-22) for
 * a task holding no objects, sanitised (user `SAPUSER01`, the placeholder
 * prefix `SIDK`, a neutral description) and with most `atom:link` entries
 * left out. `TASK_WITH_OBJECTS` has the shape recorded on premise the same
 * day — `tm:object_type="T"`, the parent's header in `tm:request`, the task
 * and its `tm:abap_object` entries in `tm:task` — with two entries in place
 * of the 1647 recorded, sanitised the same way. `REQUEST` is a request's
 * document (`tm:object_type="R"`): its header, its task and the aggregate
 * `tm:all_objects`.
 */

export const PARENT = 'SIDK900011';
export const TASK = 'SIDK900012';

export const EMPTY_TASK = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:object_type="T" adtcore:responsible="SAPUSER01" adtcore:name="${TASK}" adtcore:type="RQRQ" adtcore:changedAt="2026-11-20T12:35:18Z" adtcore:changedBy="SAPUSER01" adtcore:description="A request" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"><atom:link href="/sap/bc/adt/cts/transportrequests/${TASK}" rel="http://www.sap.com/cts/relations/adturi" type="application/vnd.sap.adt.transportrequests.v1+xml" title="Transport Organizer ADT URI" xmlns:atom="http://www.w3.org/2005/Atom"/><tm:request tm:number="${PARENT}" tm:parent="" tm:owner="SAPUSER01" tm:desc="A request" tm:type="K" tm:status="D" tm:status_text="Modifiable" tm:target="" tm:target_desc="No target system" tm:cts_project="" tm:cts_project_desc="" tm:source_client="100" tm:lastchanged_timestamp="20261120123516" tm:uri="/sap/bc/adt/cts/transportrequests/${PARENT}"><tm:long_desc/><atom:link href="/sap/bc/adt/cts/transportrequests/${PARENT}" rel="http://www.sap.com/cts/relations/adturi" type="application/vnd.sap.adt.transportrequests.v1+xml" title="Transport Organizer ADT URI" xmlns:atom="http://www.w3.org/2005/Atom"/></tm:request><tm:task tm:number="${TASK}" tm:parent="${PARENT}" tm:owner="SAPUSER01" tm:desc="A request" tm:type="Development/Correction" tm:status="D" tm:status_text="Modifiable" tm:target="" tm:target_desc="" tm:cts_project="" tm:cts_project_desc="" tm:source_client="100" tm:lastchanged_timestamp="20261120123518" tm:uri="/sap/bc/adt/cts/transportrequests/${TASK}"><tm:long_desc/><atom:link href="/sap/bc/adt/cts/transportrequests/${TASK}" rel="http://www.sap.com/cts/relations/adturi" type="application/vnd.sap.adt.transportrequests.v1+xml" title="Transport Organizer ADT URI" xmlns:atom="http://www.w3.org/2005/Atom"/><atom:link href="/sap/bc/adt/cts/transportrequests/${TASK}/checkruns" rel="http://www.sap.com/cts/relations/checkruns" title="Transport Organizer Checkruns" xmlns:atom="http://www.w3.org/2005/Atom"/></tm:task></tm:root>`;

export const TASK_WITH_OBJECTS = `<?xml version="1.0" encoding="utf-8"?>
<tm:root tm:object_type="T" adtcore:responsible="SAPUSER01" adtcore:name="${TASK}" adtcore:type="RQRQ" adtcore:changedAt="2026-11-22T09:09:56Z" adtcore:changedBy="SAPUSER01" adtcore:description="Integration tests" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core">
  <tm:request tm:number="${PARENT}" tm:parent="" tm:owner="SAPUSER01" tm:desc="Integration tests" tm:type="K" tm:status="D" tm:status_text="Modifiable" tm:target="/SIDTOQAS/" tm:target_desc="Standard for QA" tm:cts_project="" tm:cts_project_desc="" tm:source_client="100" tm:lastchanged_timestamp="20261122090950" tm:uri="/sap/bc/adt/cts/transportrequests/${PARENT}">
    <tm:long_desc/>
  </tm:request>
  <tm:task tm:number="${TASK}" tm:parent="${PARENT}" tm:owner="SAPUSER01" tm:desc="Integration tests" tm:type="Development/Correction" tm:status="D" tm:status_text="Modifiable" tm:target="" tm:target_desc="" tm:cts_project="" tm:cts_project_desc="" tm:source_client="100" tm:lastchanged_timestamp="20261122090956" tm:uri="/sap/bc/adt/cts/transportrequests/${TASK}">
    <tm:long_desc>Objects of the integration tests</tm:long_desc>
    <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_ONE" tm:wbtype="CLAS/OC" tm:position="000001" tm:lock_status="X" tm:obj_info="Class" tm:img_activity="" tm:dummy_uri="/sap/bc/adt/oo/classes/zcl_one"/>
    <tm:abap_object tm:pgmid="LIMU" tm:type="METH" tm:name="ZCL_ONE                       RUN" tm:wbtype="CLAS/OM" tm:position="000002" tm:lock_status="" tm:obj_info="Method" tm:img_activity="" tm:dummy_uri=""/>
  </tm:task>
</tm:root>`;

export const REQUEST = `<?xml version="1.0" encoding="utf-8"?>
<tm:root tm:object_type="R" adtcore:responsible="SAPUSER01" adtcore:name="${PARENT}" adtcore:type="RQRQ" adtcore:description="A request" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core">
  <tm:request tm:number="${PARENT}" tm:parent="" tm:owner="SAPUSER01" tm:desc="A request" tm:type="K" tm:status="D" tm:status_text="Modifiable" tm:target="/SIDTOQAS/" tm:target_desc="Standard for QA" tm:source_client="100">
    <tm:long_desc/>
    <tm:task tm:number="${TASK}" tm:parent="${PARENT}" tm:owner="SAPUSER01" tm:desc="A request" tm:type="Development/Correction" tm:status="D">
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_ONE" tm:position="000001"/>
    </tm:task>
    <tm:all_objects>
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_ONE" tm:position="000001"/>
    </tm:all_objects>
  </tm:request>
</tm:root>`;
