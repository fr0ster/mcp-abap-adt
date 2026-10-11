import { Refused } from '../clean/reexport';

export const isRefused = (x: unknown) => x instanceof Refused;
