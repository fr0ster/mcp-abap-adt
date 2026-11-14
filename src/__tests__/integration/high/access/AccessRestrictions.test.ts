/**
 * The access checks, live (plan Task 14): an in-process server started with
 * allowed packages and requests (`withRestriction`), on the suite's own
 * connection and as its user.
 *
 * - an allowed package's create runs; a create in another package is
 *   refused `package_not_allowed` and sends nothing;
 * - on premise, a write recorded into the allowed request runs (`access.
 *   transport_request`); a write naming another request is refused
 *   `request_not_allowed` and sends nothing (both systems);
 * - the tree strategy: a package below an allowed `<parent>/**` is allowed
 *   (its tree read), a package outside it refused.
 *
 * Every object is the run's own and deleted after; nothing of a refused call
 * reaches SAP (every request the server sends during it is counted).
 *
 * Run: MCP_TEST_CONFIG=<config> npm run test:integration -- src/__tests__/integration/high/access/AccessRestrictions.test.ts
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  parsePackageEntry,
  parseRequestEntry,
} from '../../../../lib/access/accessLists';
import { listedAccessChecks } from '../../../../lib/access/listedAccessChecks';
import { packageTreeAccessChecks } from '../../../../lib/access/packageTreeAccessChecks';
import { createAdtClient } from '../../../../lib/clients';
import { readPackageMetadata } from '../../../../lib/strategies/metadataReads';
import { packageSummary } from '../../../../lib/strategies/packageSummary';
import {
  configuredSystemKind,
  loadTestConfig,
  resolvePackageName,
} from '../../helpers/configHelpers';
import {
  deleteRecorded,
  liveConnection,
  livePrepare,
  liveSuite,
  recordCreated,
  type ToolArgs,
  withRestriction,
} from '../../helpers/live';
import {
  answerField,
  sentDuring,
  succeeded,
} from '../../helpers/restrictedCalls';
import { skipRunningTest } from '../../helpers/runningTest';
import { configText } from '../../helpers/secondUser';

const S = randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
const onprem = (): boolean => configuredSystemKind() === 'onprem';
const config = (): unknown => loadTestConfig();

/** The package the allowed creates go into. */
const allowedPackage = (): string =>
  configText(config(), 'access', 'package') ||
  (onprem() ? '$TMP' : resolvePackageName());
/** The request the allowed write records into (on premise). */
const allowedRequest = (): string =>
  configText(config(), 'access', 'transport_request');
/** The package the allowed request's write goes into: the configured transportable one. */
const requestPackage = (): string => resolvePackageName();

liveSuite(['onprem', 'cloud'], 'access restrictions', () => {
  after(async () => {
    await deleteRecorded();
  });

  const allowedClass = `ZCL_MAR${S}_A`;
  const requestClass = `ZCL_MAR${S}_R`;

  withRestriction(
    'allowed packages and requests',
    {
      accessChecks: listedAccessChecks({
        allowedPackages: [
          parsePackageEntry(allowedPackage(), 'allowed-packages'),
          parsePackageEntry(requestPackage(), 'allowed-packages'),
        ],
        // With no request of the run's own (the cloud), a request no write
        // names: every other request is outside the list.
        allowedRequests: [
          parseRequestEntry(
            allowedRequest() || 'NONEK000000',
            'allowed-requests',
          ),
        ],
      }),
    },
    () => {
      it('an allowed package create runs', async () => {
        recordCreated('DeleteClass', { class_name: allowedClass });
        succeeded(
          'CreateClass',
          await livePrepare('CreateClass', {
            class_name: allowedClass,
            package_name: allowedPackage(),
            description: 'Access live',
          }),
        );
      });

      it('a create in another package is refused, nothing sent', async () => {
        const { answer, sent } = await sentDuring('CreateClass', {
          class_name: `ZCL_MAR${S}_X`,
          package_name: 'ZMAR_NOT_ALLOWED',
          description: 'Access live',
        });
        assert.equal(answer.isError, true);
        assert.equal(answerField(answer, 'error'), 'package_not_allowed');
        assert.deepEqual(sent, []);
      });

      it('a write recorded into the allowed request runs', async () => {
        const request = allowedRequest();
        if (!onprem() || request === '') {
          skipRunningTest(
            onprem()
              ? 'access.transport_request names no request'
              : 'the probe package takes no request',
          );
          return;
        }
        const args: ToolArgs = {
          class_name: requestClass,
          transport_request: request,
        };
        recordCreated('DeleteClass', args);
        succeeded(
          'CreateClass',
          await livePrepare('CreateClass', {
            ...args,
            package_name: requestPackage(),
            description: 'Access live',
          }),
        );
      });

      it('a write naming another request is refused, nothing sent', async () => {
        const { answer, sent } = await sentDuring('CreateClass', {
          class_name: `ZCL_MAR${S}_Y`,
          package_name: allowedPackage(),
          transport_request: 'ZZZK999999',
          description: 'Access live',
        });
        assert.equal(answer.isError, true);
        assert.equal(answerField(answer, 'error'), 'request_not_allowed');
        assert.deepEqual(sent, []);
      });
    },
  );

  const localPackage = `$ZMAR${S}`;
  const treeClass = `ZCL_MAR${S}_T`;
  /** The subtree's root: configured, else on premise `$TMP`, on the cloud the package's own super package. */
  const parent = async (): Promise<string> => {
    const configured = configText(config(), 'access', 'package_parent');
    if (configured !== '') return configured;
    if (onprem()) return '$TMP';
    const read = await readPackageMetadata(
      createAdtClient(liveConnection()),
      { packageName: allowedPackage() },
      'active',
    );
    const above = read.ok
      ? packageSummary(read.getResult().value.raw).super_package
      : undefined;
    if (above === undefined) {
      throw new Error(
        'the probe package names no super package: set access.package_parent',
      );
    }
    return above;
  };
  /**
   * The package below the subtree: on premise with no parent configured a
   * local package of the run's own, else the configured one.
   */
  const ownChild = (): boolean =>
    onprem() && configText(config(), 'access', 'package_parent') === '';
  const child = (): string => (ownChild() ? localPackage : allowedPackage());

  withRestriction(
    'the package tree',
    async () => ({
      accessChecks: packageTreeAccessChecks({
        allowedPackages: [
          parsePackageEntry(`${await parent()}/**`, 'allowed-packages'),
        ],
      }),
    }),
    () => {
      it('a package below the allowed subtree is allowed, one outside refused', async () => {
        if (ownChild()) {
          // A package create: its parent is the call's super package.
          recordCreated('DeletePackage', { package_name: localPackage });
          succeeded(
            'CreatePackage',
            await livePrepare('CreatePackage', {
              package_name: localPackage,
              super_package: '$TMP',
              description: 'Access live',
              package_type: 'development',
              software_component: 'LOCAL',
            }),
          );
        }
        recordCreated('DeleteClass', { class_name: treeClass });
        succeeded(
          'CreateClass below the subtree',
          await livePrepare('CreateClass', {
            class_name: treeClass,
            package_name: child(),
            description: 'Access live',
          }),
        );
        const outside = onprem() ? requestPackage() : 'ZMAR_NO_SUCH_PACKAGE';
        const { answer, sent } = await sentDuring('CreateClass', {
          class_name: `ZCL_MAR${S}_Z`,
          package_name: outside,
          description: 'Access live',
        });
        assert.equal(answer.isError, true);
        assert.equal(
          answerField(answer, 'error'),
          onprem() ? 'package_not_allowed' : 'package_tree_unreadable',
        );
        // The tree read alone: package metadata reads, nothing of the create.
        assert.ok(
          sent.every((line) => line.startsWith('GET /sap/bc/adt/packages/')),
          JSON.stringify(sent),
        );
      });
    },
  );
});
