'use strict';

// ── Theme ─────────────────────────────────────────────────────────────────────
const VALID_THEMES = ['default', 'hacker', 'newspaper', 'magic', 'monochrome'];

function applyTheme(name) {
    if (!VALID_THEMES.includes(name)) name = 'default';
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('theme', name);
}

function loadTheme() {
    applyTheme(localStorage.getItem('theme') || 'default');
}

loadTheme();

// ── Window Controls ───────────────────────────────────────────────────────────
function minimizeWindow() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.minimize_window();
    }
}

function closeWindow() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.close_window();
    }
}

// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const el = document.getElementById('clock');
    if (el) el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function updateHeaderDate() {
    const el = document.getElementById('header-date');
    if (el) {
        el.textContent = new Date().toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
}

setInterval(updateClock, 1000);
updateClock();
updateHeaderDate();

// ── Loader ────────────────────────────────────────────────────────────────────
const LOADING_MESSAGES = [
    '> oh no. it\'s today.',
    '> fetching news feeds...',
    '> consulting the oracle...',
    '> reading the skies...',
    '> judging your letterboxd...',
    '> guessing daily wordle...',
    '> gambling away savings...',
    '> rolling for side quest...',
    '> assembling today\'s brief...',
];

let _lineIndex = 0;
const _loaderLines = document.getElementById('loader-lines');

function addLoaderLine() {
    if (!_loaderLines || _lineIndex >= LOADING_MESSAGES.length) return;
    const div = document.createElement('div');
    div.className = 'loader-line';
    div.textContent = LOADING_MESSAGES[_lineIndex++];
    _loaderLines.appendChild(div);
    setTimeout(addLoaderLine, 420);
}
addLoaderLine();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
fetch('/api/data')
    .then(r => {
        if (r.status === 400) return r.json().then(e => Promise.reject(e));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(data => {
        document.getElementById('loader').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        renderDashboard(data);
    })
    .catch(err => {
        if (err && err.error === 'no_key') {
            // No Groq key — redirect to settings
            document.getElementById('loader').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            document.querySelector('#content .container').innerHTML = `
                <div style="padding-top:80px">
                    <p class="loader-line">> groq api key not configured.</p>
                    <p style="margin-top:16px">
                        <a href="/settings" style="color:var(--accent);font-size:13px;text-decoration:none">
                            go to settings →
                        </a>
                    </p>
                </div>`;
        } else {
            if (_loaderLines) {
                const e = document.createElement('div');
                e.className = 'loader-line';
                e.style.color = 'var(--accent-error)';
                e.textContent = `> error: ${err.message || JSON.stringify(err)}`;
                _loaderLines.appendChild(e);
            }
        }
    });

// ── Dashboard Render ──────────────────────────────────────────────────────────
function renderDashboard(data) {
    renderNews(data.news || [], data.funny || []);
    renderWeather(data.weather || {});
    renderQuote(data.quote || {});
    renderMovies(data.movie_rec || {}, data.show_rec || {});
    renderPuzzles(data.date, data.wordle || {});
    renderQuest(data.sidequest || {});
    renderFooter(data.generated_at);
    if (data.errors && Object.keys(data.errors).length > 0) {
        console.warn('[ohNoItsToday] module errors:', data.errors);
    }
}

// ── News ──────────────────────────────────────────────────────────────────────
function renderNews(news, funny) {
    const el = document.getElementById('news-list');
    if (!el) return;
    const all = [...news, ...funny];
    if (!all.length) { el.innerHTML = '<p class="error-msg">> no news available.</p>'; return; }
    el.innerHTML = all.map(item => `
        <div class="news-item">
            ${item.image_url
                ? `<img class="news-thumb" src="${esc(item.image_url)}" onerror="this.style.display='none'" alt="" loading="lazy">`
                : ''}
            <div class="news-content">
                <p class="news-summary">${esc(item.summary)}</p>
                <a class="news-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">↗</a>
            </div>
        </div>`).join('');
}

// ── Weather ───────────────────────────────────────────────────────────────────
function renderWeather(w) {
    const el = document.getElementById('weather-content');
    if (!el) return;
    if (w.error || !w.temp_c) { el.innerHTML = '<p class="error-msg">> weather unavailable.</p>'; return; }
    el.innerHTML = `
        <div class="weather-row">
            <span class="weather-temp">${w.temp_c}°C</span>
            <span class="weather-sep">·</span>
            <span class="weather-detail">↑ ${esc(w.sunrise)}</span>
            <span class="weather-sep">·</span>
            <span class="weather-detail">↓ ${esc(w.sunset)}</span>
            ${w.rain_status ? `<span class="weather-sep">·</span><span class="weather-rain">${esc(w.rain_status)}</span>` : ''}
        </div>`;
}

// ── Quote ─────────────────────────────────────────────────────────────────────
function renderQuote(q) {
    const el = document.getElementById('quote-content');
    if (!el) return;
    if (!q.text) { el.innerHTML = '<p class="error-msg">> quote unavailable.</p>'; return; }
    el.innerHTML = `
        <div class="quote-block">
            <p class="quote-text">"${esc(q.text)}"</p>
            <p class="quote-author">— ${esc(q.author)}</p>
        </div>`;
}

// ── Movies ────────────────────────────────────────────────────────────────────
function renderMovies(movie, show) {
    const el = document.getElementById('movies-content');
    if (!el) return;
    if (!movie.title && !show.title) { el.innerHTML = '<p class="error-msg">> recommendations unavailable.</p>'; return; }
    let html = '<div class="rec-block">';
    if (movie.title) {
        html += `
            <div class="rec-item">
                <span class="rec-label">film</span>
                <div>
                    <div><span class="rec-title">${esc(movie.title)}</span><span class="rec-year"> (${movie.year})</span></div>
                    ${movie.from_watchlist ? '<div class="rec-tag">on your watchlist</div>' : ''}
                    <p class="rec-reason">${esc(movie.reason || '')}</p>
                </div>
            </div>`;
    }
    if (show.title) {
        html += `
            <div class="rec-item">
                <span class="rec-label">series</span>
                <div>
                    <div><span class="rec-title">${esc(show.title)}</span><span class="rec-year"> (${show.year})</span></div>
                    <p class="rec-reason">${esc(show.reason || '')}</p>
                </div>
            </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
}

// ── Puzzles ───────────────────────────────────────────────────────────────────
// Decorative tile states for the "WORDLE" preview — purely aesthetic
const PREVIEW = [
    { l: 'W', s: 'correct' },
    { l: 'O', s: 'absent'  },
    { l: 'R', s: 'present' },
    { l: 'D', s: 'correct' },
    { l: 'L', s: 'absent'  },
    { l: 'E', s: 'present' },
];

// We Ball racer colors — must match weball.js
const WB_DOT_COLORS = { Red:'#e05547', Blue:'#4d8fe0', Green:'#4cba6a', Yellow:'#d4b84a', Purple:'#8c5ce0' };
const WB_DOT_NAMES  = ['Red', 'Blue', 'Green', 'Yellow', 'Purple'];

function readWeballToday() {
    try {
        const raw = localStorage.getItem('wb_today');
        if (!raw) return null;
        const t = JSON.parse(raw);
        return (t && t.date === new Date().toISOString().slice(0, 10)) ? t : null;
    } catch { return null; }
}

function readWeballBalance() {
    try { return JSON.parse(localStorage.getItem('wb_player'))?.balance ?? 50; }
    catch { return 50; }
}

function wbDotsHTML(entry) {
    // If we have a race result, show finishing order with DNFs dimmed
    if (entry?.finishingOrder?.length) {
        const dnfs = new Set(entry.dnfs || []);
        return entry.finishingOrder.map(n =>
            `<div class="wb-dash-dot" style="background:${WB_DOT_COLORS[n]};opacity:${dnfs.has(n) ? 0.3 : 1}"></div>`
        ).join('');
    }
    // Default: static color order
    return WB_DOT_NAMES.map(n =>
        `<div class="wb-dash-dot" style="background:${WB_DOT_COLORS[n]}"></div>`
    ).join('');
}

function wbStatusHTML(entry) {
    if (!entry) return `<span class="wordle-status-pending">— not raced yet</span>`;
    const bet = entry.playerBet;
    if (bet?.result === 'win')  return `<span class="quest-status done">✓ won +⬡${bet.payout - bet.wager}</span>`;
    if (bet?.result === 'lose') return `<span class="wordle-status-failed">✗ lost ⬡${bet.wager}</span>`;
    return `<span class="wordle-status-pending">— watched</span>`;
}

function renderPuzzles(dateStr, wordle) {
    const el = document.getElementById('puzzles-content');
    if (!el) return;

    // ── Wordle ──
    const num     = wordle.number || calcWordleNumber(dateStr);
    const wstatus = wordle.status || 'pending';
    const tiles   = PREVIEW.map(p => `<div class="wp-tile wp-tile--${p.s}">${p.l}</div>`).join('');
    let wordleStatus;
    if (wstatus === 'solved') {
        wordleStatus = `<span class="quest-status done">✓ solved ${wordle.attempts}/6</span>`;
    } else if (wstatus === 'failed') {
        const ans = wordle.solution ? ` — ${wordle.solution}` : '';
        wordleStatus = `<span class="wordle-status-failed">✗ not today${esc(ans)}</span>`;
    } else {
        wordleStatus = `<span class="wordle-status-pending">— not played yet</span>`;
    }

    // ── We Ball ──
    const wb    = readWeballToday();
    const wbBal = readWeballBalance();

    el.innerHTML = `
        <div class="puzzle-block">
            <div class="puzzle-item">
                <span class="puzzle-label">wordle</span>
                <div>
                    <a href="/wordle" class="wp-preview-link">
                        <div class="wp-preview-row">${tiles}</div>
                        <span class="wp-num">#${num}</span>
                    </a>
                    <div class="wp-status">${wordleStatus}</div>
                </div>
            </div>
            <div class="puzzle-item">
                <span class="puzzle-label">we ball</span>
                <div>
                    <a href="/weball" class="wp-preview-link">
                        <div class="wb-dash-dots">${wbDotsHTML(wb)}</div>
                        <span class="wp-num">⬡ ${wbBal}</span>
                    </a>
                    <div class="wp-status">${wbStatusHTML(wb)}</div>
                </div>
            </div>
        </div>`;
}

function calcWordleNumber(dateStr) {
    const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
    return Math.max(1, Math.floor((d - new Date('2021-06-19T12:00:00')) / 86400000) + 1);
}

// ── Side Quest ────────────────────────────────────────────────────────────────
function renderQuest(quest, readonly = false) {
    const el = document.getElementById('quest-content');
    if (!el) return;
    if (!quest.title) { el.innerHTML = '<p class="error-msg">> side quest unavailable.</p>'; return; }

    const diff = quest.difficulty || 'medium';
    let actionsHTML = '';
    if (quest.status === 'done') {
        actionsHTML = '<span class="quest-status done">✓ completed</span>';
    } else if (quest.status === 'skipped') {
        actionsHTML = '<span class="quest-status skipped">— skipped</span>';
    } else if (!readonly) {
        actionsHTML = `
            <div class="quest-actions">
                <button class="btn-quest" onclick="updateQuest('done')">mark done</button>
                <button class="btn-quest secondary" onclick="updateQuest('skipped')">skip</button>
            </div>`;
    }

    el.innerHTML = `
        <div class="quest-block">
            <div class="quest-header">
                <span class="quest-difficulty difficulty-${diff}">${diff}</span>
                <span class="quest-meta">· ${esc(quest.type || 'irl')} · est. ${esc(quest.estimated_time || '—')}</span>
            </div>
            <p class="quest-title">${esc(quest.title)}</p>
            <p class="quest-desc">${esc(quest.description || '')}</p>
            ${actionsHTML}
        </div>`;
}

async function updateQuest(status) {
    const resp = await fetch('/api/quest/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    });
    if (resp.ok) {
        const actions = document.querySelector('.quest-actions');
        if (actions) {
            const span = document.createElement('span');
            span.className = `quest-status ${status}`;
            span.textContent = status === 'done' ? '✓ completed' : '— skipped';
            actions.replaceWith(span);
        }
    }
}

// ── Journal ───────────────────────────────────────────────────────────────────
const journal = document.getElementById("journal");
const saveBtn = document.getElementById("save-journal");
const status = document.getElementById("journal-status");

if (journal) {
    let timer;
    // Auto expand + autosave
    journal.addEventListener("input", () => {
        journal.style.height = "auto";
        journal.style.height = journal.scrollHeight + "px";
        clearTimeout(timer);
        timer = setTimeout(() => saveJournal(false), 1000);
    });

    // Load today's journal
    fetch("/api/journal")
        .then(r => r.json())
        .then(data => {
            journal.value = data.journal || "";
            journal.style.height = "auto";
            journal.style.height = journal.scrollHeight + "px";
        })
        .catch(err => console.error("Failed to load journal:", err));

    async function saveJournal(showMessage = false) {
        try {
            const resp = await fetch("/api/journal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ journal: journal.value })
            });
            if (!resp.ok) return;
            if (showMessage && status) {
                status.textContent = "✓ Saved";
                clearTimeout(status._timer);
                status._timer = setTimeout(() => { status.textContent = ""; }, 1200);
            }
        } catch (err) {
            console.error("Failed to save journal:", err);
            if (showMessage && status) {
                status.textContent = "✗ Failed";
                clearTimeout(status._timer);
                status._timer = setTimeout(() => { status.textContent = ""; }, 1500);
            }
        }
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", () => saveJournal(true));
    }
}

// ── Footer ────────────────────────────────────────────────────────────────────
function renderFooter(generatedAt) {
    const el = document.getElementById('footer-generated');
    if (el && generatedAt) {
        const t = new Date(generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        el.textContent = `generated ${t}`;
    }
}

async function forceRefresh() {
    document.querySelectorAll('.footer-link').forEach(el => el.style.pointerEvents = 'none');
    await fetch('/api/refresh', { method: 'POST' });
    window.location.reload();
}

// ── History ───────────────────────────────────────────────────────────────────
async function toggleHistory() {
    const panel = document.getElementById('history-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        const dates = await fetch('/api/history').then(r => r.json());
        renderHistoryList(dates);
    } else {
        panel.classList.add('hidden');
        document.getElementById('history-detail').innerHTML = '';
    }
}

function renderHistoryList(dates) {
    const list = document.getElementById('history-list');
    if (!list) return;
    if (!dates.length) {
        list.innerHTML = '<p class="error-msg" style="margin-top:16px">> no history yet.</p>';
        return;
    }
    list.innerHTML = dates.map(d => {
        const label = new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        return `<div class="history-item" data-date="${d}" onclick="loadHistoryDay('${d}')">${label}</div>`;
    }).join('');
}

async function loadHistoryDay(dateStr) {
    document.querySelectorAll('.history-item').forEach(el =>
        el.classList.toggle('active', el.dataset.date === dateStr));

    const detail = document.getElementById('history-detail');
    if (detail) detail.innerHTML = '<p class="loader-line" style="margin-top:24px">> loading...</p>';

    const data = await fetch(`/api/history/${dateStr}`).then(r => r.json());
    if (!detail) return;

    const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // We Ball: prefer server-synced data, fall back to localStorage archive
    const wbEntry = (() => {
        if (data.weball?.date) return data.weball;
        try {
            const arc = JSON.parse(localStorage.getItem('wb_archive') || '[]');
            return arc.find(e => e.date === dateStr) || null;
        } catch { return null; }
    })();

    detail.innerHTML = `
        <div style="margin-top:40px;padding-top:24px;border-top:1px solid var(--border)">
            <p class="section-heading">${label}</p>
            ${hSection('News', hNews([...(data.news||[]), ...(data.funny||[])]))}
            ${hSection('Weather', hWeather(data.weather||{}))}
            ${hSection('Quote', hQuote(data.quote||{}))}
            ${hSection('Watch', hMovies(data.movie_rec||{}, data.show_rec||{}))}
            ${hSection('Puzzles', hPuzzles(data.date, data.wordle||{}, wbEntry))}
            ${hSection('Side Quest', hQuest(data.sidequest||{}))}
            ${hSection('Journal', hJournal(data.journal))}
        </div>`;
}

function hJournal(text) {
    if (!text) return '<p class="error-msg">> no journal entry.</p>';
    return `
        <div class="quote-block">
            <p class="quote-text">${esc(text)}</p>
        </div>`;
}

// History sub-renderers (read-only, no quest actions)
function hSection(title, body) {
    return `<div class="section" style="margin-top:32px"><h2 class="section-heading">${title}</h2>${body}</div>`;
}
function hNews(items) {
    if (!items.length) return '<p class="error-msg">> no news for this day.</p>';
    return items.map(item => `
        <div class="news-item">
            ${item.image_url ? `<img class="news-thumb" src="${esc(item.image_url)}" onerror="this.style.display='none'" alt="">` : ''}
            <div class="news-content">
                <p class="news-summary">${esc(item.summary)}</p>
                <a class="news-link" href="${esc(item.url)}" target="_blank" rel="noopener">↗</a>
            </div>
        </div>`).join('');
}
function hWeather(w) {
    if (!w.temp_c) return '<p class="error-msg">> weather unavailable.</p>';
    return `<div class="weather-row">
        <span class="weather-temp">${w.temp_c}°C</span>
        <span class="weather-sep">·</span><span class="weather-detail">↑ ${esc(w.sunrise)}</span>
        <span class="weather-sep">·</span><span class="weather-detail">↓ ${esc(w.sunset)}</span>
        ${w.rain_status ? `<span class="weather-sep">·</span><span class="weather-rain">${esc(w.rain_status)}</span>` : ''}
    </div>`;
}
function hQuote(q) {
    if (!q.text) return '<p class="error-msg">> no quote.</p>';
    return `<div class="quote-block">
        <p class="quote-text">"${esc(q.text)}"</p>
        <p class="quote-author">— ${esc(q.author)}</p>
    </div>`;
}
function hMovies(m, s) {
    if (!m.title && !s.title) return '<p class="error-msg">> no recommendations.</p>';
    let h = '<div class="rec-block">';
    if (m.title) h += `<div class="rec-item"><span class="rec-label">film</span>
        <div><div><span class="rec-title">${esc(m.title)}</span><span class="rec-year"> (${m.year})</span></div>
        ${m.from_watchlist ? '<div class="rec-tag">on your watchlist</div>' : ''}
        <p class="rec-reason">${esc(m.reason||'')}</p></div></div>`;
    if (s.title) h += `<div class="rec-item"><span class="rec-label">series</span>
        <div><div><span class="rec-title">${esc(s.title)}</span><span class="rec-year"> (${s.year})</span></div>
        <p class="rec-reason">${esc(s.reason||'')}</p></div></div>`;
    return h + '</div>';
}
function hQuest(q) {
    if (!q.title) return '<p class="error-msg">> no quest.</p>';
    const diff = q.difficulty || 'medium';
    const statusHTML = q.status === 'done'
        ? '<span class="quest-status done">✓ completed</span>'
        : q.status === 'skipped'
        ? '<span class="quest-status skipped">— skipped</span>'
        : '<span class="quest-status" style="color:var(--text-dimmer)">— pending</span>';
    return `<div class="quest-block">
        <div class="quest-header">
            <span class="quest-difficulty difficulty-${diff}">${diff}</span>
            <span class="quest-meta">· ${esc(q.type||'irl')} · est. ${esc(q.estimated_time||'—')}</span>
        </div>
        <p class="quest-title">${esc(q.title)}</p>
        <p class="quest-desc">${esc(q.description||'')}</p>
        ${statusHTML}
    </div>`;
}

function hPuzzles(dateStr, wordle, wbEntry) {
    wordle  = wordle  || {};
    wbEntry = wbEntry || null;

    // ── Wordle ──
    const num     = wordle.number || calcWordleNumber(dateStr);
    const wstatus = wordle.status || 'pending';
    const tiles   = PREVIEW.map(p => `<div class="wp-tile wp-tile--${p.s}">${p.l}</div>`).join('');
    let wordleStatus;
    if (wstatus === 'solved') {
        wordleStatus = `<span class="quest-status done">✓ solved ${wordle.attempts}/6</span>`;
    } else if (wstatus === 'failed') {
        const ans = wordle.solution ? ` — ${wordle.solution}` : '';
        wordleStatus = `<span class="wordle-status-failed">✗ not today${esc(ans)}</span>`;
    } else {
        wordleStatus = `<span class="wordle-status-pending">— not played</span>`;
    }

    // ── We Ball ──
    const wbLink = wbEntry ? `/weball?replay=${wbEntry.date || dateStr}` : '/weball';

    return `
        <div class="puzzle-block">
            <div class="puzzle-item">
                <span class="puzzle-label">wordle</span>
                <div>
                    <div class="wp-preview-row" style="margin-bottom:6px">${tiles}</div>
                    <span class="wp-num">#${num}</span>
                    <div class="wp-status">${wordleStatus}</div>
                </div>
            </div>
            <div class="puzzle-item">
                <span class="puzzle-label">we ball</span>
                <div>
                    <a href="${wbLink}" class="wp-preview-link">
                        <div class="wb-dash-dots" style="margin-bottom:4px">${wbDotsHTML(wbEntry)}</div>
                    </a>
                    <div class="wp-status">${wbStatusHTML(wbEntry)}</div>
                </div>
            </div>
        </div>`;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}