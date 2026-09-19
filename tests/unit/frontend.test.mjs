import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const context = vm.createContext({
  window: {}, crypto: webcrypto, TextEncoder, TextDecoder, Blob,
  btoa, atob, DOMException, setTimeout,
});
for (const name of ["app-utils", "score-engine", "backup-codec"])
  vm.runInContext(await readFile(new URL(`../../frontend/scripts/${name}.js`, import.meta.url), "utf8"), context);
const { utils, score, backupCodec: codec } = context.window.TPTAppModules;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("2026-2027 displays week 3 as week 1 without changing stored weeks", () => {
  const years = [{ id: "current", name: "2026 – 2027" }, { id: "other", name: "2027-2028" }];
  const rows = [1, 2, 3, 4, 40].map((number) => ({
    id: `week-${number}`, school_year_id: "current", number, name: `Tuần ${number}`,
    start_date: "2026-08-31", end_date: "2026-09-06",
  }));
  rows.push({ id: "other", school_year_id: "other", number: 1, name: "Tuần 1" });
  rows.push({ id: "legacy", academic_year_id: "current", name: "Tuần 5" });
  const before = structuredClone(rows);
  const displayed = plain(utils.sortWeeksAscending(utils.visibleSchoolWeeks(rows, years)));
  assert.deepEqual(displayed.map(({ id, number, name }) => ({ id, number, name })), [
    { id: "other", number: 1, name: "Tuần 1" },
    { id: "week-3", number: 1, name: "Tuần 1" },
    { id: "week-4", number: 2, name: "Tuần 2" },
    { id: "legacy", number: 3, name: "Tuần 3" },
    { id: "week-40", number: 38, name: "Tuần 38" },
  ]);
  assert.equal(displayed.find((row) => row.id === "week-3").start_date, rows[2].start_date);
  assert.deepEqual(rows, before);
  assert.deepEqual(plain(utils.visibleSchoolWeeks(rows, [])), rows);
});

test("score input distinguishes clearing, pasted blanks, exemptions and invalid values", () => {
  assert.equal(score.parseScoreInput(" ", {}).action, "clear");
  assert.equal(score.parseScoreInput(" ", {}, { mode: "paste" }).action, "skip");
  for (const value of ["KAD", "n/a"])
    assert.equal(score.parseScoreInput(value, {}).entry_state, "na");
  for (const value of ["MIỄN", "mien"])
    assert.equal(score.parseScoreInput(value, {}).entry_state, "exempt");
  assert.equal(score.parseScoreInput("2,5", { min: 0, max: 3 }).value, 2.5);
  for (const value of ["0", "3"])
    assert.equal(score.parseScoreInput(value, { min: 0, max: 3 }).valid, true);
  for (const value of ["-1", "4"])
    assert.equal(score.parseScoreInput(value, { min: 0, max: 3 }).reason, "range");
  for (const value of ["abc", "Infinity"])
    assert.equal(score.parseScoreInput(value, {}).reason, "number");
  assert.equal(score.parseScoreInput("ĐẠT", { data_type: "boolean" }).value, 1);
  assert.equal(score.parseScoreInput("KHÔNG", { data_type: "boolean" }).value, 0);
  assert.equal(score.parseScoreInput("2", { data_type: "boolean" }).reason, "boolean");
});

test("score calculation applies count points, boolean points and weights", () => {
  assert.equal(score.criterionScore({ value: 3 }, { data_type: "count", points: -2, weight: 2 }, { formula: "weighted" }), -12);
  assert.equal(score.criterionScore({ value: 1 }, { data_type: "boolean", points: 5 }, {}), 5);
  assert.equal(score.criterionScore({ value: 0 }, { data_type: "boolean", points: 5 }, {}), 0);
  assert.equal(score.criterionScore({ value: 10 }, { data_type: "note" }, {}), 0);
  assert.equal(score.criterionScore({ value: -3, criteria_group_id: "group" }, { weight: 2 }, { formula: "weighted" }), -3);
});

test("rankings use competition ranks within each group and omit empty classes", () => {
  const classes = ["a", "b", "c", "d", "empty"].map((id) => ({
    id, class_name: id, class_group_id: id === "d" ? "g2" : "g1",
    class_group_name: id === "d" ? "Group 2" : "Group 1", class_group_order: id === "d" ? 2 : 1,
  }));
  const ctx = {
    classes, set: { formula: "base", base_score: 100 },
    criteria: [{ id: "criterion", data_type: "score" }], days: [{ date: "2026-09-14" }],
    entries: [0, 0, -10, -20].map((value, index) => ({
      class_id: classes[index].id, criteria_id: "criterion", entry_date: "2026-09-14", entry_state: "value", value,
    })),
  };
  assert.deepEqual(plain(score.rankClasses(ctx).map(({ id, rank, total, complete }) => ({ id, rank, total, complete }))), [
    { id: "a", rank: 1, total: 100, complete: true },
    { id: "b", rank: 1, total: 100, complete: true },
    { id: "c", rank: 3, total: 90, complete: true },
    { id: "d", rank: 1, total: 80, complete: true },
  ]);
  ctx.entries.push({ class_id: "a", criteria_id: "criterion", entry_date: "2026-09-15", entry_state: "exempt", value: 999 });
  assert.deepEqual(plain(score.classScoreSummary(ctx, "a", "2026-09-15")), { dayAdjustment: 0, weeklyTotal: 100 });
});

test("school days cross month boundaries and include Saturday only when requested", () => {
  const week = { start_date: "2026-08-31" };
  assert.deepEqual(plain(score.scoreWeekdays(week, {}).map((day) => day.date)), [
    "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
  ]);
  assert.equal(score.scoreWeekdays(week, { include_saturday: true }).at(-1).date, "2026-09-05");
  assert.equal(utils.addDays("2024-02-28", 1), "2024-02-29");
});

test("CSV utilities preserve quoted fields and neutralize formula prefixes", () => {
  assert.deepEqual(plain(utils.parseDelimited('"A,B","say ""hello""",', ",")), ["A,B", 'say "hello"', ""]);
  assert.deepEqual(plain(utils.parseDelimited("a\tb\t", "\t")), ["a", "b", ""]);
  for (const prefix of ["=", "+", "-", "@"])
    assert.equal(utils.csvSafe(`${prefix}1`), `"'${prefix}1"`);
  assert.equal(utils.esc('<a title="x">&\''), "&lt;a title=&quot;x&quot;&gt;&amp;&#39;");
});

test("backup checksums are deterministic and match a known SHA-256 vector", async () => {
  assert.equal(codec.stableJSON({ b: 2, a: { d: 4, c: 3 } }), codec.stableJSON({ a: { c: 3, d: 4 }, b: 2 }));
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(await codec.sha256Text("abc"), expected);
  assert.equal(await codec.sha256Blob(new Blob(["abc"])), expected);
});

test("binary backups round-trip across chunk boundaries and honor cancellation", async () => {
  const bytes = Uint8Array.from({ length: 3 * 1024 * 1024 + 7 }, (_, index) => index % 256);
  const progress = [];
  const encoded = await codec.blobToBase64(new Blob([bytes]), null, (value) => progress.push(value));
  const decoded = codec.base64ToBlob(encoded, "application/octet-stream");
  assert.deepEqual(new Uint8Array(await decoded.arrayBuffer()), bytes);
  assert.equal(progress.at(-1), 1);
  assert.equal(progress.length, 2);
  await assert.rejects(codec.blobToBase64(new Blob(["x"]), { aborted: true }), { name: "AbortError" });
  assert.equal(await codec.blobToBase64(new Blob([])), "");
});

test("encrypted backups restore Unicode and reject wrong passwords or tampering", async () => {
  const password = "test-only-passphrase", text = "Dữ liệu trường học 🏫";
  const encrypted = await codec.encryptText(text, password);
  assert.equal(await codec.decryptText(encrypted, password), text);
  await assert.rejects(codec.decryptText(encrypted, "wrong-passphrase"));
  const bytes = Buffer.from(encrypted.data, "base64");
  bytes[0] ^= 1;
  await assert.rejects(codec.decryptText({ ...encrypted, data: bytes.toString("base64") }, password));
});
