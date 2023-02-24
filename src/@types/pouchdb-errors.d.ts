// types for "pouchdb-errors" compare with definition in "node_module/pouchdb-errors/lib/index.js" for correctness
declare class PouchError extends Error {
  status: number;
  error: boolean;
  reason: unknown;

  constructor(status: number, error: string, reason: string) {
    super();
    this.status = status;
    this.name = error;
    this.message = reason;
    this.error = true;
  }

  toString() {
    return JSON.stringify({
      status: this.status,
      name: this.name,
      message: this.message,
      reason: this.reason,
    });
  }
}

// This is a type declaration for the "NOT_OPEN" variable exported by "pouchdb-errors"
export const NOT_OPEN = new PouchError(412, 'precondition_failed', 'Database not open');
