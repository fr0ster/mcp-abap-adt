export function drop(): void {
  delete process.env.SAP_SYSTEM_TYPE;
}
