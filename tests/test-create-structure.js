/**
 * Test CreateStructure functionality
 * 
 * This test demonstrates creating a new ABAP structure with fields and type references
 * using the MCP ABAP ADT server's CreateStructure handler.
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Load configuration from YAML file
const configPath = path.resolve(__dirname, '..', 'e19.env');
let config;

try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    // Parse as YAML (the .env file contains YAML-like structure)
    const lines = configContent.split('\n');
    const yamlLines = lines.filter(line => 
        line.trim() && 
        !line.trim().startsWith('#') &&
        !line.trim().startsWith('export') &&
        line.includes('=')
    ).map(line => {
        const [key, ...valueParts] = line.split('=');
        let value = valueParts.join('=');
        // Remove quotes if present
        value = value.replace(/^["']|["']$/g, '');
        return `${key.trim()}: "${value}"`;
    });
    
    config = yaml.load(yamlLines.join('\n'));
    console.log('✓ Configuration loaded successfully');
} catch (error) {
    console.error('✗ Failed to load configuration:', error.message);
    process.exit(1);
}

async function testCreateStructure() {
    const { handleCreateStructure } = require('../dist/handlers/handleCreateStructure');
    
    // Test parameters - creating a test address structure
    const structureArgs = {
        structure_name: 'ZZ_S_ADDRESS_001',
        description: 'Test Address Structure for MCP ABAP ADT',
        package_name: 'ZOK_LOCAL',
        transport_request: 'E19K905646', // Use transport from Transport Management tests
        fields: [
            {
                name: 'CLIENT',
                data_type: 'CHAR',
                length: 3,
                description: 'Client ID'
            },
            {
                name: 'ADDRESS_ID',
                data_type: 'CHAR',
                length: 10,
                description: 'Address ID'
            },
            {
                name: 'STREET',
                data_type: 'CHAR',
                length: 35,
                description: 'Street Name'
            },
            {
                name: 'HOUSE_NUMBER',
                data_type: 'CHAR',
                length: 10,
                description: 'House Number'
            },
            {
                name: 'POSTAL_CODE',
                data_type: 'CHAR',
                length: 10,
                description: 'Postal Code'
            },
            {
                name: 'CITY',
                data_type: 'CHAR',
                length: 25,
                description: 'City'
            },
            {
                name: 'COUNTRY',
                data_type: 'CHAR',
                length: 3,
                description: 'Country Code'
            },
            {
                name: 'REGION',
                data_type: 'CHAR',
                length: 3,
                description: 'Region Code'
            },
            {
                name: 'LATITUDE',
                data_type: 'DEC',
                length: 15,
                decimals: 6,
                description: 'Latitude Coordinate'
            },
            {
                name: 'LONGITUDE',
                data_type: 'DEC',
                length: 15,
                decimals: 6,
                description: 'Longitude Coordinate'
            },
            {
                name: 'VALID_FROM',
                data_type: 'DATS',
                length: 8,
                description: 'Valid From Date'
            },
            {
                name: 'VALID_TO',
                data_type: 'DATS',
                length: 8,
                description: 'Valid To Date'
            }
        ]
    };
    
    console.log('\n🏗️  Testing CreateStructure functionality...');
    console.log(`📋 Structure: ${structureArgs.structure_name}`);
    console.log(`📦 Package: ${structureArgs.package_name}`);
    console.log(`🚛 Transport: ${structureArgs.transport_request}`);
    console.log(`🔗 Fields: ${structureArgs.fields.length} fields`);
    
    try {
        const result = await handleCreateStructure(structureArgs);
        
        if (result.isError) {
            console.error('✗ CreateStructure failed:', result.content[0].text);
            return false;
        }
        
        const response = JSON.parse(result.content[0].text);
        console.log('\n✓ CreateStructure completed successfully!');
        
        // Print summary
        console.log(`\n📊 Summary:`);
        console.log(`   Structure Name: ${response.structure_name}`);
        console.log(`   Package: ${response.package}`);
        console.log(`   Total Steps: ${response.total_steps}`);
        console.log(`   Successful Steps: ${response.successful_steps}`);
        console.log(`   Overall Status: ${response.overall_status}`);
        
        // Print step details
        console.log(`\n📝 Step Details:`);
        response.steps.forEach((step, index) => {
            const status = step.status === 'success' ? '✓' : '✗';
            console.log(`   ${index + 1}. ${status} ${step.step}: ${step.action || step.error || 'completed'}`);
        });
        
        // Verify structure fields
        const verifyStep = response.steps.find(s => s.step === 'verify_structure' && s.status === 'success');
        if (verifyStep && verifyStep.structure_details && verifyStep.structure_details['ddic:structure']) {
            const structureDetails = verifyStep.structure_details['ddic:structure'];
            const verifiedFields = Array.isArray(structureDetails['ddic:fields']?.['ddic:field']) 
                ? structureDetails['ddic:fields']['ddic:field']
                : [structureDetails['ddic:fields']?.['ddic:field']];
            
            console.log(`\n🔍 Verified Structure Details:`);
            console.log(`   Name: ${structureDetails['adtcore:name']}`);
            console.log(`   Description: ${structureDetails['adtcore:description']}`);
            console.log(`   Package: ${structureDetails['adtcore:packageRef']?.['adtcore:name']}`);
            console.log(`   Fields Count: ${verifiedFields.filter(Boolean).length}`);
            
            console.log(`\n📋 Field Details:`);
            verifiedFields.filter(Boolean).forEach((field, index) => {
                const typeInfo = field['ddic:dataType'] || field['ddic:dataElement'] || field['ddic:domainName'] || 'UNKNOWN';
                console.log(`   ${index + 1}. ${field['ddic:name']} (${typeInfo})`);
            });
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ CreateStructure test failed:', error.message);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testCreateStructure().then(success => {
        if (success) {
            console.log('\n🎉 CreateStructure test completed successfully!');
            process.exit(0);
        } else {
            console.log('\n💥 CreateStructure test failed!');
            process.exit(1);
        }
    }).catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { testCreateStructure };