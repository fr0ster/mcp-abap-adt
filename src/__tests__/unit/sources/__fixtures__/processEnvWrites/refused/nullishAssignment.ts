export function fill(): void {
  process.env.SAP_SYSTEM_TYPE ??= 'onprem';
}
