// @flow

declare class describe {
  static(description: string, spec: () => void): void;

  static only(description: string, spec: () => void): void;
  static skip(description: string, spec: () => void): void;
}

declare class context {
  static(description: string, spec: () => void): void;

  static only(description: string, spec: () => void): void;
  static skip(description: string, spec: () => void): void;
}

declare class it {
  static(description: string, spec: () => void | Promise<*>): void;

  static only(description: string, spec: () => void | Promise<*>): void;
  static skip(description: string, spec: () => void | Promise<*>): void;
}

declare class xit {
  static(description: string, spec: () => void | Promise<*>): void;

  static only(description: string, spec: () => void | Promise<*>): void;
  static skip(description: string, spec: () => void | Promise<*>): void;
}

declare class specify {
  static(description: string, spec: () => void | Promise<*>): void;
}

declare class before {
  static(spec: () => void | Promise<*>): void;
}

declare class after {
  static(spec: () => void | Promise<*>): void;
}

declare class beforeEach {
  static(spec: () => void | Promise<*>): void;
}

declare class afterEach {
  static(spec: () => void | Promise<*>): void;
}
