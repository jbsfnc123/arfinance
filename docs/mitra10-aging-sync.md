# Mitra10 Aging synchronization

An existing No SJ could retain a replaced invoice and outdated balance because the upload helper only appended new SJ. The replacement helper updates eight Aging-owned fields in place. Worksheet IDs, SJ spelling, creation time, manual remarks, row marks, GR and kwitansi remain untouched. Absent SJ remain historical rows. Existing `aging_commit` and tax-setting callers retain their integer NEW-row-count contract.

Source is the existing tax-filtered `m10_aging` view. Matching trims and uppercases SJ. Identical source rows collapse; conflicting projected source data or multiple canonical worksheet matches are skipped with a PostgreSQL warning. Missing invoice numbers are skipped. Operators must investigate warnings before correcting ambiguous source data.

Only changed/new rows are staged in transaction-local JSON. Identical uploads write no worksheet rows, audit rows or worksheet cache version. Existing statement triggers publish cache changes for real mutations; no browser polling is added. `private.m10_aging_changes` stores only prior values of modified columns plus row ID/time, allowing reconstruction across successive changes without copying snapshots. The table has RLS enabled and no client permissions. Audit retention is intentionally preserved; this does not reduce the size of already stored Aging snapshots.

Migration backfills existing mismatches atomically. The worksheet write lock serializes writers while allowing readers. Public functions, packing formats, frontend formulas, Collection snapshots and other module functions are unchanged.

## Verification

Run `vitest run tests/mitra10/aging-sync.test.ts lib/modules/m10/compute.test.ts tests/closing/database.test.ts`, then `next typegen` and `tsc --noEmit`. Regression fixture reproduces SJ/150918/XXVI/TRA: invoice replacement and balance 1144132 correctly join kwitansi 1144127, leaving the genuine difference of 5.

Before/after production checks: worksheet identity digest; row marks, remarks, GR and kwitansi digests; closed Collection digest; source mismatch count. Repeat sync to confirm no audit/cache growth.

## Recovery

If necessary, restore the previous helper definition from migration 0017 to stop future updates. Keep the private audit. Do not blindly replay previous_values: subsequent uploads may already be valid. Restore a specific affected row only after checking its latest source and audit chain, in a transaction, preserving its ID and manual metadata. No data deletion or whole-table replacement is required.

## Current Aging projection (follow-up)

Mitra10's active worksheet and dashboard now exclude SJ absent from current Aging. Source fields are projected from the current snapshot in the shared derived-data path, so an older browser worksheet packet cannot override the latest invoice/date/balance/PO. Stable worksheet IDs and stored SJ spelling preserve annotations; receipts, schedules and shared remarks are never deleted. If an SJ reappears, its prior ID and linked metadata remain available.

`pack_m10` sends only active worksheet anchors. Its cache depends on both `m10` and `aging`, including uploads that only remove invoices. Existing version-token caching remains in place; no polling or reload loop was introduced. Historical anchors remain solely for linkage, not active totals. No new table, duplicate snapshot or audit entry is needed for disappearance/reappearance.

Mitra10 dashboard counts distinct invoice numbers (several SJ may share one invoice), including its daily/monthly rows; the paid-invoice summary and upload message are removed. RKM retains its existing shared dashboard behavior. The common Aging dataset already uses only one current snapshot; closed Collection snapshots and historical period references remain protected.

Tests additionally cover stale browser source fields, null/zero replacements, removal-only uploads, reappearance with the same ID, retained TF dates/notes, invoice deduplication, SQL packet filtering and access checks. Apply `20261007145618_m10_current_aging_projection.sql` before or with the app release; it changes only the packet function and bumps the Mitra10 cache token once.
