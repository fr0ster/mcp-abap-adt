/**
 * `npm run test:check` compiles this file: `SearchSource`'s two strategy
 * contracts and the shipped strategies are exported from
 * `@mcp-abap-adt/lib/embeddable` (DO22, DO24), and an embedder's own
 * strategies type-check against them as `EmbeddableMcpServer`'s and
 * `HandlerExporter`'s options.
 */
import {
  type EmbeddableMcpServerOptions,
  type LineMatchStrategy,
  type SapAnswerDecision,
  type SapAnswerPlace,
  type SapAnswerStrategy,
  type ScanHit,
  type ScanInput,
  type ScanResult,
  skipSapAnswers,
  substringLineMatch,
} from '@mcp-abap-adt/lib/embeddable';
import type { HandlerExporterOptions } from '@mcp-abap-adt/lib/handlers';

const decide = (_failure: unknown, place: SapAnswerPlace): SapAnswerDecision =>
  place.kind === 'source' ? 'skip' : 'throw';
export const sapAnswers: SapAnswerStrategy = { decide };

const hitOf = (line: number): ScanHit => ({ line, snippet: '' });
export const lineMatch: LineMatchStrategy = {
  match: (lines: readonly string[], _input: ScanInput): ScanResult => ({
    hits: lines.map((_, i) => hitOf(i + 1)),
    capped: false,
  }),
};

export const serverOptions: Pick<
  EmbeddableMcpServerOptions,
  'sapAnswerStrategy' | 'lineMatchStrategy'
> = { sapAnswerStrategy: sapAnswers, lineMatchStrategy: lineMatch };

export const exporterOptions: HandlerExporterOptions = {
  sapAnswerStrategy: skipSapAnswers,
  lineMatchStrategy: substringLineMatch,
};
