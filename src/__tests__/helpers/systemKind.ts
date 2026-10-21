/**
 * The system kind is required (never guessed): a stand that builds a
 * connection states its stand-in's kind — on-premise unless the case
 * already stated one (`SAP_SYSTEM_TYPE`). A case about the requirement
 * itself deletes it.
 */
export function stateSystemKind(kind: 'onprem' | 'cloud' = 'onprem'): void {
  if (!process.env.SAP_SYSTEM_TYPE) process.env.SAP_SYSTEM_TYPE = kind;
}
