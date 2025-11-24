/**
 * Test GetView functionality
 * 
 * This test demonstrates retrieving ABAP database view definition and contents
 * using the MCP ABAP ADT server's GetView handler.
 */

const { initializeTestEnvironment, loadTestConfig } = require('./test-helper');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Initialize test environment
initializeTestEnvironment();

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

async function testGetView() {
    const { handleGetView } = require('../dist/handlers/view/readonly/handleGetView');
    
    // Test with multiple views - some standard SAP views that should exist
    const testViews = [
        'V_T001',      // Company Code view (if exists)
        'DD02V',       // Tables view (should exist in most systems)
        'DD03VV',      // Table fields view (should exist in most systems)
        'TMDIR',       // Transport Management view (if exists)
        'V_TABDIR'     // Table directory view (if exists)
    ];
    
    console.log('\n🔍 Testing GetView functionality...');
    console.log(`📋 Testing ${testViews.length} different database views`);
    
    let successCount = 0;
    let totalTested = 0;
    
    for (const viewName of testViews) {
        console.log(`\n📖 Testing view: ${viewName}`);
        totalTested++;
        
        try {
            const result = await handleGetView({
                view_name: viewName,
                max_rows: 50
            });
            
            if (result.isError) {
                console.log(`   ⚠️  View ${viewName} not accessible: ${result.content[0].text}`);
                continue;
            }
            
            const response = JSON.parse(result.content[0].text);
            console.log(`   ✓ View ${viewName} retrieved successfully!`);
            successCount++;
            
            // Analyze view definition
            if (response.definition && !response.definition.error) {
                const def = response.definition;
                console.log(`   📊 View Details:`);
                console.log(`      Name: ${def.name || 'Unknown'}`);
                console.log(`      Type: ${def.objectType || 'Unknown'}`);
                console.log(`      Description: ${def.description || 'No description'}`);
                console.log(`      Package: ${def.package || 'Unknown'}`);
                
                if (def.tables && Array.isArray(def.tables)) {
                    console.log(`      Tables: ${def.tables.length} tables`);
                    def.tables.forEach((table, index) => {
                        console.log(`         ${index + 1}. ${table.name} ${table.alias ? `(${table.alias})` : ''}`);
                    });
                }
                
                if (def.fields && Array.isArray(def.fields)) {
                    console.log(`      Fields: ${def.fields.length} fields`);
                    const keyFields = def.fields.filter(f => f.key);
                    if (keyFields.length > 0) {
                        console.log(`      Key Fields: ${keyFields.map(f => f.name).join(', ')}`);
                    }
                }
                
                if (def.joins && Array.isArray(def.joins) && def.joins.length > 0) {
                    console.log(`      Joins: ${def.joins.length} join conditions`);
                }
                
                if (def.conditions && Array.isArray(def.conditions) && def.conditions.length > 0) {
                    console.log(`      Conditions: ${def.conditions.length} selection conditions`);
                }
            } else {
                console.log(`   ⚠️  View definition not available: ${response.definition?.error || 'Unknown error'}`);
            }
            
            // Analyze view contents
            if (response.contents && !response.contents.error) {
                console.log(`   📋 View Contents: Successfully retrieved data`);
                if (response.contents.data) {
                    console.log(`      Query: ${response.contents.query}`);
                    console.log(`      Max Rows: ${response.contents.maxRows}`);
                }
            } else {
                console.log(`   ⚠️  View contents not accessible: ${response.contents?.error || 'Unknown error'}`);
            }
            
        } catch (error) {
            console.log(`   ✗ Failed to test view ${viewName}: ${error.message}`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n📊 Test Summary:`);
    console.log(`   Total Views Tested: ${totalTested}`);
    console.log(`   Successfully Retrieved: ${successCount}`);
    console.log(`   Success Rate: ${((successCount / totalTested) * 100).toFixed(1)}%`);
    
    return successCount > 0;
}

async function testSpecificView() {
    const { handleGetView } = require('../dist/handlers/view/readonly/handleGetView');
    
    // Test with a specific view that's more likely to exist
    const viewName = 'DD02V'; // Dictionary Tables view
    
    console.log(`\n🎯 Detailed test of view: ${viewName}`);
    
    try {
        const result = await handleGetView({
            view_name: viewName,
            max_rows: 10
        });
        
        if (result.isError) {
            console.error(`✗ GetView failed: ${result.content[0].text}`);
            return false;
        }
        
        const response = JSON.parse(result.content[0].text);
        console.log(`✓ GetView completed successfully!`);
        
        // Detailed analysis
        console.log(`\n📋 Detailed Analysis of ${viewName}:`);
        console.log(`   Timestamp: ${response.timestamp}`);
        
        if (response.definition) {
            console.log(`\n📖 Definition Analysis:`);
            if (response.definition.error) {
                console.log(`     Error: ${response.definition.error}`);
            } else if (response.definition.raw) {
                console.log(`     Raw Structure: Available (unstructured XML)`);
                console.log(`     Keys in raw: ${Object.keys(response.definition.raw || {}).join(', ')}`);
            } else {
                console.log(`     Name: ${response.definition.name}`);
                console.log(`     Type: ${response.definition.objectType}`);
                console.log(`     Description: ${response.definition.description || 'No description'}`);
                console.log(`     Package: ${response.definition.package || 'Unknown'}`);
                
                if (response.definition.tables) {
                    console.log(`     Tables (${response.definition.tables.length}):`);
                    response.definition.tables.forEach(table => {
                        console.log(`       - ${table.name} ${table.alias ? `(alias: ${table.alias})` : ''}`);
                    });
                }
                
                if (response.definition.fields && response.definition.fields.length > 0) {
                    console.log(`     Fields (${response.definition.fields.length}):`);
                    response.definition.fields.slice(0, 10).forEach(field => { // Show first 10 fields
                        const keyFlag = field.key ? '🔑' : '  ';
                        console.log(`       ${keyFlag} ${field.name} (${field.dataType || 'Unknown'})`);
                    });
                    if (response.definition.fields.length > 10) {
                        console.log(`       ... and ${response.definition.fields.length - 10} more fields`);
                    }
                }
            }
        }
        
        if (response.contents) {
            console.log(`\n📊 Contents Analysis:`);
            if (response.contents.error) {
                console.log(`     Error: ${response.contents.error}`);
                console.log(`     Note: ${response.contents.note || 'No additional info'}`);
            } else {
                console.log(`     Query: ${response.contents.query}`);
                console.log(`     Max Rows: ${response.contents.maxRows}`);
                console.log(`     Data Available: ${response.contents.data ? 'Yes' : 'No'}`);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error(`✗ GetView test failed: ${error.message}`);
        return false;
    }
}

// Run the tests
if (require.main === module) {
    async function runAllTests() {
        let success = true;
        
        // Test multiple views
        const multiViewResult = await testGetView();
        success = success && multiViewResult;
        
        // Test specific view in detail
        const specificViewResult = await testSpecificView();
        success = success && specificViewResult;
        
        if (success) {
            console.log('\n🎉 GetView tests completed successfully!');
            process.exit(0);
        } else {
            console.log('\n💥 GetView tests failed!');
            process.exit(1);
        }
    }
    
    runAllTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { testGetView, testSpecificView };