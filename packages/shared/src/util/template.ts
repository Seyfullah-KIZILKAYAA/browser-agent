/** Variable + secret substitution for workflow strings: {{var}} and {{secret:name}}. */

const VAR_RE = /\{\{\s*([\w.:-]+)\s*\}\}/g;

export interface SubstituteOptions {
  vars: Record<string, string | number | boolean>;
  /** Resolves {{secret:name}} at runtime only; secrets must never enter LLM context or logs. */
  resolveSecret?: (name: string) => string | undefined;
}

/** Replace {{var}} placeholders. Throws when a referenced variable/secret is missing. */
export function substitute(input: string, opts: SubstituteOptions): string {
  return input.replace(VAR_RE, (_m, key: string) => {
    if (key.startsWith("secret:")) {
      const name = key.slice("secret:".length);
      const val = opts.resolveSecret?.(name);
      if (val === undefined) throw new Error(`Secret not found: ${name}`);
      return val;
    }
    const val = opts.vars[key];
    if (val === undefined) throw new Error(`Variable not found: ${key}`);
    return String(val);
  });
}

/** List variable names referenced in a string (secrets excluded). */
export function referencedVars(input: string): string[] {
  const out: string[] = [];
  for (const m of input.matchAll(VAR_RE)) {
    const key = m[1]!;
    if (!key.startsWith("secret:")) out.push(key);
  }
  return out;
}

/** True if the string contains a {{secret:...}} placeholder (value must be redacted in logs). */
export function containsSecret(input: string): boolean {
  for (const m of input.matchAll(VAR_RE)) {
    if (m[1]!.startsWith("secret:")) return true;
  }
  return false;
}
