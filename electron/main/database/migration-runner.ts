import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations.js";

function schema(database: DatabaseSync): string {
  return JSON.stringify(database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all().map(row => ({ ...row, sql: String(row.sql).replace(/\s+/g, " ").trim() })));
}

/** Recognize only schemas produced by our migration history; unknown damage fails closed. */
export function migrateDatabase(database: DatabaseSync): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error("Migration sequence must be uninterrupted");
  });
  const reference = new DatabaseSync(":memory:");
  const expected = new Map<number, string>([[0, schema(reference)]]);
  let brokenWithKling = "";
  try {
    for (const migration of migrations) {
      reference.exec(migration.sql);
      expected.set(migration.version, schema(reference));
      if (migration.version === 19) {
        reference.exec("SAVEPOINT broken_v30");
        reference.exec(migrations[29].sql);
        brokenWithKling = schema(reference);
        reference.exec("ROLLBACK TO broken_v30; RELEASE broken_v30");
      }
    }
  } finally { reference.close(); }

  const foreignKeys = Number(database.prepare("PRAGMA foreign_keys").get()?.foreign_keys ?? 0);
  // Table rebuilds must not execute ON DELETE cascades against linked queue rows.
  database.exec("PRAGMA foreign_keys = OFF");
  let transaction = false;
  try {
    database.exec("BEGIN IMMEDIATE");
    transaction = true;
    const version = Number(database.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const actual = schema(database);
    const latest = migrations.length;
    let start = version;
    let skipKling = false;
    if (version === 30 && (actual === expected.get(19) || actual === brokenWithKling)) {
      start = 19;
      skipKling = actual === brokenWithKling;
    } else if (actual !== expected.get(version)) {
      throw new Error(`Unrecognized database schema at version ${version}; no changes applied. Restore or inspect a backup before proceeding.`);
    }
    for (const migration of migrations.filter(item => item.version > start)) {
      if (!(skipKling && migration.version === 30)) database.exec(migration.sql);
    }
    if (schema(database) !== expected.get(latest)) throw new Error("Migrated schema does not match the canonical schema");
    if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Migration foreign-key verification failed");
    if (database.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Migration integrity verification failed");
    database.exec(`PRAGMA user_version = ${latest}`);
    database.exec("COMMIT");
    transaction = false;
  } catch (error) {
    if (transaction) database.exec("ROLLBACK");
    throw error;
  } finally { database.exec(`PRAGMA foreign_keys = ${foreignKeys}`); }
}
