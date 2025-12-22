import type { NextFunction, Request, Response } from 'express';

/**
 * Handler function type for HTTP routes
 */
export type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>;

/**
 * Interface for Express-like HTTP application
 * Allows injection of external HTTP server into v2 MCP servers
 *
 * This enables integration with existing Express/CDS/CAP servers
 * without creating a separate HTTP server instance
 */
export interface IHttpApplication {
  /**
   * Register GET route handler
   */
  get(path: string, handler: RouteHandler): void;

  /**
   * Register POST route handler
   */
  post(path: string, handler: RouteHandler): void;

  /**
   * Register handler for all HTTP methods
   */
  all(path: string, handler: RouteHandler): void;

  /**
   * Register middleware (optional - not all apps support this)
   */
  use?(path: string | RouteHandler, handler?: RouteHandler): void;
}

/**
 * Options for route registration on external app
 */
export interface RouteRegistrationOptions {
  /**
   * Whether to add express.json() middleware for the routes
   * Set to false if the external app already has JSON parsing middleware
   * @default true for standalone, false for external app
   */
  addJsonMiddleware?: boolean;
}
