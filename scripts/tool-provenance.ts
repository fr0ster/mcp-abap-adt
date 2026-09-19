import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

const isToolDef = (v: unknown): v is { name: string } =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as { name?: unknown }).name === 'string' &&
  'inputSchema' in (v as object);

const provenance = new Map<string, Set<string>>();
const add = (name: string, file: string) => {
  const at = provenance.get(name) ?? new Set<string>();
  at.add(file);
  provenance.set(name, at);
};

for (const file of walk('src/handlers')) {
  let mod: Record<string, unknown>;
  try {
    mod = require(`../${file}`) as Record<string, unknown>;
  } catch {
    continue;
  }

  for (const value of Object.values(mod)) {
    // Tier 1: an exported TOOL_DEFINITION, or an exported array of definitions/entries.
    if (isToolDef(value)) {
      add(value.name, file);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isToolDef(item)) add(item.name, file);
        else if (
          item &&
          isToolDef((item as { toolDefinition?: unknown }).toolDefinition)
        ) {
          add(
            (item as { toolDefinition: { name: string } }).toolDefinition.name,
            file,
          );
        }
      }
      continue;
    }
    // Tier 2: a zero-argument build* factory. Call it and take the names it produces —
    // this is the only way to attribute a generated name to the file that generates it.
    if (
      typeof value === 'function' &&
      value.length === 0 &&
      /^build/.test(value.name)
    ) {
      try {
        const out = (value as () => unknown)();
        if (Array.isArray(out)) {
          for (const item of out) {
            const td = (item as { toolDefinition?: unknown })?.toolDefinition;
            if (isToolDef(td)) add(td.name, file);
          }
        }
      } catch {
        /* not a tool factory; ignore */
      }
    }
  }
}

for (const [name, files] of provenance) {
  if (files.size > 1) console.error('AMBIGUOUS', name, [...files].join(', '));
}
console.log(
  JSON.stringify(
    [...provenance].map(([name, f]) => ({ name, files: [...f] })),
    null,
    2,
  ),
);
