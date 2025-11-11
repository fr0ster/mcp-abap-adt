/**
 * CreatePackage Handler - Create ABAP Package via ADT API
 *
 * Eclipse ADT workflow for package creation:
 * 1. POST /sap/bc/adt/packages/validation - Validate package parameters (basic check)
 * 2. POST /sap/bc/adt/cts/transportchecks - Check transport requirements
 * 3. POST /sap/bc/adt/packages/validation - Full validation with transport layer
 * 4. POST /sap/bc/adt/packages - Create package with metadata
 * 5. POST /sap/bc/adt/checkruns - Check package for errors
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl } from '../lib/utils';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "CreatePackage",
  description: "Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.",
  inputSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions (start with Z or Y for customer namespace)."
      },
      description: {
        type: "string",
        description: "Package description. If not provided, package_name will be used."
      },
      super_package: {
        type: "string",
        description: "Parent package name (e.g., ZOK_PACKAGE). Required for structure packages."
      },
      package_type: {
        type: "string",
        description: "Package type: 'development' (default) or 'structure'",
        enum: ["development", "structure"],
        default: "development"
      },
      software_component: {
        type: "string",
        description: "Software component (e.g., HOME, LOCAL). Default: HOME"
      },
      transport_layer: {
        type: "string",
        description: "Transport layer (e.g., ZE19). Required for transportable packages."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required if package is transportable."
      },
      application_component: {
        type: "string",
        description: "Application component (optional, e.g., BC-ABA)"
      },
      responsible: {
        type: "string",
        description: "User responsible for the package (e.g., CB9980002377). If not provided, uses SAP_USERNAME or SAP_USER environment variable."
      }
    },
    required: ["package_name", "super_package"]
  }
} as const;

interface CreatePackageArgs {
  package_name: string;
  description?: string;
  super_package: string;
  package_type?: string;
  software_component?: string;
  transport_layer?: string;
  transport_request?: string;
  application_component?: string;
  responsible?: string;
}

/**
 * Generate unique request ID for ADT request
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Step 1: Validate package parameters (basic check)
 */
async function validatePackageBasic(args: CreatePackageArgs, baseUrl: string): Promise<void> {
  const url = `${baseUrl}/sap/bc/adt/packages/validation`;
  const params = {
    objname: args.package_name,
    packagename: args.super_package,
    description: args.description || args.package_name,
    packagetype: args.package_type || 'development',
    checkmode: 'basic'
  };

  console.log('[DEBUG] Step 1: Basic validation');
  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', undefined, params, {
    'Accept': 'application/vnd.sap.as+xml'
  });

  const parser = new XMLParser({ ignoreAttributes: false });
  const result = parser.parse(response.data);
  const severity = result['asx:abap']?.['asx:values']?.DATA?.SEVERITY;

  if (severity !== 'OK') {
    const shortText = result['asx:abap']?.['asx:values']?.DATA?.SHORT_TEXT || 'Validation failed';
    throw new McpError(ErrorCode.InvalidParams, `Package validation failed: ${shortText}`);
  }

  console.log('[DEBUG] Basic validation passed');
}

/**
 * Step 2: Check transport requirements
 */
async function checkTransportRequirements(
  args: CreatePackageArgs,
  baseUrl: string,
  transportLayer: string
): Promise<string[]> {
  const url = `${baseUrl}/sap/bc/adt/cts/transportchecks`;

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
    <DATA>
      <PGMID/>
      <OBJECT/>
      <OBJECTNAME/>
      <DEVCLASS>${args.package_name}</DEVCLASS>
      <SUPER_PACKAGE>${args.super_package}</SUPER_PACKAGE>
      <RECORD_CHANGES/>
      <OPERATION>I</OPERATION>
      <URI>/sap/bc/adt/packages/${args.package_name.toLowerCase()}</URI>
    </DATA>
  </asx:values>
</asx:abap>`;

  console.log('[DEBUG] Step 2: Checking transport requirements');
  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', xmlBody,
    { transportLayer },
    {
      'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData',
      'Content-Type': 'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData'
    }
  );

  const parser = new XMLParser({ ignoreAttributes: false });
  const result = parser.parse(response.data);
  const data = result['asx:abap']?.['asx:values']?.DATA;

  if (data?.RESULT !== 'S') {
    throw new McpError(ErrorCode.InternalError, 'Transport check failed');
  }

  // Extract available transport requests
  const requests = data?.REQUESTS?.CTS_REQUEST || [];
  const transportList = Array.isArray(requests) ? requests : [requests];
  const transportNumbers = transportList
    .map((req: any) => req.REQ_HEADER?.TRKORR)
    .filter((trkorr: any) => trkorr);

  console.log('[DEBUG] Available transports:', transportNumbers);
  return transportNumbers;
}

/**
 * Step 3: Full validation with transport layer
 */
async function validatePackageFull(
  args: CreatePackageArgs,
  baseUrl: string,
  swcomp: string,
  transportLayer: string
): Promise<void> {
  const url = `${baseUrl}/sap/bc/adt/packages/validation`;
  const params = {
    objname: args.package_name,
    packagename: args.super_package,
    description: args.description || args.package_name,
    packagetype: args.package_type || 'development',
    swcomp: swcomp,
    transportlayer: transportLayer,
    recordChanges: 'false',
    checkmode: 'full'
  };

  console.log('[DEBUG] Step 3: Full validation');
  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', undefined, params, {
    'Accept': 'application/vnd.sap.as+xml'
  });

  const parser = new XMLParser({ ignoreAttributes: false });
  const result = parser.parse(response.data);
  const severity = result['asx:abap']?.['asx:values']?.DATA?.SEVERITY;

  if (severity !== 'OK') {
    const shortText = result['asx:abap']?.['asx:values']?.DATA?.SHORT_TEXT || 'Full validation failed';
    throw new McpError(ErrorCode.InvalidParams, `Package full validation failed: ${shortText}`);
  }

  console.log('[DEBUG] Full validation passed');
}

/**
 * Step 4: Create package
 */
async function createPackage(
  args: CreatePackageArgs,
  baseUrl: string,
  swcomp: string,
  transportLayer: string,
  transportRequest?: string,
  isLocalPackage?: boolean
): Promise<any> {
  const url = `${baseUrl}/sap/bc/adt/packages`;
  const username = args.responsible || process.env.SAP_USERNAME || process.env.SAP_USER || 'DEVELOPER';

  // For local packages: softwareComponent = "ZLOCAL", transportLayer empty
  // For transportable packages: softwareComponent = swcomp (HOME), transportLayer = transportLayer
  const softwareComponentName = isLocalPackage ? 'ZLOCAL' : swcomp;
  const transportLayerXml = isLocalPackage
    ? '<pak:transportLayer/>'
    : `<pak:transportLayer pak:name="${transportLayer}"/>`;

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${args.description || args.package_name}" adtcore:language="EN" adtcore:name="${args.package_name}" adtcore:type="DEVC/K" adtcore:version="active" adtcore:masterLanguage="EN" adtcore:masterSystem="${process.env.SAP_SYSTEM || 'E19'}" adtcore:responsible="${username}">

  <adtcore:packageRef adtcore:name="${args.package_name}"/>

  <pak:attributes pak:isEncapsulated="false" pak:packageType="${args.package_type || 'development'}" pak:recordChanges="false"/>

  <pak:superPackage adtcore:name="${args.super_package}"/>

  <pak:applicationComponent/>

  <pak:transport>

    <pak:softwareComponent pak:name="${softwareComponentName}"/>

    ${transportLayerXml}

  </pak:transport>

  <pak:translation/>

  <pak:useAccesses/>

  <pak:packageInterfaces/>

  <pak:subPackages/>

</pak:package>`;

  console.log('[DEBUG] Step 4: Creating package');

  // For local packages: no corrNr in query params
  // For transportable packages: include corrNr
  const queryParams = transportRequest ? { corrNr: transportRequest } : undefined;

  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', xmlBody,
    queryParams,
    {
      'Accept': 'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
      'Content-Type': 'application/vnd.sap.adt.packages.v2+xml'
    }
  );

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const result = parser.parse(response.data);

  console.log('[DEBUG] Package created successfully');
  return result['pak:package'];
}

/**
 * Step 5: Check package for errors
 */
async function checkPackage(packageName: string, baseUrl: string): Promise<void> {
  const url = `${baseUrl}/sap/bc/adt/checkruns`;

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">

  <chkrun:checkObject adtcore:uri="/sap/bc/adt/packages/${packageName.toLowerCase()}" chkrun:version="active"/>

</chkrun:checkObjectList>`;

  console.log('[DEBUG] Step 5: Checking package');
  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', xmlBody, undefined, {
    'Accept': 'application/vnd.sap.adt.checkmessages+xml',
    'Content-Type': 'application/vnd.sap.adt.checkobjects+xml'
  });

  const parser = new XMLParser({ ignoreAttributes: false });
  const result = parser.parse(response.data);
  const reports = result['chkrun:checkRunReports']?.['chkrun:checkReport'];

  if (reports) {
    const status = reports['@_chkrun:status'] || reports['status'];
    console.log('[DEBUG] Check status:', status);
  }
}

/**
 * Main handler for CreatePackage MCP tool
 */
export async function handleCreatePackage(args: any) {
  try {
    // Validate required parameters
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    if (!args?.super_package) {
      throw new McpError(ErrorCode.InvalidParams, 'Super package (parent package) is required');
    }

    const typedArgs = args as CreatePackageArgs;
    const baseUrl = await getBaseUrl();

    console.log(`[DEBUG] Creating package: ${typedArgs.package_name}`);
    console.log(`[DEBUG] Super package: ${typedArgs.super_package}`);
    console.log(`[DEBUG] Type: ${typedArgs.package_type || 'development'}`);

    // Determine if this is a local package
    // Local package = no transport_request AND no software_component AND no transport_layer
    const hasTransportRequest = !!typedArgs.transport_request;
    const hasSoftwareComponent = !!typedArgs.software_component;
    const hasTransportLayer = !!typedArgs.transport_layer;

    const isLocalPackage = !hasTransportRequest && !hasSoftwareComponent && !hasTransportLayer;

    // Determine software component and transport layer
    // For local packages: use HOME and empty layer (will be overridden to ZLOCAL in XML)
    // For transportable packages: use provided or defaults
    const swcomp = typedArgs.software_component || 'HOME';
    const transportLayer = typedArgs.transport_layer || process.env.SAP_TRANSPORT_LAYER || 'ZE19';

    // Step 1: Basic validation
    await validatePackageBasic(typedArgs, baseUrl);

    // Step 2: Check transport requirements (only for non-local packages)
    let transportRequest = typedArgs.transport_request;
    if (!isLocalPackage && transportLayer) {
      const availableTransports = await checkTransportRequirements(typedArgs, baseUrl, transportLayer);

      // Use provided transport or first available
      if (!transportRequest && availableTransports.length > 0) {
        transportRequest = availableTransports[0];
        console.log(`[DEBUG] Using first available transport: ${transportRequest}`);
      }
    }

    // Transport request is optional for local packages
    if (transportRequest) {
      console.log(`[DEBUG] Using transport request: ${transportRequest}`);
    } else if (isLocalPackage) {
      console.log(`[DEBUG] Creating local package (no transport request, software component, or transport layer)`);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Transport request is required for transportable packages. Please provide transport_request parameter or create a transport first.'
      );
    }

    // Step 3: Full validation (only for non-local packages)
    if (!isLocalPackage) {
      await validatePackageFull(typedArgs, baseUrl, swcomp, transportLayer);
    } else {
      console.log(`[DEBUG] Skipping full validation for local package`);
    }

    // Step 4: Create package
    const packageData = await createPackage(typedArgs, baseUrl, swcomp, transportLayer, transportRequest, isLocalPackage);

    // Step 5: Check package
    await checkPackage(typedArgs.package_name, baseUrl);

    return {
      isError: false,
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          package_name: typedArgs.package_name,
          description: typedArgs.description || typedArgs.package_name,
          super_package: typedArgs.super_package,
          package_type: typedArgs.package_type || 'development',
          software_component: swcomp,
          transport_layer: transportLayer,
          transport_request: transportRequest,
          uri: `/sap/bc/adt/packages/${typedArgs.package_name.toLowerCase()}`,
          message: `Package ${typedArgs.package_name} created successfully`
        }, null, 2)
      }]
    };

  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
