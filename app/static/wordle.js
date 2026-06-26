'use strict';

// ── Window controls (same as main page) ──────────────────────────────────────
function minimizeWindow() { if (window.pywebview?.api) window.pywebview.api.minimize_window(); }
function closeWindow()    { if (window.pywebview?.api) window.pywebview.api.close_window(); }

// ── Constants ─────────────────────────────────────────────────────────────────
const WORD_LEN   = 5;
const MAX_ROWS   = 6;
const FLIP_HALF  = 220;   // ms per half of a tile flip
const FLIP_STAGGER = 280; // ms between tiles in same row

const WIN_MSGS = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

const KB_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Enter','Z','X','C','V','B','N','M','⌫'],
];

// ── State ─────────────────────────────────────────────────────────────────────
let solution    = '';
let wordleDate  = '';
let wordleNum   = 0;
let board       = [];   // [row][col] letter
let tileStates  = [];   // [row][col] 'correct'|'present'|'absent'|''
let keyStates   = {};   // letter → best state
let currentRow  = 0;
let currentCol  = 0;
let guess       = [];   // current in-progress letters
let gameOver    = false;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
    try {
        const resp = await fetch('/api/wordle/word');
        const data = await resp.json();
        if (data.error) { showToast('Could not load word. Try refreshing.', 4000); return; }
        solution   = data.solution.toUpperCase();
        wordleDate = data.date;
        wordleNum  = data.number || 0;
    } catch {
        showToast('Network error — try again.', 4000);
        return;
    }

    const numEl = document.getElementById('wordle-number');
    if (numEl) numEl.textContent = `#${wordleNum}`;

    // Fresh state
    board      = Array.from({length: MAX_ROWS}, () => Array(WORD_LEN).fill(''));
    tileStates = Array.from({length: MAX_ROWS}, () => Array(WORD_LEN).fill(''));
    keyStates  = {};

    buildBoard();
    buildKeyboard();

    // Restore today's saved game
    const saved = loadState();
    if (saved && saved.date === wordleDate) {
        restoreState(saved);
    }

    document.addEventListener('keydown', onPhysicalKey);
}

// ── Board ─────────────────────────────────────────────────────────────────────
function buildBoard() {
    const container = document.getElementById('wordle-board');
    container.innerHTML = '';
    for (let r = 0; r < MAX_ROWS; r++) {
        const row = document.createElement('div');
        row.className = 'wordle-row';
        row.id = `wr-${r}`;
        for (let c = 0; c < WORD_LEN; c++) {
            const tile = document.createElement('div');
            tile.className = 'wordle-tile';
            tile.id = `wt-${r}-${c}`;
            row.appendChild(tile);
        }
        container.appendChild(row);
    }
}

function tile(r, c) { return document.getElementById(`wt-${r}-${c}`); }
function row(r)     { return document.getElementById(`wr-${r}`); }

function writeTile(r, c, letter) {
    const t = tile(r, c);
    if (!t) return;
    t.textContent = letter;
    if (letter) {
        t.dataset.state = 'tbd';
        t.classList.add('wp-pop');
        t.addEventListener('animationend', () => t.classList.remove('wp-pop'), {once: true});
    } else {
        delete t.dataset.state;
    }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function buildKeyboard() {
    const kb = document.getElementById('wordle-keyboard');
    kb.innerHTML = '';
    for (const rowKeys of KB_ROWS) {
        const rowEl = document.createElement('div');
        rowEl.className = 'wordle-kb-row';
        for (const k of rowKeys) {
            const btn = document.createElement('button');
            btn.className = 'wordle-key' + (k.length > 1 ? ' wordle-key--wide' : '');
            btn.textContent = k;
            btn.dataset.key = k;
            btn.addEventListener('click', () => press(k));
            rowEl.appendChild(btn);
        }
        kb.appendChild(rowEl);
    }
}

function refreshKey(letter) {
    const btn = document.querySelector(`.wordle-key[data-key="${letter}"]`);
    if (btn) {
        if (keyStates[letter]) btn.dataset.state = keyStates[letter];
    }
}

function liftKey(letter, state) {
    // correct > present > absent — never downgrade
    const rank = {correct: 3, present: 2, absent: 1};
    if ((rank[state] || 0) > (rank[keyStates[letter]] || 0)) {
        keyStates[letter] = state;
    }
    refreshKey(letter);
}

// ── Input ─────────────────────────────────────────────────────────────────────
function onPhysicalKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter')     press('Enter');
    else if (e.key === 'Backspace') press('⌫');
    else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
}

function press(key) {
    if (gameOver) return;
    if (key === 'Enter') { submit(); return; }
    if (key === '⌫')    { deleteLetter(); return; }
    if (/^[A-Z]$/.test(key)) addLetter(key);
}

function addLetter(l) {
    if (currentCol >= WORD_LEN) return;
    guess[currentCol] = l;
    board[currentRow][currentCol] = l;
    writeTile(currentRow, currentCol, l);
    currentCol++;
}

function deleteLetter() {
    if (currentCol <= 0) return;
    currentCol--;
    guess[currentCol] = '';
    board[currentRow][currentCol] = '';
    writeTile(currentRow, currentCol, '');
}

// ── Evaluation ────────────────────────────────────────────────────────────────
function evaluate(g) {
    const result = Array(WORD_LEN).fill('absent');
    const sol    = solution.split('');
    const gArr   = g.split('');

    // Pass 1: correct positions
    for (let i = 0; i < WORD_LEN; i++) {
        if (gArr[i] === sol[i]) {
            result[i] = 'correct';
            sol[i]    = null;
            gArr[i]   = null;
        }
    }
    // Pass 2: present letters
    for (let i = 0; i < WORD_LEN; i++) {
        if (!gArr[i]) continue;
        const idx = sol.indexOf(gArr[i]);
        if (idx !== -1) {
            result[i] = 'present';
            sol[idx]  = null;
        }
    }
    return result;
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
    if (currentCol < WORD_LEN) {
        shakeRow(currentRow);
        showToast('Not enough letters');
        return;
    }

    const word   = guess.slice(0, WORD_LEN).join('');
    const result = evaluate(word);
    tileStates[currentRow] = result;

    flipRow(currentRow, result, () => {
        // Update keyboard colours after flip completes
        for (let i = 0; i < WORD_LEN; i++) liftKey(word[i], result[i]);

        const won  = result.every(r => r === 'correct');
        const playedRow = currentRow;
        currentRow++;
        currentCol = 0;
        guess = [];

        saveState();

        if (won) {
            gameOver = true;
            setTimeout(() => {
                bounceRow(playedRow);
                showToast(WIN_MSGS[playedRow] || 'Brilliant!', 2000);
                showResult(`✓ solved in ${playedRow + 1}/6`);
                reportResult('solved', playedRow + 1);
            }, 150);
        } else if (currentRow >= MAX_ROWS) {
            gameOver = true;
            setTimeout(() => {
                showToast(solution, 4000);
                showResult(`✗ the word was ${solution}`);
                reportResult('failed', MAX_ROWS);
            }, 150);
        }
    });
}

// ── Animations ────────────────────────────────────────────────────────────────
function flipRow(r, result, onDone) {
    for (let c = 0; c < WORD_LEN; c++) {
        const t     = tile(r, c);
        const delay = c * FLIP_STAGGER;
        const state = result[c];

        // Rotate forward (disappear)
        setTimeout(() => {
            t.style.transition = `transform ${FLIP_HALF}ms ease-in`;
            t.style.transform  = 'rotateX(90deg)';
        }, delay);

        // At peak — swap colour, then rotate back (appear)
        setTimeout(() => {
            t.dataset.state    = state;
            t.style.transition = `transform ${FLIP_HALF}ms ease-out`;
            t.style.transform  = 'rotateX(0deg)';
        }, delay + FLIP_HALF);
    }

    // All tiles done
    setTimeout(onDone, (WORD_LEN - 1) * FLIP_STAGGER + FLIP_HALF * 2 + 50);
}

function shakeRow(r) {
    const rowEl = row(r);
    if (!rowEl) return;
    rowEl.classList.add('wp-shake');
    rowEl.addEventListener('animationend', () => rowEl.classList.remove('wp-shake'), {once: true});
}

function bounceRow(r) {
    for (let c = 0; c < WORD_LEN; c++) {
        const t = tile(r, c);
        if (!t) continue;
        setTimeout(() => {
            t.classList.add('wp-bounce');
            t.addEventListener('animationend', () => t.classList.remove('wp-bounce'), {once: true});
        }, c * 90);
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 1400) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'wordle-toast';
    el.textContent = msg;
    container.appendChild(el);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('toast-show'));
    });

    setTimeout(() => {
        el.classList.remove('toast-show');
        el.classList.add('toast-hide');
        setTimeout(() => el.remove(), 350);
    }, duration);
}

function showResult(msg) {
    const el = document.getElementById('wordle-result');
    if (el) el.textContent = msg;
}

// ── State Persistence (localStorage) ─────────────────────────────────────────
function saveState() {
    try {
        localStorage.setItem('wordle_state', JSON.stringify({
            date: wordleDate,
            board, tileStates, keyStates,
            currentRow, gameOver,
        }));
    } catch {}
}

function loadState() {
    try {
        const raw = localStorage.getItem('wordle_state');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function restoreState(s) {
    board      = s.board;
    tileStates = s.tileStates;
    keyStates  = s.keyStates || {};
    currentRow = s.currentRow;
    gameOver   = s.gameOver || false;
    currentCol = 0;
    guess      = [];

    // Re-paint all played rows instantly (no animation)
    for (let r = 0; r < currentRow; r++) {
        for (let c = 0; c < WORD_LEN; c++) {
            const t = tile(r, c);
            if (!t) continue;
            t.textContent  = board[r][c] || '';
            t.dataset.state = board[r][c] ? (tileStates[r][c] || 'tbd') : '';
        }
    }

    // Re-paint keyboard
    for (const [letter, state] of Object.entries(keyStates)) {
        const btn = document.querySelector(`.wordle-key[data-key="${letter}"]`);
        if (btn) btn.dataset.state = state;
    }

    if (gameOver) {
        const won = currentRow > 0 && tileStates[currentRow - 1].every(s => s === 'correct');
        if (won) {
            showResult(`✓ solved in ${currentRow}/6`);
        } else {
            showResult(`✗ the word was ${solution}`);
            setTimeout(() => showToast(solution, 4000), 200);
        }
    }
}

// ── Report result to server ───────────────────────────────────────────────────
async function reportResult(status, attempts) {
    const guesses = board.slice(0, currentRow).map(r => r.join(''));
    try {
        await fetch('/api/wordle/solved', {
            method:  'POST',
            headers: {'Content-Type': 'application/json'},
            body:    JSON.stringify({status, attempts, guesses, date: wordleDate}),
        });
    } catch (e) {
        console.warn('[wordle] could not report result:', e);
    }
}

// ── Go ────────────────────────────────────────────────────────────────────────
init();