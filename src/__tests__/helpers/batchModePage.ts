/**
 * The eligibility list of `docs/user-guide/BATCH_MODE.md`, rendered from
 * `tools/batch-handlers.json` (through `batchEntries` and the sentence's own
 * words, `entryWords`): one row per entry, the full set's first, each set's
 * tools in name order. `batchModePage.test.ts` checks the page holds exactly
 * this between its markers; run it with `WRITE_BATCH_MODE_PAGE=1` to write it.
 */
import { batchEntries } from '../../lib/batch/eligibility';
import { entryWords } from '../../lib/batch/sentence';

export const PAGE_START = '<!-- batch-handlers:start -->';
export const PAGE_END = '<!-- batch-handlers:end -->';

const SET_TITLES = {
  full: 'Full sets (`mcp-abap-adt`, `-http`, `-sse`, and their `-ro` binaries for the reads)',
  compact:
    'Compact sets (`mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`, and their `-ro` binaries for the reads)',
} as const;

const cell = (text: string) => text.replace(/\|/g, '\\|');

/** The list as the page holds it between its markers. */
export function renderEligibility(): string {
  const entries = batchEntries();
  const lines: string[] = [
    `${entries.length} entries, rendered from \`tools/batch-handlers.json\`. A tool that is not listed is refused in batch mode. A \`-ro\` binary serves an entry when it serves the tool.`,
    '',
  ];
  for (const set of ['full', 'compact'] as const) {
    const rows = entries
      .filter((entry) => entry.set === set)
      .sort((a, b) => a.tool.localeCompare(b.tool));
    lines.push(`### ${SET_TITLES[set]}`, '');
    lines.push('| Tool | Recorded | Sends |', '|---|---|---|');
    for (const entry of rows) {
      const when = entryWords(entry);
      lines.push(
        `| \`${entry.tool}\` | ${when === '' ? 'every call' : cell(`when ${when}`)} | ${cell(entry.sends)} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
