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


async function generateLesson(userInput) {
  const systemPrompt = `あなたは英語学習コンテンツ作成の専門家です。

【絵文字選定】話題に合った絵文字を必ず選ぶ：
音楽🎵 料理🍳 旅行✈️ スポーツ⚽ ファッション👗 健康💪 映画🎬 仕事💼 自然🌿 読書📚 アート🎨 趣味🎯

【スクリプト構成】2部構成：
Part1（8文）：ユーザーの英語スピーチ
Part2（6文）：ネイティブとの会話（ja に【あなた】【ネイティブ】を先頭につける）

【chunksの作り方 ★最重要★】
- 1つのchunkは意味のある塊（単語1つ〜フレーズ）
- 絶対にNG：1単語ずつ分割すること。"Hello/everyone/Today" のような分割は禁止
- スラッシュは句・節の区切りにのみ使う（3〜8語ごとに1回程度）
- 正しい例：
  [{"w":"If you ask me","t":"phrase",...}, {"w":" /","t":"slash"}, {"w":" what I love about this show","t":"normal"}, {"w":" /","t":"slash"}, {"w":" it's the","t":"normal"}, {"w":" compelling","t":"vocab",...}, {"w":" storyline.","t":"normal"}]
- 悪い例（禁止）：
  [{"w":"If","t":"normal"},{"w":"/","t":"slash"},{"w":"you","t":"normal"},{"w":"/","t":"slash"}...]

【vocab・phrase選定ルール】
絶対選ばない：人名・地名・固有名詞・簡単な単語(good/like/very)
必ず選ぶ（英会話で役立つ表現）：
vocab例：compelling、sophisticated、genuinely、obsessed、fascinating、portrayed、stunning、resonate
phrase例："I can't help but"、"what I love about"、"to be honest"、"no wonder"、"ever since"、"I'm totally into"、"it really hits different"、"I have to say"

各文に vocab か phrase を1〜2個含める。
chunksの最後は必ず {"w":"[句読点]","t":"normal"} で終わる。

JSON形式のみで返答（JSON以外禁止）：

{
  "id": "lesson_[英語ID]",
  "title": "[絵文字] [英語タイトル]",
  "theme": {
    "primary": "#567B89",
    "secondary": "#CDA69A",
    "bg1": "#f9f5f2",
    "bg2": "#eef3f6",
    "bg3": "#f5f0ee",
    "slash": "#567B89",
    "vocabBg": "#FFF3E0",
    "vocabBorder": "#CDA69A",
    "vocabText": "#7A4A35",
    "phraseBg": "#E3EFF3",
    "phraseBorder": "#567B89",
    "phraseText": "#1A3A42"
  },
  "fullText": "[全文]",
  "sentences": [
    {
      "id": 0,
      "ja": "[日本語訳]",
      "chunks": [
        {"w": "If you ask me", "t": "phrase", "pron": "イフ ユー アスク ミー", "ipa": "/ɪf juː æsk miː/", "meaning": "私に言わせれば", "example": "If you ask me, this is amazing."},
        {"w": " /", "t": "slash"},
        {"w": " what I think,", "t": "normal"},
        {"w": " /", "t": "slash"},
        {"w": " it's", "t": "normal"},
        {"w": " compelling", "t": "vocab", "pron": "コンペリング", "ipa": "/kəmˈpel.ɪŋ/", "meaning": "魅力的な・引き込まれる", "example": "The story is so compelling."},
        {"w": ".", "t": "normal"}
      ]
    }
  ]
}`;

  const messages = [{
    role: "user",
    parts: [{ text: `以下の内容で英語学習スクリプトを作成してください。ユーザーの話と、ネイティブとの会話を含めてください：\n\n${userInput}` }]
  }];

  const reply = await callAI(messages, systemPrompt, 4000);

  try {
    const clean = reply.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON parse error:", e);
    return null;
  }
}
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

function getTC(lesson) {
  return {
    vocab:  { bg: lesson.theme.vocabBg,  border: lesson.theme.vocabBorder,  text: lesson.theme.vocabText,  label: "単語" },
    phrase: { bg: lesson.theme.phraseBg, border: lesson.theme.phraseBorder, text: lesson.theme.phraseText, label: "フレーズ" }
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

function renderChunk(chunk, lesson) {
  const tc = getTC(lesson);
  if (chunk.t === "normal") return `<span>${escHtml(chunk.w)}</span>`;
  if (chunk.t === "slash") return showSlash ? `<span class="slash-mark">/</span>` : `<span style="visibility:hidden"> </span>`;
  const c = tc[chunk.t];
  const bm = bookmarks.has(chunk.w) ? '<sup class="bm-star">★</sup>' : "";
  const dataItem = escHtml(JSON.stringify(chunk));
  return `<mark class="chunk-mark" data-item="${dataItem}" style="background:${c.bg};color:${c.text};border-bottom:2.5px solid ${c.border}">${escHtml(chunk.w)}${bm}</mark>`;
}
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
  status.innerHTML = `<div class="generating"><div class="generating-icon">🤖</div><div class="generating-text">AIがスクリプトを生成中です...<br>少々お待ちください（10〜20秒）</div></div>`;
  const lesson = await generateLesson(input.value.trim());
  if (!lesson) {
    status.innerHTML = `<div class="generate-error">❌ 生成に失敗しました。もう一度試してください。</div>`;
    btn.disabled = false; btn.textContent = "🤖 AIでスクリプトを生成する"; return;
  }
  lesson.custom = true;
  showPreview(lesson);
  btn.disabled = false; btn.textContent = "🤖 AIでスクリプトを生成する";
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
        ${[["script","📄 スクリプト"],["list","📚 単語一覧"],["notebook",`★ 単語帳${bookmarks.size>0?` (${bookmarks.size})`:""}`],["practice","🗣️ 英会話練習"]].map(([k,lb]) =>
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
  document.querySelectorAll(".chunk-mark").forEach(el => {
    el.addEventListener("click", () => {
      const item = JSON.parse(el.getAttribute("data-item").replace(/&quot;/g,'"'));
      openPopup(item);
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

function renderScriptTab(l, tc) {
  return `
    <div class="controls-row">
      <div class="legend">
        <span class="legend-dot" style="background:${tc.vocab.border}"></span><span class="legend-label">単語</span>
        <span class="legend-dot" style="background:${tc.phrase.border}"></span><span class="legend-label">フレーズ</span>
        <span class="legend-slash" style="color:${l.theme.slash}">/</span><span class="legend-label">区切り</span>
      </div>
      <div class="toggle-btns">
        <button class="toggle-btn${showTrans?" on":""}" onclick="toggleTrans()" style="${showTrans?"color:#CDA69A":""}">
          ${showTrans?"訳 表示中":"訳 非表示"}
        </button>
        <button class="toggle-btn${showSlash?" on":""}" onclick="toggleSlash()" style="${showSlash?`color:${l.theme.slash}`:""}">
          ${showSlash?"/ 表示中":"/ 非表示"}
        </button>
      </div>
    </div>
    <div class="sentences">
      ${l.sentences.map(s => `
        <div class="sentence-card" style="border-left:3px solid ${l.theme.primary}44">
          <div class="sentence-en-row">
            <div class="sentence-en">${s.chunks.map(c => renderChunk(c, l)).join("")}</div>
            <button class="sentence-speak-btn" onclick="speakWord('${escHtml(getSentenceText(s))}')" style="color:${l.theme.primary}">🔊</button>
          </div>
          ${showTrans?`<div class="sentence-ja">🇯🇵 ${escHtml(s.ja)}</div>`:""}
        </div>`).join("")}
    </div>`;
}

function renderListTab(l, tc, allItems) {
  return `
    <div class="word-list">
      ${allItems.map(item => {
        const c = tc[item.t];
        const bm = bookmarks.has(item.w);
        return `
          <div class="word-card" style="border-left:4px solid ${c.border}">
            <div class="word-card-main" onclick='openPopup(${JSON.stringify(item)})'>
              <div class="word-card-top">
                <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${c.label}</span>
                <span class="word-title">${escHtml(item.w)}</span>
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
        ${practiceHistory.length===0?`<div class="practice-welcome">${mode.icon} ${getPracticeWelcome(practiceMode)}</div>`:
          practiceHistory.map(m=>`<div class="ai-bubble ${m.role}">${escHtml(m.text)}</div>`).join("")}
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
  return {free:"スクリプトについて何でも聞いてください！",conversation:"Let's practice English conversation!\nまず英語で話しかけてみてください 😊",correction:"英文を入力してください。\n丁寧に添削します！",roleplay:"シナリオを選んで会話練習を始めましょう！",quiz:"「スタート」と入力してクイズを始めましょう！"}[mode]||"";
}

function getPracticePlaceholder(mode) {
  return {free:"例：'goes back to' の使い方を教えて",conversation:"Type in English...",correction:"添削してほしい英文を入力...",roleplay:"英語で話しかけてください...",quiz:"「スタート」または答えを入力..."}[mode]||"";
}

function selectPracticeMode(mode) {
  practiceMode=mode; practiceHistory=[]; renderLesson();
}

function startRoleplay(scenario) {
  practiceHistory=[];
  const systemPrompt=getSystemPrompt("roleplay",currentLesson)+`\n\n現在のシナリオ: ${scenario}\nあなたからシナリオに合った役を演じて会話を始めてください。`;
  addPracticeMessage("ai","⏳ シナリオを準備中..."); renderPracticeMessages();
  callAI([{role:"user",parts:[{text:`シナリオ「${scenario}」で会話練習を始めてください。`}]}],systemPrompt).then(reply=>{
    practiceHistory=[{role:"ai",text:reply}]; renderLesson(); setTimeout(()=>scrollPractice(),100);
  });
}

function addPracticeMessage(role,text) { practiceHistory.push({role,text}); }

function renderPracticeMessages() {
  const msgs=document.getElementById("practice-messages");
  if (!msgs) return;
  msgs.innerHTML=practiceHistory.map(m=>`<div class="ai-bubble ${m.role}">${escHtml(m.text)}</div>`).join("");
  scrollPractice();
}

function scrollPractice() {
  const msgs=document.getElementById("practice-messages");
  if (msgs) msgs.scrollTop=msgs.scrollHeight;
}

async function sendPractice() {
  const input=document.getElementById("practice-input");
  if (!input) return;
  const msg=input.value.trim();
  if (!msg) return;
  input.value="";
  addPracticeMessage("user",msg);
  addPracticeMessage("ai","考え中...");
  renderPracticeMessages();
  const messages=practiceHistory.filter(m=>m.text!=="考え中...").slice(0,-1).map(m=>({role:m.role==="user"?"user":"model",parts:[{text:m.text}]}));
  messages.push({role:"user",parts:[{text:msg}]});
  const reply=await callAI(messages,getSystemPrompt(practiceMode,currentLesson));
  const idx=practiceHistory.findLastIndex(m=>m.text==="考え中...");
  if (idx!==-1) practiceHistory[idx]={role:"ai",text:reply};
  renderPracticeMessages();
  if (practiceMode==="conversation"||practiceMode==="roleplay") speakWord(reply.replace(/\[.*?\]/g,"").replace(/\(.*?\)/g,""));
}

function speakMyInput() {
  const lastAI=[...practiceHistory].reverse().find(m=>m.role==="ai");
  if (lastAI) speakWord(lastAI.text.replace(/\[.*?\]/g,"").replace(/\(.*?\)/g,""));
}

function resetPractice() { practiceHistory=[]; renderLesson(); }

function switchTab(tab) { currentTab=tab; renderLesson(); window.scrollTo(0,0); }
function toggleTrans() { showTrans=!showTrans; renderLesson(); }
function toggleSlash() { showSlash=!showSlash; renderLesson(); }
function toggleBookmark(word) { bookmarks.has(word)?bookmarks.delete(word):bookmarks.add(word); renderLesson(); }

function openPopup(item) {
  if (typeof item==="string") item=JSON.parse(item);
  const l=currentLesson, tc=getTC(l), c=tc[item.t], bm=bookmarks.has(item.w);
  const overlay=document.getElementById("popup-overlay"), card=document.getElementById("popup-card");
  overlay.classList.remove("hidden"); card.classList.remove("hidden");
  card.style.borderTop=`6px solid ${c.border}`;
  card.innerHTML=`
    <div class="popup-header">
      <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${c.label}</span>
      <button class="bm-popup-btn" onclick="toggleBookmarkPopup('${escHtml(item.w)}')" style="color:${bm?"#CDA69A":"#ccc"}">${bm?"★":"☆"}</button>
    </div>
    <div class="popup-word-row">
      <div class="popup-word">"${escHtml(item.w)}"</div>
      <button class="popup-speak-btn" onclick="speakWord('${escHtml(item.w)}')" style="background:${c.border}">🔊</button>
    </div>
    <div class="popup-pron">カタカナ: <strong>${escHtml(item.pron||"")}</strong></div>
    <div class="popup-ipa">${escHtml(item.ipa||"")}</div>
    <div class="popup-meaning">🇯🇵 ${escHtml(item.meaning||"")}</div>
    <div class="popup-example">
      <div class="popup-example-label">例文</div>
      <div class="popup-example-text">${escHtml(item.example||"")}</div>
    </div>
    ${bm?`<div class="popup-bm-note">★ 単語帳に登録済み</div>`:""}
    <button class="popup-close-btn" onclick="closePopup()" style="background:${c.border}">閉じる</button>`;
}

function toggleBookmarkPopup(word) {
  bookmarks.has(word)?bookmarks.delete(word):bookmarks.add(word);
  const bm=bookmarks.has(word);
  const btn=document.querySelector(".bm-popup-btn");
  if (btn){btn.textContent=bm?"★":"☆";btn.style.color=bm?"#CDA69A":"#ccc";}
  const note=document.querySelector(".popup-bm-note");
  if (bm&&!note) document.querySelector(".popup-close-btn").insertAdjacentHTML("beforebegin",`<div class="popup-bm-note">★ 単語帳に登録済み</div>`);
  else if (!bm&&note) note.remove();
}

function closePopup() {
  document.getElementById("popup-overlay").classList.add("hidden");
  document.getElementById("popup-card").classList.add("hidden");
}

let flashIdx=0,flashFlipped=false,flashResults=[];

function startFlash() { flashIdx=0; flashFlipped=false; flashResults=[]; renderFlash(); }

function renderFlash() {
  const l=currentLesson,tc=getTC(l),items=getAllItems(l).filter(x=>bookmarks.has(x.w));
  const overlay=document.getElementById("flash-overlay"),card=document.getElementById("flash-card");
  overlay.classList.remove("hidden"); card.classList.remove("hidden");
  if (flashIdx>=items.length) {
    const ok=flashResults.filter(r=>r==="ok").length;
    card.innerHTML=`<div class="flash-done"><div class="flash-done-icon">🎉</div><div class="flash-done-title">完了！</div><div class="flash-done-score">${items.length}問中 <strong style="color:${l.theme.primary}">${ok}問</strong> 正解</div><div class="flash-done-btns"><button onclick="startFlash()" style="background:${l.theme.primary}">もう一度</button><button onclick="closeFlash()" style="background:#888">閉じる</button></div></div>`;
    return;
  }
  const item=items[flashIdx],c=tc[item.t];
  card.innerHTML=`
    <div class="flash-counter">${flashIdx+1} / ${items.length}</div>
    <div class="flash-face${flashFlipped?" flipped":""}" onclick="flipCard()"
      style="background:${flashFlipped?c.bg:`linear-gradient(135deg,${l.theme.bg1},${l.theme.bg3})`};border:2px solid ${flashFlipped?c.border:"transparent"}">
      <div class="flash-face-word" style="color:${flashFlipped?c.text:"#2a3a42"}">${escHtml(item.w)}</div>
      ${flashFlipped?`
        <button onclick="event.stopPropagation();speakWord('${escHtml(item.w)}')" style="margin-top:8px;background:${c.border};border:none;border-radius:99px;padding:4px 12px;color:#fff;font-weight:700;font-size:12px;cursor:pointer">🔊 発音</button>
        <div class="flash-face-ipa">${escHtml(item.ipa||"")}</div>
        <div class="flash-face-pron">${escHtml(item.pron||"")}</div>
        <div class="flash-face-meaning">${escHtml(item.meaning||"")}</div>
      `:`<div class="flash-face-hint">タップして答えを見る</div>`}
    </div>
    ${flashFlipped?`<div class="flash-btns"><button onclick="answerFlash('ng')" style="background:#e74c3c">😓 もう一度</button><button onclick="answerFlash('ok')" style="background:#27AE60">✅ 覚えた！</button></div>`:""}`;
}

function flipCard() { flashFlipped=true; renderFlash(); }
function answerFlash(r) { flashResults.push(r); flashIdx++; flashFlipped=false; renderFlash(); }
function closeFlash() {
  document.getElementById("flash-overlay").classList.add("hidden");
  document.getElementById("flash-card").classList.add("hidden");
}

window.addEventListener("load", () => {
  window.speechSynthesis?.getVoices();
  renderHome();
});
