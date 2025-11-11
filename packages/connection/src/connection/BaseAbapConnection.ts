import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { Agent } from "https";
import { ILogger, ISessionStorage, SessionState } from "../logger.js";
import { getTimeout } from "../utils/timeouts.js";
import { SapConfig } from "../config/sapConfig.js";
import { AbapConnection, AbapRequestOptions } from "./AbapConnection.js";

export abstract class BaseAbapConnection implements AbapConnection {
  private axiosInstance: AxiosInstance | null = null;
  private csrfToken: string | null = null;
  private cookies: string | null = null;
  private cookieStore: Map<string, string> = new Map();
  private cachedBaseUrl: string | null = null;
  private sessionId: string | null = null;
  private sessionStorage: ISessionStorage | null = null;
  private sessionMode: "stateless" | "stateful" = "stateless";

  protected constructor(
    private readonly config: SapConfig,
    private readonly logger: ILogger,
    sessionStorage?: ISessionStorage,
    sessionId?: string
  ) {
    this.sessionStorage = sessionStorage || null;
    this.sessionId = sessionId || null;
    this.sessionMode = sessionId && sessionStorage ? "stateful" : "stateless";
  }

  /**
   * Enable stateful session mode with storage
   * @param sessionId - Unique session identifier
   * @param storage - Storage implementation for persisting session state
   */
  async enableStatefulSession(sessionId: string, storage: ISessionStorage): Promise<void> {
    this.sessionId = sessionId;
    this.sessionStorage = storage;
    this.sessionMode = "stateful";

    // Try to load existing session state
    await this.loadSessionState();

    this.logger.info("Stateful session enabled", {
      sessionId,
      hasExistingState: !!this.csrfToken || !!this.cookies
    });
  }

  /**
   * Disable stateful session mode (switch to stateless)
   * Optionally saves current state before switching
   */
  async disableStatefulSession(saveBeforeDisable: boolean = false): Promise<void> {
    if (this.sessionMode === "stateless") {
      return;
    }

    if (saveBeforeDisable && this.sessionId && this.sessionStorage) {
      await this.saveSessionState();
    }

    this.sessionMode = "stateless";
    this.sessionId = null;
    this.sessionStorage = null;

    this.logger.info("Stateful session disabled", {
      savedBeforeDisable: saveBeforeDisable
    });
  }

  /**
   * Get current session mode
   */
  getSessionMode(): "stateless" | "stateful" {
    return this.sessionMode;
  }

  /**
   * Set session ID for stateful operations
   * When session ID is set, session state (cookies, CSRF token) will be persisted
   * @deprecated Use enableStatefulSession() instead
   */
  setSessionId(sessionId: string): void {
    if (this.sessionStorage) {
      this.sessionId = sessionId;
      this.sessionMode = "stateful";
    } else {
      this.logger.warn("Cannot set session ID without session storage. Use enableStatefulSession() instead.");
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set session storage (can be changed at runtime)
   */
  setSessionStorage(storage: ISessionStorage | null): void {
    this.sessionStorage = storage;
    if (storage && this.sessionId) {
      this.sessionMode = "stateful";
    } else if (!storage) {
      this.sessionMode = "stateless";
    }
  }

  /**
   * Get current session storage
   */
  getSessionStorage(): ISessionStorage | null {
    return this.sessionStorage;
  }

  /**
   * Load session state from storage
   */
  async loadSessionState(): Promise<void> {
    if (!this.sessionId || !this.sessionStorage) {
      return;
    }

    try {
      const state = await this.sessionStorage.load(this.sessionId);
      if (state) {
        this.csrfToken = state.csrfToken;
        this.cookies = state.cookies;
        this.cookieStore = new Map(Object.entries(state.cookieStore));
        this.logger.debug("Session state loaded", {
          sessionId: this.sessionId,
          hasCookies: !!this.cookies,
          hasCsrfToken: !!this.csrfToken
        });
      }
    } catch (error) {
      this.logger.warn("Failed to load session state", {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Save session state to storage
   * Only saves if in stateful mode
   */
  async saveSessionState(): Promise<void> {
    if (this.sessionMode !== "stateful" || !this.sessionId || !this.sessionStorage) {
      return;
    }

    try {
      const state: SessionState = {
        cookies: this.cookies,
        csrfToken: this.csrfToken,
        cookieStore: Object.fromEntries(this.cookieStore)
      };
      await this.sessionStorage.save(this.sessionId, state);
      this.logger.debug("Session state saved", {
        sessionId: this.sessionId,
        hasCookies: !!this.cookies,
        hasCsrfToken: !!this.csrfToken
      });
    } catch (error) {
      this.logger.warn("Failed to save session state", {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clear session state from storage
   */
  async clearSessionState(): Promise<void> {
    if (!this.sessionId || !this.sessionStorage) {
      return;
    }

    try {
      await this.sessionStorage.delete(this.sessionId);
      this.logger.debug("Session state cleared", {
        sessionId: this.sessionId
      });
    } catch (error) {
      this.logger.warn("Failed to clear session state", {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  getConfig(): SapConfig {
    return this.config;
  }

  reset(): void {
    if (this.axiosInstance) {
      this.axiosInstance.interceptors.request.clear();
      this.axiosInstance.interceptors.response.clear();
      this.axiosInstance = null;
    }
    this.csrfToken = null;
    this.cookies = null;
    this.cookieStore.clear();
    this.cachedBaseUrl = null;
  }

  async getBaseUrl(): Promise<string> {
    if (this.cachedBaseUrl) {
      return this.cachedBaseUrl;
    }

    const { url } = this.config;
    try {
      const urlObj = new URL(url);
      this.cachedBaseUrl = urlObj.origin;
      return this.cachedBaseUrl;
    } catch (error) {
      const errorMessage = `Invalid URL in configuration: ${
        error instanceof Error ? error.message : error
      }`;
      throw new Error(errorMessage);
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (this.config.client) {
      headers["X-SAP-Client"] = this.config.client;
    }

    const authorization = this.buildAuthorizationHeader();
    if (authorization) {
      headers["Authorization"] = authorization;
    }

    return headers;
  }

  async makeAdtRequest(options: AbapRequestOptions): Promise<AxiosResponse> {
    const { url, method, timeout, data, params, headers: customHeaders } = options;
    const normalizedMethod = method.toUpperCase();
    const requestUrl = this.normalizeRequestUrl(url);

    if (normalizedMethod === "POST" || normalizedMethod === "PUT" || normalizedMethod === "DELETE") {
      await this.ensureFreshCsrfToken(requestUrl);
    }

    // Start with default Accept header
    const requestHeaders: Record<string, string> = {};
    if (!customHeaders || !customHeaders["Accept"]) {
      requestHeaders["Accept"] = "application/xml, application/json, text/plain, */*";
    }

    // Add custom headers (but they won't override auth/cookies)
    if (customHeaders) {
      Object.assign(requestHeaders, customHeaders);
    }

    // Add auth headers (these MUST NOT be overridden)
    Object.assign(requestHeaders, await this.getAuthHeaders());

    if ((normalizedMethod === "POST" || normalizedMethod === "PUT" || normalizedMethod === "DELETE") && this.csrfToken) {
      requestHeaders["x-csrf-token"] = this.csrfToken;
    }

    // Add cookies LAST (MUST NOT be overridden by custom headers)
    if (this.cookies) {
      requestHeaders["Cookie"] = this.cookies;
      console.log(`[DEBUG] BaseAbapConnection - Adding cookies to request (first 100 chars): ${this.cookies.substring(0, 100)}...`);
    } else {
      console.log(`[DEBUG] BaseAbapConnection - NO COOKIES available for this request to ${requestUrl}`);
    }

    if ((normalizedMethod === "POST" || normalizedMethod === "PUT") && data) {
      if (typeof data === "string" && !requestHeaders["Content-Type"]) {
        if (requestUrl.includes("/usageReferences") && data.includes("usageReferenceRequest")) {
          requestHeaders["Content-Type"] = "application/vnd.sap.adt.repository.usagereferences.request.v1+xml";
          requestHeaders["Accept"] = "application/vnd.sap.adt.repository.usagereferences.result.v1+xml";
        } else {
          requestHeaders["Content-Type"] = "text/plain; charset=utf-8";
        }
      }
    }

    const requestConfig: AxiosRequestConfig = {
      method: normalizedMethod,
      url: requestUrl,
      headers: requestHeaders,
      timeout,
      params
    };

    if (data !== undefined) {
      requestConfig.data = data;
    }

    this.logger.info(`Executing ${normalizedMethod} request to: ${requestUrl}`, {
      type: "REQUEST_INFO",
      url: requestUrl,
      method: normalizedMethod
    });

    try {
      const response = await this.getAxiosInstance()(requestConfig);
      this.updateCookiesFromResponse(response.headers);

      // Save session state after successful request (if session storage is configured)
      await this.saveSessionState();

      this.logger.info(`Request succeeded with status ${response.status}`, {
        type: "REQUEST_SUCCESS",
        status: response.status,
        url: requestUrl,
        method: normalizedMethod
      });

      return response;
    } catch (error) {
      const errorDetails: {
        type: string;
        message: string;
        url: string;
        method: string;
        status?: number;
        data?: string;
      } = {
        type: "REQUEST_ERROR",
        message: error instanceof Error ? error.message : String(error),
        url: requestUrl,
        method: normalizedMethod,
        status: error instanceof AxiosError ? error.response?.status : undefined,
        data: undefined
      };

      if (error instanceof AxiosError && error.response) {
        errorDetails.data =
          typeof error.response.data === "string"
            ? error.response.data.slice(0, 200)
            : JSON.stringify(error.response.data).slice(0, 200);

        this.updateCookiesFromResponse(error.response.headers);
      }

      // Save session state even on error (cookies might have been updated)
      await this.saveSessionState();

      this.logger.error(errorDetails.message, errorDetails);

      if (this.shouldRetryCsrf(error)) {
        if (this.logger.csrfToken) {
          this.logger.csrfToken(
            "retry",
            "CSRF token validation failed, fetching new token and retrying request",
            {
              url: requestUrl,
              method: normalizedMethod
            }
          );
        }

        this.csrfToken = await this.fetchCsrfToken(requestUrl, 5, 2000);
        if (this.csrfToken) {
          requestHeaders["x-csrf-token"] = this.csrfToken;
        }
        if (this.cookies) {
          requestHeaders["Cookie"] = this.cookies;
        }

        const retryResponse = await this.getAxiosInstance()(requestConfig);
        this.updateCookiesFromResponse(retryResponse.headers);

        // Save session state after retry
        await this.saveSessionState();

        return retryResponse;
      }

      throw error;
    }
  }

  protected abstract buildAuthorizationHeader(): string;

  private updateCookiesFromResponse(headers?: Record<string, any>): void {
    if (!headers) {
      return;
    }

    const setCookie = headers["set-cookie"] as string[] | string | undefined;
    if (!setCookie) {
      return;
    }

    const cookiesArray = Array.isArray(setCookie) ? setCookie : [setCookie];

    for (const entry of cookiesArray) {
      if (typeof entry !== "string") {
        continue;
      }

      const [nameValue] = entry.split(";");
      if (!nameValue) {
        continue;
      }

      const [name, ...rest] = nameValue.split("=");
      if (!name) {
        continue;
      }

      const trimmedName = name.trim();
      const trimmedValue = rest.join("=").trim();

      if (!trimmedName) {
        continue;
      }

      this.cookieStore.set(trimmedName, trimmedValue);
    }

    if (this.cookieStore.size === 0) {
      return;
    }

    const combined = Array.from(this.cookieStore.entries())
      .map(([name, value]) => (value ? `${name}=${value}` : name))
      .join("; ");

    if (!combined) {
      return;
    }

    this.cookies = combined;
    console.log(
      `[DEBUG] BaseAbapConnection - Updated cookies from response (first 100 chars): ${this.cookies.substring(0, 100)}...`
    );
  }

  private getAxiosInstance(): AxiosInstance {
    if (!this.axiosInstance) {
      const rejectUnauthorized =
        process.env.NODE_TLS_REJECT_UNAUTHORIZED === "1" ||
        (process.env.TLS_REJECT_UNAUTHORIZED === "1" &&
          process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0");

      if (this.logger.tlsConfig) {
        this.logger.tlsConfig(rejectUnauthorized);
      }

      this.axiosInstance = axios.create({
        httpsAgent: new Agent({
          rejectUnauthorized
        })
      });
    }

    return this.axiosInstance;
  }

  private normalizeRequestUrl(url: string): string {
    if (!url.includes("/sap/bc/adt/") && !url.endsWith("/sap/bc/adt")) {
      return url.endsWith("/") ? `${url}sap/bc/adt` : `${url}/sap/bc/adt`;
    }
    return url;
  }

  private async ensureFreshCsrfToken(requestUrl: string): Promise<void> {
    // If we already have a CSRF token, reuse it to keep the same SAP session
    // SAP ties the lock handle to the HTTP session (SAP_SESSIONID cookie)
    if (this.csrfToken) {
      console.log(`[DEBUG] BaseAbapConnection - Reusing existing CSRF token to maintain session`);
      return;
    }

    try {
      console.log(`[DEBUG] BaseAbapConnection - Fetching NEW CSRF token (will create new SAP session)`);
      this.csrfToken = await this.fetchCsrfToken(requestUrl);
    } catch (error) {
      const errorMsg =
        "CSRF token is required for POST/PUT requests but could not be fetched";

      this.logger.error(errorMsg, {
        type: "CSRF_FETCH_ERROR",
        cause: error instanceof Error ? error.message : String(error)
      });

      throw new Error(errorMsg);
    }
  }

  private async fetchCsrfToken(url: string, retryCount = 3, retryDelay = 1000): Promise<string> {
    let csrfUrl = url;
    if (!url.includes("/sap/bc/adt/")) {
      csrfUrl = url.endsWith("/") ? `${url}sap/bc/adt/discovery` : `${url}/sap/bc/adt/discovery`;
    } else if (!url.includes("/sap/bc/adt/discovery")) {
      const base = url.split("/sap/bc/adt")[0];
      csrfUrl = `${base}/sap/bc/adt/discovery`;
    }

    if (this.logger.csrfToken) {
      this.logger.csrfToken("fetch", `Fetching CSRF token from: ${csrfUrl}`);
    }

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0 && this.logger.csrfToken) {
          this.logger.csrfToken("retry", `Retry attempt ${attempt}/${retryCount} for CSRF token`);
        }

        const response = await this.getAxiosInstance()({
          method: "GET",
          url: csrfUrl,
          headers: {
            ...(await this.getAuthHeaders()),
            "x-csrf-token": "fetch",
            Accept: "application/atomsvc+xml"
          },
          timeout: getTimeout("csrf")
        });

        this.updateCookiesFromResponse(response.headers);

        const token = response.headers["x-csrf-token"] as string | undefined;
        if (!token) {
          if (this.logger.csrfToken) {
            this.logger.csrfToken("error", "No CSRF token in response headers", {
              headers: response.headers,
              status: response.status
            });
          }

          if (attempt < retryCount) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          throw new Error("No CSRF token in response headers");
        }

        if (response.headers["set-cookie"]) {
          this.updateCookiesFromResponse(response.headers);
          if (this.cookies) {
            console.log(`[DEBUG] BaseAbapConnection - Cookies received from CSRF response (first 100 chars): ${this.cookies.substring(0, 100)}...`);
            if (this.logger.csrfToken) {
              this.logger.csrfToken("success", "Cookies extracted from response", {
                cookieLength: this.cookies.length
              });
            }
          }
        }

        // Save session state after CSRF token fetch (cookies and token are now available)
        await this.saveSessionState();

        if (this.logger.csrfToken) {
          this.logger.csrfToken("success", "CSRF token successfully obtained");
        }
        return token;
      } catch (error) {
        if (error instanceof AxiosError) {
          if (this.logger.csrfToken) {
            this.logger.csrfToken("error", `CSRF token error: ${error.message}`, {
              url: csrfUrl,
              status: error.response?.status,
              attempt: attempt + 1,
              maxAttempts: retryCount + 1
            });
          }

          if (error.response?.status === 405 && error.response?.headers["x-csrf-token"]) {
            if (this.logger.csrfToken) {
              this.logger.csrfToken(
                "retry",
                "CSRF: SAP returned 405 (Method Not Allowed) — not critical, token found in header"
              );
            }

            const token = error.response.headers["x-csrf-token"] as string;
            if (token) {
              this.updateCookiesFromResponse(error.response.headers);
              return token;
            }
          }

          if (error.response?.headers["x-csrf-token"]) {
            if (this.logger.csrfToken) {
              this.logger.csrfToken(
                "success",
                `Got CSRF token despite error (status: ${error.response?.status})`
              );
            }

            const token = error.response.headers["x-csrf-token"] as string;
            this.updateCookiesFromResponse(error.response.headers);
            return token;
          }

          if (error.response && this.logger.csrfToken) {
            this.logger.csrfToken("error", "CSRF error details", {
              status: error.response.status,
              statusText: error.response.statusText,
              headers: Object.keys(error.response.headers),
              data:
                typeof error.response.data === "string"
                  ? error.response.data.slice(0, 200)
                  : JSON.stringify(error.response.data).slice(0, 200)
            });
          } else if (error.request && this.logger.csrfToken) {
            this.logger.csrfToken("error", "CSRF request error - no response received", {
              request: error.request.path
            });
          }
        } else if (this.logger.csrfToken) {
          this.logger.csrfToken("error", "CSRF non-axios error", {
            error: error instanceof Error ? error.message : String(error)
          });
        }

        if (attempt < retryCount) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        throw new Error(
          `Failed to fetch CSRF token after ${retryCount + 1} attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    throw new Error("CSRF token fetch failed unexpectedly");
  }

  private shouldRetryCsrf(error: unknown): boolean {
    if (!(error instanceof AxiosError)) {
      return false;
    }

    const responseData = error.response?.data;
    const responseText = typeof responseData === "string" ? responseData : JSON.stringify(responseData || "");

    return (
      (!!error.response && error.response.status === 403 && responseText.includes("CSRF")) ||
      responseText.includes("CSRF token")
    );
  }
}

