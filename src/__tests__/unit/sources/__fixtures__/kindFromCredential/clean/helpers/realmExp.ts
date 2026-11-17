// Clean as a test helper (outside the decoding ban, inside the kind check):
// the realm check's `exp` read decodes the session's token and produces no
// kind. The same file as production is refused (`decode`).
export function tokenExp(): unknown {
  const token = process.env.SAP_JWT_TOKEN ?? '';
  const payload = token.split('.')[1] ?? '';
  const claims: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  );
  return typeof claims === 'object' && claims !== null && 'exp' in claims
    ? claims.exp
    : undefined;
}
