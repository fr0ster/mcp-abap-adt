/**
 * Unit tests for McpServer v2
 *
 * Tests with mocked implementations of all interfaces
 */

/// <reference types="jest" />

import { McpServer } from '../../server/McpServer.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { IClientInfo } from '../../types/transport.js';
import { ISessionManager, ISession } from '../../interfaces/session.js';
import { IConnectionProvider, IConnectionParams } from '../../interfaces/connection.js';
import { IProtocolHandler } from '../../interfaces/protocol.js';
import { IHandlersRegistry } from '../../../handlers/interfaces.js';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('McpServer', () => {
  let mockTransport: ITransport & { start: jest.Mock; stop: jest.Mock; on: jest.Mock; send: jest.Mock };
  let mockSessionManager: ISessionManager & {
    createSession: jest.Mock;
    getSession: jest.Mock;
    deleteSession: jest.Mock;
    setAbapSession: jest.Mock;
    clearAbapSession: jest.Mock;
    on: jest.Mock;
    clearAll: jest.Mock;
    updateConnectionParams: jest.Mock;
  };
  let mockConnectionProvider: IConnectionProvider & {
    getConnectionParams: jest.Mock;
    updateConnectionParams: jest.Mock;
  };
  let mockProtocolHandler: IProtocolHandler & {
    initialize: jest.Mock;
    handleRequest: jest.Mock;
  };
  let mockHandlersRegistry: IHandlersRegistry & {
    registerAllTools: jest.Mock;
    registerTool: jest.Mock;
    getRegisteredTools: jest.Mock;
  };
  let mockSdkServer: SdkMcpServer;
  let mockLogger: any;

  beforeEach(() => {
    // Mock Transport
    mockTransport = {
      type: 'stdio' as const,
      bindAddress: '127.0.0.1',
      port: undefined,
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      send: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock Session Manager
    const mockSession: ISession = {
      clientSessionId: 'test-session-id',
      createdAt: new Date(),
      lastActivity: new Date(),
      connectionParams: {
        sapUrl: 'https://test.sap.com',
        auth: { type: 'jwt', jwtToken: 'test-token' },
      },
      metadata: {
        transport: 'stdio',
        requestCount: 0,
        errorCount: 0,
      },
    };

    mockSessionManager = {
      createSession: jest.fn().mockReturnValue(mockSession),
      getSession: jest.fn().mockReturnValue(mockSession),
      deleteSession: jest.fn(),
      setAbapSession: jest.fn(),
      clearAbapSession: jest.fn(),
      on: jest.fn(),
      clearAll: jest.fn(),
      updateConnectionParams: jest.fn(),
    } as any;

    // Mock Connection Provider
    const mockConnectionParams: IConnectionParams = {
      sapUrl: 'https://test.sap.com',
      auth: { type: 'jwt', jwtToken: 'test-token' },
    };

    mockConnectionProvider = {
      mode: 'LOCAL' as const,
      getConnectionParams: jest.fn().mockResolvedValue(mockConnectionParams),
      updateConnectionParams: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock Protocol Handler
    mockProtocolHandler = {
      initialize: jest.fn(),
      handleRequest: jest.fn().mockResolvedValue({ result: 'success' }),
    } as any;

    // Mock Handlers Registry
    mockHandlersRegistry = {
      registerAllTools: jest.fn(),
      registerTool: jest.fn(),
      getRegisteredTools: jest.fn().mockReturnValue(['test-tool']),
    } as any;

    // Mock SDK Server
    mockSdkServer = {} as any;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('constructor', () => {
    it('should initialize with all dependencies', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer,
        mockLogger
      );

      expect(server).toBeDefined();
      expect(mockProtocolHandler.initialize).toHaveBeenCalledWith(mockHandlersRegistry, mockSdkServer);
      expect(mockTransport.on).toHaveBeenCalled();
      expect(mockSessionManager.on).toHaveBeenCalled();
    });

    it('should work without logger', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(server).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start transport', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer,
        mockLogger
      );

      await server.start();

      expect(mockTransport.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting MCP Server v2...');
      expect(mockLogger.info).toHaveBeenCalledWith('MCP Server v2 started successfully');
    });

    it('should throw error if already started', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      await server.start();

      await expect(server.start()).rejects.toThrow('Server is already started');
    });
  });

  describe('stop', () => {
    it('should stop transport and clear sessions', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer,
        mockLogger
      );

      await server.start();
      await server.stop();

      expect(mockTransport.stop).toHaveBeenCalled();
      expect(mockSessionManager.clearAll).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping MCP Server v2...');
    });

    it('should not throw if not started', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      await expect(server.stop()).resolves.not.toThrow();
    });
  });

  describe('validateConfiguration', () => {
    it('should pass validation for LOCAL mode', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(() => server.validateConfiguration()).not.toThrow();
    });

    it('should throw error for LOCAL transport with REMOTE provider', () => {
      const remoteProvider = {
        ...mockConnectionProvider,
        mode: 'REMOTE' as const,
      };

      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        remoteProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(() => server.validateConfiguration()).toThrow('Configuration mismatch');
    });

    it('should throw error for REMOTE transport with LOCAL provider', () => {
      const remoteTransport = {
        ...mockTransport,
        bindAddress: '0.0.0.0',
      };

      const server = new McpServer(
        remoteTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(() => server.validateConfiguration()).toThrow('Configuration mismatch');
    });
  });

  describe('session creation flow', () => {
    it('should create session when transport emits session:created', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer,
        mockLogger
      );

      // Get the session:created handler
      const sessionCreatedCall = mockTransport.on.mock.calls.find(
        (call) => call[0] === 'session:created'
      );
      expect(sessionCreatedCall).toBeDefined();

      const handler = sessionCreatedCall![1];
      const clientInfo: IClientInfo = {
        transport: 'stdio',
      };

      await handler('test-session-id', clientInfo);

      expect(mockSessionManager.createSession).toHaveBeenCalledWith(clientInfo);
      expect(mockConnectionProvider.getConnectionParams).toHaveBeenCalled();
    });
  });

  describe('message handling flow', () => {
    it('should process message and send response', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer,
        mockLogger
      );

      // Get the message handler
      const messageCall = mockTransport.on.mock.calls.find((call) => call[0] === 'message');
      expect(messageCall).toBeDefined();

      const handler = messageCall![1];
      const message: McpMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test-tool', arguments: {} },
      };

      await handler('test-session-id', message);

      expect(mockProtocolHandler.handleRequest).toHaveBeenCalledWith('test-session-id', message);
      expect(mockTransport.send).toHaveBeenCalled();
    });

    it('should handle errors and send error response', async () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer,
        mockLogger
      );

      // Make getSession return undefined to simulate error
      mockSessionManager.getSession = jest.fn().mockReturnValue(undefined);

      // Get the message handler
      const messageCall = (mockTransport.on as jest.Mock).mock.calls.find((call) => call[0] === 'message');
      const handler = messageCall[1];

      const message: McpMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test-tool', arguments: {} },
      };

      await handler('test-session-id', message);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockTransport.send).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({
          error: expect.any(Object),
        })
      );
    });
  });

  describe('getters', () => {
    it('should return SDK server instance', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(server.getSdkServer()).toBe(mockSdkServer);
    });

    it('should return transport instance', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(server.getTransport()).toBe(mockTransport);
    });

    it('should return session manager instance', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(server.getSessionManager()).toBe(mockSessionManager);
    });

    it('should return connection provider instance', () => {
      const server = new McpServer(
        mockTransport,
        mockSessionManager,
        mockConnectionProvider,
        mockProtocolHandler,
        mockHandlersRegistry,
        mockSdkServer
      );

      expect(server.getConnectionProvider()).toBe(mockConnectionProvider);
    });
  });
});
