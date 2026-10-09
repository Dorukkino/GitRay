/**
 * Server-side error logging that never leaks secrets. Database drivers put the
 * whole connection string (password included) into some error messages.
 */

const CONNECTION_STRING = /\b(?:postgres(?:ql)?|https?):\/\/[^\s'"]*@[^\s'"]*/gi;
const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g;

export function redact(message: string): string {
  return message.replace(CONNECTION_STRING, "[redacted connection string]").replace(TOKEN, "[redacted token]");
}

export function logError(context: string, e: unknown): void {
  const name = e instanceof Error ? e.name : typeof e;
  const code = typeof e === "object" && e !== null && "code" in e ? ` ${String((e as { code: unknown }).code)}` : "";
  const message = e instanceof Error ? e.message : String(e);
  console.error(`${context}: ${name}${code}: ${redact(message).slice(0, 500)}`);
}
