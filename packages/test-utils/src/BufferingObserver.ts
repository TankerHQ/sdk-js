export class BufferingObserver {
  _inputWritten: number = 0;
  _outputWritten: number = 0;
  _snapshots: Array<number> = [];

  incrementInput(quantity: number) {
    this._inputWritten += quantity;
  }

  incrementOutput(quantity: number) {
    this._outputWritten += quantity;
  }

  snapshot() {
    this._snapshots.push(this._inputWritten - this._outputWritten);
  }

  incrementOutputAndSnapshot(quantity: number) {
    this.incrementOutput(quantity);
    this.snapshot();
  }

  get snapshots(): Array<number> {
    return this._snapshots;
  }

  get inputWritten(): number {
    return this._inputWritten;
  }

  get outputWritten(): number {
    return this._outputWritten;
  }
}
