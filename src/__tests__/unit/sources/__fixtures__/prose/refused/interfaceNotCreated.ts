// Refused (search ×2): the old `isInterfaceNotCreated` — an error's message,
// the parameter's anonymous type naming the field, searched for words.
export function isInterfaceNotCreated(error: { message?: string }): boolean {
  const message = error?.message ?? '';
  return (
    message.includes('Interface SAPL') &&
    message.includes('has not been created')
  );
}
