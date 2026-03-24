import { initializeDatabase } from "./db";

let initialized = false;

export async function ensureDbInitialized() {
  if (!initialized) {
    await initializeDatabase();
    initialized = true;
  }
}
