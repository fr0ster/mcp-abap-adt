// A failure slot whose declaration writes its type: the instantiation that
// builds it is the declaration's, charged once there.
export class Watch {
  private readonly thrown: Set<unknown> = new Set();

  saw(error: Error): boolean {
    this.thrown.add(error);
    return this.thrown.has(error);
  }
}
