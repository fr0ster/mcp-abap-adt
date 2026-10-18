/**
 * The request headers the server sends by default on the adt-clients members
 * that take them (`options.headers: IAdtHeaders`, adt-clients 36): one pair
 * per operation — the member and the object type it is called on, the key
 * `<object>.<member>`. The one place these pairs live.
 *
 * Each pair is the one adt-clients 35.0.0 sent from its modern client
 * (`docs/usage/MIGRATION-36.md`, "The pairs 35.0.0 sent"); where 35.0.0 sent
 * one header or none, the pair is the one measured there ("The completed
 * pairs, measured"). What a system answers `406`/`415` to is corrected per
 * system (`AdtHeaderPairs`, `withAdtHeaders`).
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';

function pair(accept: string, contentType: string): IAdtHeaders {
  return Object.freeze({ accept, contentType });
}

export const DEFAULT_ADT_HEADERS = Object.freeze({
  'abapGit.checkExternalRepo': pair(
    'application/abapgit.adt.repo.info.ext.response.v2+xml',
    'application/abapgit.adt.repo.info.ext.request.v2+xml',
  ),
  'abapGit.link': pair(
    'application/abapgit.adt.repo.v3+xml',
    'application/abapgit.adt.repo.v3+xml',
  ),
  'abapGit.pull': pair(
    'application/abapgit.adt.repo.v3+xml',
    'application/abapgit.adt.repo.v3+xml',
  ),
  'accessControl.activate': pair('application/xml', 'application/xml'),
  'accessControl.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'accessControl.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'accessControl.create': pair(
    'application/vnd.sap.adt.dclSource+xml',
    'application/vnd.sap.adt.dclSource+xml',
  ),
  'accessControl.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'accessControl.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'amdpDebugger.getDataPreview': pair(
    'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
    'text/plain',
  ),
  'appendStructure.activate': pair('application/xml', 'application/xml'),
  'appendStructure.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'appendStructure.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'appendStructure.create': pair(
    'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.structures.v2+xml',
    'application/vnd.sap.adt.structures.v2+xml',
  ),
  'appendStructure.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'appendStructure.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'authorizationField.activate': pair('application/xml', 'application/xml'),
  'authorizationField.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'authorizationField.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'authorizationField.create': pair(
    'application/vnd.sap.adt.blues.v1+xml',
    'application/vnd.sap.adt.blues.v1+xml',
  ),
  'authorizationField.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'authorizationField.updateMetadata': pair(
    'application/vnd.sap.adt.blues.v1+xml',
    'application/vnd.sap.adt.blues.v1+xml',
  ),
  'behaviorDefinition.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'behaviorDefinition.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'behaviorDefinition.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'behaviorDefinition.create': pair(
    'application/vnd.sap.adt.blues.v1+xml',
    'application/vnd.sap.adt.blues.v1+xml',
  ),
  'behaviorDefinition.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'behaviorDefinition.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'behaviorImplementation.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'behaviorImplementation.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'behaviorImplementation.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'behaviorImplementation.create': pair(
    'application/vnd.sap.adt.oo.classes.v4+xml',
    'application/vnd.sap.adt.oo.classes.v4+xml',
  ),
  'behaviorImplementation.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'behaviorImplementation.update': pair(
    'text/plain',
    'text/plain; charset=utf-8',
  ),
  'class.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'class.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'class.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'class.create': pair(
    'application/vnd.sap.adt.oo.classes.v4+xml',
    'application/vnd.sap.adt.oo.classes.v4+xml',
  ),
  'class.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'class.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'classExecutor.scheduleTrace': pair('application/xml', 'application/xml'),
  'dataElement.activate': pair('application/xml', 'application/xml'),
  'dataElement.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'dataElement.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'dataElement.create': pair(
    'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
    'application/vnd.sap.adt.dataelements.v2+xml',
  ),
  'dataElement.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'dataElement.updateMetadata': pair(
    'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
    'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8',
  ),
  'ddl.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'ddl.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'ddl.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'ddl.create': pair(
    'application/vnd.sap.adt.ddlSource.v2+xml, application/vnd.sap.adt.ddlSource+xml',
    'application/vnd.sap.adt.ddlSource+xml',
  ),
  'ddl.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'ddl.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'debugger.getChildVariables': pair(
    'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables',
    'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables',
  ),
  'debugger.getVariables': pair(
    'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables',
    'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables',
  ),
  'debugger.setBreakpoints': pair('application/xml', 'application/xml'),
  'debugger.setDebuggerSettings': pair('application/xml', 'application/xml'),
  'debugger.syncBreakpoints': pair('application/xml', 'application/xml'),
  'domain.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'domain.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'domain.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'domain.create': pair(
    'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
    'application/vnd.sap.adt.domains.v2+xml',
  ),
  'domain.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'domain.updateMetadata': pair(
    'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml',
    'application/vnd.sap.adt.domains.v2+xml; charset=utf-8',
  ),
  'enhancement.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'enhancement.check': pair(
    'application/vnd.sap.adt.checkrun.v1+xml',
    'application/vnd.sap.adt.checkrun.v1+xml',
  ),
  'enhancement.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'enhancement.create': pair(
    'application/vnd.sap.adt.enh.enhoxhh.v3+xml',
    'application/vnd.sap.adt.enh.enhoxhh.v3+xml',
  ),
  'enhancement.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'enhancement.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'enhancement.updateMetadata': pair(
    'application/vnd.sap.adt.enh.enhoxhh.v3+xml',
    'application/vnd.sap.adt.enh.enhoxhh.v3+xml',
  ),
  'featureToggle.activate': pair('application/xml', 'application/xml'),
  'featureToggle.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'featureToggle.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'featureToggle.checkState': pair(
    'application/vnd.sap.adt.toggle.check.result.v1+asjson',
    'application/vnd.sap.adt.toggle.check.parameters.v1+asjson',
  ),
  'featureToggle.create': pair(
    'application/vnd.sap.adt.blues.v1+xml',
    'application/vnd.sap.adt.blues.v1+xml',
  ),
  'featureToggle.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'featureToggle.update': pair(
    'application/vnd.sap.adt.toggle.content.v2+json',
    'application/vnd.sap.adt.toggle.content.v2+json',
  ),
  'featureToggle.updateMetadata': pair(
    'application/vnd.sap.adt.blues.v1+xml',
    'application/vnd.sap.adt.blues.v1+xml',
  ),
  'functionGroup.activate': pair('application/xml', 'application/xml'),
  'functionGroup.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'functionGroup.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'functionGroup.create': pair(
    'application/vnd.sap.adt.functions.groups.v3+xml',
    'application/vnd.sap.adt.functions.groups.v3+xml',
  ),
  'functionGroup.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'functionGroup.updateMetadata': pair(
    'application/vnd.sap.adt.functions.groups.v3+xml',
    'application/vnd.sap.adt.functions.groups.v3+xml; charset=utf-8',
  ),
  'functionInclude.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'functionInclude.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'functionInclude.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'functionInclude.create': pair(
    'application/vnd.sap.adt.functions.fincludes.v2+xml, application/vnd.sap.adt.functions.fincludes+xml',
    'application/vnd.sap.adt.functions.fincludes.v2+xml',
  ),
  'functionInclude.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'functionInclude.update': pair('text/plain', 'text/plain'),
  'functionInclude.updateMetadata': pair(
    'application/vnd.sap.adt.functions.fincludes.v2+xml, application/vnd.sap.adt.functions.fincludes+xml',
    'application/vnd.sap.adt.functions.fincludes.v2+xml',
  ),
  'functionModule.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'functionModule.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'functionModule.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'functionModule.create': pair(
    'application/vnd.sap.adt.functions.fmodules+xml',
    'application/vnd.sap.adt.functions.fmodules+xml',
  ),
  'functionModule.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'functionModule.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'include.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'include.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'include.create': pair(
    'application/vnd.sap.adt.programs.includes.v2+xml',
    'application/vnd.sap.adt.programs.includes.v2+xml',
  ),
  'include.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'include.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'interface.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'interface.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'interface.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'interface.create': pair(
    'application/vnd.sap.adt.oo.interfaces.v5+xml',
    'application/vnd.sap.adt.oo.interfaces.v5+xml',
  ),
  'interface.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'interface.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'localDefinitions.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'localDefinitions.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'localDefinitions.delete': pair('text/plain', 'text/plain; charset=utf-8'),
  'localDefinitions.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'localMacros.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'localMacros.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'localMacros.delete': pair('text/plain', 'text/plain; charset=utf-8'),
  'localMacros.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'localTestClass.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'localTestClass.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'localTestClass.delete': pair('text/plain', 'text/plain; charset=utf-8'),
  'localTestClass.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'localTypes.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'localTypes.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'localTypes.delete': pair('text/plain', 'text/plain; charset=utf-8'),
  'localTypes.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'messageClass.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'messageClass.create': pair('application/xml', 'application/xml'),
  'messageClass.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'messageClass.updateMetadata': pair(
    'application/vnd.sap.adt.mc.messageclass+xml',
    'application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8',
  ),
  'messageClassMessage.create': pair(
    'application/vnd.sap.adt.mc.messageclass+xml',
    'application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8',
  ),
  'messageClassMessage.delete': pair(
    'application/vnd.sap.adt.mc.messageclass+xml',
    'application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8',
  ),
  'messageClassMessage.update': pair(
    'application/vnd.sap.adt.mc.messageclass+xml',
    'application/vnd.sap.adt.mc.messageclass+xml; charset=utf-8',
  ),
  'metadataExtension.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'metadataExtension.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'metadataExtension.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'metadataExtension.create': pair(
    'application/vnd.sap.adt.ddic.ddlx.v1+xml',
    'application/vnd.sap.adt.ddic.ddlx.v1+xml',
  ),
  'metadataExtension.delete': pair('application/xml', 'application/xml'),
  'metadataExtension.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'package.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'package.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'package.create': pair(
    'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
    'application/vnd.sap.adt.packages.v2+xml',
  ),
  'package.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'package.updateMetadata': pair(
    'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
    'application/vnd.sap.adt.packages.v2+xml',
  ),
  'program.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'program.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'program.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'program.create': pair(
    'application/vnd.sap.adt.programs.programs.v2+xml',
    'application/vnd.sap.adt.programs.programs.v2+xml',
  ),
  'program.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'program.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'programExecutor.scheduleTrace': pair('application/xml', 'application/xml'),
  'request.addObject': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'text/plain',
  ),
  'request.changeTaskType': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'text/plain',
  ),
  'request.checkDeletion': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'application/vnd.sap.adt.transportorganizer.v1+xml',
  ),
  'request.create': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'text/plain',
  ),
  'request.createTask': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'text/plain',
  ),
  'request.delete': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'application/vnd.sap.adt.transportorganizer.v1+xml',
  ),
  'request.moveObjects': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'text/plain',
  ),
  'request.removeObject': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'text/plain',
  ),
  'request.updateMetadata': pair(
    'application/vnd.sap.adt.transportorganizer.v1+xml',
    'application/vnd.sap.adt.transportorganizer.v1+xml',
  ),
  'scalarFunction.activate': pair('application/xml', 'application/xml'),
  'scalarFunction.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'scalarFunction.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'scalarFunction.create': pair(
    'application/vnd.sap.adt.blues.v1+xml',
    'application/vnd.sap.adt.blues.v1+xml',
  ),
  'scalarFunction.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'scalarFunction.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'scalarFunctionImplementation.activate': pair(
    'application/xml',
    'application/xml',
  ),
  'scalarFunctionImplementation.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'scalarFunctionImplementation.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'scalarFunctionImplementation.create': pair(
    'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.blues.v2+xml',
    'application/vnd.sap.adt.blues.v2+xml',
  ),
  'scalarFunctionImplementation.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'scalarFunctionImplementation.update': pair(
    'application/json',
    'application/json',
  ),
  'scalarFunctionImplementation.updateMetadata': pair(
    'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.blues.v2+xml',
    'application/vnd.sap.adt.blues.v2+xml; charset=utf-8',
  ),
  'serviceBinding.activate': pair('application/xml', 'application/xml'),
  'serviceBinding.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'serviceBinding.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'serviceBinding.create': pair(
    'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
    'application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
  ),
  'serviceBinding.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'serviceBinding.update': pair(
    'application/xml, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage',
    'application/xml',
  ),
  'serviceDefinition.activate': pair('application/xml', 'application/xml'),
  'serviceDefinition.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'serviceDefinition.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'serviceDefinition.create': pair(
    'application/vnd.sap.adt.ddic.srvd.v1+xml',
    'application/vnd.sap.adt.ddic.srvd.v1+xml',
  ),
  'serviceDefinition.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'serviceDefinition.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'structure.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'structure.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'structure.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'structure.create': pair(
    'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.structures.v2+xml',
    'application/vnd.sap.adt.structures.v2+xml',
  ),
  'structure.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'structure.update': pair(
    'application/xml, application/json, text/plain, */*',
    'text/plain; charset=utf-8',
  ),
  'table.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'table.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'table.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'table.create': pair(
    'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml',
    'application/vnd.sap.adt.tables.v2+xml',
  ),
  'table.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'table.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'tableType.activate': pair(
    'application/xml',
    'application/vnd.sap.adt.activation+xml',
  ),
  'tableType.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'tableType.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'tableType.create': pair(
    'application/vnd.sap.adt.tabletype.v1+xml',
    'application/vnd.sap.adt.tabletype.v1+xml',
  ),
  'tableType.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'tableType.updateMetadata': pair(
    'application/vnd.sap.adt.tabletype.v1+xml',
    'application/vnd.sap.adt.tabletype.v1+xml',
  ),
  'transformation.activate': pair('application/xml', 'application/xml'),
  'transformation.check': pair(
    'application/vnd.sap.adt.checkmessages+xml',
    'application/vnd.sap.adt.checkobjects+xml',
  ),
  'transformation.checkDeletion': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'transformation.create': pair(
    'application/vnd.sap.adt.transformations+xml',
    'application/vnd.sap.adt.transformations+xml',
  ),
  'transformation.delete': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'transformation.update': pair('text/plain', 'text/plain; charset=utf-8'),
  'utils.activateObjectsGroup': pair('application/xml', 'application/xml'),
  'utils.checkDeletionGroup': pair(
    'application/vnd.sap.adt.deletion.check.response.v1+xml',
    'application/vnd.sap.adt.deletion.check.request.v1+xml',
  ),
  'utils.deleteObjectsGroup': pair(
    'application/vnd.sap.adt.deletion.response.v1+xml',
    'application/vnd.sap.adt.deletion.request.v1+xml',
  ),
  'utils.fetchNodeStructure': pair(
    'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
    'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
  ),
  'utils.getSqlQuery': pair(
    'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
    'text/plain; charset=utf-8',
  ),
  'utils.getTableContents': pair(
    'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
    'text/plain; charset=utf-8',
  ),
  'utils.getVirtualFoldersContents': pair(
    'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml',
    'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml',
  ),
  'utils.getWhereUsed': pair(
    'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
    'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
  ),
  'utils.getWhereUsedScope': pair(
    'application/vnd.sap.adt.repository.usagereferences.scope.response.v1+xml',
    'application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml',
  ),
});

/** An operation that takes a header pair: `<object>.<member>`. */
export type AdtOperation = keyof typeof DEFAULT_ADT_HEADERS;

/** The object types whose `member` takes a header pair. */
export type AdtObjectWith<M extends string> = AdtOperation extends infer K
  ? K extends `${infer O}.${M}`
    ? O
    : never
  : never;

/** The operation of `member` on `object`. */
export function adtOperation<M extends string>(
  object: AdtObjectWith<M>,
  member: M,
): AdtOperation {
  return `${object}.${member}` as AdtOperation;
}
