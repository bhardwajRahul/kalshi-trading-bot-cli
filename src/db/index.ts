import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { migrate } from './schema.js';
import { appPath } from '../utils/paths.js';
import { prefetchOctagonEvents } from '../scan/octagon-prefetch.js';
import { logger } from '../utils/logger.js';

let _db: Database | null = null;

const DEFAULT_DB_PATH = appPath('kalshi-bot.db');

/**
 * Get the database singleton. Lazy-initializes on first call.
 * Pass a custom path for testing (e.g. ":memory:").
 */
export function getDb(path?: string): Database {
  if (_db) return _db;

  const dbPath = path ?? DEFAULT_DB_PATH;

  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  _db = new Database(dbPath);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  migrate(_db);

  // Fire-and-forget: prefetch Octagon events in background
  const db = _db;
  prefetchOctagonEvents(db).catch((err) => {
    logger.warn(`[octagon-prefetch] ${err instanceof Error ? err.message : err}`);
  });

  return _db;
}

/**
 * Close the database singleton and release the file descriptor.
 * Safe to call even if no DB is open.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Create a fresh database instance (not the singleton).
 * Useful for tests with :memory: databases.
 */
export function createDb(path: string): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}
