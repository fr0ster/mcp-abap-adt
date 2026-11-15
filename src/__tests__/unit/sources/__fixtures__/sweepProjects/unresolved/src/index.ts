// A sibling imported through `paths` whose declarations were never built:
// unresolved, its type is the error type, which reads as `any`.
import { answer } from '@sibling/unbuilt';

export const kept: string = answer.text;
