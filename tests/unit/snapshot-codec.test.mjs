import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compressSnapshot, expandSnapshot } from '../../backend/snapshot-codec.js';

test('incremental chain restores edits, removals, additions and original ordering', () => {
  const base = { id: 'a', school_profile_id: 's', schema: 15, payload: { tasks: [{id:'1',title:'a'}, {id:'2'}], old: [] } };
  const next = { ...base, id: 'b', payload: { tasks: [{id:'3'}, {id:'1',title:'b'}], added: [] } };
  const delta = compressSnapshot(next, [base]);
  assert.equal(delta.snapshot_format, 'incremental-v1');
  assert.deepEqual(delta.payload.tasks.deleted, ['2']);
  assert.deepEqual(expandSnapshot(delta, [base]).payload, next.payload);
  const third = compressSnapshot({...next,id:'c'}, [base,delta]);
  assert.deepEqual(third.payload, {});
  assert.deepEqual(expandSnapshot(third, [base,delta]).payload, next.payload);
  assert.throws(() => expandSnapshot(delta, []), /missing/);
  assert.throws(() => expandSnapshot(delta, [{...base,school_profile_id:'other'}]), /missing/);
  assert.equal(compressSnapshot({...next,school_profile_id:'other'}, [base]).snapshot_format, undefined);
});
