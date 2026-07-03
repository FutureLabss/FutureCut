// ============================================================
// FutureCut — SQLite Database Layer
// ============================================================
// Uses better-sqlite3 for synchronous, fast SQLite access.
// Stores projects, render jobs, and user accounts.
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DB_DIR, "futurecut.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations
  migrate(db);

  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON render_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status);
  `);
}
