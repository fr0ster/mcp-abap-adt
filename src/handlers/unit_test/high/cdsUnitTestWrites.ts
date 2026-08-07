/**
 * `update()` and `delete()` for a CDS unit test class.
 *
 * `AdtCdsUnitTest` implements both for real — update writes the local test class
 * source, delete removes the global class — but adt-clients 9.0.0 narrowed
 * `getCdsUnitTest()` to `IAdtCreatable & IAdtReadable & IAdtValidatable &
 * IAdtCdsTestRunnable`, which omits them, and the class itself is not exported.
 * So the capability exists at runtime and is unreachable through the declared
 * type.
 *
 * This describes exactly the two methods the class declares, so the cast at the
 * call site widens the accessor back to what the object actually is rather than
 * inventing a capability. It should be deleted once the accessor's return type
 * covers these two operations.
 */
import type {
  ICdsUnitTestConfig,
  ICdsUnitTestState,
} from '@mcp-abap-adt/interfaces';

export interface CdsUnitTestWrites {
  update(config: Partial<ICdsUnitTestConfig>): Promise<ICdsUnitTestState>;
  delete(config: Partial<ICdsUnitTestConfig>): Promise<ICdsUnitTestState>;
}
