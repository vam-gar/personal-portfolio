// Loads .env.local into process.env for scripts run outside Next.js.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");

export function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
