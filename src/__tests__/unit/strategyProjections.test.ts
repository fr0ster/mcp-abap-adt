import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import {
  project,
  terseActivation,
  terseCheck,
  terseDeletion,
  terseValidation,
  terseWrite,
} from '../../lib/strategies/projections';
import { parseStructure } from '../../lib/strategies/reading';

/**
 * One parse, three answers, against real documents.
 *
 * `terse` is the default and the one the size budget is for, so each projection
 * is checked for what it names AND for what it leaves out. `full` is the whole
 * parse and `raw` is the document — those two are checked once, because the
 * mechanism is shared.
 */

function readingOf(name: string) {
  const meta = corpusSidecar(name);
  const raw = corpusBody(name);
  return {
    value: parseStructure(raw),
    raw,
    status: Number(meta.response.status),
  };
}

describe('activation', () => {
  it('says it activated, and adds nothing else, when it did', () => {
    const r = readingOf('activation-success-verdict--01-activation');
    expect(terseActivation(r.value as never, r.status)).toEqual({
      activated: true,
      generated: true,
    });
  });

  it('names the no-op, so a success that says activated:false is legible', () => {
    const r = readingOf('activation-nothing-to-activate--01-activation');
    expect(terseActivation(r.value as never, r.status)).toEqual({
      activated: false,
      generated: true,
      nothing_to_activate: true,
    });
  });

  it('never calls a refusal a no-op — the messages decide', () => {
    const r = readingOf('refusal-activation-fails--01-activation');
    expect(terseActivation(r.value as never, r.status)).not.toHaveProperty(
      'nothing_to_activate',
    );
  });

  it('says it did not, and carries the reason, when it did not', () => {
    const r = readingOf('refusal-activation-fails--01-activation');
    const terse = terseActivation(r.value as never, r.status) as any;
    expect(terse.activated).toBe(false);
    expect(terse.messages).toHaveLength(1);
    expect(terse.messages[0]).toEqual({
      type: 'E',
      text: 'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
    });
  });

  it("reads a function group's `ioc:inactiveObjects` answer, and states no verdict of its own", () => {
    // Measured live (RFC, 2026-09-21): ActivateFunctionGroupLow's 2xx answer
    // for a function group comes back as `ioc:inactiveObjects`, not
    // `chkl:messages`. Before this case was known, `undefined` here turned a
    // real SAP answer into `projection_failed`.
    //
    // **And it must not turn it into `activated: true` either.** The document
    // lists objects and says nothing about an outcome; an activation that
    // failed answers 200 just the same, which is what #154 was. What the
    // reading offers instead is the objects the answer named, and the fact
    // that the answer stated no outcome — which is a caller's cue to read the
    // state back with `GetInactiveObjects`, as the run that measured this did:
    // it answered `count: 0`. That read is a snapshot — activation is
    // asynchronous, so a later run seeing a count above zero would mean "not
    // yet" as readily as "not done", which is why the verdict belongs to
    // whoever can read again and not to this function.
    const r = readingOf('activation-still-inactive--01-activation');
    expect(terseActivation(r.value as never, r.status)).toEqual({
      activation_not_stated: true,
      objects: [
        { type: 'FUGR/F', name: 'ZMCP_BLD_FGR_L1' },
        { type: 'FUGR/F', name: 'ZMCP_BLD_FGR_L1' },
      ],
    });
  });

  /** A checklist still answers a verdict, because a checklist states one. */
  it('still reads a class checklist as activated', () => {
    const r = readingOf('activation-success-verdict--01-activation');
    expect(terseActivation(r.value as never, r.status)).toMatchObject({
      activated: true,
    });
  });
});

describe('check runs', () => {
  it('a clean check is ran-with-nothing-to-say', () => {
    const r = readingOf('check-success-verdict--01-checkrun');
    const terse = terseCheck(r.value as never, r.status) as any;
    expect(terse.ran).toBe(true);
    expect(terse.messages).toBeUndefined();
  });

  it('a check that never ran says so, and why', () => {
    const r = readingOf('refusal-check-nonexistent-object--01-checkrun');
    const terse = terseCheck(r.value as never, r.status) as any;
    expect(terse.ran).toBe(false);
    expect(terse.status_text).toContain('does not exist');
  });

  it('a syntax error is ran-with-findings', () => {
    const r = readingOf('refusal-syntax-check--01-checkrun');
    const terse = terseCheck(r.value as never, r.status) as any;
    expect(terse.ran).toBe(true);
    expect(terse.messages[0].type).toBe('E');
    expect(terse.messages[0].code).toBe('MESSAGE(GTH)');
  });
});

describe('deletion', () => {
  it('a successful delete says deleted, and does not repeat an empty message', () => {
    const r = readingOf('delete-success--01-deletion-delete');
    expect(terseDeletion(r.value as never, r.status)).toEqual({
      deleted: true,
      object: 'ZMCP_BLD_ANSCH01',
    });
  });

  it('a refused delete says not deleted, with what SAP said', () => {
    const r = readingOf('refusal-delete-refused--01-deletion-delete');
    const terse = terseDeletion(r.value as never, r.status) as any;
    expect(terse.deleted).toBe(false);
    expect(terse.message.text).toContain('already editing');
  });

  // A delete tool answers the check's document only when it sent no delete
  // (the check said the object is not there), so it says so.
  it('the check step answers deletable, and not deleted', () => {
    const r = readingOf('deletion-check-allows--01-deletion-check');
    const terse = terseDeletion(r.value as never, r.status) as any;
    expect(terse.deletable).toBe(true);
    expect(terse.deleted).toBe(false);
  });
});

describe('validation', () => {
  it('CHECK_RESULT X means the name is admissible', () => {
    const r = readingOf('validation-name-free-class--01-validation-objectname');
    expect(terseValidation(r.value as never, r.status)).toEqual({
      admissible: true,
    });
  });

  it('SEVERITY OK means the same, through the other carrier', () => {
    const r = readingOf('validation-name-free-ddl--01-ddl-validation');
    expect(terseValidation(r.value as never, r.status)).toEqual({
      admissible: true,
    });
  });

  it('SEVERITY ERROR means it is taken, and says so', () => {
    const r = readingOf('refusal-validation-name-taken-ddl--01-ddl-validation');
    const terse = terseValidation(r.value as never, r.status) as any;
    expect(terse.admissible).toBe(false);
    expect(terse.message.text).toContain('already exists');
  });
});

describe('a write with nothing to report', () => {
  it('says SUCCESS rather than nothing, because undefined is a failure', () => {
    const r = readingOf('create-class--01-oo-classes');
    expect(r.raw).toBe('');
    expect(terseWrite(r.value, r.status)).toBe('SUCCESS');
  });

  it('says nothing for a status that is not a success', () => {
    expect(terseWrite(null, 423)).toBeUndefined();
  });
});

describe('detail picks how much of the one parse is shown', () => {
  const name = 'refusal-activation-fails--01-activation';
  const r = readingOf(name);

  it('raw is the document, unmodified', () => {
    expect(project('raw', terseActivation)(r as never)).toBe(corpusBody(name));
  });

  it('full is the whole parse, not a different one', () => {
    const full = project('full', terseActivation)(r as never) as any;
    expect(full['chkl:messages']).toBeDefined();
    // the attributes SAP sent are still there, verbatim
    expect(full['chkl:messages'].msg[0]['@'].code).toBe('MESSAGE(GTH)');
  });

  it('terse is a projection of that same parse', () => {
    const terse = project('terse', terseActivation)(r as never) as any;
    expect(terse.activated).toBe(false);
    expect(terse['chkl:messages']).toBeUndefined();
  });
});
