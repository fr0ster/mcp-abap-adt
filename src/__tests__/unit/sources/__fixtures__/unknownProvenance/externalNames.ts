// The closed rule, a name read whose declaration is outside the repository
// (`node_modules/external-contracts`): its `unknown` or `any` is the third
// party's, judged where the name is read — passing only whole into a sink,
// for its keys alone, or inside a listed function.
import { anything, many, raw } from './node_modules/external-contracts';

// Refused: inspected, kept, indexed.
export function read(): boolean {
  const kept = raw;
  return typeof raw === 'string' && kept !== null && many[0] !== anything;
}

// Passes: whole into a sink, keys alone.
export function passedOn(): string {
  return `${JSON.stringify(raw)}${Object.keys(many).length}`;
}
