const $ = (id) => document.getElementById(id);

let cfg = {};
let currentMode = 'line';
let lastPayload = null; // 「作り直す」用

// ---------- 起動時 ----------
init();
async function init() {
  cfg = await window.api.getConfig();
  // モデル候補を反映
  if (cfg.modelList) fillModels(cfg.modelList, cfg.model);
  $('apiKey').value = cfg.apiKey || '';
  // ピン状態の見た目
  if (cfg.alwaysOnTop !== false) $('pinBtn').classList.add('on');

  // APIキー未設定なら設定パネルを開く
  if (!cfg.apiKey) openSettings();
}

// ---------- ウィンドウ操作 ----------
$('hideBtn').onclick = () => window.api.hideWindow();
$('minBtn').onclick = () => window.api.minimizeWindow();
$('pinBtn').onclick = async () => {
  const on = await window.api.toggleAlwaysOnTop();
  $('pinBtn').classList.toggle('on', on);
  setStatus($('status'), on ? '常に最前面：オン' : '常に最前面：オフ', 'ok');
};
$('setBtn').onclick = () => toggleSettings();

// ---------- 設定パネル ----------
function openSettings() { $('settings').classList.remove('hidden'); $('composer').classList.add('hidden'); }
function closeSettings() { $('settings').classList.add('hidden'); $('composer').classList.remove('hidden'); }
function toggleSettings() { $('settings').classList.contains('hidden') ? openSettings() : closeSettings(); }

$('getKeyLink').onclick = () => window.api.openExternal('https://aistudio.google.com/app/apikey');

$('testBtn').onclick = async () => {
  const key = $('apiKey').value.trim();
  if (!key) return setStatus($('setStatus'), 'APIキーを入力してください', 'err');
  setStatus($('setStatus'), '接続を確認中…', 'busy');
  try {
    const models = await window.api.listModels(key);
    const picked = pickModel(models);
    cfg.modelList = models;
    fillModels(models, $('modelSelect').value || picked);
    await window.api.setConfig({ modelList: models });
    setStatus($('setStatus'), `接続OK。利用可能モデル ${models.length} 件（推奨: ${picked}）`, 'ok');
  } catch (e) {
    setStatus($('setStatus'), 'NG: ' + e.message, 'err');
  }
};

$('saveSettings').onclick = async () => {
  const key = $('apiKey').value.trim();
  if (!key) return setStatus($('setStatus'), 'APIキーを入力してください', 'err');
  cfg = await window.api.setConfig({ apiKey: key, model: $('modelSelect').value || '' });
  // モデル一覧をまだ持っていなければ取得を試みる
  if (!cfg.modelList) {
    try {
      const models = await window.api.listModels(key);
      cfg = await window.api.setConfig({ modelList: models });
      fillModels(models, $('modelSelect').value);
    } catch { /* 後で生成時に再取得 */ }
  }
  setStatus($('setStatus'), '保存しました', 'ok');
  closeSettings();
};

function fillModels(models, selected) {
  const sel = $('modelSelect');
  sel.innerHTML = '<option value="">自動（おすすめのflashを選択）</option>';
  models.forEach((m) => {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    if (m === selected) o.selected = true;
    sel.appendChild(o);
  });
}

// 推奨モデルの自動選択（速くて無料枠に優しいflash系を優先）
function pickModel(models) {
  const pref = [
    'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash',
    'gemini-2.0-flash-001', 'gemini-1.5-flash',
  ];
  for (const p of pref) if (models.includes(p)) return p;
  const flash = models.find((m) => m.includes('flash') && !m.includes('thinking'));
  return flash || models[0];
}

// ---------- 用途タブ ----------
$('modeTabs').querySelectorAll('.tab').forEach((btn) => {
  btn.onclick = () => {
    currentMode = btn.dataset.mode;
    $('modeTabs').querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    // 「相手の文」欄の見せ方を用途で調整
    const wrap = $('incomingWrap');
    const lbl = wrap.querySelector('label');
    if (currentMode === 'free') wrap.classList.add('hidden');
    else { wrap.classList.remove('hidden');
      lbl.firstChild.textContent =
        currentMode === 'remind' ? '前回の経緯（あれば貼り付け）' : '相手から届いた文（あれば貼り付け）';
    }
  };
});

// ---------- 生成 ----------
$('genBtn').onclick = () => run(false);
$('regenBtn').onclick = () => run(true);

async function run(isRegen) {
  cfg = await window.api.getConfig();
  if (!cfg.apiKey) { openSettings(); return setStatus($('setStatus'), 'まずAPIキーを設定してください', 'err'); }

  const points = $('points').value.trim();
  if (!points) return setStatus($('status'), '「伝えたい要点」を入力してください', 'err');

  // モデルを決定（設定優先→なければ一覧から自動）
  let model = cfg.model;
  if (!model) {
    let list = cfg.modelList;
    if (!list || !list.length) {
      try { list = await window.api.listModels(cfg.apiKey); await window.api.setConfig({ modelList: list }); }
      catch (e) { return setStatus($('status'), 'モデル取得に失敗: ' + e.message, 'err'); }
    }
    model = pickModel(list);
  }

  const { system, user, temperature } = buildPrompt({
    mode: currentMode,
    incoming: $('incoming').value.trim(),
    points,
    tone: $('tone').value,
    length: $('length').value,
    regen: isRegen,
  });
  lastPayload = { apiKey: cfg.apiKey, model, system, user, temperature };

  $('genBtn').disabled = true; $('regenBtn').disabled = true;
  setStatus($('status'), (isRegen ? '別案を作成中' : '作成中') + `…（${model}）`, 'busy');
  try {
    const text = await window.api.generate(lastPayload);
    $('outWrap').classList.remove('hidden');
    $('output').textContent = text;
    setStatus($('status'), '完成しました', 'ok');
  } catch (e) {
    let msg = e.message || String(e);
    if (/API_KEY|403|400/.test(msg)) msg += '（APIキーを再確認してください）';
    if (/429/.test(msg)) msg = '無料枠の上限に達した可能性。少し待って再度お試しください。';
    setStatus($('status'), '失敗: ' + msg, 'err');
  } finally {
    $('genBtn').disabled = false; $('regenBtn').disabled = false;
  }
}

// ---------- コピー ----------
$('copyBtn').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('output').textContent);
    setStatus($('status'), 'コピーしました', 'ok');
  } catch {
    setStatus($('status'), 'コピーに失敗しました', 'err');
  }
};

// ---------- プロンプト構築（生成のクセを決める核） ----------
function buildPrompt({ mode, incoming, points, tone, length, regen }) {
  const toneText = {
    polite: 'ていねいで自然な敬語。かしこまり過ぎず、読みやすく感じの良い文体。',
    friendly: 'やわらかく親しみのある丁寧語。距離が近いお客様・取引先向け。絵文字は使わない。',
    formal: 'きちんとした敬語・ビジネス文体。誠実でかしこまった印象。',
  }[tone];

  const lengthText = {
    short: 'できるだけ簡潔に。2〜4文程度。',
    normal: '適度な長さ。挨拶＋本文＋結びで自然なまとまり。',
    long: '丁寧にしっかりと。背景や配慮の一言も添える。',
  }[length];

  const modeText = {
    line: 'これはLINEやチャットでのビジネス連絡への返信文です。長すぎず、件名や「拝啓」などの手紙形式は不要。話し言葉に近いが失礼のない、すぐ送れる本文だけを書く。',
    customer: 'これはお客様への対応文です。相手の気持ちに配慮し、安心感と誠実さが伝わるようにする。',
    thanks: 'これはお礼またはお詫びの連絡です。感謝/謝罪の気持ちが過不足なく、わざとらしくならないように伝える。',
    remind: 'これは催促・確認の連絡です。相手を責める印象を与えず、やわらかく、しかし要件が明確に伝わるようにする。',
    free: 'ビジネス向けの文章を作成する。',
  }[mode];

  const system = [
    'あなたは日本の中小企業・店舗の実務に精通した、日本語ビジネス文章の専門アシスタントです。',
    '会津若松の地域密着の事業者を想定し、堅すぎず温かみのある、実際にそのまま送れる自然な文章を書きます。',
    modeText,
    '【文体】' + toneText,
    '【分量】' + lengthText,
    '【厳守事項】',
    '- 出力は「送る文章そのもの」だけ。前置き・解説・候補列挙・かぎ括弧での補足は一切書かない。',
    '- 事実を勝手に創作しない（金額・日時・固有名詞は要点に書かれた範囲のみ使う。不足する箇所は自然な一般表現にする）。',
    '- 不自然な翻訳調・AIっぽい決まり文句は避け、人が書いたように整える。',
    regen ? '- 前回とは表現・構成を変えた、別の言い回しの案にする。' : '',
  ].filter(Boolean).join('\n');

  const user = [
    incoming ? '■相手から届いた文（これに応える）:\n' + incoming + '\n' : '',
    '■伝えたい要点・メモ:\n' + points,
    '\n上記をもとに、送る文章を作成してください。',
  ].join('\n');

  return { system, user, temperature: regen ? 1.0 : 0.85 };
}

// ---------- 補助 ----------
function setStatus(el, msg, kind) {
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
}
