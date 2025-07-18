// handleParseCode.ts
import { Registry, MemoryFile } from "@abaplint/core";
import { handleGetProgFullCode } from "./handleGetProgFullCode";

interface ParseCodeParams {
  name: string;
  type: string;
}

// Хендлер для парсингу ABAP-коду через abaplint/core
export async function handleParseCode(params: ParseCodeParams) {
  const { name, type } = params;
  // Отримати повний код об'єкта (разом з інклудами)
  const progResult = await handleGetProgFullCode({ name, type });
  if (progResult.isError || !Array.isArray(progResult.content) || progResult.content.length === 0) {
    return { error: `No code found for ${type} ${name}` };
  }

  // Витягнути code_objects з JSON-результату
  let codeObjects: any[] = [];
  try {
    const parsed = JSON.parse(progResult.content[0].text);
    codeObjects = parsed.code_objects;
  } catch {
    return { error: "Failed to parse code_objects" };
  }

  // Додати всі code_objects у Registry abaplint
  const reg = new Registry();
  for (const obj of codeObjects) {
    if (typeof obj.code === "string") {
      reg.addFile(new MemoryFile(obj.OBJECT_NAME + ".abap", obj.code));
    }
  }
  await reg.parseAsync();

  // Зібрати знайдені об'єкти
  const objects: { type: string; name: string }[] = [];
  for (const obj of reg.getObjects()) {
    objects.push({ type: obj.getType(), name: obj.getName() });
  }

  // Зібрати issues
  const issues = reg.findIssues().map(issue => ({
    message: issue.getMessage(),
    start: issue.getStart().getCol(),
    end: issue.getEnd().getCol(),
    rule: issue.getKey(),
  }));

  return {
    parsed: objects,
    issues,
  };
}
