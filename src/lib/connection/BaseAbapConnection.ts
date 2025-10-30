import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { Agent } from "https";
import { logger } from "../logger";
import { getTimeout } from "../timeouts";
import { SapConfig } from "../sapConfig";
import { AbapConnection, AbapRequestOptions } from "./AbapConnection";

export abstract class BaseAbapConnection implements AbapConnection {
  private axiosInstance: AxiosInstance | null = null;
  private csrfToken: string | null = null;
  private cookies: string | null = null;
  private cachedBaseUrl: string | null = null;

  protected constructor(private readonly config: SapConfig) {}

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
    const { url, method, timeout, data, params } = options;
    const normalizedMethod = method.toUpperCase();
    const requestUrl = this.normalizeRequestUrl(url);

    if (normalizedMethod === "POST" || normalizedMethod === "PUT") {
      await this.ensureFreshCsrfToken(requestUrl);
    }

    const requestHeaders: Record<string, string> = {
      ...(await this.getAuthHeaders())
    };

    if ((normalizedMethod === "POST" || normalizedMethod === "PUT") && this.csrfToken) {
      requestHeaders["x-csrf-token"] = this.csrfToken;
    }

    if (this.cookies) {
      requestHeaders["Cookie"] = this.cookies;
    }

    if (!requestHeaders["Accept"]) {
      requestHeaders["Accept"] = "application/xml, application/json, text/plain, */*";
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

    logger.info(`Executing ${normalizedMethod} request to: ${requestUrl}`, {
      type: "REQUEST_INFO",
      url: requestUrl,
      method: normalizedMethod
    });

    try {
      const response = await this.getAxiosInstance()(requestConfig);

      logger.info(`Request succeeded with status ${response.status}`, {
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
      }

      logger.error(errorDetails.message, errorDetails);

      if (this.shouldRetryCsrf(error)) {
        logger.csrfToken(
          "retry",
          "CSRF token validation failed, fetching new token and retrying request",
          {
            url: requestUrl,
            method: normalizedMethod
          }
        );

        this.csrfToken = await this.fetchCsrfToken(requestUrl, 5, 2000);
        if (this.csrfToken) {
          requestHeaders["x-csrf-token"] = this.csrfToken;
        }
        if (this.cookies) {
          requestHeaders["Cookie"] = this.cookies;
        }

        return await this.getAxiosInstance()(requestConfig);
      }

      throw error;
    }
  }

  protected abstract buildAuthorizationHeader(): string;

  private getAxiosInstance(): AxiosInstance {
    if (!this.axiosInstance) {
      const rejectUnauthorized =
        process.env.NODE_TLS_REJECT_UNAUTHORIZED === "1" ||
        (process.env.TLS_REJECT_UNAUTHORIZED === "1" &&
          process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0");

      logger.tlsConfig(rejectUnauthorized);

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
    try {
      this.csrfToken = await this.fetchCsrfToken(requestUrl);
    } catch (error) {
      const errorMsg =
        "CSRF token is required for POST/PUT requests but could not be fetched";

      logger.error(errorMsg, {
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

    logger.csrfToken("fetch", `Fetching CSRF token from: ${csrfUrl}`);

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0) {
          logger.csrfToken("retry", `Retry attempt ${attempt}/${retryCount} for CSRF token`);
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

        const token = response.headers["x-csrf-token"] as string | undefined;
        if (!token) {
          logger.csrfToken("error", "No CSRF token in response headers", {
            headers: response.headers,
            status: response.status
          });

          if (attempt < retryCount) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          throw new Error("No CSRF token in response headers");
        }

        if (response.headers["set-cookie"]) {
          this.cookies = (response.headers["set-cookie"] as string[]).join("; ");
          logger.csrfToken("success", "Cookies extracted from response", {
            cookieLength: this.cookies.length
          });
        }

        logger.csrfToken("success", "CSRF token successfully obtained");
        return token;
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.csrfToken("error", `CSRF token error: ${error.message}`, {
            url: csrfUrl,
            status: error.response?.status,
            attempt: attempt + 1,
            maxAttempts: retryCount + 1
          });

          if (error.response?.status === 405 && error.response?.headers["x-csrf-token"]) {
            logger.csrfToken(
              "retry",
              "CSRF: SAP returned 405 (Method Not Allowed) — not critical, token found in header"
            );

            const token = error.response.headers["x-csrf-token"] as string;
            if (token) {
              if (error.response.headers["set-cookie"]) {
                this.cookies = (error.response.headers["set-cookie"] as string[]).join("; ");
              }
              return token;
            }
          }

          if (error.response?.headers["x-csrf-token"]) {
            logger.csrfToken(
              "success",
              `Got CSRF token despite error (status: ${error.response?.status})`
            );

            const token = error.response.headers["x-csrf-token"] as string;
            if (error.response.headers["set-cookie"]) {
              this.cookies = (error.response.headers["set-cookie"] as string[]).join("; ");
            }
            return token;
          }

          if (error.response) {
            logger.csrfToken("error", "CSRF error details", {
              status: error.response.status,
              statusText: error.response.statusText,
              headers: Object.keys(error.response.headers),
              data:
                typeof error.response.data === "string"
                  ? error.response.data.slice(0, 200)
                  : JSON.stringify(error.response.data).slice(0, 200)
            });
          } else if (error.request) {
            logger.csrfToken("error", "CSRF request error - no response received", {
              request: error.request.path
            });
          }
        } else {
          logger.csrfToken("error", "CSRF non-axios error", {
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
