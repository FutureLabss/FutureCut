// ============================================================
// FutureCut — Database Layer (PostgreSQL + SQLite Dual-Driver)
// ============================================================
// Dynamically routes queries to Supabase (PostgreSQL) if
// DATABASE_URL is defined, or falls back to local SQLite otherwise.
// ============================================================

import Database from "better-sqlite3";
import { Pool } from "pg";
import path from "path";
import fs from "fs";

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let pgInitialized = false;

const isPostgres = !!process.env.DATABASE_URL;

function getSqliteDb(): Database.Database {
  if (sqliteDb) return sqliteDb;

  const DB_DIR = path.join(process.cwd(), ".data");
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  sqliteDb = new Database(path.join(DB_DIR, "futurecut.db"));
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");

  // Run SQLite migrations
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Untitled Project',
      project_data TEXT NOT NULL DEFAULT '{}',
      thumbnail_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      output_url TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      clip_id TEXT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      input_data TEXT,
      output_data TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON render_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_project ON ai_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
  `);

  return sqliteDb;
}

function getPgPool(): Pool {
  if (pgPool) return pgPool;

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Required for Neon/Supabase TLS
    },
  });

  return pgPool;
}

async function initializePg() {
  if (pgInitialized) return;
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Untitled Project',
      project_data TEXT NOT NULL DEFAULT '{}',
      thumbnail_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      output_url TEXT,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      clip_id TEXT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      input_data TEXT,
      output_data TEXT,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON render_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_project ON ai_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
  `);
  pgInitialized = true;
}

// Convert standard "?" parameters to PostgreSQL style "$1, $2" parameters
function translateSql(sql: string): string {
  let counter = 1;
  return sql.replace(/\?/g, () => `$${counter++}`);
}

/**
 * Execute a query that returns a single row.
 */
export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (isPostgres) {
    await initializePg();
    const pool = getPgPool();
    const res = await pool.query(translateSql(sql), params);
    return res.rows[0];
  } else {
    const db = getSqliteDb();
    return db.prepare(sql).get(...params) as T | undefined;
  }
}

/**
 * Execute a query that returns multiple rows.
 */
export async function queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isPostgres) {
    await initializePg();
    const pool = getPgPool();
    const res = await pool.query(translateSql(sql), params);
    return res.rows;
  } else {
    const db = getSqliteDb();
    return db.prepare(sql).all(...params) as T[];
  }
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE).
 */
export async function execute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  if (isPostgres) {
    await initializePg();
    const pool = getPgPool();
    const res = await pool.query(translateSql(sql), params);
    return { changes: res.rowCount ?? 0 };
  } else {
    const db = getSqliteDb();
    const res = db.prepare(sql).run(...params);
    return { changes: res.changes };
  }
}
