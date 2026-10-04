# Collection monthly closing (Fase 51)

## User flow

Dashboard Collection has Open/Closed periods, a closing preview, explicit source confirmation, history, Excel export and Super Admin reopening with a reason. Controllers with Dashboard Collection access can close. No existing period is automatically closed by the migration.

Closing requires an end-of-month cut-off no later than today in Asia/Jakarta. The bound Aging report date must equal that cut-off. Legacy Aging dates are identified as inferred and require explicit confirmation that the source really represents the end-of-month position. A later report cannot reconstruct an earlier balance merely by changing its date.

All Aging upload interfaces now require a report position date and Collection destination month. Operational Aging still serves the existing modules. An upload to a Closed destination fails atomically. Target uploads remain independent: Aging changes the remaining balance and achievement, not the uploaded target amount.

A period initially uses current Aging until explicitly bound by an upload. Afterwards other-period uploads cannot move its Aging. Payments and activities remain live for Open periods. Closed periods use only their saved source and cut-off, including allocation graphs and reconciliation. This closing applies to Dashboard Collection; it does not freeze all other operational dashboards.

## Data and invariants

- `collection_periods`: state, revision and Aging binding. Open periods keep a small snapshot reference; the referenced raw snapshot is exempt from retention. Closing copies the compact full projection so reopening and correcting target membership remain independent of raw snapshot retention.
- `collection_closings`: immutable revision, cut-off, authoritative database source, preview checksum, actor and timestamp. Only target-related Aging lines/replacements, target rows, aggregated payments and dashboard activity fields are included. No original spreadsheet is copied.
- `collection_closing_log`: append-only close/reopen reason and actor.
- `ar_aging_snapshots.report_date`: explicitly supplied date; NULL denotes legacy inference.

RPCs check authenticated menu/role access; tables have RLS and no direct authenticated grants. Closing takes source table SHARE locks, then the period row lock. Target replacement acquires its source table lock before the same period lock. A source change invalidates the preview checksum. Lost-response retries with the same checksum/revision return the existing closing, not a duplicate. Statement failure rolls back its changes. Snapshot and history update/delete/truncate are rejected.

The source is captured by the database, not accepted as client-supplied report totals. The v1 evaluator under `lib/modules/collection/closing-v1` must remain stable; introduce a new schema/evaluator version for future arithmetic changes. The existing distinction between target-minus-Aging collection and actual ERP payment allocation is preserved.

Closed dashboard reads do not depend on the retention of original Aging snapshots. Closing does not change source target amounts or mark any invoice paid. Reopening preserves the original Aging projection while allowing explicit corrections and a new closing revision. Old versions remain downloadable.

## Verification

`npm test` includes a PGlite/Postgres integration suite applying the migration over copies of the actual production upload functions. Cases cover stale previews, idempotent retry, target protection, upload rollback, September/October isolation, ERP and activity corrections, Aging retention, role checks, immutable history, reopening, multi-SJ revisions, and 9,000 targets / 22,000 Aging lines. PGlite is single-connection: these tests cover ordered interleavings, not a multi-session stress test.

Browser verification uses the actual Dashboard/Closing components and RPC SQL through a local PGlite adapter with synthetic data, without production credentials. It covers confirmation, refresh, month switching, history XLSX, reopen/reclose, and narrow dark-theme layout. XLSX totals are compared with the displayed report. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build` before deployment.

Dashboard Collection caches each period in IndexedDB by user and database version. It checks the small version table on entry, avoids repeated report fetches on focus/interval, and deduplicates simultaneous requests. Closed periods depend only on the closing version, while Open periods also track Aging, targets, ERP, activity and settings. Manual Refresh bypasses the cache.

## Release and recovery

Apply the additive migration before deploying the app. Verify period rows remain Open and target totals unchanged; verify execute permissions and advisors. Deploy the tested commit via the existing GitHub/Vercel pipeline. Do not create a real business closing as a smoke test.

Before any real closing, rolling back the UI is possible while leaving the additive tables in place. After a real closing exists, use a forward fix: an older UI reads live Aging and would misrepresent closed history. Never drop snapshot tables or roll back by deleting closing data. Failed requests can be retried; a stale-preview error requires fetching a fresh preview. Historical corrections require Super Admin reopening and a new revision.
