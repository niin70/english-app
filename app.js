// ─── STATE ───────────────────────────────────────────────────────────────────
let currentLesson = null;
let currentTab = "script";
let showSlash = true;
let showTrans = true;
let bookmarks = new Set();
let playing = false;
let progressInterval = null;
let practiceMode = "free";
let practiceHistory = [];

// 日本語訳キャッシュ（自動翻訳した結果を保存）
const jaCache = {};

const STORAGE_KEY = "english_app_custom_lessons";

function loadCustomLessons() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) { return []; }
}

function saveCustomLessons(lessons) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons));
  } catch (e) { console.error("保存エラー:", e); }
}

let customLessons = loadCustomLessons();

function getLessons() {
  return [THAILAND_LESSON, FASHION_LESSON, ...customLessons];
}

const PRACTICE_MODES = {
  free:         { label: "💬 自由質問",    icon: "💬", desc: "単語・文法・発音など何でも聞く",   color: "#3A6FD8" },
  conversation: { label: "🗣️ 英会話練習",  icon: "🗣️", desc: "AIと英語で会話練習",             color: "#27AE60" },
  correction:   { label: "✏️ 英作文添削",  icon: "✏️", desc: "書いた英文をAIが添削",           color: "#F5A623" },
  roleplay:     { label: "🎭 ロールプレイ", icon: "🎭", desc: "場面設定で実践的な会話練習",     color: "#C0397A" },
  quiz:         { label: "🧠 クイズ",      icon: "🧠", desc: "スクリプトの単語・内容クイズ",   color: "#8B5CF6" }
};

async function callAI(messages, systemPrompt, maxTokens = 1000) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, systemPrompt, maxTokens })
    });
    const data = await res.json();
    if (data.error) return `エラー: ${data.error}`;
    return data.reply;
  } catch (e) {
    return `通信エラー: ${e.message}`;
  }
}

function getSystemPrompt(mode, lesson) {
  const base = `スクリプトタイトル: ${lesson.title}\nスクリプト本文:\n${lesson.fullText}`;
  const prompts = {
    free: `あなたは親切な英語学習アシスタントです。\n${base}\nこのスクリプトを学習している日本人をサポートしてください。\n- 質問には日本語で丁寧に答える\n- 単語・フレーズは「意味」「使い方」「例文」の形で説明\n- 発音のコツや覚え方も積極的に提供\n- 返答は簡潔にわかりやすく`,
    conversation: `あなたはフレンドリーな英会話の練習相手です。\n${base}\nルール:\n- 必ず英語で返答する\n- 相手の英語に間違いがあれば、会話の最後にさりげなく正しい表現を()内に示す\n- 難しい単語を使ったら日本語訳を[]内に添える\n- 返答は2〜3文程度で簡潔に\n- 最後に必ず相手への質問を1つ加えて会話を続ける`,
    correction: `あなたは英語の先生です。\n${base}\nルール:\n- ユーザーが書いた英文を添削する\n- 間違いがあれば「❌ 原文」→「✅ 修正」の形で示す\n- 間違いの理由を日本語で簡潔に説明する\n- 良い表現は「👍 良い点」として褒める\n- より自然な言い回しがあれば提案する`,
    roleplay: `あなたは英会話のロールプレイ相手です。\n${base}\n現在のシナリオに応じて、リアルな英語で対話してください。\n- 必ず英語で返答する\n- ネイティブが実際に使う自然な表現を使う\n- 相手が詰まったら日本語でヒントを[]内に提供する`,
    quiz: `あなたは英語クイズの出題者です。\n${base}\nルール:\n- 上記スクリプトの単語・フレーズ・内容に関するクイズを出す\n- 1問ずつ出題し、答えを待つ\n- 正解・不正解に関わらず解説を加える\n- 日本語で進行する`
  };
  return prompts[mode] || prompts.free;
}

// ─── AI翻訳（不足している日本語訳を自動補完）────────────────────────────────
async function translateSentence(engText) {
  const cacheKey = engText.trim();
  if (jaCache[cacheKey]) return jaCache[cacheKey];

  const reply = await callAI(
    [{ role: "user", parts: [{ text: `次の英文を自然な日本語に翻訳してください。訳文のみ出力してください（説明不要）：\n"${engText}"` }] }],
    "あなたは英語→日本語の翻訳者です。訳文のみを出力し、それ以外の説明は一切不要です。",
    200
  );
  const result = reply.trim();
  jaCache[cacheKey] = result;
  return result;
}

// ─── LESSON GENERATE ─────────────────────────────────────────────────────────
async function generateLesson(userInput) {
  const systemPrompt = `You are an English learning content creator. Return ONLY valid JSON, no explanation, no markdown fences.

Output this exact JSON structure:
{
  "id": "lesson_dance",
  "title": "💃 Dancing My Way Around the World",
  "theme": {"primary":"#567B89","secondary":"#CDA69A","bg1":"#f9f5f2","bg2":"#eef3f6","bg3":"#f5f0ee","slash":"#567B89","vocabBg":"#FFF3E0","vocabBorder":"#E08800","vocabText":"#7A4A35","phraseBg":"#D6EEFF","phraseBorder":"#2074B8","phraseText":"#0A3A5C"},
  "fullText": "full English script here",
  "sentences": [
    {"id":0,"ja":"日本語訳（1文ずつ）","chunks":[
      {"w":"I can't help but","t":"phrase","pron":"アイ キャント ヘルプ バット","ipa":"/aɪ kænt help bʌt/","meaning":"〜せずにはいられない","example":"I can't help but smile when I dance."},
      {"w":" /","t":"slash"},
      {"w":" share my passion","t":"normal"},
      {"w":" for dancing","t":"normal"},
      {"w":".","t":"normal"}
    ]}
  ]
}

Rules:
- sentences: each element = exactly ONE English sentence (one period/exclamation)
- ja: complete Japanese translation of that one sentence
- chunks: meaningful phrase groups (3-7 words each), NOT word-by-word
- slash chunks: {"w":" /","t":"slash"} only at clause boundaries
- vocab chunks: important English words with pron/ipa/meaning/example
- phrase chunks: useful set phrases with pron/ipa/meaning/example  
- normal chunks: everything else, NO extra fields
- Include 8 speech sentences (Part1) + 6 conversation sentences (Part2, ja starts with【あなた】or【ネイティブ】)
- Pick 1-2 vocab or phrase per sentence
- Good vocab: passionate, incredible, stunning, genuinely, fascinating, rhythm, energized
- Good phrases: "I can't help but", "ever since", "to be honest", "no wonder", "what I love about"`;

  const userMessage = `Create an English learning script based on this Japanese input:\n\n${userInput}`;

  // まずcallAIで試みる（バックエンド経由）
  let reply = await callAI(
    [{ role: "user", content: userMessage }],
    systemPrompt,
    3500
  );

  // バックエンドが parts 形式を期待している場合のフォールバック
  if (!reply || reply.startsWith("エラー") || reply.startsWith("通信エラー")) {
    reply = await callAI(
      [{ role: "user", parts: [{ text: userMessage }] }],
      systemPrompt,
      3500
    );
  }

  if (!reply || reply.startsWith("エラー") || reply.startsWith("通信エラー")) {
    console.error("AI call failed:", reply);
    return null;
  }

  // JSONを抽出（コードブロックや前後の文字列を除去）
  try {
    // まずそのままパース
    let clean = reply.trim();
    // ```json ... ``` を除去
    clean = clean.replace(/^```json\s*/i, "").replace(/\s*```\s*$/, "");
    clean = clean.replace(/^```\s*/, "").replace(/\s*```\s*$/, "");
    // 先頭の { から末尾の } までを抽出
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      clean = clean.slice(start, end + 1);
    }
    const parsed = JSON.parse(clean);
    // 最低限のバリデーション
    if (!parsed.sentences || !Array.isArray(parsed.sentences) || parsed.sentences.length === 0) {
      console.error("Invalid lesson structure:", parsed);
      return null;
    }
    return parsed;
  } catch (e) {
    console.error("JSON parse error:", e, "\nRaw reply:", reply.substring(0, 300));
    return null;
  }
}

// ─── SPEECH ──────────────────────────────────────────────────────────────────
function speakWord(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 0.85; u.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(x => x.lang.startsWith("en-US")) || voices.find(x => x.lang.startsWith("en"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

function toggleFullPlay() {
  if (!currentLesson) return;
  if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
  const u = new SpeechSynthesisUtterance(currentLesson.fullText);
  u.lang = "en-US"; u.rate = 0.88; u.pitch = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(x => x.lang.startsWith("en-US")) || voices.find(x => x.lang.startsWith("en"));
  if (v) u.voice = v;
  setPlaying(true);
  const bar = document.getElementById("progress-bar");
  const dur = currentLesson.fullText.length * 68;
  const start = Date.now();
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (bar) bar.style.width = Math.min(100, ((Date.now() - start) / dur) * 100) + "%";
  }, 100);
  u.onend = u.onerror = () => {
    setPlaying(false); clearInterval(progressInterval);
    if (bar) { bar.style.width = "100%"; setTimeout(() => { bar.style.width = "0%"; }, 800); }
  };
  window.speechSynthesis.speak(u);
}

function setPlaying(val) {
  playing = val;
  const btn = document.getElementById("play-btn");
  const label = document.getElementById("play-label");
  if (btn) btn.textContent = val ? "⏹" : "▶";
  if (label) label.textContent = val ? "🔊 再生中..." : "タップして全文を再生";
}

// ─── THEME COLORS ─────────────────────────────────────────────────────────────
// 【英検3級向け】
// vocab（単語）: 暖かいオレンジ系 → 重要単語として目立たせる
// phrase（フレーズ）: 青緑系 → まとめて覚えるフレーズ
function getTC(lesson) {
  return {
    vocab: {
      bg:     lesson.theme.vocabBg     || "#FFF0CC",
      border: lesson.theme.vocabBorder || "#E08800",
      text:   lesson.theme.vocabText   || "#7A4A00",
      label:  "単語"
    },
    phrase: {
      bg:     lesson.theme.phraseBg    || "#D6EEFF",
      border: lesson.theme.phraseBorder|| "#2074B8",
      text:   lesson.theme.phraseText  || "#0A3A5C",
      label:  "フレーズ"
    }
  };
}

function getAllItems(lesson) {
  const items = [];
  lesson.sentences.forEach(s => s.chunks.forEach(c => {
    if ((c.t === "vocab" || c.t === "phrase") && !items.find(x => x.w === c.w)) items.push(c);
  }));
  return items;
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function getSentenceText(s) {
  return s.chunks.filter(c => c.t !== "slash").map(c => c.w).join("");
}

// ─── CHUNKS → 文単位に分割 ───────────────────────────────────────────────────
// 1つのsentenceに複数の英文が詰め込まれている場合に対応
// "." "!" "?" で終わる normal chunk を区切りとして分割する
function splitChunksIntoSubSentences(chunks) {
  const groups = [];
  let current = [];
  for (const chunk of chunks) {
    current.push(chunk);
    if (chunk.t === "normal") {
      const w = chunk.w.trim();
      // 文末記号で終わる場合に分割（".." のような二重ピリオドも対応）
      if (/[.!?]+\s*$/.test(w)) {
        groups.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) groups.push(current);
  // 分割できなかった場合はそのまま返す
  return groups.length > 0 ? groups : [chunks];
}

// サブグループから英文テキストを取得
function getSubSentenceText(chunksGroup) {
  return chunksGroup.filter(c => c.t !== "slash").map(c => c.w).join("").trim();
}

// ─── CHUNK RENDER ─────────────────────────────────────────────────────────────
// 【重要】vocab も phrase も同じようにタップ可能・色付き表示
// 英検3級学習者向け：
//   vocab（単語）= オレンジ背景 + 太字下線 → 重要単語として強調
//   phrase（フレーズ）= 青背景 + 太字下線 → まとめて覚えるフレーズとして強調
function renderChunk(chunk, lesson) {
  const tc = getTC(lesson);
  if (chunk.t === "normal") return `<span>${escHtml(chunk.w)}</span>`;
  if (chunk.t === "slash") {
    return showSlash
      ? `<span class="slash-mark" style="color:${lesson.theme.slash||'#567B89'}">/</span>`
      : `<span style="visibility:hidden"> </span>`;
  }
  const c = tc[chunk.t];
  const bm = bookmarks.has(chunk.w) ? '<sup class="bm-star" style="color:#E08800;font-size:10px">★</sup>' : "";
  // data-itemはシングルクォートをエスケープして埋め込み
  const dataItem = JSON.stringify(chunk).replace(/"/g, "&quot;");
  return `<mark
    class="chunk-mark chunk-${chunk.t}"
    data-item="${dataItem}"
    style="
      background:${c.bg};
      color:${c.text};
      border-bottom:3px solid ${c.border};
      border-radius:4px;
      padding:1px 3px;
      cursor:pointer;
      font-weight:700;
      text-decoration:none;
      box-shadow:0 1px 3px ${c.border}44;
    "
  >${escHtml(chunk.w)}${bm}</mark>`;
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function renderHome() {
  const lessons = getLessons();
  document.getElementById("app").innerHTML = `
    <div class="home-screen">
      <div class="home-header">
        <div class="home-label">📚 English Learning App</div>
        <h1 class="home-title">My English<br>Script Library</h1>
        <p class="home-sub">会話から生まれた英語スクリプトを学ぼう</p>
      </div>
      <div class="lesson-cards">
        ${lessons.map(l => `
          <div class="lesson-card-wrap">
            <button class="lesson-card" onclick="openLesson('${l.id}')" style="border-top:4px solid ${l.theme.primary}">
              <div class="lesson-card-title">${l.title}</div>
              <div class="lesson-card-meta">${l.sentences.length}文 · ${getAllItems(l).length}単語/フレーズ</div>
              <div class="lesson-card-arrow" style="color:${l.theme.primary}">学習開始 →</div>
            </button>
            ${l.custom ? `<button class="lesson-delete-btn" onclick="deleteLesson('${l.id}')">🗑️</button>` : ""}
          </div>
        `).join("")}
      </div>
      <button class="add-lesson-btn" onclick="renderCreateLesson()">
        ➕ 新しいレッスンを作成
      </button>
      <div class="home-footer">📁 アーカイブ：会話①タイ旅行 / 会話②ファッション</div>
    </div>`;
}

function deleteLesson(id) {
  if (!confirm("このレッスンを削除しますか？")) return;
  customLessons = customLessons.filter(l => l.id !== id);
  saveCustomLessons(customLessons);
  renderHome();
}

function renderCreateLesson() {
  document.getElementById("app").innerHTML = `
    <div class="home-screen">
      <div class="create-header">
        <button class="back-btn-home" onclick="renderHome()">← ホーム</button>
        <h2 class="create-title">➕ 新しいレッスンを作成</h2>
        <p class="create-sub">日本語で話した内容をAIが英語スクリプトに変換します</p>
      </div>
      <div class="create-examples">
        <div class="create-example-title">💡 入力例</div>
        <button class="example-btn" onclick="fillExample('私は音楽が大好きです。特にジャズが好きで、休日はよくライブに行きます。音楽は心を豊かにしてくれると思います。')">🎵 音楽について</button>
        <button class="example-btn" onclick="fillExample('私は料理が趣味です。週末に新しいレシピに挑戦するのが楽しみです。特に和食とイタリアンが得意です。')">🍳 料理について</button>
        <button class="example-btn" onclick="fillExample('私はランニングが好きです。毎朝30分走っています。マラソン大会にも出たことがあります。')">🏃 スポーツについて</button>
      </div>
      <div class="create-input-area">
        <div class="create-input-label">あなたの話したい内容を日本語で入力</div>
        <textarea id="lesson-input" class="lesson-textarea"
          placeholder="例：私は旅行が好きで、特にヨーロッパに行きたいと思っています..."></textarea>
      </div>
      <button id="generate-btn" class="generate-btn" onclick="startGenerate()">
        🤖 AIでスクリプトを生成する
      </button>
      <div id="generate-status" class="generate-status hidden"></div>
      <div id="preview-area" class="hidden"></div>
    </div>`;
}

function fillExample(text) {
  const input = document.getElementById("lesson-input");
  if (input) input.value = text;
}

async function startGenerate() {
  const input = document.getElementById("lesson-input");
  const btn = document.getElementById("generate-btn");
  const status = document.getElementById("generate-status");
  if (!input || !input.value.trim()) { alert("内容を入力してください"); return; }

  btn.disabled = true;
  btn.textContent = "⏳ 生成中...";
  status.classList.remove("hidden");

  const steps = ["🤖 AIがスクリプト作成中...","📝 英文とチャンクを構築中...","🇯🇵 日本語訳を追加中...","✨ もうすぐ完成です..."];
  let stepIdx = 0;
  status.innerHTML = `<div class="generating"><div class="generating-icon">🤖</div><div class="generating-text" id="gen-step">${steps[0]}<br><small style="color:#aaa">（20〜30秒かかります）</small></div></div>`;
  const stepTimer = setInterval(() => {
    stepIdx = (stepIdx + 1) % steps.length;
    const el = document.getElementById("gen-step");
    if (el) el.innerHTML = `${steps[stepIdx]}<br><small style="color:#aaa">（20〜30秒かかります）</small>`;
  }, 7000);

  const lesson = await generateLesson(input.value.trim());
  clearInterval(stepTimer);

  if (!lesson) {
    status.innerHTML = `
      <div style="background:#fff5f5;border:1px solid #ffcccc;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">❌</div>
        <div style="font-weight:700;color:#c0392b;margin-bottom:6px">生成に失敗しました</div>
        <div style="font-size:13px;color:#666;margin-bottom:12px">
          入力が長すぎるか通信エラーの可能性があります。<br>
          少し短い内容で試してみてください。
        </div>
        <button onclick="startGenerate()" style="background:#c0392b;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:14px;cursor:pointer">
          🔄 もう一度試す
        </button>
      </div>`;
    btn.disabled = false;
    btn.textContent = "🤖 AIでスクリプトを生成する";
    return;
  }

  lesson.custom = true;
  showPreview(lesson);
  btn.disabled = false;
  btn.textContent = "🤖 AIでスクリプトを生成する";
  status.classList.add("hidden");
}

function showPreview(lesson) {
  const preview = document.getElementById("preview-area");
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="preview-card" style="border-top:4px solid ${lesson.theme.primary}">
      <div class="preview-title">✅ 生成完了！</div>
      <div class="preview-lesson-title">${lesson.title}</div>
      <div class="preview-fulltext">${escHtml(lesson.fullText.substring(0,150))}...</div>
      <div class="preview-stats">${lesson.sentences.length}文 · ${getAllItems(lesson).length}単語/フレーズ</div>
      <div class="preview-btns">
        <button class="preview-save-btn" onclick='saveLesson(${JSON.stringify(lesson).replace(/'/g,"&#39;")})' style="background:${lesson.theme.primary}">
          💾 保存してレッスンに追加
        </button>
        <button class="preview-retry-btn" onclick="startGenerate()">🔄 再生成</button>
      </div>
    </div>`;
}

function saveLesson(lesson) {
  if (typeof lesson === "string") lesson = JSON.parse(lesson);
  lesson.id = "custom_" + Date.now();
  lesson.custom = true;
  customLessons.push(lesson);
  saveCustomLessons(customLessons);
  alert("✅ レッスンを保存しました！");
  renderHome();
}

function openLesson(id) {
  currentLesson = getLessons().find(l => l.id === id);
  bookmarks = new Set();
  practiceHistory = [];
  practiceMode = "free";
  currentTab = "script";
  renderLesson();
}

// ─── LESSON RENDER ────────────────────────────────────────────────────────────
function renderLesson() {
  const l = currentLesson;
  const tc = getTC(l);
  const allItems = getAllItems(l);
  const bmItems = allItems.filter(x => bookmarks.has(x.w));

  document.getElementById("app").innerHTML = `
    <div class="lesson-screen" style="background:linear-gradient(135deg,${l.theme.bg1},${l.theme.bg2},${l.theme.bg3})">
      <div class="lesson-header">
        <button class="back-btn" onclick="renderHome()">← ホーム</button>
        <div class="lesson-header-label" style="color:${l.theme.secondary}">English Learning App</div>
        <div class="lesson-header-title">${l.title}</div>
        <div class="player-bar">
          <button id="play-btn" class="play-btn" onclick="toggleFullPlay()" style="background:${l.theme.primary}">▶</button>
          <div class="player-info">
            <div id="play-label" class="player-label">タップして全文を再生</div>
            <div class="progress-track">
              <div id="progress-bar" class="progress-fill" style="background:linear-gradient(90deg,${l.theme.primary},${l.theme.secondary})"></div>
            </div>
          </div>
          <div class="player-speed">EN 0.88x</div>
        </div>
      </div>
      <div class="tab-bar">
        ${[
          ["script","📄 スクリプト"],
          ["list","📚 単語一覧"],
          ["notebook",`★ 単語帳${bookmarks.size>0?` (${bookmarks.size})`:""}`],
          ["practice","🗣️ 英会話練習"]
        ].map(([k,lb]) =>
          `<button class="tab-btn${currentTab===k?" active":""}" onclick="switchTab('${k}')">${lb}</button>`
        ).join("")}
      </div>
      <div class="tab-content" id="tab-content">
        ${renderTabContent(l, tc, allItems, bmItems)}
      </div>
    </div>
    <div id="popup-overlay" class="popup-overlay hidden" onclick="closePopup()"></div>
    <div id="popup-card" class="popup-card hidden"></div>
    <div id="flash-overlay" class="popup-overlay hidden" onclick="closeFlash()"></div>
    <div id="flash-card" class="flash-card hidden"></div>`;

  // ─ chunk-mark クリックイベント登録（vocab・phrase 両方）
  document.querySelectorAll(".chunk-mark").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      try {
        const raw = el.getAttribute("data-item").replace(/&quot;/g, '"');
        const item = JSON.parse(raw);
        openPopup(item);
      } catch(err) {
        console.error("popup parse error:", err);
      }
    });
  });
}

function renderTabContent(l, tc, allItems, bmItems) {
  if (currentTab === "script")   return renderScriptTab(l, tc);
  if (currentTab === "list")     return renderListTab(l, tc, allItems);
  if (currentTab === "notebook") return renderNotebookTab(l, tc, bmItems);
  if (currentTab === "practice") return renderPracticeTab(l);
  return "";
}

// ─── SCRIPT TAB ───────────────────────────────────────────────────────────────
// 【修正ポイント1】chunks を文末記号で自動分割して、文ごとにカードを分けて表示
// 【修正ポイント2】jaが1文しかない場合、残りの分割文は自動翻訳で補完（非同期）
function renderScriptTab(l, tc) {
  // 凡例：タップできることを明示
  const legendHtml = `
    <div class="controls-row">
      <div class="legend">
        <span class="legend-dot" style="background:${tc.vocab.border};width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:3px"></span>
        <span class="legend-label" style="color:${tc.vocab.text};font-weight:600">単語</span>
        <span style="font-size:10px;color:#999;margin-right:8px">（タップ→解説）</span>
        <span class="legend-dot" style="background:${tc.phrase.border};width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:3px"></span>
        <span class="legend-label" style="color:${tc.phrase.text};font-weight:600">フレーズ</span>
        <span style="font-size:10px;color:#999;margin-right:8px">（タップ→解説）</span>
        <span class="legend-slash" style="color:${l.theme.slash||'#567B89'};font-weight:700">/</span>
        <span class="legend-label">区切り</span>
      </div>
      <div class="toggle-btns">
        <button class="toggle-btn${showTrans?" on":""}" onclick="toggleTrans()" style="${showTrans?"color:#CDA69A":""}">
          ${showTrans?"訳 表示中":"訳 非表示"}
        </button>
        <button class="toggle-btn${showSlash?" on":""}" onclick="toggleSlash()" style="${showSlash?`color:${l.theme.slash||'#567B89'}`:""}">
          ${showSlash?"/ 表示中":"/ 非表示"}
        </button>
      </div>
    </div>`;

  // 各sentenceを文末記号で分割してカードを生成
  let sentenceCards = "";
  let cardIndex = 0;

  l.sentences.forEach((s) => {
    const subGroups = splitChunksIntoSubSentences(s.chunks);

    subGroups.forEach((chunksGroup, groupIdx) => {
      const engText = getSubSentenceText(chunksGroup);
      if (!engText) return;

      // ja訳の決定：
      // - 最初のサブグループ → s.ja（元データの訳）を使う
      // - 2つ目以降のサブグループ → キャッシュにあれば使う、なければプレースホルダー
      let jaText = "";
      if (groupIdx === 0) {
        jaText = s.ja || "";
      } else {
        // キャッシュにあれば即表示、なければ「翻訳中...」と表示して非同期で取得
        jaText = jaCache[engText] || null;
      }

      const cardId = `sc-${cardIndex}`;
      cardIndex++;

      // 英文HTMLを生成
      const engHtml = chunksGroup.map(c => renderChunk(c, l)).join("");
      // speakボタン用のテキスト（HTMLエスケープ済み）
      const engTextEsc = escHtml(engText);

      if (jaText !== null) {
        // 訳が確定している場合
        sentenceCards += `
          <div class="sentence-card" id="${cardId}" style="border-left:3px solid ${l.theme.primary}44">
            <div class="sentence-en-row">
              <div class="sentence-en">${engHtml}</div>
              <button class="sentence-speak-btn" onclick="speakWord('${engTextEsc}')" style="color:${l.theme.primary}">🔊</button>
            </div>
            ${showTrans && jaText ? `<div class="sentence-ja">🇯🇵 ${escHtml(jaText)}</div>` : ""}
          </div>`;
      } else {
        // 訳が未取得の場合（プレースホルダー表示→非同期で更新）
        sentenceCards += `
          <div class="sentence-card" id="${cardId}" style="border-left:3px solid ${l.theme.primary}44">
            <div class="sentence-en-row">
              <div class="sentence-en">${engHtml}</div>
              <button class="sentence-speak-btn" onclick="speakWord('${engTextEsc}')" style="color:${l.theme.primary}">🔊</button>
            </div>
            ${showTrans ? `<div class="sentence-ja" id="ja-${cardId}">🇯🇵 <span style="color:#aaa">翻訳中...</span></div>` : ""}
          </div>`;

        // 非同期で翻訳を取得してDOMを更新
        if (showTrans) {
          translateSentence(engText).then(jaResult => {
            const jaEl = document.getElementById(`ja-${cardId}`);
            if (jaEl) jaEl.innerHTML = `🇯🇵 ${escHtml(jaResult)}`;
          });
        }
      }
    });
  });

  return legendHtml + `<div class="sentences">${sentenceCards}</div>`;
}

// ─── LIST TAB ─────────────────────────────────────────────────────────────────
function renderListTab(l, tc, allItems) {
  return `
    <div class="word-list-hint" style="padding:10px 16px 4px;font-size:12px;color:#888;text-align:center">
      🟠 単語  🔵 フレーズ ── タップすると発音・意味・例文が見られます
    </div>
    <div class="word-list">
      ${allItems.map(item => {
        const c = tc[item.t];
        const bm = bookmarks.has(item.w);
        const safeItem = JSON.stringify(item).replace(/'/g, "&#39;");
        return `
          <div class="word-card" style="border-left:4px solid ${c.border}">
            <div class="word-card-main" onclick='openPopup(${safeItem})' style="cursor:pointer">
              <div class="word-card-top">
                <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};font-weight:700">${c.label}</span>
                <span class="word-title" style="color:${c.text};font-weight:700">${escHtml(item.w)}</span>
              </div>
              <div class="word-pron">${escHtml(item.pron||"")} <span class="word-ipa">${escHtml(item.ipa||"")}</span></div>
              <div class="word-meaning">${escHtml(item.meaning||"")}</div>
            </div>
            <div class="word-card-actions">
              <button class="icon-btn" onclick="speakWord('${escHtml(item.w)}')">🔊</button>
              <button class="icon-btn bm-btn${bm?" active":""}" onclick="toggleBookmark('${escHtml(item.w)}')">${bm?"★":"☆"}</button>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

// ─── NOTEBOOK TAB ─────────────────────────────────────────────────────────────
function renderNotebookTab(l, tc, bmItems) {
  if (!bmItems.length) return `
    <div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-title">単語帳が空です</div>
      <div class="empty-sub">☆ をタップして単語を追加しましょう</div>
    </div>`;
  return `
    <div class="notebook-header">
      <span class="notebook-count">${bmItems.length}件登録中</span>
      <button class="flash-btn" onclick="startFlash()" style="background:${currentLesson.theme.primary}">🃏 フラッシュカード</button>
    </div>
    <div class="word-list">
      ${bmItems.map(item => {
        const c = tc[item.t];
        return `
          <div class="word-card" style="border-left:4px solid ${c.border}">
            <div class="word-card-main">
              <div class="word-card-top">
                <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${c.label}</span>
                <span class="word-title">${escHtml(item.w)}</span>
              </div>
              <div class="word-pron">${escHtml(item.pron||"")} <span class="word-ipa">${escHtml(item.ipa||"")}</span></div>
              <div class="word-meaning">${escHtml(item.meaning||"")}</div>
            </div>
            <div class="word-card-actions">
              <button class="icon-btn" onclick="speakWord('${escHtml(item.w)}')">🔊</button>
              <button class="icon-btn bm-btn active" onclick="toggleBookmark('${escHtml(item.w)}')">★</button>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

// ─── PRACTICE TAB ─────────────────────────────────────────────────────────────
function renderPracticeTab(l) {
  const mode = PRACTICE_MODES[practiceMode];
  const isConversation = practiceMode === "conversation" || practiceMode === "roleplay";
  const roleplayScenarios = ["✈️ 空港でのチェックイン","🏨 ホテルのフロントで","🍽️ レストランで注文","🛍️ ショッピングで店員と会話","🗺️ 道を聞く・教える","👗 ファッションについて語る"];
  return `
    <div class="practice-tab">
      <div class="practice-mode-grid">
        ${Object.entries(PRACTICE_MODES).map(([key,m]) => `
          <button class="practice-mode-btn${practiceMode===key?" active":""}" onclick="selectPracticeMode('${key}')"
            style="${practiceMode===key?`background:${m.color};color:#fff;border-color:${m.color}`:""}">
            <span class="practice-mode-icon">${m.icon}</span>
            <span class="practice-mode-label">${m.label.replace(m.icon+" ","")}</span>
          </button>`).join("")}
      </div>
      <div class="practice-desc" style="border-left:3px solid ${mode.color}">
        <strong>${mode.label}</strong>　${mode.desc}
      </div>
      ${practiceMode==="roleplay"?`
        <div class="scenario-list">
          <div class="scenario-title">🎭 シナリオを選んでください</div>
          ${roleplayScenarios.map(s=>`<button class="scenario-btn" onclick="startRoleplay('${escHtml(s)}')">${s}</button>`).join("")}
        </div>`:""}
      <div id="practice-messages" class="ai-messages practice-messages">
        ${practiceHistory.length===0
          ? `<div class="practice-welcome">${mode.icon} ${getPracticeWelcome(practiceMode)}</div>`
          : practiceHistory.map(m=>`<div class="ai-bubble ${m.role}">${escHtml(m.text)}</div>`).join("")}
      </div>
      ${practiceMode!=="roleplay"||practiceHistory.length>0?`
        <div class="ai-input-row">
          <input id="practice-input" class="ai-input" type="text"
            placeholder="${getPracticePlaceholder(practiceMode)}"
            onkeydown="if(event.key==='Enter')sendPractice()">
          <button class="ai-send-btn" onclick="sendPractice()" style="background:${mode.color}">送信</button>
        </div>
        ${isConversation?`<button class="speak-input-btn" onclick="speakMyInput()" style="color:${mode.color}">🔊 AIの返答を読み上げる</button>`:""}
      `:""}
      ${practiceHistory.length>0?`<button class="reset-practice-btn" onclick="resetPractice()">🔄 会話をリセット</button>`:""}
    </div>`;
}

function getPracticeWelcome(mode) {
  return {
    free: "スクリプトについて何でも聞いてください！",
    conversation: "Let's practice English conversation!\nまず英語で話しかけてみてください 😊",
    correction: "英文を入力してください。\n丁寧に添削します！",
    roleplay: "シナリオを選んで会話練習を始めましょう！",
    quiz: "「スタート」と入力してクイズを始めましょう！"
  }[mode] || "";
}

function getPracticePlaceholder(mode) {
  return {
    free: "例：'goes back to' の使い方を教えて",
    conversation: "Type in English...",
    correction: "添削してほしい英文を入力...",
    roleplay: "英語で話しかけてください...",
    quiz: "「スタート」または答えを入力..."
  }[mode] || "";
}

function selectPracticeMode(mode) {
  practiceMode = mode; practiceHistory = []; renderLesson();
}

function startRoleplay(scenario) {
  practiceHistory = [];
  const systemPrompt = getSystemPrompt("roleplay", currentLesson) +
    `\n\n現在のシナリオ: ${scenario}\nあなたからシナリオに合った役を演じて会話を始めてください。`;
  addPracticeMessage("ai", "⏳ シナリオを準備中...");
  renderPracticeMessages();
  callAI(
    [{ role: "user", parts: [{ text: `シナリオ「${scenario}」で会話練習を始めてください。` }] }],
    systemPrompt
  ).then(reply => {
    practiceHistory = [{ role: "ai", text: reply }];
    renderLesson();
    setTimeout(() => scrollPractice(), 100);
  });
}

function addPracticeMessage(role, text) { practiceHistory.push({ role, text }); }

function renderPracticeMessages() {
  const msgs = document.getElementById("practice-messages");
  if (!msgs) return;
  msgs.innerHTML = practiceHistory.map(m =>
    `<div class="ai-bubble ${m.role}">${escHtml(m.text)}</div>`
  ).join("");
  scrollPractice();
}

function scrollPractice() {
  const msgs = document.getElementById("practice-messages");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

async function sendPractice() {
  const input = document.getElementById("practice-input");
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";
  addPracticeMessage("user", msg);
  addPracticeMessage("ai", "考え中...");
  renderPracticeMessages();
  const messages = practiceHistory
    .filter(m => m.text !== "考え中...")
    .slice(0, -1)
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  messages.push({ role: "user", parts: [{ text: msg }] });
  const reply = await callAI(messages, getSystemPrompt(practiceMode, currentLesson));
  const idx = practiceHistory.findLastIndex(m => m.text === "考え中...");
  if (idx !== -1) practiceHistory[idx] = { role: "ai", text: reply };
  renderPracticeMessages();
  if (practiceMode === "conversation" || practiceMode === "roleplay") {
    speakWord(reply.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, ""));
  }
}

function speakMyInput() {
  const lastAI = [...practiceHistory].reverse().find(m => m.role === "ai");
  if (lastAI) speakWord(lastAI.text.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, ""));
}

function resetPractice() { practiceHistory = []; renderLesson(); }

function switchTab(tab) { currentTab = tab; renderLesson(); window.scrollTo(0, 0); }
function toggleTrans() { showTrans = !showTrans; renderLesson(); }
function toggleSlash() { showSlash = !showSlash; renderLesson(); }
function toggleBookmark(word) {
  bookmarks.has(word) ? bookmarks.delete(word) : bookmarks.add(word);
  renderLesson();
}

// ─── POPUP（単語・フレーズ共通）────────────────────────────────────────────────
// 【修正ポイント3】vocab も phrase も同じポップアップが開く
// 英検3級向けに「覚えるポイント」メッセージを表示
function openPopup(item) {
  if (typeof item === "string") item = JSON.parse(item);
  const l = currentLesson;
  const tc = getTC(l);
  const c = tc[item.t];
  const bm = bookmarks.has(item.w);

  const overlay = document.getElementById("popup-overlay");
  const card = document.getElementById("popup-card");
  overlay.classList.remove("hidden");
  card.classList.remove("hidden");
  card.style.borderTop = `6px solid ${c.border}`;

  // 英検3級向けの学習ヒント
  const studyTip = item.t === "vocab"
    ? `<div style="background:#FFF8E1;border:1px solid #FFD54F;border-radius:8px;padding:8px 12px;margin:10px 0;font-size:13px;line-height:1.5">
        📌 <strong>覚えよう！</strong><br>英検3級以上で役立つ重要単語です。<br>発音を声に出して練習しましょう 🗣️
      </div>`
    : `<div style="background:#E8F5E9;border:1px solid #81C784;border-radius:8px;padding:8px 12px;margin:10px 0;font-size:13px;line-height:1.5">
        💡 <strong>フレーズで覚えよう！</strong><br>このまま丸ごと暗記すると会話で使えます ✨
      </div>`;

  card.innerHTML = `
    <div class="popup-header">
      <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};font-weight:700;padding:3px 10px;border-radius:99px;font-size:12px">${c.label}</span>
      <button class="bm-popup-btn" onclick="toggleBookmarkPopup('${escHtml(item.w)}')" style="color:${bm?"#E08800":"#ccc"};font-size:22px;background:none;border:none;cursor:pointer">${bm?"★":"☆"}</button>
    </div>
    <div class="popup-word-row">
      <div class="popup-word" style="color:${c.text};font-size:22px;font-weight:800">"${escHtml(item.w)}"</div>
      <button class="popup-speak-btn" onclick="speakWord('${escHtml(item.w)}')" style="background:${c.border};color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:16px;cursor:pointer">🔊</button>
    </div>
    <div class="popup-pron" style="margin:6px 0;font-size:14px;color:#555">カタカナ: <strong>${escHtml(item.pron||"")}</strong></div>
    <div class="popup-ipa" style="font-size:13px;color:#888;margin-bottom:6px">${escHtml(item.ipa||"")}</div>
    <div class="popup-meaning" style="font-size:16px;font-weight:600;color:#222;margin:8px 0">🇯🇵 ${escHtml(item.meaning||"")}</div>
    ${studyTip}
    <div class="popup-example" style="background:#f5f5f5;border-radius:8px;padding:10px 12px;margin:8px 0">
      <div style="font-size:12px;color:#888;margin-bottom:4px;font-weight:600">📝 例文</div>
      <div style="font-size:14px;color:#333;line-height:1.6">${escHtml(item.example||"")}</div>
    </div>
    ${bm?`<div class="popup-bm-note" style="color:#E08800;font-size:13px;text-align:center;margin:6px 0">★ 単語帳に登録済み</div>`:""}
    <button class="popup-close-btn" onclick="closePopup()" style="background:${c.border};color:#fff;border:none;border-radius:8px;padding:10px;width:100%;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px">閉じる</button>`;
}

function toggleBookmarkPopup(word) {
  bookmarks.has(word) ? bookmarks.delete(word) : bookmarks.add(word);
  const bm = bookmarks.has(word);
  const btn = document.querySelector(".bm-popup-btn");
  if (btn) { btn.textContent = bm ? "★" : "☆"; btn.style.color = bm ? "#E08800" : "#ccc"; }
  const note = document.querySelector(".popup-bm-note");
  if (bm && !note) {
    document.querySelector(".popup-close-btn").insertAdjacentHTML("beforebegin",
      `<div class="popup-bm-note" style="color:#E08800;font-size:13px;text-align:center;margin:6px 0">★ 単語帳に登録済み</div>`);
  } else if (!bm && note) {
    note.remove();
  }
}

function closePopup() {
  document.getElementById("popup-overlay").classList.add("hidden");
  document.getElementById("popup-card").classList.add("hidden");
}

// ─── FLASH CARD ───────────────────────────────────────────────────────────────
let flashIdx = 0, flashFlipped = false, flashResults = [];

function startFlash() { flashIdx = 0; flashFlipped = false; flashResults = []; renderFlash(); }

function renderFlash() {
  const l = currentLesson, tc = getTC(l);
  const items = getAllItems(l).filter(x => bookmarks.has(x.w));
  const overlay = document.getElementById("flash-overlay");
  const card = document.getElementById("flash-card");
  overlay.classList.remove("hidden");
  card.classList.remove("hidden");

  if (flashIdx >= items.length) {
    const ok = flashResults.filter(r => r === "ok").length;
    card.innerHTML = `
      <div class="flash-done">
        <div class="flash-done-icon">🎉</div>
        <div class="flash-done-title">完了！</div>
        <div class="flash-done-score">${items.length}問中 <strong style="color:${l.theme.primary}">${ok}問</strong> 正解</div>
        <div class="flash-done-btns">
          <button onclick="startFlash()" style="background:${l.theme.primary}">もう一度</button>
          <button onclick="closeFlash()" style="background:#888">閉じる</button>
        </div>
      </div>`;
    return;
  }

  const item = items[flashIdx], c = tc[item.t];
  card.innerHTML = `
    <div class="flash-counter">${flashIdx + 1} / ${items.length}</div>
    <div class="flash-face${flashFlipped ? " flipped" : ""}" onclick="flipCard()"
      style="background:${flashFlipped ? c.bg : `linear-gradient(135deg,${l.theme.bg1},${l.theme.bg3})`};border:2px solid ${flashFlipped ? c.border : "transparent"}">
      <div class="flash-face-word" style="color:${flashFlipped ? c.text : "#2a3a42"}">${escHtml(item.w)}</div>
      ${flashFlipped ? `
        <button onclick="event.stopPropagation();speakWord('${escHtml(item.w)}')"
          style="margin-top:8px;background:${c.border};border:none;border-radius:99px;padding:4px 12px;color:#fff;font-weight:700;font-size:12px;cursor:pointer">🔊 発音</button>
        <div class="flash-face-ipa">${escHtml(item.ipa||"")}</div>
        <div class="flash-face-pron">${escHtml(item.pron||"")}</div>
        <div class="flash-face-meaning">${escHtml(item.meaning||"")}</div>
      ` : `<div class="flash-face-hint">タップして答えを見る</div>`}
    </div>
    ${flashFlipped ? `
      <div class="flash-btns">
        <button onclick="answerFlash('ng')" style="background:#e74c3c">😓 もう一度</button>
        <button onclick="answerFlash('ok')" style="background:#27AE60">✅ 覚えた！</button>
      </div>` : ""}`;
}

function flipCard() { flashFlipped = true; renderFlash(); }
function answerFlash(r) { flashResults.push(r); flashIdx++; flashFlipped = false; renderFlash(); }
function closeFlash() {
  document.getElementById("flash-overlay").classList.add("hidden");
  document.getElementById("flash-card").classList.add("hidden");
}

window.addEventListener("load", () => {
  window.speechSynthesis?.getVoices();
  renderHome();
});
