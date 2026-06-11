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

【絵文字選定ルール】必ず話題に合った絵文字を選んでください：
- 音楽・歌→🎵、料理・食事→🍳、旅行→✈️、スポーツ→⚽
- ファッション→👗、健康・ダイエット→💪、映画・ドラマ→🎬
- 仕事→💼、自然→🌿、動物→🐾、読書→📚、アート→🎨
- 友達・人間関係→👫、趣味全般→🎯、テクノロジー→💻

【スクリプト構成】必ず以下の2部構成にしてください：

Part 1（約8文）：ユーザーの自己紹介・意見・経験を英語スピーチとして
Part 2（約6文）：ネイティブとの自然な会話のやり取り
  - ネイティブ：興味を持って質問や共感のコメント
  - ユーザー：具体的に答える
  - ネイティブ：さらに深掘りまたは自分の意見を共有

Part 2の各文のja（日本語訳）には必ず【あなた】または【ネイティブ】を先頭につける。

【単語・フレーズ選定の厳格なルール】
絶対に選ばないもの：
- 人名・地名・固有名詞
- 誰でも知っている簡単な単語（good、like、very、want など）

必ず選ぶもの（英会話で役立つ表現）：
vocab（単語）の例：stunning、sophisticated、overwhelming、indulge、resonate、compelling、dedicate、transform、genuinely、obsessed
phrase（フレーズ）の例："to be honest"、"what I love about"、"the thing is"、"I can't help but"、"no wonder"、"I'm totally into"、"it really hits different"、"ever since"

【chunksの組み立てルール】
- スラッシュ {"w": " /", "t": "slash"} は文の途中・意味のかたまりの区切りにのみ入れる
- 文末にスラッシュを置いてはいけない
- vocab・phraseは必ず文の途中に配置する
- chunksの最後の要素は必ずnormalで句読点（"." "?" "!"）にすること
- 例：[{"w":"I love","t":"normal"},{"w":" /","t":"slash"},{"w":"this feeling","t":"phrase",...},{"w":".","t":"normal"}]

以下のJSON形式のみで返答してください（JSON以外出力禁止）：

{
  "id": "lesson_[英語ID]",
  "title": "[話題に合った絵文字] [英語タイトル]",
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
  "fullText": "[Part1とPart2を含む全文]",
  "sentences": [
    {
      "id": 0,
      "ja": "[日本語訳]",
      "chunks": [
        {"w": "[テキスト]", "t": "normal"},
        {"w": " /", "t": "slash"},
        {"w": "[重要単語]", "t": "vocab", "pron": "[カタカナ]", "ipa": "[IPA]", "meaning": "[日本語の意味]", "example": "[英語例文]"},
        {"w": ".", "t": "normal"}
      ]
    }
  ]
}`;

  const messages = [{
    role: "user",
    parts: [{ text: `以下の内容で英語学習スクリプトを作成してください。ユーザーの話す内容と、それに対するネイティブとの会話を含めてください：\n\n${userInput}` }]
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
