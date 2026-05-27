// Persona loader. Single source of truth is personas.json, extracted from the frontend
// roster (src/TalentCore_v2.jsx INIT_EMPLOYEES). Read-only input to a run.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS = JSON.parse(
  readFileSync(path.join(__dirname, "personas.json"), "utf8"),
);

const byId = new Map(PERSONAS.map((p) => [p.id, p]));

/** Return the persona record for an id, or undefined if unknown. */
export function getPersona(id) {
  return byId.get(id);
}

/** All personas (e.g. for listing in a UI). */
export function listPersonas() {
  return PERSONAS.slice();
}
