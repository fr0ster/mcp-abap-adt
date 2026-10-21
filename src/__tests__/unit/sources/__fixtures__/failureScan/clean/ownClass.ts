import { errorClassOf, SettingsError } from '../../../../../../lib/auth/errors';

class OwnRefusal extends Error {
  readonly words: string;
  constructor(words: string) {
    super(words);
    this.name = 'OwnRefusal';
    this.words = words;
  }
}

export function run(work: () => void): string {
  try {
    work();
    return 'ok';
  } catch (caught) {
    if (caught instanceof OwnRefusal) return caught.words;
    if (caught instanceof SettingsError) return caught.setting;
    if (caught instanceof Error) return caught.constructor.name;
    return errorClassOf(caught);
  }
}
