const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expandObject, appRecords, analyzeRevision } = require('./model');
const meta = { batch:'batch', capturedAt:'2026-01-01T00:00:00Z', kind:'フィールド', sourceId:'5', title:'Example', revision:'3' };
const app = {appId:'1',name:'A'};
test('設定項目を対応するフィールドに変換し、配列と子を別レコードにする', () => {
  const rows = expandObject({ ...meta, value:{ code:'A', label:'氏名', required:true, options:{ x:{ label:'選択肢', index:'0' } }, defaultValue:null } });
  assert.equal(rows[0].p_code, 'A'); assert.equal(rows[0].p_required, 'true'); assert.equal(rows[0].nulls, 'defaultValue');
  assert.equal(rows.find((r) => r.path === '/options/x').p_label, '選択肢'); assert.ok(rows.every((r) => r.revision === '3'));
});
test('未知の項目はnullでも黙って捨てない', () => assert.throws(() => expandObject({ ...meta, value:{ newUnknownProperty: null } }), /未対応/));
test('取得中のリビジョン不一致・未取得・最終確認失敗は取込しない', () => {
  for (const results of [
    [{label:'一般設定',data:{revision:'1'}},{label:'一覧',data:{revision:'2'}}],
    [{label:'一般設定',data:{name:'A'}}],
    [{label:'一般設定',data:{revision:'1'}},{label:'確認',checkOnly:true,error:{kind:'取得失敗'}}],
  ]) assert.throws(() => appRecords(app,results,'x','now'), /リビジョン/);
});
test('取得失敗や未対応は項目別に残し、他の設定を取り込む', () => {
  const {rows,state} = appRecords(app, [
    {label:'一般設定',data:{revision:'4',name:'A'}},
    {label:'レコードのアクセス権',error:{kind:'権限不足の可能性',code:'CB_NO02'}},
    {label:'グラフ',data:{revision:'4',reports:{G:{name:'G',unsupported:'x'}}}},
  ], 'x','now');
  assert.ok(rows.some(r=>r.kind==='一般設定' && r.p_name==='A'));
  assert.ok(rows.some(r=>r.kind==='レコードのアクセス権' && r.nodeType==='error'));
  assert.ok(rows.some(r=>r.kind==='グラフ' && r.nodeType==='unsupported'));
  assert.equal(state.incomplete,true);
});
test('未設定のプロセス管理はnullを保持し、他の設定項目はフィールドに入る', () => {
 const {rows}=appRecords(app,[{label:'プロセス管理',data:{revision:'3',enable:false,states:null,actions:null}}],'x','now');
 assert.ok(rows.some(r=>r.p_enable==='false')); assert.ok(rows.some(r=>r.path==='/states' && r.nodeType==='null')); assert.ok(rows.some(r=>r.path==='/actions' && r.nodeType==='null'));
});
test('グラフ、通知、アクセス権、アクションを要素ごとに保持する', () => {
 const data=[
  {label:'グラフ',data:{revision:'8',reports:{売上:{name:'売上',chartType:'BAR',groups:[{code:'C',per:'MONTH'}]}}}},
  {label:'アプリの条件通知',data:{revision:'8',notifyToCommenter:true,notifications:[{recordAdded:true,entity:{type:'GROUP',code:'everyone'}}]}},
  {label:'レコードのアクセス権',data:{revision:'8',rights:[{filterCond:'',entities:[{viewable:true,editable:false,deletable:false}]}]}},
  {label:'アプリアクション',data:{revision:'8',actions:{複写:{name:'複写',mappings:[{srcType:'FIELD',srcField:'A',destField:'B'}]}}}},
 ];
 const {rows,state}=appRecords(app,data,'x','now'); assert.equal(state.incomplete,false);
 for(const field of ['p_chartType','p_per','p_recordAdded','p_viewable','p_srcField']) assert.ok(rows.some(r=>r[field] !== undefined),field);
});
test('エラーを含む取込は不完全と扱う',()=> assert.equal(analyzeRevision([{data:{revision:'4'}},{error:{}}]).incomplete,true));
