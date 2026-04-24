import {
  NoDedupStrategy,
  ReadVsGetDedupStrategy,
} from '../../lib/handlers/groups/strategies';
import type { HandlerEntry } from '../../lib/handlers/interfaces';

const makeEntry = (name: string): HandlerEntry =>
  ({
    toolDefinition: { name, description: '', inputSchema: {} },
    handler: async () => ({ content: [] }),
  }) as any;

describe('ReadVsGetDedupStrategy', () => {
  const strategy = new ReadVsGetDedupStrategy();

  it('excludes Read<X> when Get<X> is in overriding set', () => {
    const overriding = new Set(['GetFunctionModule']);
    expect(
      strategy.shouldExclude(makeEntry('ReadFunctionModule'), overriding),
    ).toBe(true);
  });

  it('keeps Read<X> when Get<X> is not in overriding set', () => {
    const overriding = new Set(['GetPackage']);
    expect(
      strategy.shouldExclude(makeEntry('ReadFunctionModule'), overriding),
    ).toBe(false);
  });

  it('never excludes non-Read* entries', () => {
    const overriding = new Set(['GetEnhancements']);
    expect(
      strategy.shouldExclude(makeEntry('GetEnhancements'), overriding),
    ).toBe(false);
    expect(
      strategy.shouldExclude(makeEntry('ListTransports'), overriding),
    ).toBe(false);
  });

  it('keeps Read<X> when overriding set is empty', () => {
    expect(strategy.shouldExclude(makeEntry('ReadClass'), new Set())).toBe(
      false,
    );
  });

  it('handles all 16 known duplicate pairs', () => {
    const suffixes = [
      'BehaviorDefinition',
      'BehaviorImplementation',
      'Class',
      'DataElement',
      'Domain',
      'FunctionGroup',
      'FunctionModule',
      'Interface',
      'MetadataExtension',
      'Package',
      'Program',
      'ServiceBinding',
      'ServiceDefinition',
      'Structure',
      'Table',
      'View',
    ];
    const overriding = new Set(suffixes.map((s) => 'Get' + s));
    for (const s of suffixes) {
      expect(strategy.shouldExclude(makeEntry('Read' + s), overriding)).toBe(
        true,
      );
    }
  });
});

describe('NoDedupStrategy', () => {
  it('never excludes anything', () => {
    const strategy = new NoDedupStrategy();
    const overriding = new Set(['GetFunctionModule', 'GetClass']);
    expect(
      strategy.shouldExclude(makeEntry('ReadFunctionModule'), overriding),
    ).toBe(false);
  });
});
