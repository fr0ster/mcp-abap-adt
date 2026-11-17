export function read(): string | undefined {
  const copy: Record<string, string | undefined> = { ...process.env };
  copy.A = '1';
  return process.env.SAP_SYSTEM_TYPE ?? copy.A;
}
