((root) => {
  'use strict';
  const definitions = Object.freeze([
    ['一般設定', '/k/v1/app/settings.json'],
    ['フィールド', '/k/v1/app/form/fields.json'],
    ['フォーム配置', '/k/v1/app/form/layout.json'],
    ['一覧', '/k/v1/app/views.json'],
    ['グラフ', '/k/v1/app/reports.json'],
    ['プロセス管理', '/k/v1/app/status.json'],
    ['アプリの条件通知', '/k/v1/app/notifications/general.json'],
    ['レコードの条件通知', '/k/v1/app/notifications/perRecord.json'],
    ['リマインダー通知', '/k/v1/app/notifications/reminder.json'],
    ['アプリのアクセス権', '/k/v1/app/acl.json'],
    ['レコードのアクセス権', '/k/v1/record/acl.json'],
    ['フィールドのアクセス権', '/k/v1/field/acl.json'],
    ['アプリアクション', '/k/v1/app/actions.json'],
    ['プラグイン一覧', '/k/v1/app/plugins.json'],
  ]);
  function failure(error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    const status = Number(error?.status || error?.statusCode);
    return { kind: status === 403 || code === 'CB_NO02' ? '権限不足の可能性' : '取得失敗', code };
  }
  function createQuery(get) {
    async function list(path, key, sizeKey) {
      const items = [];
      for (let offset = 0; ; offset += 100) {
        const page = await get(path, { [sizeKey]: 100, offset });
        if (!Array.isArray(page[key])) throw new Error(`${key} の取得結果が不正です`);
        items.push(...page[key]);
        if (page[key].length < 100) return items;
      }
    }
    async function settings(app) {
      const result = [];
      for (const [label, path] of definitions) {
        try { result.push({ label, data: await get(path, { app }) }); }
        catch (error) { result.push({ label, error: failure(error) }); }
      }
      // Re-read the revision after the last endpoint to detect changes during collection.
      try {
        const last = await get('/k/v1/app/settings.json', { app });
        if (last.revision == null || last.revision === '') throw new Error('リビジョンがありません');
        result.push({ label: '取得後のリビジョン確認', checkOnly: true, data: { revision: last.revision } });
      } catch (error) { result.push({ label: '取得後のリビジョン確認', checkOnly: true, error: failure(error) }); }
      return result;
    }
    return {
      apps: () => list('/k/v1/apps.json', 'apps', 'limit'),
      users: () => list('/v1/users.json', 'users', 'size'),
      organizations: () => list('/v1/organizations.json', 'organizations', 'size'),
      memberships: (code) => get('/v1/user/organizations.json', { code }),
      settings,
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createQuery, failure, definitions };
  else root.AllKintoneQuery = { createQuery, failure, definitions };
})(typeof globalThis !== 'undefined' ? globalThis : this);
