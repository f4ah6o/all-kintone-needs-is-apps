(() => {
  'use strict';
  const metadata = {
    ak_batch:'取込ID', ak_captured:'取得日時', ak_kind:'設定の種類', ak_source:'取得元ID', ak_title:'設定名',
    ak_revision:'取得元アプリ設定リビジョン', ak_path:'設定内の位置', ak_parent:'親の位置', ak_property:'親からの項目名',
    ak_ordinal:'並び順', ak_node_type:'データの種類', ak_nulls:'値がnullの項目',
  };
  kintone.events.on('app.record.index.show', (event) => {
    const host = kintone.app.getHeaderSpaceElement();
    if (!host || host.querySelector('[data-ak-setup]')) return event;
    const box = document.createElement('div'); box.dataset.akSetup = '1';
    const button = document.createElement('button'); button.textContent = '取込用フィールドを準備（管理者向け）'; button.type = 'button';
    const status = document.createElement('p'); status.setAttribute('role', 'status'); box.append(button, status); host.append(box);
    button.addEventListener('click', async () => {
      button.disabled = true; status.textContent = 'フィールドを確認しています…';
      try {
        const app = kintone.app.getId();
        const url = kintone.api.url('/k/v1/preview/app/form/fields.json', false);
        const current = await kintone.api(url, 'GET', { app });
        const fields = {};
        const add = (code, label, type) => {
          if (current.properties[code]) {
            if (current.properties[code].type !== type) throw new Error(`${code} のフィールドタイプが異なります`);
          } else fields[code] = { type, code, label };
        };
        for (const [code, label] of Object.entries(metadata)) add(code, label, 'SINGLE_LINE_TEXT');
        for (const name of AllKintoneModel.properties) add(`p_${name}`, `項目：${name}`, 'MULTI_LINE_TEXT');
        if (!Object.keys(fields).length) { status.textContent = '必要なフィールドは既に存在します。'; return; }
        await kintone.api(url, 'POST', { app, properties: fields, revision: current.revision });
        status.textContent = `${Object.keys(fields).length}個のフィールドを動作テスト環境に追加しました。アプリ設定を確認し、アプリを更新してください。`;
      } catch (error) { status.textContent = `準備に失敗しました（${error.code || '詳細不明'}）。アプリ設定の状態を確認してください。`; button.disabled = false; }
    });
    return event;
  });
})();
