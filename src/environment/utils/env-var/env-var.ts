/**
 * Minimal subset of the `env-var` package API (`get('X').default('1').asIntPositive()`),
 * so the factories read like the ones in other projects. Empty strings count as unset.
 * Can be replaced with `import { get } from 'env-var'` without touching the factories.
 */
class EnvVar {
  private fallback: string | undefined;
  private isRequired = false;

  constructor(
    private readonly name: string,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  default(value: string): this {
    this.fallback = value;
    return this;
  }

  required(isRequired = true): this {
    this.isRequired = isRequired;
    return this;
  }

  asString(): string | undefined {
    return this.raw();
  }

  asIntPositive(): number | undefined {
    return this.parse((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw this.error(v, 'a positive integer');
      return n;
    });
  }

  asPortNumber(): number | undefined {
    return this.parse((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw this.error(v, 'a port number');
      return n;
    });
  }

  asBoolStrict(): boolean | undefined {
    return this.parse((v) => {
      if (v.toLowerCase() === 'true') return true;
      if (v.toLowerCase() === 'false') return false;
      throw this.error(v, '"true" or "false"');
    });
  }

  asArray(delimiter = ','): string[] | undefined {
    return this.parse((v) => v.split(delimiter).map((s) => s.trim()).filter(Boolean));
  }

  asEnum<T extends string>(values: readonly T[]): T | undefined {
    return this.parse((v) => {
      if (!values.includes(v as T)) throw this.error(v, `one of ${values.join(', ')}`);
      return v as T;
    });
  }

  private raw(): string | undefined {
    const value = this.env[this.name]?.trim();
    const result = value ? value : this.fallback;
    if (result === undefined && this.isRequired) throw new Error(`Env ${this.name} is required`);
    return result;
  }

  private parse<T>(fn: (value: string) => T): T | undefined {
    const value = this.raw();
    return value === undefined ? undefined : fn(value);
  }

  private error(value: string, expected: string): Error {
    return new Error(`Env ${this.name} must be ${expected}, got "${value}"`);
  }
}

export function get(name: string, env: NodeJS.ProcessEnv = process.env): EnvVar {
  return new EnvVar(name, env);
}
