import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { migrations } from "./migrations.js";
import { migrateDatabase } from "./migration-runner.js";

function fixture(version: number, check: (db: DatabaseSync, file: string) => void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "migration-audit-"));
  const file = path.join(dir, "test.sqlite");
  const db = new DatabaseSync(file);
  try {
    for (const migration of migrations.slice(0, version)) db.exec(migration.sql);
    db.exec(`PRAGMA user_version = ${version}; PRAGMA foreign_keys = ON`);
    check(db, file);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
}

for (const version of [0, ...Array.from({length: 13}, (_, i) => i + 19)]) {
  test(`migration ${version} -> latest and idempotent reopen`, () => fixture(version, (db, file) => {
    migrateDatabase(db);
    assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 32);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='post_publish_analytics'").get());
    assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    const reopened = new DatabaseSync(file);
    try { migrateDatabase(reopened); assert.deepEqual(reopened.prepare("PRAGMA foreign_key_check").all(), []); }
    finally { reopened.close(); }
  }));
}

for (const kling of [false, true]) {
  test(`repair false v30, Kling already applied=${kling}`, () => fixture(19, db => {
    if (kling) db.exec(migrations[29].sql);
    db.exec("PRAGMA user_version = 30");
    migrateDatabase(db);
    assert.ok(db.prepare("SELECT revision_number FROM release_plans").all());
    assert.ok(db.prepare("SELECT publishing_queue_id FROM schedule_events").all());
    migrateDatabase(db);
  }));
}

test("unknown partial schema fails closed without changing version or data", () => fixture(19, db => {
  db.exec("CREATE TABLE release_plans (id TEXT); INSERT INTO release_plans VALUES ('preserve'); PRAGMA user_version=30");
  assert.throws(() => migrateDatabase(db), /Unrecognized database schema/);
  assert.equal(db.prepare("SELECT id FROM release_plans").get()?.id, "preserve");
  assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 30);
  assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
}));

test("non-contiguous migration list rejected before writes", () => fixture(19, db => {
  const migration = migrations[20];
  const original = migration.version;
  try { migration.version = 99; assert.throws(() => migrateDatabase(db), /uninterrupted/); }
  finally { migration.version = original; }
  assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 19);
}));
