const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQuery, failure, definitions } = require('./query.js');
test('ユーザー一覧は100件を超えても全ページを取得する', async () => {
  const calls = []; const api = createQuery(async (path, params) => { calls.push({ path, params }); return { users: Array.from({ length: params.offset === 0 ? 100 : 1 }, (_, i) => i) }; });
  assert.equal((await api.users()).length, 101); assert.deepEqual(calls.map((c) => c.params.offset), [0, 100]);
});
test('一部の設定の取得失敗を区別し、最後にリビジョンを再確認する', async () => {
  const calls = []; const api = createQuery(async (path) => { calls.push(path); if (path === '/k/v1/record/acl.json') throw { code: 'CB_NO02' }; return { revision: '1' }; });
  const result = await api.settings('42'); assert.equal(result.length, definitions.length + 1); assert.equal(result.find((r) => r.label === 'レコードのアクセス権').error.kind, '権限不足の可能性'); assert.equal(result.at(-1).checkOnly, true); assert.equal(calls.at(-1), '/k/v1/app/settings.json');
});
test('不正な一覧レスポンスを空として扱わない', async () => { const api = createQuery(async () => ({})); await assert.rejects(api.organizations(), /取得結果が不正/); });
test('不明な失敗を権限不足と断定しない', () => { assert.equal(failure({ code: 'GAIA_NO01' }).kind, '取得失敗'); });
