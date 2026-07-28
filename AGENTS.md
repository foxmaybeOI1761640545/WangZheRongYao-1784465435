# Mandatory project workflow

Before changing any code in this repository:

1. Read `FARM_WORKFLOW_ROADMAP.md` completely.
2. Confirm the current phase and unfinished checklist.
3. Do not repeat completed work.
4. Preserve data migration and Android release compatibility.
5. After making changes, update `FARM_WORKFLOW_ROADMAP.md` with progress, tests, decisions, risks, and commit references.
6. The current baseline is the immutable v1.0.14 tag
   `20260727-153511-future-1784566876-AndroidApp-v1.0.14` at
   `064485a004545955f9227114995ac7056f8d21d2`.
7. Before changing cloud sync, read `docs/CLOUD_SYNC.md`; preserve the original
   account localStorage key and manual backup Schema 3.
8. Cloud writes must use `save_wangzhe_sync_state`; never add Supabase Auth,
   Secret Keys, service_role credentials, database passwords, or direct table writes.
9. Preserve tombstones, deterministic node merge, revision retries, local-first
   startup, recovery points, reminder ID repair, and notification resynchronisation.
