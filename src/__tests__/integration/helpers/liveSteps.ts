/**
 * The live suites' locks and step verdicts (#394): in soft mode a coverage
 * suite's locks are the run connection's registry's (`heldLocksOf`), so the
 * file's close sees what is left; a step's answer is read by its outcome
 * (`answerOutcome`), so a success whose own unlock failed on the network
 * ends the step with its lock held. A lost session is attributed by the
 * wire (`heldLiveLocks.ts`, `observeWire`) to the connection it happened
 * on. Hard mode keeps its own registry and its `isError` check, as before.
 */
import { HeldLiveLocks, heldLocksOf } from './heldLiveLocks';
import { type LiveAnswer, liveConnection } from './live';
import { answerOutcome, StepFailure } from './stepOutcome';
import { isHardModeEnabled } from './testers/hardMode';

/** Hard mode's locks: the server owns its session, the suite only names them. */
const hardModeLocks = new HeldLiveLocks();

/** The registry a live suite's locks go to: the run connection's in soft mode. */
export function liveLocks(): HeldLiveLocks {
  return isHardModeEnabled() ? hardModeLocks : heldLocksOf(liveConnection());
}

/**
 * The answer, or the step ends: in soft mode by its outcome (a lock its
 * answer left behind taken in), in hard mode by `isError`. `words` is what the failure quotes.
 */
export function liveSucceeded(
  step: string,
  answer: LiveAnswer,
  words: string = answer.text,
): LiveAnswer {
  if (isHardModeEnabled()) {
    if (answer.isError) throw new Error(`${step}: ${words}`);
    return answer;
  }
  const locks = liveLocks();
  locks.takeInLeftLocked(answer);
  const outcome = answerOutcome(answer);
  if (outcome !== 'ok') throw new StepFailure(step, outcome, words);
  return answer;
}
