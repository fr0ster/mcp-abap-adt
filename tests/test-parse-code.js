// Тестовий скрипт для handleParseCode
const { handleParseCode } = require("../dist/handlers/handleParseCode");

// Отримати параметри з командного рядка
const argv = require("minimist")(process.argv.slice(2));
const name = argv.name || "CL_SALV_TABLE";
const type = argv.type || "CLAS/OC";

const fs = require("fs");
(async () => {
  try {
    const result = await handleParseCode({ name, type });
    console.dir(result, { depth: null, colors: true });

    // Якщо є code, зберегти у файл
    if (result && Array.isArray(result.parsed) && result.parsed.length > 0) {
      const codeFile = `parse-result-${name}-${type}.json`;
      fs.writeFileSync(codeFile, JSON.stringify(result, null, 2), "utf-8");
      console.log(`Result saved to ${codeFile}`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
})();
