import { AxiosResponse } from "axios";
import { SapConfig } from "../sapConfig";

export interface AbapRequestOptions {
  url: string;
  method: string;
  timeout: number;
  data?: any;
  params?: any;
  headers?: Record<string, string>;
}

export interface AbapConnection {
  getConfig(): SapConfig;
  getBaseUrl(): Promise<string>;
  getAuthHeaders(): Promise<Record<string, string>>;
  makeAdtRequest(options: AbapRequestOptions): Promise<AxiosResponse>;
  reset(): void;
}
