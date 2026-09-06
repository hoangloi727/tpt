# Technology-Independent Rebuild Specification

## 1. Product overview and goals
Build a secure multi-school application for Vietnamese school youth-team administration and class competition. It must let schools manage academic context, plans/work, events/activities, youth-team records, documents/equipment, reports, and a controlled weekly competition process. It must preserve school data isolation, role boundaries, historical/audit integrity, recoverability, and official competition results while allowing any implementation stack or UI design.

## 2. Users and roles
- **Root superadministrator**: protected initial global administrator; cannot be deleted, disabled, or demoted.
- **Superadministrator**: creates/selects schools and has full capabilities in the selected school.
- **School administrator**: full management in assigned school; may manage non-superadministrator accounts, configuration, operations, scoring, backups, and year lifecycle.
- **Homeroom teacher**: read-only official weekly result and named-incident view for an assigned class/year; may print and manage own account.
- **Score grader (Sao do)**: enters competition records only for assigned active classes in assigned academic year while sheet remains editable.
- **Limited user**: access only to explicitly granted pages/data operations. Page visibility permissions must never substitute server/business authorization.

Every non-global user belongs to one school. Every user can update own display name, change password using current-password proof, and sign out. Password change, disablement, and removal terminate the affected user's sessions.

## 3. Functional requirements

### 3.1 Identity, tenancy and security
1. The system must support first-run creation of exactly one protected root account. If no school exists, setup creates the initial school; otherwise setup selects an existing school. There is no default password.
2. The system must authenticate against a chosen school. Invalid credentials, disabled account and school mismatch must not disclose which condition occurred.
3. A superadministrator may create schools and switch active school. All business operations must apply to exactly one selected school.
4. Every domain record must have immutable tenant ownership; a caller cannot use an identifier or payload field to read or move another school's record.
5. Require a secure authenticated session, auto-lock after configurable inactivity (5/10/15/30 minutes, default 10), and clear/expire sessions. Background inactivity counts. Enforce this in the authoritative service/session policy, not merely by a browser timer.
6. Apply rate friction after three consecutive client login failures using exponential delay capped at 30 seconds.
7. Sensitive/destructive actions require both ordinary authorization and recent current-password confirmation with literal confirmation text `YES`.

### 3.2 School and academic context
1. Manage school profile (identity, code/address, report preparer/title, logo) and campuses.
2. Campus names/codes are unique; retain at least one campus and prevent deletion when referenced by business data.
3. Manage academic years, two semesters and 40 Monday-starting school weeks. Year end follows start; unique year name is required by observed UI.
4. Manage active/inactive classes, grades 1-9, campus/year membership, optional class code, class name and homeroom teacher data. Do not delete a class with score or ranking history; allow historical deactivation. Reject duplicate normalized class names within the same year and within one class-import batch. Class-code requiredness/uniqueness is not evidenced and must not be invented.
5. Manage class groups by year with name/code/description/order/active flag and class members. Each active class can occur in at most one group per year; group name/code must be unique per year.
6. Context selectors for school/year/semester/week/campus must narrow displayed data. A record marked all-campus appears in every campus context.
7. Create a new academic year from name/dates; generate its semesters/weeks and optionally copy classes/groups/rule sets as new records. Do not copy score/rank history, generated tasks, activities, reports, or task templates. The observed task-template-copy option is unimplemented and must remain unavailable unless deliberately implemented.
8. Close a year only when all competition sheets are locked, no open tasks remain, and no draft reports remain. Produce protection/report/package/transition evidence, archive/read-only the year, and allow only manager correction with reason >=10 characters.

### 3.3 Operational management
1. Plans: create/search/filter/edit/export/delete plans with code, name, level, dates, objectives, targets, basis, coordination, resources, risks, status and progress. Plan creation does not create tasks.
2. Tasks: provide list and Kanban views, search/status/priority filters, pagination, clone, templates, recurrence, start/due date, progress, coordination, obstacles/results and checklists. Due date cannot precede start; progress is 0-100; mandatory `!` checklist entries block done status.
3. Generate daily/weekly/monthly/yearly recurring tasks only when a manager opens the application. Preserve original duration, reset progress/status/checklists, and prevent duplicate occurrence identity.
4. Calendar: manage dated events and print a Monday-Sunday month view. Title/date required; missing location/leader/safety fields warn but do not block. Reminder hours are stored without an implied notification service.
5. Activities: manage category/theme/date/location/leader/participants/objectives/safety/contingency/result/status. Activity and calendar event are separate; creating one must not automatically create the other.
6. Manage team member organization, training; program/specialty results; award dossiers; and equipment inventory. Equipment supports inventory state only; do not claim loan/return or stock-reduction automation unless newly specified.
7. Provide current-day view for relevant tasks/events, a temporary duty checklist, quick notes/incidents saved as draft documents, and an end-of-day summary. Quick entries must not automatically alter scores.
8. Support global normalized search across tasks/classes/activities/plans/documents and manager-only quick creation.

### 3.4 Configurable values and custom fields
1. Managers configure categories/items for plans, activities/calendar, tasks, documents, organization/programs, awards, equipment, reports and templates.
2. Support add/edit/clone/reorder/disable/enable/restore defaults and configuration import/export. Import/export must round-trip categories, items and custom-field definitions transactionally, validate collisions, and report inserted/skipped/conflicted counts. Disabled values must not be offered for new records but historic labels remain.
3. Support custom fields only for explicitly supported entities: the observed forms cover plans, activities, organization/team members, programs, commendations and equipment. Types are short text, long text, number, date, single choice, multiple choice, boolean, URL link and file-reference text; definition includes description, ordering, required/active flags and options. Enforce required/type/choice-option semantics and store values by field ID, using arrays for multichoice and a defined canonical boolean representation.

### 3.5 Competition and scoring
1. Managers configure versioned criteria sets with status/effective period/formula/base score and active direct criteria or incident categories/rules. A used set cannot be structurally changed normally; clone it for a new version.
2. A weekly sheet is unique per school week, must bind a valid active non-stopped criteria set from its year/effective period, and only managers initialize/select it. The sheet and its lifecycle are school-wide: campus is only a display/report filter and cannot cause another sheet, partial completion, or partial official snapshot.
3. Assign a score grader to active classes for one year. A grader has no more than one assignment/year and a class no more than one grader/year. Graders can score only their assignments; managers score all.
4. Record one unique cell per sheet/date/class/direct criterion or incident category. Dates are exact Monday-Friday dates inside the referenced school week. Entry class/year, week, sheet, criteria set and component must all be valid and belong to the same school and academic year.
5. Direct cell input: blank means unrecorded; `KAD`/`N/A` is not applicable; `MIỄN`/`MIEN` is exempt; zero is recorded. Pasted blanks do not create zero scores or clear existing scores unless an explicit clear-on-blank action is selected. Boolean pass terms map to 1 and failure terms map to 0; numeric boolean input is restricted to 0 or 1. Numeric comma input is accepted. Values must be finite and honor configured min/max.
6. Incident category entries contain zero or more incidents only for `value` state. Each incident has unique ID, recognized person name <=120 and a current active rule in category/set. The service derives canonical code/name/points and category total; clients cannot supply trusted point values or arbitrary incident fields.
7. Entry state is `value`, `na`, or `exempt`; non-value state has null value and no incidents. `na`/`exempt` count as filled but add zero.
8. Calculation (apply criterion weight only when formula is `weighted`; `score` and `choice` use direct numeric behavior):
```
direct = entered numeric value
count = entered value * points
boolean = points when value is truthy, otherwise 0
note = 0
incident category = sum(incident rule points)
weighted adjustment = above value * criterion weight
weekly total = base score + sum(adjustments) for base formula
weekly total = sum(adjustments) otherwise
daily total = sum(adjustments for date)
```
9. A class is complete only when it has unique filled cells for every active scoring component across all five weekdays. Blank does not count; zero, not applicable and exempt do.
10. Sheet lifecycle: absent -> draft -> complete -> review -> approved -> locked. Complete requires full data; review precedes approval; approval/lock atomically calculate and save official ranking snapshot. Lock creates protected criteria/restore evidence. Locked -> unlocked requires reason >=5, creates protection, marks reports stale, then returns through review. These transitions, calculations, completeness checks, snapshots and correction effects must be service-authoritative and unavailable through generic record mutation.
11. Block entry create/edit/delete on approved/locked sheets. Replacing selected criteria after initialization or deleting a sheet/rule set requires destructive confirmation and atomically cascades the documented dependent score/evidence/ranking data, audit/journal/protection evidence and report invalidation; replacement resets sheet to draft/stale reporting.
12. Rank only classes with >=1 filled entry. Rank separately by class group, with ungrouped classes in their own group. Within group sort total descending, then Vietnamese/numeric class name, then stable ID. Equal totals within `1e-9` share rank and next rank is positional. Official reports/teacher results use saved official snapshots, not draft rank.
13. Warn, without declaring misconduct, for no data, incomplete data, out-of-range values, and evidence-required criteria lacking evidence reference. The compatibility baseline has no score-entry attachment UI despite the evidence concept.

### 3.6 Documents and files
1. Manage documents, folders, metadata, tags, pinning, links to plans/tasks/calendar/activities/scores/commendations/programs/equipment/reports, attachments, versions, trash and restore.
2. Accept PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, PNG/JPG/JPEG/WebP and ZIP. Sanitize names <=180; default file limit 25 MB configurable 1-250 MB; hash content; request confirmation for duplicate active content.
3. Preview images/PDF/text (text capped 200,000 characters); download other types. Preserve prior version when replacing and reject identical checksum replacement.
4. Delete documents/files to trash and restore them. A permanent-delete command must either truly purge or, for compatibility, explicitly be a purge request and never promise immediate physical erasure.

### 3.7 Reports and assistant
1. Generate preview/printable weekly work, competition, task progress, activity and equipment reports with saved explicit source predicates. Weekly work uses selected Monday-Sunday school-week dates, with documented task due/start/completion inclusion and events inside that interval. Competition lifecycle/rank uses school-wide classes; campus may filter displayed rows. Task/activity/equipment reports must state exact year/semester/week/campus/status/date predicates.
2. Competition report must show only official ranking when approved/locked; include group rank, class/group/campus, five daily totals and weekly total.
3. Support CSV exports and entity-specific CSV exports. Each export must state whether it contains visible search-filtered rows, current-context rows or all tenant rows. Compatibility note: current non-score report CSV returns task data even for other report previews; treat this as a documented legacy limitation, not a desirable design requirement.
4. Allow draft reports and reconciliation-confirmed final reports. A final report persists immutable output plus filters, source-data and output checksums, source count, configuration/ruleset/build metadata, recipient/submission state. Source changes require a new final version.
5. Generate finalized-report package with related available files, and a year-end finalized report with context counts.
6. Provide local read-only rule-based assistant for today/overdue/missing scores/anomalies/reports/progress/activity readiness/backup status. It must never modify data or call remote AI.

### 3.8 Persistence, audit, backup and recovery
1. Persist all domain records and accounts durably, including crash-consistent atomic commit/recovery and single-writer coordination where necessary. Normal record metadata includes stable ID, tenant, immutable creation time, service-controlled update/delete time, revision, source/device provenance and recoverable deletion state. Ordinary callers cannot forge these values; controlled restore is the only metadata-preservation path.
2. Updates with provided finite revision must conflict when stale. Batch writes reject duplicate IDs and are all-or-nothing. Do not auto-retry by dropping revision.
3. Create service-owned, append-only audit and operation-journal evidence for create, update, soft delete, restore, hard delete, clear, import/merge, sheet lifecycle and competition destructive operations. Each event records actor/reason and affected record/count as applicable. Generic clients cannot create, alter, clear or delete audit, journal, snapshot, restore, backup, migration, report-package or lifecycle-evidence records.
4. Auto-save form drafts with 30-day recovery, restore/discard, and cleanup after successful save.
5. Internal snapshots include structural records including soft-deleted rows, exclude system artifacts and binary attachments/file versions, checksum canonical content, and use manual/daily/weekly/monthly/protected tiers. Default retention 7 daily/4 weekly/12 monthly; never prune protected snapshots.
6. Create quick external backups without attachment bytes; full backups with bytes/hash; year packages filtered to selected year plus shared data. Support progress/cancel and record only completed backups.
7. Support optional password encryption (>=8, confirmed, no password recovery) and browser download/directory target where environment allows. Directory permission/handles are local user-agent capabilities, never server-persisted records; scheduled output can run only while a usable local capability is available and manager app session is open. No background guarantee.
8. Restore accepts only recognized backups containing required format/schema/application/school metadata, canonical payload checksum and complete attachment manifest. Reject missing/invalid metadata, incompatible schema, checksum/manifest/file hash failure, invalid or duplicate merge IDs, and invalid merge timestamps/revisions. Create protected pre-restore snapshot and restore staging/audit/journal evidence, then merge or replace transactionally with normal domain/reference validation. Merge precedence: absent -> incoming; higher revision -> incoming; equal revision/newer update time -> incoming; otherwise retain current. Preview counts use this exact comparator. Replace only stores included in payload; omit internal recovery artifacts. Internal snapshot restore preserves current attachments because snapshots omit blobs.
9. No remote synchronization provider is required.

## 4. Permissions and validation
Use the matrix in `reverse-engineering/permissions.md` and validation in `reverse-engineering/validation.md` as normative behavioral detail. Authorization must be enforced by the service/business layer, tenant checks must not leak data, and destructive confirmation adds to role checks. Explicit limited-user page permissions must produce navigation in addition to any grader access; page visibility never grants data access. The major role outcomes, class/group/assignment constraints, score-entry requirements, year locks, name/date/range checks and file integrity rules are mandatory.

## 5. Error handling and edge cases
The system must distinguish invalid input, unauthenticated, forbidden, absent, unsupported operation, conflict, excessive payload and unexpected failure in a machine-actionable way. It must avoid partial persistence for atomic workflows, report stale revisions, and handle the edge cases enumerated in `reverse-engineering/edge-cases.md`. Human-readable error language/design is unconstrained.

## 6. Observable non-functional requirements
- Responsive desktop/mobile workflow, keyboard-accessible search/modals, printable reports, and safe update behavior.
- Shell-only offline access is acceptable; business data requires authenticated service connectivity.
- Prevent unsafe simultaneous browser editing. A secondary session/tab may be read-only if that is the chosen mechanism.
- Preserve confidentiality of credentials, session secrets, export/backup content and attachments. Passwords must not be stored in plaintext.
- Preserve binary attachment content/metadata across normal persistence, report packages, full backups and restore without requiring any current wire encoding.

## 7. Acceptance criteria
1. A global administrator can create two schools; data created in one cannot be seen or changed from the other.
2. An administrator can configure a year, classes/groups and an active ruleset; no class is in two groups, inactive classes cannot be newly grouped/assigned, and no second weekly sheet is possible for the same week even when initialized/viewed from different campuses.
3. An assigned grader can score only their class/year on valid weekdays, while a teacher can only read official assigned-class results. A limited user granted `page:tasks` and matching task read/write permissions can reach and use Tasks; that grant does not bypass any business validation.
4. A base-formula sheet with base 100, a count entry 2 with points -3, and a boolean pass worth 5 yields 99; `N/A` does not alter score but makes that cell complete.
5. Two group classes with equal totals receive rank 1 and the next receives rank 3; ungrouped classes do not rank against grouped classes.
6. A sheet cannot complete when a required cell is blank, a pasted blank does not become zero, a boolean value of `2` is rejected, and no entry changes after approval/lock. Unlock needs a five-character reason and causes re-review before a renewed official result.
7. Used rules cannot be structurally edited; destructive rule replacement clears that week’s dependent competition data only after current-password `YES` confirmation.
8. A stale revision update conflicts without overwrite; an invalid bulk row leaves all batch records unchanged.
9. A closed-year ordinary edit fails; a manager correction with >=10-character reason succeeds and is auditable.
10. Document duplicate/version, snapshot/full-backup, mandatory format/manifest/checksum validation, merge precedence (identical in preview and commit), pre-restore protection, domain validation and attachment-preservation rules behave as specified.
11. Final report content cannot be edited in place; changed source data requires a new finalized version.
12. Known limitations are not misrepresented: no remote sync, no scheduled reminder delivery, no automatic activity-calendar linkage, no guaranteed immediate binary purge, and no background maintenance while closed.

## Evidence and unresolved areas
Detailed evidence, unknown entities, and source contradictions are recorded in `reverse-engineering/`. That directory is part of this specification's traceability record, not a technology requirement.
