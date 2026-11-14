// Refused (argument, kind): the login stand's old expression — `auth` is
// recognised by its declared type, a union of the auth-type literals.
declare function stateSystemKind(kind: 'cloud' | 'onprem'): void;

export interface StandOptions {
  auth?: 'basic' | 'jwt';
}

export function stand(options: StandOptions): void {
  stateSystemKind(options.auth === 'jwt' ? 'cloud' : 'onprem');
}
