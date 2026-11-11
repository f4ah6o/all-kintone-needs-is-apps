((root) => {
  'use strict';
  // API property names map to explicit fields. Unknown properties stop the import;
  // this prevents an API update from silently dropping data.
  const names = `builtinType date html pager enable instructions from to chartType chartMode per by active every month pattern dayOfMonth dayOfWeek minute recordAdded recordEdited commentAdded statusChanged fileImported notifyToCommenter daysLater hoursLater viewable editable deletable accessibility srcType srcField destField id code name description type label noLabel required unique defaultValue expression hideExpression minLength maxLength minValue maxValue digit unit unitPosition displayScale format protocol thumbnailSize enabled openGroup localName localNameLocale parentCode parent id code value index order filterCond sort width height innerHeight elementId content color title selectionMode key contentType fileKey size app relatedKeyField field relatedField entity includeSubs appEditable recordViewable recordAddable recordEditable recordDeletable recordImportable recordExportable enableThumbnails enableBulkDeletion enableComments enableDuplicateRecord enableInlineRecordEditing digits decimalPlaces roundingMode firstMonthOfFiscalYear theme url email phone mobilePhone extensionNumber employeeNumber birthDate joinDate timezone locale valid surName givenName surNameReading givenNameReading primaryOrganization sortOrder callto ctime mtime createdAt modifiedAt appId spaceId threadId revision condition titleField viewType device mediaRef previewMode rows cols enabledRelatedField showExpression decimalPlaces useThousandsSeparator options optionsOrder defaultExpression blankValue displayFormat referenceTable lookup relatedApp fieldMappings lookupPickerFields filter sortType filterType readOnly creator modifier lang image position text iconFile handleMinutes overflow time precision minuteStep`.split(/\s+/);
  const properties = [...new Set(names)];
  const allowed = new Set(properties);
  const pointer = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');
  function analyzeRevision(results) {
    const revisions = [...new Set(results.filter((r) => r.data && r.data.revision != null && r.data.revision !== '').map((r) => String(r.data.revision)))];
    const missing = results.some((r) => r.data && (r.data.revision == null || r.data.revision === ''));
    const check = results.find((r) => r.checkOnly);
    const checkFailed = Boolean(check && check.error);
    return { revisions, consistent: revisions.length === 1 && !missing && !checkFailed, incomplete: results.some((r) => r.error) || missing };
  }
  function expandObject({ kind, sourceId, title, revision = null, batch, capturedAt, value, path = '' }) {
    const rows = [];
    const walk = (node, at, parent, property, ordinal) => {
      const row = { batch, capturedAt, kind, sourceId: String(sourceId), title, revision: revision == null ? '' : String(revision), path: at || '/', parent, property, ordinal: ordinal == null ? '' : String(ordinal), nodeType: Array.isArray(node) ? 'array' : node === null ? 'null' : typeof node };
      if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
        const nulls = [];
        for (const [key, val] of Object.entries(node)) {
          if (key === 'revision') continue;
          if ((val === null || typeof val !== 'object') && !allowed.has(key)) throw new Error(`未対応のプロパティ: ${key}（${at || '/'}）`);
          if (val === null) { nulls.push(key); continue; }
          if (typeof val !== 'object') {
            if (!allowed.has(key)) throw new Error(`未対応のプロパティ: ${key}（${at || '/'}）`);
            row[`p_${key}`] = String(val);
          }
        }
        row.nulls = nulls.join(', '); rows.push(row);
        for (const [key, val] of Object.entries(node)) if (val !== null && typeof val === 'object') walk(val, `${at}/${pointer(key)}`, at || '/', key, null);
      } else if (Array.isArray(node)) {
        rows.push(row); node.forEach((v, i) => walk(v, `${at}/${i}`, at || '/', '', i));
      } else { if (node !== null) row.p_value = String(node); rows.push(row); }
    };
    walk(value, path, '', '', null); return rows;
  }
  const sections = {
    'フィールド': { properties: 'map' }, '一覧': { views: 'map' }, 'グラフ': { reports: 'map' },
    'プロセス管理': { states: 'map', actions: 'array' },
    'アプリの条件通知': { notifications: 'array' }, 'レコードの条件通知': { notifications: 'array' },
    'リマインダー通知': { notifications: 'array' }, 'アプリのアクセス権': { rights: 'array' },
    'レコードのアクセス権': { rights: 'array' }, 'フィールドのアクセス権': { rights: 'array' },
    'アプリアクション': { actions: 'map' }, 'プラグイン一覧': { plugins: 'array' },
  };
  function appRecords(app, results, batch, capturedAt) {
    const state = analyzeRevision(results);
    if (!state.consistent) throw new Error(`リビジョンの不一致または確認失敗のため取り込めません: ${state.revisions.join(', ') || '不明'}`);
    const rows = [];
    for (const result of results) {
      if (result.checkOnly) continue;
      const statusRow = { batch, capturedAt, kind: result.label, sourceId: String(app.appId), title: `${app.name} / 取得結果`, revision: result.data?.revision == null ? '' : String(result.data.revision), path: '/', parent: '', property: '', ordinal: '', nodeType: 'status' };
      if (result.error) { rows.push({ ...statusRow, nodeType: 'error', p_code: result.error.code || '', p_description: result.error.kind }); continue; }
      try {
        const data = result.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('取得結果の形式が不正です');
        const collections = sections[result.label] || {};
        const sectionRows = [];
        const base = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'revision' && !(key in collections)));
        const common = { kind: result.label, sourceId: app.appId, revision: data.revision, batch, capturedAt };
        if (Object.keys(base).length || !Object.keys(collections).length) sectionRows.push(...expandObject({ ...common, title: app.name, value: base }));
        for (const [key, mode] of Object.entries(collections)) {
          const values = data[key];
          if (result.label === 'プロセス管理' && values === null) {
            sectionRows.push(...expandObject({ ...common, title: `${app.name} / ${key}`, value: null, path: `/${key}` }));
            continue;
          }
          if (mode === 'map') {
            if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`${key} の取得結果が不正です`);
            for (const [name, value] of Object.entries(values)) sectionRows.push(...expandObject({ ...common, title: `${app.name} / ${name}`, value, path: `/${key}/${pointer(name)}` }));
          } else {
            if (!Array.isArray(values)) throw new Error(`${key} の取得結果が不正です`);
            values.forEach((value, i) => sectionRows.push(...expandObject({ ...common, title: `${app.name} / ${key} ${i + 1}`, value, path: `/${key}/${i}` })));
          }
        }
        rows.push({ ...statusRow, p_description: '取得成功' }, ...sectionRows);
      } catch (error) {
        state.incomplete = true;
        rows.push({ ...statusRow, nodeType: 'unsupported', p_description: String(error.message || '未対応の取得結果') });
      }
    }
    return { rows, state };
  }
  const exported = { properties, expandObject, analyzeRevision, appRecords };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.AllKintoneModel = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this);
