import { isDeepStrictEqual } from "node:util";

export function expandSnapshot(snapshot, snapshots) {
  const chain = [], visited = new Set();
  let current = snapshot;
  while (current?.snapshot_format === "incremental-v1") {
    if (visited.has(current.id)) throw new Error("Snapshot dependency cycle.");
    visited.add(current.id);
    chain.push(current);
    current = snapshots.find(row => row.id === current.base_snapshot_id &&
      row.school_profile_id === snapshot.school_profile_id);
    if (!current) throw new Error("Snapshot base is missing.");
  }
  let payload = structuredClone(current.payload);
  for (const delta of chain.reverse()) {
    for (const store of delta.removed_stores || []) delete payload[store];
    for (const [store, changes] of Object.entries(delta.payload)) {
      const rows = new Map((payload[store] || []).map(row => [row.id, row]));
      for (const id of changes.deleted) rows.delete(id);
      for (const row of changes.upserted) rows.set(row.id, structuredClone(row));
      payload[store] = changes.order.map(id => {
        if (!rows.has(id)) throw new Error("Snapshot record is missing.");
        return rows.get(id);
      });
    }
  }
  return { ...structuredClone(snapshot), payload };
}

export function compressSnapshot(snapshot, snapshots) {
  if (!snapshot.payload || snapshot.snapshot_format) return snapshot;
  const base = [...snapshots].reverse().find(row => !row.deleted_at &&
    row.id !== snapshot.id && row.school_profile_id === snapshot.school_profile_id &&
    row.schema === snapshot.schema && row.school_year_id === snapshot.school_year_id && row.payload);
  if (!base) return snapshot;
  const previous = expandSnapshot(base, snapshots).payload;
  const payload = {};
  for (const [store, rows] of Object.entries(snapshot.payload)) {
    if (isDeepStrictEqual(previous[store], rows)) continue;
    const old = new Map((previous[store] || []).map(row => [row.id, row]));
    const ids = new Set(rows.map(row => row.id));
    payload[store] = {
      upserted: rows.filter(row => !isDeepStrictEqual(old.get(row.id), row)),
      deleted: [...old.keys()].filter(id => !ids.has(id)),
      order: rows.map(row => row.id),
    };
  }
  return { ...snapshot, snapshot_format: "incremental-v1", base_snapshot_id: base.id,
    removed_stores: Object.keys(previous).filter(store => !(store in snapshot.payload)), payload };
}
