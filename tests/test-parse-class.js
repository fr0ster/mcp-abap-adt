// Тестовий скрипт: отримати код класу і розпарсити через abaplint
const { handleGetClass } = require("../dist/handlers/handleGetClass");
const { Registry, MemoryFile } = require("@abaplint/core");
const argv = require("minimist")(process.argv.slice(2));
const class_name = argv.name || "CL_SALV_TABLE";

(async () => {
  try {
    const result = await handleGetClass({ class_name });
    if (result.isError || !Array.isArray(result.content) || result.content.length === 0) {
      console.error("GetClass error:", result);
      process.exit(1);
    }
    const code = result.content[0].text;
    const filename = `${class_name}.clas.abap`;
    const reg = new Registry();
    reg.addFile(new MemoryFile(filename, code));
    await reg.parseAsync();

    const objects = [];
    for (const obj of reg.getObjects()) {
      objects.push({ type: obj.getType(), name: obj.getName() });
    }
    const issues = reg.findIssues().map(issue => ({
      message: issue.getMessage(),
      start: issue.getStart().getCol(),
      end: issue.getEnd().getCol(),
      rule: issue.getKey(),
    }));

    console.dir({ parsed: objects, issues }, { depth: null, colors: true });
    process.exit(0);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
})();
