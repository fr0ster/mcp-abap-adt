import type { IAbapConnection } from '@mcp-abap-adt/interfaces';

export class MockAbapConnection {
  private throwError() {
    throw new Error(
      'Stdio mode without configuration (--mcp-config-file or .env) is limited to tool inspection only. Please provide configuration to execute tools.',
    );
  }

  get connectionOptions() {
    return {};
  }

  get sdkClient() {
    return {};
  }

  async get() {
    this.throwError();
  }

  async post() {
    this.throwError();
  }

  async put() {
    this.throwError();
  }

  async delete() {
    this.throwError();
  }

  async request() {
    this.throwError();
  }

  async head() {
    this.throwError();
  }

  async options() {
    this.throwError();
  }
}
