# Consolidation migration preparation

Base: origin/main 3adeb11684f24ac8af41219ba143d6ecf7f152c0 (fetched 2026-09-22).
No product integration commits are included. Migration SQL 20-30 is preserved
from local main 96ada69; migrations 1-19 are unchanged.

| Version | Schema change |
| --- | --- |
| 20 | release_plans, campaign_items, approval_records and indexes |
| 21 | revision_number, previous_plan_id and revision indexes |
| 22 | promo_generations with unique campaign-item association |
| 23 | promo review status, original/edited text, actor/reason/time |
| 24 | schedule_events, explicit timezone, unique content/platform/time |
| 25 | schedule-to-queue linkage, queued_at/by, unique queue index |
| 26 | queue review actor/time/reason and index |
| 27 | artist_promotion_profiles |
| 28 | queue rebuild adding publishing status, preserving review fields |
| 29 | post_publish_analytics and lookup indexes |
| 30 | media table rebuild permitting kling-cli provider |

## Recovery and safety

The runner validates a contiguous sequence and builds canonical schemas in an
isolated in-memory database. It compares actual sqlite_master definitions with
the claimed version, including tables, indexes, constraints and foreign keys.
Whitespace is normalized; unknown schema changes (including custom indexes)
fail closed instead of attempting destructive best-effort repair.

Only two known false-v30 cases are auto-repaired: exact v19 schema, and exact
v19 plus migration 30. Apply 20-30 in the first case, or 20-29 in the second.
No version downgrade or partial repair is committed. All DDL, data copies and
the final version update share one transaction. Foreign-key enforcement is
temporarily disabled outside the transaction to prevent table-rebuild cascades;
foreign_key_check and integrity_check must pass before commit. The prior
foreign-key setting is restored even after rollback.

Back up the real database including WAL consistently before a future deployment.
This task does not open, migrate, or copy the user's production database.
Unknown partial schemas require manual investigation, not forced user_version
changes. Recovery cannot reconstruct data previously lost by other migrations.

## Tests and next batch

The existing npm test entry imports migration tests: fresh database, every
version 19-30, both false-v30 shapes, repeated reopening, unknown schema rejection,
sequence gaps, linked data preservation, and rollback after verification failure.
Fixtures use temporary databases or isolated in-memory databases only.

Safety branches preserve main, integration, remote main and remote Kling tips.
Keep them until consolidation is verified. Next review batch: bbb6c99 through
a0ac0ae, in dependency order (Harness integration/readiness/execution/governance).
Compare each diff first: keep the consolidated migrations and current resilience
code. Do not blindly replace contracts, database, package scripts or App.tsx.
Conversation/dashboard and fe9a42f/049277c remain separate later batches.
