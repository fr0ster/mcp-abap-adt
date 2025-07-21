// Тестовий скрипт: парсинг програми та інклудів через abaplint (без handleGetProgFullCode)
const { handleGetProgram } = require("../dist/handlers/handleGetProgram");
const { handleGetIncludesList } = require("../dist/handlers/handleGetIncludesList");
const { handleGetInclude } = require("../dist/handlers/handleGetInclude");
const { Registry, MemoryFile } = require("@abaplint/core");

const prog_name = "SAPMSSY1";

(async () => {
  try {
    // 1. Основний код програми
    const progResult = await handleGetProgram({ program_name: prog_name });
    if (progResult.isError || !Array.isArray(progResult.content) || progResult.content.length === 0) {
      console.error("GetProgram error:", progResult);
      process.exit(1);
    }
    const mainCode = progResult.content[0].text;

    // 2. Список інклудів
    const includesResult = await handleGetIncludesList({ object_name: prog_name, object_type: "program" });
    if (includesResult.isError || !Array.isArray(includesResult.content) || includesResult.content.length === 0) {
      console.error("GetIncludesList error:", includesResult);
      process.exit(1);
    }
    // Дебаг: подивитися формат результату
    console.log("INCLUDES RAW:", includesResult.content[0].text);

    // Спробувати розпарсити як масив рядків (розділення по переносу)
    const includes = includesResult.content[0].text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    // 3. Завантажити код кожного інклуда
    const includeFiles = [];
    for (const inc of includes) {
      const incResult = await handleGetInclude({ include_name: inc });
      if (!incResult.isError && Array.isArray(incResult.content) && incResult.content.length > 0) {
        includeFiles.push({
          name: inc,
          code: incResult.content[0].text || incResult.content[0].data || ""
        });
      }
    }

    // 4. Додати всі файли у Registry abaplint
    const reg = new Registry();
    reg.addFile(new MemoryFile(prog_name + ".prog.abap", mainCode));
    for (const inc of includeFiles) {
      reg.addFile(new MemoryFile(inc.name + ".inc.abap", inc.code));
    }
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
