import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { migrations } from "./migrations.js";
import { migrateDatabase } from "./migration-runner.js";

test("rebuilds preserve linked media and schedule records", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const migration of migrations.slice(0, 27)) db.exec(migration.sql);
    db.exec(`PRAGMA user_version=27; PRAGMA foreign_keys=ON;
      INSERT INTO artist_profiles VALUES ('a','Artist','[]','voice','now','now');
      INSERT INTO projects(id,artist_id,name,created_at,updated_at) VALUES ('p','a','Project','now','now');
      INSERT INTO releases(id,project_id,title,created_at,updated_at) VALUES ('r','p','Release','now','now');
      INSERT INTO campaign_pack_items(id,release_id,kind,language,content,model_name,created_at,updated_at) VALUES ('c','r','caption','en','copy','model','now','now');
      INSERT INTO media_generations(id,release_id,campaign_pack_item_id,provider,media_type,prompt,status,created_at,updated_at) VALUES ('m','r','c','comfyui','image','prompt','ready','now','now');
      INSERT INTO publishing_queue(id,release_id,campaign_pack_item_id,media_generation_id,platform,caption,created_at,updated_at) VALUES ('q','r','c','m','Facebook','caption','now','now');
      INSERT INTO release_plans(id,release_id,title,created_at,updated_at) VALUES ('plan','r','Plan','now','now');
      INSERT INTO campaign_items(id,release_plan_id,title,content_type,created_at,updated_at) VALUES ('item','plan','Item','caption','now','now');
      INSERT INTO promo_generations(id,release_id,release_plan_id,campaign_item_id,content_type,created_at) VALUES ('promo','r','plan','item','caption','now');
      INSERT INTO schedule_events(id,release_id,release_plan_id,campaign_item_id,promo_generation_id,platform,scheduled_at,timezone,created_at,updated_at,publishing_queue_id) VALUES ('s','r','plan','item','promo','Facebook','2026-09-22T12:00:00Z','Europe/Berlin','now','now','q');`);
    migrateDatabase(db);
    assert.equal(db.prepare("SELECT media_generation_id FROM publishing_queue WHERE id='q'").get()?.media_generation_id, 'm');
    assert.equal(db.prepare("SELECT publishing_queue_id FROM schedule_events WHERE id='s'").get()?.publishing_queue_id, 'q');
    assert.equal(db.prepare("SELECT prompt FROM media_generations WHERE id='m'").get()?.prompt, 'prompt');
  } finally { db.close(); }
});

test("verification failure rolls back all migration DDL and version", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const migration of migrations.slice(0,19)) db.exec(migration.sql);
    db.exec("PRAGMA foreign_keys=OFF; PRAGMA user_version=19; INSERT INTO releases(id,project_id,title,created_at,updated_at) VALUES ('bad','missing','Retain','now','now'); PRAGMA foreign_keys=ON");
    assert.throws(() => migrateDatabase(db), /foreign-key verification/);
    assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 19);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='release_plans'").get(), undefined);
    assert.equal(db.prepare("SELECT title FROM releases WHERE id='bad'").get()?.title, 'Retain');
    assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  } finally { db.close(); }
});
