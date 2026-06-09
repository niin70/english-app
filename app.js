// ─── STATE ───────────────────────────────────────────────────────────────────
let currentLesson = null;
let currentTab = "script";
let showSlash = true;
let showTrans = true;
let bookmarks = new Set();
let popup = null;
let playing = false;
let progressInterval = null;
let aiChatHistory = [];

const LESSONS = [THAILAND_LESSON, FASHION_LESSON];

// ─── AI API（サーバー経由・APIキーはサーバー側のみ）───────────────────────
async function askAI(userMessage, lesson) {
  const systemPrompt = `あなたは英語学習アシスタントです。
以下のスクリプトを学習している日本人ユーザーをサポートしてください。

スクリプトタイトル: ${lesson.title}
スクリプト本文:
${lesson.fullText}

ルール:
- 質問には日本語で丁寧に答えてください
- 単語・フレーズの説明は「意味」「使い方」「例文」の形で答えてください
- スクリプトに関係する英語の練習問題を求められたら出題してください
- 発音のコツや覚え方のヒントも積極的に提供してください
- 返答は簡潔に、でも分かりやすくしてください`;

  const messages = [
    ...aiChatHistory,
    { role: "user", parts: [{ text: userMessage }] }
  ];

  try {
    // ★ APIキーはブラウザに渡さず、サーバー側の /api/chat で処理
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, systemPrompt })
    });

    const data = await res.json();
    if (data.error) return `エラー: ${data.error}`;

    const reply = data.reply;
    aiChatHistory.push(
      { role: "user", parts: [{ text: userMessage }] },
      { role: "model", parts: [{ text: reply }] }
    );
    if (aiChatHistory.length > 20) aiChatHistory = aiChatHistory.slice(-20);
    return reply;

  } catch (e) {
    return `通信エラー: ${e.message}`;
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
  if (playing) {
    window.speechSynthesis.cancel();
    setPlaying(false);
    return;
  }
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
    setPlaying(false);
    clearInterval(progressInterval);
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderChunk(chunk, lesson) {
  const tc = getTC(lesson);
  if (chunk.t === "normal") return `<span>${escHtml(chunk.w)}</span>`;
  if (chunk.t === "slash") {
    return showSlash
      ? `<span class="slash-mark">/</span>`
      : `<span style="visibility:hidden"> </span>`;
  }
  const c = tc[chunk.t];
  const bm = bookmarks.has(chunk.w) ? '<sup class="bm-star">★</sup>' : "";
  const dataItem = escHtml(JSON.stringify(chunk));
  return `<mark class="chunk-mark" data-item="${dataItem}" style="background:${c.bg};color:${c.text};border-bottom:2.5px solid ${c.border}">${escHtml(chunk.w)}${bm}</mark>`;
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────
function renderHome() {
  document.getElementById("app").innerHTML = `
    <div class="home-screen">
      <div class="home-header">
        <div class="home-label">📚 English Learning App</div>
        <h1 class="home-title">My English<br>Script Library</h1>
        <p class="home-sub">会話から生まれた英語スクリプトを学ぼう</p>
      </div>
      <div class="lesson-cards">
        ${LESSONS.map(l => `
          <button class="lesson-card" onclick="openLesson('${l.id}')" style="border-top:4px solid ${l.theme.primary}">
            <div class="lesson-card-title">${l.title}</div>
            <div class="lesson-card-meta">${l.sentences.length}文 · ${getAllItems(l).length}単語/フレーズ</div>
            <div class="lesson-card-arrow" style="color:${l.theme.primary}">学習開始 →</div>
          </button>
        `).join("")}
      </div>
      <div class="home-footer">📁 アーカイブ：会話①タイ旅行 / 会話②ファッション</div>
    </div>`;
}

function openLesson(id) {
  currentLesson = LESSONS.find(l => l.id === id);
  bookmarks = new Set();
  aiChatHistory = [];
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
        ${[["script","📄 スクリプト"],["list","📚 単語一覧"],["notebook",`★ 単語帳${bookmarks.size > 0 ? ` (${bookmarks.size})` : ""}`],["ai","🤖 AI質問"]].map(([k,lb]) =>
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
    <div id="flash-card" class="flash-card hidden"></div>
  `;

  document.querySelectorAll(".chunk-mark").forEach(el => {
    el.addEventListener("click", () => {
      const item = JSON.parse(el.getAttribute("data-item").replace(/&quot;/g, '"'));
      openPopup(item);
    });
  });
}

function renderTabContent(l, tc, allItems, bmItems) {
  if (currentTab === "script")   return renderScriptTab(l, tc);
  if (currentTab === "list")     return renderListTab(l, tc, allItems);
  if (currentTab === "notebook") return renderNotebookTab(l, tc, bmItems);
  if (currentTab === "ai")       return renderAITab(l);
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
        <button class="toggle-btn${showTrans?" on":""}" onclick="toggleTrans()" style="${showTrans?"color:#ffd060":""}">
          ${showTrans ? "訳 表示中" : "訳 非表示"}
        </button>
        <button class="toggle-btn${showSlash?" on":""}" onclick="toggleSlash()" style="${showSlash?`color:${l.theme.slash}`:""}">
          ${showSlash ? "/ 表示中" : "/ 非表示"}
        </button>
      </div>
    </div>
    <div class="sentences">
      ${l.sentences.map(s => `
        <div class="sentence-card" style="border-left:3px solid ${l.theme.primary}44">
          <div class="sentence-en">${s.chunks.map(c => renderChunk(c, l)).join("")}</div>
          ${showTrans ? `<div class="sentence-ja">🇯🇵 ${escHtml(s.ja)}</div>` : ""}
        </div>
      `).join("")}
    </div>`;
}

function renderListTab(l, tc, allItems) {
  return `
    <div class="word-list">
      ${allItems.map(item => {
        const c = tc[item.t];
        const bm = bookmarks.has(item.w);
        const di = escHtml(JSON.stringify(item));
        return `
          <div class="word-card" style="border-left:4px solid ${c.border}">
            <div class="word-card-main" onclick='openPopup(${JSON.stringify(item)})'>
              <div class="word-card-top">
                <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${c.label}</span>
                <span class="word-title">${escHtml(item.w)}</span>
              </div>
              <div class="word-pron">${escHtml(item.pron)} <span class="word-ipa">${escHtml(item.ipa)}</span></div>
              <div class="word-meaning">${escHtml(item.meaning)}</div>
            </div>
            <div class="word-card-actions">
              <button class="icon-btn speak-btn" onclick="speakWord('${escHtml(item.w)}')">🔊</button>
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
              <div class="word-pron">${escHtml(item.pron)} <span class="word-ipa">${escHtml(item.ipa)}</span></div>
              <div class="word-meaning">${escHtml(item.meaning)}</div>
            </div>
            <div class="word-card-actions">
              <button class="icon-btn speak-btn" onclick="speakWord('${escHtml(item.w)}')">🔊</button>
              <button class="icon-btn bm-btn active" onclick="toggleBookmark('${escHtml(item.w)}')">★</button>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function renderAITab(l) {
  return `
    <div class="ai-tab">
      <div class="ai-intro">
        <div class="ai-intro-icon">🤖</div>
        <div class="ai-intro-text">スクリプトについて何でも聞いてください！<br>単語の意味、発音のコツ、練習問題など</div>
      </div>
      <div id="ai-messages" class="ai-messages">
        ${aiChatHistory.filter((_,i) => i % 2 === 0).map((msg, i) => {
          const reply = aiChatHistory[i*2+1];
          return `
            <div class="ai-bubble user">${escHtml(msg.parts[0].text)}</div>
            ${reply ? `<div class="ai-bubble ai">${escHtml(reply.parts[0].text)}</div>` : ""}`;
        }).join("")}
      </div>
      <div class="ai-input-row">
        <input id="ai-input" class="ai-input" type="text"
          placeholder="例：'goes back to' の使い方を教えて"
          onkeydown="if(event.key==='Enter')sendAI()">
        <button class="ai-send-btn" onclick="sendAI()" style="background:${l.theme.primary}">送信</button>
      </div>
    </div>`;
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  renderLesson();
  window.scrollTo(0, 0);
}
function toggleTrans() { showTrans = !showTrans; renderLesson(); }
function toggleSlash() { showSlash = !showSlash; renderLesson(); }

// ─── BOOKMARK ────────────────────────────────────────────────────────────────
function toggleBookmark(word) {
  bookmarks.has(word) ? bookmarks.delete(word) : bookmarks.add(word);
  renderLesson();
}

// ─── POPUP ───────────────────────────────────────────────────────────────────
function openPopup(item) {
  if (typeof item === "string") item = JSON.parse(item);
  popup = item;
  const l = currentLesson;
  const tc = getTC(l);
  const c = tc[item.t];
  const bm = bookmarks.has(item.w);
  const overlay = document.getElementById("popup-overlay");
  const card = document.getElementById("popup-card");
  overlay.classList.remove("hidden");
  card.classList.remove("hidden");
  card.style.borderTop = `6px solid ${c.border}`;
  card.innerHTML = `
    <div class="popup-header">
      <span class="word-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${c.label}</span>
      <button class="bm-popup-btn" onclick="toggleBookmarkPopup('${escHtml(item.w)}')" style="color:${bm?"#F5A623":"#ccc"}">${bm?"★":"☆"}</button>
    </div>
    <div class="popup-word-row">
      <div class="popup-word">"${escHtml(item.w)}"</div>
      <button class="popup-speak-btn" onclick="speakWord('${escHtml(item.w)}')" style="background:${c.border}">🔊</button>
    </div>
    <div class="popup-pron">カタカナ: <strong>${escHtml(item.pron)}</strong></div>
    <div class="popup-ipa">${escHtml(item.ipa)}</div>
    <div class="popup-meaning">🇯🇵 ${escHtml(item.meaning)}</div>
    <div class="popup-example">
      <div class="popup-example-label">例文</div>
      <div class="popup-example-text">${escHtml(item.example)}</div>
    </div>
    ${bm ? `<div class="popup-bm-note">★ 単語帳に登録済み</div>` : ""}
    <button class="popup-close-btn" onclick="closePopup()" style="background:${c.border}">閉じる</button>`;
}

function toggleBookmarkPopup(word) {
  bookmarks.has(word) ? bookmarks.delete(word) : bookmarks.add(word);
  const bm = bookmarks.has(word);
  const btn = document.querySelector(".bm-popup-btn");
  if (btn) { btn.textContent = bm ? "★" : "☆"; btn.style.color = bm ? "#F5A623" : "#ccc"; }
  const note = document.querySelector(".popup-bm-note");
  if (bm && !note) {
    document.querySelector(".popup-close-btn").insertAdjacentHTML("beforebegin", `<div class="popup-bm-note">★ 単語帳に登録済み</div>`);
  } else if (!bm && note) { note.remove(); }
}

function closePopup() {
  document.getElementById("popup-overlay").classList.add("hidden");
  document.getElementById("popup-card").classList.add("hidden");
}

// ─── FLASHCARD ────────────────────────────────────────────────────────────────
let flashIdx = 0, flashFlipped = false, flashResults = [];

function startFlash() {
  flashIdx = 0; flashFlipped = false; flashResults = [];
  renderFlash();
}

function renderFlash() {
  const l = currentLesson;
  const tc = getTC(l);
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

  const item = items[flashIdx];
  const c = tc[item.t];
  card.innerHTML = `
    <div class="flash-counter">${flashIdx+1} / ${items.length}</div>
    <div class="flash-face${flashFlipped?" flipped":""}" onclick="flipCard()"
      style="background:${flashFlipped ? c.bg : `linear-gradient(135deg,${l.theme.bg1},${l.theme.bg3})`};border:2px solid ${flashFlipped?c.border:"transparent"}">
      <div class="flash-face-word" style="color:${flashFlipped?c.text:"#fff"}">${escHtml(item.w)}</div>
      ${flashFlipped ? `
        <button onclick="event.stopPropagation();speakWord('${escHtml(item.w)}')"
          style="margin-top:8px;background:${c.border};border:none;border-radius:99px;padding:4px 12px;color:#fff;font-weight:700;font-size:12px;cursor:pointer">
          🔊 発音
        </button>
        <div class="flash-face-ipa">${escHtml(item.ipa)}</div>
        <div class="flash-face-pron">${escHtml(item.pron)}</div>
        <div class="flash-face-meaning">${escHtml(item.meaning)}</div>
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

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
async function sendAI() {
  const input = document.getElementById("ai-input");
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";

  const msgs = document.getElementById("ai-messages");
  if (msgs) {
    msgs.innerHTML += `<div class="ai-bubble user">${escHtml(msg)}</div>`;
    msgs.innerHTML += `<div class="ai-bubble ai loading">考え中<span class="dots">...</span></div>`;
    msgs.scrollTop = msgs.scrollHeight;
  }

  const reply = await askAI(msg, currentLesson);

  const loading = document.querySelector(".ai-bubble.loading");
  if (loading) loading.outerHTML = `<div class="ai-bubble ai">${escHtml(reply)}</div>`;
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
window.addEventListener("load", () => {
  window.speechSynthesis?.getVoices();
  renderHome();
});
