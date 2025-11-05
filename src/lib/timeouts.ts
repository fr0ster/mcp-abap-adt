export interface TimeoutConfig {
  default: number;
  csrf: number;
  long: number;
}

export function getTimeoutConfig(): TimeoutConfig {
  const defaultTimeout = parseInt(process.env.SAP_TIMEOUT_DEFAULT || "45000", 10);
  const csrfTimeout = parseInt(process.env.SAP_TIMEOUT_CSRF || "15000", 10);
  const longTimeout = parseInt(process.env.SAP_TIMEOUT_LONG || "60000", 10);

  return {
    default: defaultTimeout,
    csrf: csrfTimeout,
    long: longTimeout
  };
}

export function getTimeout(type: "default" | "csrf" | "long" | number = "default"): number {
  if (typeof type === "number") {
    return type;
  }

  const config = getTimeoutConfig();
  return config[type];
}
