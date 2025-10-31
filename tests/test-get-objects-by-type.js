// Test for handleGetObjectsByType

const { handleGetObjectsByType } = require('../dist/handlers/handleGetObjectsByType');
const assert = require('assert');

async function run() {
    // Allow passing parameters through the command line
    const parent_name = process.argv[2] || '/CBY/PURBOOK_EN';
    const parent_tech_name = process.argv[3] || '/CBY/PURBOOK_EN';
    const parent_type = process.argv[4] || 'PROG/P';
    const node_id = process.argv[5] || '000000';
    const with_short_descriptions = process.argv[6] !== undefined ? process.argv[6] === 'true' : true;

    const args = {
        parent_name,
        parent_tech_name,
        parent_type,
        node_id,
        with_short_descriptions
    };

    const result = await handleGetObjectsByType(args);

    // Ensure the handler returns an object with content
    assert(result && result.content && Array.isArray(result.content), 'Result must have content array');
    // Log the result for verification
    console.dir(result, { depth: null, maxArrayLength: 100 });

    console.log('handleGetObjectsByType test passed');
    process.exit(0);
}

run().catch(e => {
    console.error('handleGetObjectsByType test failed:', e);
    process.exit(1);
});
