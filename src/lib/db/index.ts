import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.NEON_DB_URL;
    if (!url) {
      throw new Error('NEON_DB_URL environment variable is not set');
    }
    const sql = neon(url);
    _db = drizzle({ client: sql, schema });
  }
  return _db;
}

// Proxy that lazily initializes on first property access — keeps existing
// `import { db }` usage working everywhere without code changes.
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
