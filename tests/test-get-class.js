// Тестовий скрипт для handleGetClass
const { handleGetClass } = require("../dist/handlers/handleGetClass");

const argv = require("minimist")(process.argv.slice(2));
const class_name = argv.name || "CL_SALV_TABLE";

(async () => {
  try {
    const result = await handleGetClass({ class_name });
    console.dir(result, { depth: null, colors: true });
    process.exit(0);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
})();
