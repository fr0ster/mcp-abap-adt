/**
 * abapGit live, compact (plan T6.9): every `HandlerAbapGitGet` and
 * `HandlerAbapGit` action once, the action that runs each full tool of the
 * flow in `abapGitRun.ts`, on the same run-owned fixtures, T100 and
 * recovery cases as the full suite. On premise and on the cloud.
 */

import { abapGitLiveRun } from './abapGitRun';

abapGitLiveRun('compact', 'abapGit, compact');
