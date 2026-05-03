export function log(scope: string, message: string): void {
  const ts = new Date().toISOString();
  console.log(`${ts} [${scope}] ${message}`);
}

export function error(scope: string, message: string, err?: unknown): void {
  const ts = new Date().toISOString();
  console.error(`${ts} [${scope}] ${message}`, err ?? "");
}
