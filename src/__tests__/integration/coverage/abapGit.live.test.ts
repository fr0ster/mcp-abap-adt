/**
 * abapGit live, the full tools (plan T6.9, spec §7 steps 1–8), on premise
 * and on the cloud, on run-owned fixtures: check the remote, link, push a
 * run-owned interface, pull a remote change, switch branches (on premise),
 * checks and files with SAP's T100 key on a missing file, link and pull
 * refused under an allowed-packages entry, push and unlink checked against
 * the repository's package, and the cleanup. A cloud job is correlated by a
 * new log key and a terminal status before anything is cleaned up; a run
 * that cannot correlate keeps its fixtures in the ledger for the next run.
 * The flow, where it runs and why it skips: `abapGitRun.ts`.
 */

import { abapGitLiveRun } from './abapGitRun';

abapGitLiveRun('full', 'abapGit, the full tools');
