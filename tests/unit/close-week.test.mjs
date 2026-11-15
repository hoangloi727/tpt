import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        async function closeScoreWeek('), source.indexOf('        async function scoreWorkflow('));
test('one close action completes transitions and stops on incomplete data', async () => {
  for (const blocked of [false, true]) {
    let status = 'draft', calls = 0, renders = 0;
    const context = vm.createContext({
      canManageScores: () => true,
      scoreWorkflow: async (ctx, reset, silent) => {
        assert.equal(silent, true);
        calls++;
        if (blocked) return;
        status = { draft: 'complete', complete: 'review', review: 'approved', approved: 'locked' }[ctx.sheet.status];
        return true;
      },
      scoreContext: async () => ({ sheet: { status } }),
      toast() {}, renderScores: async () => { renders++; },
    });
    vm.runInContext(code, context);
    await context.closeScoreWeek({ sheet: { status } });
    assert.equal(status, blocked ? 'draft' : 'locked');
    assert.equal(calls, blocked ? 1 : 4);
    assert.equal(renders, blocked ? 0 : 1);
  }
});
