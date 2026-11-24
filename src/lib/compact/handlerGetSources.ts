/**
 * The full tools HandlerGet's parts do the work of, by their descriptions:
 * each such part states the function of its tool in that tool's parts. A
 * module of its own, importing nothing, so the read barrel that fills it
 * links no write handler through it.
 */
export interface HandlerGetSources {
  readonly contents: string;
  readonly urls: string;
  readonly main_programs: string;
  readonly draft: string;
  readonly object_structure: string;
  readonly node_structure: string;
  readonly virtual_folders: string;
}
