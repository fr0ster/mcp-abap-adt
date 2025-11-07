/**
 * Test script for GetTransport handler
 * Tests transport request information retrieval
 */

const { initializeTestEnvironment } = require('./test-helper');

// Initialize test environment
initializeTestEnvironment();

const { handleGetTransport } = require('../dist/handlers/handleGetTransport');

async function testGetTransport() {
  console.log('='.repeat(80));
  console.log('GetTransport Handler Test');
  console.log('='.repeat(80));

  try {
    // Test with existing transport (you can change this to a real transport number)
    const transportNumber = 'E19K905635'; // Update with actual transport number
    
    console.log(`\n📝 Testing with transport: ${transportNumber}`);

    // Call GetTransport handler
    console.log('\n🚀 Calling GetTransport handler...');
    
    const startTime = Date.now();
    const result = await handleGetTransport({
      transport_number: transportNumber,
      include_objects: true,
      include_tasks: true
    });
    const duration = Date.now() - startTime;

    console.log(`\n✅ Transport retrieved successfully in ${duration}ms`);
    console.log('\n📊 Result:');
    
    let parsedResult;
    try {
      // result має MCP формат: { isError, content: [{ type, text }] }
      const responseText = result.content[0].text;
      parsedResult = JSON.parse(responseText);
      console.log(JSON.stringify(parsedResult, null, 2));
    } catch (e) {
      console.log(result);
      parsedResult = null;
    }

    // Verify result structure
    if (parsedResult && parsedResult.transport) {
      const transport = parsedResult.transport;
      console.log('\n✅ Verification Results:');
      
      console.log(`\n📋 Transport Information:`);
      console.log(`   Number: ${transport.number}`);
      console.log(`   Description: ${transport.description}`);
      console.log(`   Type: ${transport.type}`);
      console.log(`   Status: ${transport.status}`);
      console.log(`   Owner: ${transport.owner}`);
      console.log(`   Target: ${transport.target_system || 'N/A'}`);
      console.log(`   Client: ${transport.client || 'N/A'}`);
      console.log(`   Created: ${transport.created_at} by ${transport.created_by}`);
      console.log(`   Changed: ${transport.changed_at} by ${transport.changed_by}`);
      console.log(`   Released: ${transport.release_date || 'Not released'}`);

      if (parsedResult.objects && parsedResult.objects.length > 0) {
        console.log(`\n📦 Objects (${parsedResult.object_count}):`);
        parsedResult.objects.slice(0, 5).forEach((obj, index) => {
          console.log(`   ${index + 1}. ${obj.name} (${obj.type}) - ${obj.status}`);
        });
        if (parsedResult.objects.length > 5) {
          console.log(`   ... and ${parsedResult.objects.length - 5} more objects`);
        }
      }

      if (parsedResult.tasks && parsedResult.tasks.length > 0) {
        console.log(`\n📋 Tasks (${parsedResult.task_count}):`);
        parsedResult.tasks.forEach((task, index) => {
          console.log(`   ${index + 1}. ${task.number} - ${task.description} (${task.status})`);
          console.log(`      Owner: ${task.owner}, Created: ${task.created_at}`);
        });
      }

      // Success checks
      const checks = {
        'Transport found': !!transport.number,
        'Has description': !!transport.description,
        'Has owner': !!transport.owner,
        'Has type': !!transport.type,
        'Has status': !!transport.status
      };

      console.log('\n🔍 Validation Checks:');
      for (const [check, passed] of Object.entries(checks)) {
        console.log(`   ${passed ? '✅' : '❌'} ${check}`);
      }

      const allPassed = Object.values(checks).every(v => v);
      if (allPassed) {
        console.log('\n🎉 All checks passed! Transport information retrieved successfully.');
      } else {
        console.log('\n⚠️  Some checks failed. Please review the results.');
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // If transport not found, suggest testing with CreateTransport first
    if (error.message && error.message.includes('404')) {
      console.log('\n💡 Transport not found. Try running test-create-transport.js first to create a test transport.');
    }
    
    process.exit(1);
  }
}

// Run test
testGetTransport().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});