(() => {
  'use strict';
  const call = (path, method, params) => kintone.api(kintone.api.url(path, false), method, params);
  const api = AllKintoneQuery.createQuery((path, params) => call(path, 'GET', params));
  const meta = { batch:'ak_batch', capturedAt:'ak_captured', kind:'ak_kind', sourceId:'ak_source', title:'ak_title', revision:'ak_revision', path:'ak_path', parent:'ak_parent', property:'ak_property', ordinal:'ak_ordinal', nodeType:'ak_node_type', nulls:'ak_nulls' };
  const el = (tag, value) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; return node; };
  function button(label, action) { const node = el('button', label); node.type = 'button'; node.addEventListener('click', action); return node; }
  function record(row) {
    const result = {};
    for (const [key, value] of Object.entries(row)) {
      const code = meta[key] || (key.startsWith('p_') ? key : null);
      if (code && value != null) result[code] = { value: String(value) };
    }
    return result;
  }
  async function assertRestricted(app) {
    const acl = await call('/k/v1/app/acl.json', 'GET', { app });
    if (!Array.isArray(acl.rights) || !acl.rights.length || acl.rights.some((r) => r.entity.type !== 'CREATOR' && (r.appEditable || r.recordViewable || r.recordAddable || r.recordEditable || r.recordDeletable || r.recordImportable || r.recordExportable))) {
      throw new Error('このアプリのアクセス権を作成者のみに制限し、アプリを更新してから取り込んでください。');
    }
  }
  kintone.events.on('app.record.index.show', (event) => {
    const host = kintone.app.getHeaderSpaceElement(); if (!host || host.querySelector('[data-aknia]')) return event;
    const panel = el('section'); panel.dataset.aknia = 'true'; panel.className = 'aknia';
    const nav = el('div'); nav.className = 'aknia-nav';
    const search = el('input'); search.type = 'search'; search.placeholder = '名前・コード・IDで絞り込み'; search.setAttribute('aria-label', '一覧を絞り込み'); search.hidden = true;
    const status = el('p', '項目を選択してください。'); status.setAttribute('role', 'status');
    const output = el('div');
    panel.append(el('h2', 'All kintone Needs is Apps'), el('p', '設定やユーザーを読み取り、項目別フィールドを持つレコードとしてこのアプリに追加します。取り込み前に閲覧権限を確認してください。'), nav, search, status, output); host.append(panel);
    let generation = 0, currentKind = '', currentItems = [];
    const show = (title, data) => { const details = el('details'); details.append(el('summary', title)); details.append(el('pre', JSON.stringify(data, null, 2))); output.append(details); };
    async function importRows(load) {
      const job = crypto.randomUUID(), timestamp = new Date().toISOString(), app = kintone.app.getId();
      let written = 0; status.textContent = 'アクセス権と取り込み内容を確認しています…';
      try {
        if (await kintone.app.isTestEnvironment()) throw new Error('動作テスト画面からの取り込みは無効です。運用環境へ反映後に実行してください。');
        await assertRestricted(app);
        const rows = await load(job, timestamp);
        if (!rows.length) { status.textContent = '取り込む対象はありません。'; return; }
        for (let i = 0; i < rows.length; i += 100) {
          const records = rows.slice(i, i + 100).map(record);
          await call('/k/v1/records.json', 'POST', { app, records }); written += records.length;
          status.textContent = `取込中：${written} / ${rows.length} 件`;
        }
        const failures = rows.filter((row) => row.nodeType === 'error').length;
        const unsupported = rows.filter((row) => row.nodeType === 'unsupported').length;
        status.textContent = `取込完了：${written} 件。取得失敗 ${failures} 件・未対応 ${unsupported} 件。取込ID ${job}。一覧を再読み込みして確認できます。`;
      } catch (error) { status.textContent = `取込を中止しました。登録済み ${written} 件、取込ID ${job}。${error.message || error.code || '取得または登録に失敗しました。'}`; }
    }
    function importButton(action) { const b = button('項目ごとにレコードへ取り込む', async () => { b.disabled = true; await importRows(action); b.disabled = false; }); output.append(b); }
    function list() {
      output.replaceChildren(); const term = search.value.trim().toLocaleLowerCase();
      const matches = currentItems.filter((item) => [item.name,item.code,item.appId].some((v) => String(v || '').toLocaleLowerCase().includes(term)));
      for (const item of matches) { const label = `${item.name || '名称なし'}（${item.appId || item.code || 'コードなし'}）`; output.append(button(label, () => detail(item))); }
      status.textContent = `${matches.length} / ${currentItems.length} 件。取得可能な範囲のみ表示します。`;
    }
    async function detail(item) {
      const kind = currentKind, current = ++generation; output.replaceChildren(); search.hidden = true; status.textContent = '取得中…';
      try {
        const data = kind === 'apps' ? await api.settings(item.appId) : kind === 'users' ? await api.memberships(item.code) : null;
        if (current !== generation) return;
        output.append(button('一覧へ戻る', () => { ++generation; search.hidden = false; list(); }));
        if (kind === 'apps') {
          for (const result of data) show(result.label + (result.error ? ` — ${result.error.kind}` : ` — リビジョン ${result.data.revision}`), result.error || result.data);
          const check = AllKintoneModel.analyzeRevision(data);
          status.textContent = check.consistent ? `リビジョン ${check.revisions.join(', ') || '不明'}。取得失敗 ${data.filter((r) => r.error).length} 件。` : 'リビジョンが一致しません。再取得が必要です。';
          importButton(async (batch, capturedAt) => AllKintoneModel.appRecords(item, await api.settings(item.appId), batch, capturedAt).rows);
        } else if (kind === 'users') {
          show('ユーザー情報', item); show('所属組織・役職', data); status.textContent = 'ユーザー情報。リビジョンはUser APIで提供されません。';
          importButton(async (batch, capturedAt) => {
            const [users, memberships] = await Promise.all([api.users(), api.memberships(item.code)]);
            const user = users.find((u) => u.code === item.code); if (!user) throw new Error('ユーザーが見つかりません。再取得してください。');
            const base = { sourceId: item.code, title: user.name, batch, capturedAt };
            return [ ...AllKintoneModel.expandObject({ ...base, kind:'ユーザー', value:user }), ...memberships.organizationTitles.flatMap((value, i) => AllKintoneModel.expandObject({ ...base, kind:'所属組織・役職', value, path:`/organizationTitles/${i}` })) ];
          });
        } else {
          show('組織情報', item); status.textContent = '組織情報。リビジョンはUser APIで提供されません。';
          importButton(async (batch, capturedAt) => {
            const org = (await api.organizations()).find((o) => o.code === item.code); if (!org) throw new Error('組織が見つかりません。再取得してください。');
            return AllKintoneModel.expandObject({ kind:'組織', sourceId:org.code, title:org.name, batch, capturedAt, value:org });
          });
        }
      } catch (error) { if (current === generation) status.textContent = `取得失敗：${error.code || '詳細不明'}`; }
    }
    async function load(kind) {
      const current = ++generation; currentKind = kind; output.replaceChildren(); search.hidden = false; status.textContent = '取得中…';
      try { const items = await api[kind](); if (current !== generation) return; currentItems = items; search.value = ''; list(); }
      catch (error) { if (current === generation) status.textContent = `取得失敗：${error.code || '詳細不明'}`; }
    }
    nav.append(button('アプリ', () => load('apps')), button('ユーザー', () => load('users')), button('組織', () => load('organizations')), button('再取得', () => { if (currentKind) load(currentKind); }));
    search.addEventListener('input', list); return event;
  });
})();
