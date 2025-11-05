const { getAllTools } = require('./dist/lib/toolsRegistry.js');

try {
  const tools = getAllTools();
  console.log('Total number of tools:', tools.length);
  
  tools.forEach((tool, index) => {
    if (!tool) {
      console.log(`Tool ${index} is null/undefined`);
    } else if (!tool.name) {
      console.log(`Tool ${index} does not have a name property:`, JSON.stringify(tool, null, 2));
    } else {
      console.log(`${index}: ${tool.name}`);
    }
  });
  
  console.log('\n✅ All tools loaded successfully!');
  console.log('📊 Stats:');
  console.log(`   - Total: ${tools.length}`);
  console.log(`   - Loaded successfully: ${tools.filter(t => t && t.name).length}`);
  console.log(`   - Problematic: ${tools.filter(t => !t || !t.name).length}`);
  
  // Exit the process explicitly
  process.exit(0);
} catch (error) {
  console.error('❌ Failed to load tools:', error.message);
  process.exit(1);
}
