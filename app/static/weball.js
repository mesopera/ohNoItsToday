'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   WE BALL — Deterministic Daily Racing Game
   All state lives in localStorage. No server needed.
   ══════════════════════════════════════════════════════════════════════════════ */

// ── Window controls ───────────────────────────────────────────────────────────
function minimizeWindow() { if (window.pywebview?.api) window.pywebview.api.minimize_window(); }
function closeWindow()    { if (window.pywebview?.api) window.pywebview.api.close_window(); }

// ── Constants ─────────────────────────────────────────────────────────────────
const WB_COLORS = {
    Red:    '#e05547',
    Blue:   '#4d8fe0',
    Green:  '#4cba6a',
    Yellow: '#d4b84a',
    Purple: '#8c5ce0',
};
const WB_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple'];
const WEATHERS = ['Sunny', 'Cloudy', 'Fog', 'Snow', 'Rain'];

// localStorage keys
const K_RACERS  = 'wb_racers';
const K_PLAYER  = 'wb_player';
const K_ARCHIVE = 'wb_archive';
const K_TODAY   = 'wb_today';

// Race timing
const BASE_RACE_TIME = 72; // seconds — target duration at speed 100

// ── PRNG (mulberry32) ─────────────────────────────────────────────────────────
function hashStr(s) {
    let h = 0;
    for (const c of s) h = Math.imul(31, h) + c.charCodeAt(0) | 0;
    return h >>> 0;
}

function makePRNG(seed) {
    let s = typeof seed === 'string' ? hashStr(seed) : (seed >>> 0);
    return {
        next() {
            s = s + 0x6D2B79F5 | 0;
            let t = Math.imul(s ^ s >>> 15, 1 | s);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        },
        float(lo = 0, hi = 1) { return this.next() * (hi - lo) + lo; },
        int(lo, hi)            { return Math.floor(this.float(lo, hi + 1)); },
        pick(arr)              { return arr[this.int(0, arr.length - 1)]; },
        chance(p)              { return this.next() < p; },
        shuffle(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = this.int(0, i);
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },
    };
}

// ── Today's date string ───────────────────────────────────────────────────────
function todayStr()  { return new Date().toISOString().slice(0, 10); }
function seasonStr() { return new Date().toISOString().slice(0, 7); }

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadRacers() {
    try {
        const r = JSON.parse(localStorage.getItem(K_RACERS));
        if (r && WB_NAMES.every(n => n in r)) return r;
    } catch {}
    return makeDefaultRacers();
}
function saveRacers(r)  { localStorage.setItem(K_RACERS, JSON.stringify(r)); }

function loadPlayer() {
    try {
        const p = JSON.parse(localStorage.getItem(K_PLAYER));
        if (p && typeof p.balance === 'number') return p;
    } catch {}
    return { balance: 50, lastPlayDate: null, lastPlaySeason: null };
}
function savePlayer(p)  { localStorage.setItem(K_PLAYER, JSON.stringify(p)); }

function loadArchive()  {
    try { return JSON.parse(localStorage.getItem(K_ARCHIVE)) || []; } catch { return []; }
}
function appendArchive(entry) {
    const arc = loadArchive();
    arc.unshift(entry);
    localStorage.setItem(K_ARCHIVE, JSON.stringify(arc.slice(0, 365)));
}

function loadToday()    {
    try {
        const t = JSON.parse(localStorage.getItem(K_TODAY));
        return (t && t.date === todayStr()) ? t : null;
    } catch { return null; }
}
function saveToday(e)   { localStorage.setItem(K_TODAY, JSON.stringify(e)); }

// ── Default racer state ───────────────────────────────────────────────────────
function makeDefaultRacers() {
    const r = {};
    for (const n of WB_NAMES) r[n] = {
        currentSpeed:      100,
        consecutiveWins:   0,
        consecutiveLasts:  0,
        careerWins:        0,
        totalRaces:        0,
        podiumFinishes:    0,
        dnfs:              0,
        winnerBonus:       0,
        depressionDebuff:  false,
    };
    return r;
}

// ── Catmull-Rom closed spline ─────────────────────────────────────────────────
function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t * t2;
    return {
        x: 0.5*(2*p1.x + t*(-p0.x+p2.x) + t2*(2*p0.x-5*p1.x+4*p2.x-p3.x) + t3*(-p0.x+3*p1.x-3*p2.x+p3.x)),
        y: 0.5*(2*p1.y + t*(-p0.y+p2.y) + t2*(2*p0.y-5*p1.y+4*p2.y-p3.y) + t3*(-p0.y+3*p1.y-3*p2.y+p3.y)),
    };
}

function evalSpline(pts, u) {
    const N = pts.length;
    const s = ((u % 1) + 1) % 1 * N;
    const i = Math.floor(s);
    return catmullRom(pts[(i-1+N)%N], pts[i%N], pts[(i+1)%N], pts[(i+2)%N], s - i);
}

// ── Build track from F1 circuit data ─────────────────────────────────────────
function buildTrack(prng, W, H) {
    // Pick today's F1 circuit
    const circuit = getTrackForDate(todayStr());
    const rawPts  = circuit.pts;   // [[x,y], ...] normalized 0-1

    // Find bounding box of the raw points
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of rawPts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    // Scale to fit canvas with padding
    const PAD  = 0.08;
    const scaleX = W * (1 - PAD * 2) / (maxX - minX);
    const scaleY = H * (1 - PAD * 2) / (maxY - minY);
    const scale  = Math.min(scaleX, scaleY);  // uniform scale, preserve aspect ratio

    // Center offset
    const offX = (W - (maxX - minX) * scale) / 2 - minX * scale;
    const offY = (H - (maxY - minY) * scale) / 2 - minY * scale;

    // Convert raw normalized points → canvas pixel objects for Catmull-Rom
    const ctrl = rawPts.map(([x, y]) => ({
        x: x * scale + offX,
        y: y * scale + offY,
    }));

    // Sample spline at high resolution
    const SAMPLES = 800;
    const pts = [];
    for (let i = 0; i < SAMPLES; i++) pts.push(evalSpline(ctrl, i / SAMPLES));

    // Arc-length table
    let totalLen = 0;
    const arcTable = [0];
    for (let i = 1; i < SAMPLES; i++) {
        totalLen += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        arcTable.push(totalLen);
    }
    totalLen += Math.hypot(pts[0].x - pts[SAMPLES-1].x, pts[0].y - pts[SAMPLES-1].y);
    arcTable.push(totalLen);

    // Curvature table
    const curvTable = pts.map((_, i) => {
        const a = pts[(i - 1 + SAMPLES) % SAMPLES];
        const b = pts[i];
        const c = pts[(i + 1) % SAMPLES];
        const dx1 = c.x - a.x, dy1 = c.y - a.y;
        const dx2 = c.x - 2*b.x + a.x, dy2 = c.y - 2*b.y + a.y;
        const num = Math.abs(dx1*dy2 - dy1*dx2);
        const den = Math.pow(dx1*dx1 + dy1*dy1, 1.5);
        return den > 1e-6 ? num / den : 0;
    });

    // Gate at the first control point (start/finish)
    const GATE_X = ctrl[0].x;
    const GATE_Y = ctrl[0].y;

    // ── Distance-to-track field ──────────────────────────────────────────
    // Grid-bucket the track samples so we can cheaply find "nearest track point
    // to any (x,y)" without an O(SAMPLES) scan per candidate. This is what lets
    // us reject any decoration whose footprint would overlap ANY part of the
    // track, not just the locally nearest segment (which is what caused trees
    // to land on a different loop of a serpentine layout).
    const CELL = 24;
    const grid = new Map();
    const cellKey = (cx, cy) => `${cx},${cy}`;
    for (const p of pts) {
        const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
        const k = cellKey(cx, cy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(p);
    }
    function distToTrack(x, y) {
        const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        let best = Infinity;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const bucket = grid.get(cellKey(cx + dx, cy + dy));
                if (!bucket) continue;
                for (const p of bucket) {
                    const d = Math.hypot(p.x - x, p.y - y);
                    if (d < best) best = d;
                }
            }
        }
        return best;
    }

    const TRACK_HALF_WIDTH = 11; // matches the 20-22px stroke drawn in drawScene

    // ── Grandstands near start/finish ──────────────────────────────────────
    const g0 = ctrl[0], g1 = ctrl[Math.min(3, ctrl.length - 1)];
    const gdx = g1.x - g0.x, gdy = g1.y - g0.y;
    const glen = Math.hypot(gdx, gdy) || 1;
    const gnx = -gdy / glen, gny = gdx / glen;

    const stands = [];
    const CROWD_COLORS = ['#c87878','#7898c8','#78c878','#c8b878','#a878c8','#c89878'];

    function buildStand(cx, cy, w, h, rows, alpha) {
        const dots = [];
        const rowH = h / rows;
        for (let r = 0; r < rows; r++) {
            const numDots = Math.floor(w / 4);
            for (let d = 0; d < numDots; d++) {
                dots.push({
                    x: cx - w/2 + d * 4 + prng.float(-1, 1),
                    y: cy - h/2 + r * rowH + rowH * 0.5 + prng.float(-1, 1),
                    r: prng.float(1, 2),
                    c: prng.pick(CROWD_COLORS),
                });
            }
        }
        return { x: cx - w/2, y: cy - h/2, w, h, rows, dots, a: alpha };
    }

    // Try placing a stand at increasing distance from the gate until it clears the track
    function placeStandNear(baseX, baseY, nx, ny, w, h, rows, alpha) {
        for (let dist = TRACK_HALF_WIDTH + h/2 + 4; dist < TRACK_HALF_WIDTH + h/2 + 70; dist += 4) {
            const cx = baseX + nx * dist, cy = baseY + ny * dist;
            // Check all 4 corners + center clear the track
            const corners = [
                [cx, cy], [cx - w/2, cy - h/2], [cx + w/2, cy - h/2],
                [cx - w/2, cy + h/2], [cx + w/2, cy + h/2],
            ];
            const clear = corners.every(([x, y]) => distToTrack(x, y) > TRACK_HALF_WIDTH + 3);
            const inBounds = cx - w/2 > 4 && cx + w/2 < W - 4 && cy - h/2 > 4 && cy + h/2 < H - 4;
            if (clear && inBounds) return buildStand(cx, cy, w, h, rows, alpha);
        }
        return null; // couldn't find a clear spot — skip this stand
    }

    // Two stands flanking the start gate (one each side, whichever side is clear)
    for (let side = -1; side <= 1; side += 2) {
        const standW = 50 + prng.float(-6, 6);
        const standH = 20 + prng.float(-3, 3);
        const s = placeStandNear(GATE_X, GATE_Y, gnx * side, gny * side, standW, standH, 4, 0.75);
        if (s) stands.push(s);
    }

    // 3 extra small stands spread around the track at different arc positions
    const standSpots = [0.22, 0.48, 0.74];
    for (const frac of standSpots) {
        const idx  = Math.floor(frac * SAMPLES);
        const pt   = pts[idx];
        const ptB  = pts[(idx + 4) % SAMPLES];
        const tdx  = ptB.x - pt.x, tdy = ptB.y - pt.y;
        const tlen = Math.hypot(tdx, tdy) || 1;
        const tnx  = -tdy / tlen, tny = tdx / tlen;
        const side = prng.pick([-1, 1]);
        const s = placeStandNear(pt.x, pt.y, tnx * side, tny * side, 36, 14, 3, 0.55);
        if (s) stands.push(s);
    }

    // ── Greenery patches (outside the track, collision-checked) ────────────
    const greenery = [];
    const GREEN_SHADES = ['#1a3320','#1c3d22','#153318','#204030','#172d1c'];
    const BRIGHT_GREEN = ['#2a5530','#234d28','#1e4425'];

    function standsOverlap(x, y, r) {
        for (const s of stands) {
            if (x + r > s.x - 4 && x - r < s.x + s.w + 4 &&
                y + r > s.y - 4 && y - r < s.y + s.h + 4) return true;
        }
        return false;
    }

    let placed = 0, attempts = 0;
    while (placed < 26 && attempts < 400) {
        attempts++;
        const idx = Math.floor(prng.float(0, SAMPLES));
        const pt  = pts[idx];
        const ptB = pts[(idx + 5) % SAMPLES];
        const tdx = ptB.x - pt.x, tdy = ptB.y - pt.y;
        const tlen = Math.hypot(tdx, tdy) || 1;
        const tnx = -tdy / tlen, tny = tdx / tlen;
        const side = prng.pick([-1, 1]);
        const dist = prng.float(TRACK_HALF_WIDTH + 14, TRACK_HALF_WIDTH + 50);
        const gx = pt.x + tnx * side * dist + prng.float(-6, 6);
        const gy = pt.y + tny * side * dist + prng.float(-6, 6);
        const r  = prng.float(7, 16);

        if (gx - r < 2 || gx + r > W - 2 || gy - r < 2 || gy + r > H - 2) continue;
        if (distToTrack(gx, gy) < TRACK_HALF_WIDTH + r) continue;   // would overlap track
        if (standsOverlap(gx, gy, r)) continue;                     // would overlap a stand
        // avoid stacking trees directly on each other
        if (greenery.some(g => Math.hypot(g.x - gx, g.y - gy) < (g.r + r) * 0.7)) continue;

        greenery.push({
            x: gx, y: gy, r,
            color: prng.chance(0.3) ? prng.pick(BRIGHT_GREEN) : prng.pick(GREEN_SHADES),
            a: prng.float(0.5, 0.85),
        });
        placed++;
    }

    const crowd = []; // legacy, unused

    return {
        ctrl, pts, arcTable, curvTable, totalLen,
        GATE_X, GATE_Y, crowd, stands, greenery, SAMPLES,
        circuitName: circuit.name,
        circuitLocation: circuit.location,
    };
}

// Convert normalized progress (0-1) to canvas point
function trackPoint(trk, progress) {
    const target = ((progress % 1) + 1) % 1 * trk.totalLen;
    const { arcTable, pts, SAMPLES } = trk;
    // Binary search in arc table
    let lo = 0, hi = SAMPLES - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        arcTable[mid] < target ? lo = mid : hi = mid;
    }
    const t0 = arcTable[lo], t1 = arcTable[hi];
    const frac = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
    const pa = pts[lo], pb = pts[hi % SAMPLES];
    return { x: pa.x + frac*(pb.x-pa.x), y: pa.y + frac*(pb.y-pa.y), idx: lo };
}

// Curvature-based speed factor at progress
function curvSpeedFactor(trk, progress) {
    const { idx } = trackPoint(trk, progress);
    const k = trk.curvTable[idx] || 0;
    return Math.max(0.4, 1 / (1 + k * 6000));
}

// ── Daily data generation ─────────────────────────────────────────────────────
function getDailyData(dateStr) {
    const prng    = makePRNG(dateStr);
    const racers  = loadRacers();
    const archive = loadArchive();

    // Weather
    const weatherWeights = [30, 25, 15, 15, 15];
    let wr = prng.float(0, 100), wi = 0;
    for (; wi < weatherWeights.length - 1 && wr > weatherWeights[wi]; wi++) wr -= weatherWeights[wi];
    const weather = WEATHERS[wi];

    // Daily speed bonus (0-10, seeded per racer)
    const bonuses = {};
    for (const n of WB_NAMES) bonuses[n] = prng.int(0, 10);

    // Effective race speeds
    const speeds = {};
    for (const n of WB_NAMES) {
        let s = racers[n].currentSpeed + bonuses[n];
        if (weather === 'Snow') s -= 5;
        speeds[n] = Math.max(50, s);
    }

    // DNFs (Rain: 5-10% per racer, pre-seeded)
    const dnfSet = new Set();
    const dnfTimes = {};
    if (weather === 'Rain') {
        for (const n of WB_NAMES) {
            const chance = prng.float(0.05, 0.10);
            if (prng.chance(chance)) {
                dnfSet.add(n);
                dnfTimes[n] = prng.float(0.2, 0.85) * (BASE_RACE_TIME / (speeds[n] / 100));
            }
        }
    }

    // Finish times (locked ordering)
    const finishTimes = {};
    for (const n of WB_NAMES) {
        if (dnfSet.has(n)) { finishTimes[n] = Infinity; continue; }
        finishTimes[n] = BASE_RACE_TIME / (speeds[n] / 100);
    }

    // Finishing order: finishers by time, then DNFs by dnfTime descending (latest = higher rank)
    const finishers = WB_NAMES.filter(n => !dnfSet.has(n)).sort((a,b) => finishTimes[a]-finishTimes[b]);
    const dnfRanked = [...dnfSet].sort((a,b) => (dnfTimes[b]||0)-(dnfTimes[a]||0));
    const finishingOrder = [...finishers, ...dnfRanked];

    // Phase multipliers per racer (drama in the middle, settling at end)
    const phaseMults = {};
    for (const n of WB_NAMES) {
        const m0 = prng.float(0.72, 1.28);
        const m1 = prng.float(0.72, 1.28);
        const m2 = Math.max(0.44, Math.min(1.56, 3 - m0 - m1));
        phaseMults[n] = [m0, m1, m2];
    }

    // Lore headlines (pool + seeded picks)
    const headlines = generateHeadlines(prng, dateStr, archive, finishingOrder);

    // Tax (evaluated at day start)
    let tax = 0, taxMsg = null;
    const player = loadPlayer();
    if (player.balance > 100 && prng.chance(0.30)) {
        const taxable = player.balance - 100;
        tax = Math.floor(prng.float(0.05, 0.10) * taxable);
        taxMsg = `Revenue Service: Thank you for your contribution to absolutely nothing. (−${tax})`;
    }

    // AI bets
    const aiBets = getAIBets(prng, racers, archive, finishingOrder);

    return { weather, speeds, dnfSet, dnfTimes, finishTimes, finishingOrder, phaseMults, headlines, tax, taxMsg, aiBets };
}

// ── AI Bettors ────────────────────────────────────────────────────────────────
const AI_IDS = ['WW','LL','RR','HS','UD'];

function getAIBets(prng, racers, archive, _finishingOrder) {
    const last = archive[0];
    const lastWinner = last?.winner;
    const lastLast   = last?.finishingOrder?.at(-1);
    const mostWins   = WB_NAMES.reduce((a, b) => racers[a].careerWins >= racers[b].careerWins ? a : b);
    const fewestWins = WB_NAMES.reduce((a, b) => racers[a].careerWins <= racers[b].careerWins ? a : b);

    const personalities = {
        WW: lastWinner || prng.pick(WB_NAMES),
        LL: lastLast   || prng.pick(WB_NAMES),
        RR: prng.pick(WB_NAMES),
        HS: mostWins,
        UD: fewestWins,
    };

    return AI_IDS.map(id => ({
        id,
        racer:  personalities[id],
        wager:  prng.int(1, 3),
    }));
}

// ── Lore headlines ────────────────────────────────────────────────────────────
const LORE_POOL = [
    "{C} reportedly changed coaches.",
    "{C} was seen arguing with a traffic cone.",
    "{C} switched to a plant-based diet.",
    "{C} overslept.",
    "{C} changed breakfast cereal.",
    "{C} says they're built different.",
    "{C} insists the brakes weren't their fault.",
    "{C} is taking a break from social media.",
    "{C} hired a motivational speaker.",
    "{C} refuses to confirm the rumours.",
    "{C} posted a cryptic message and deleted it.",
    "{C} was spotted at the track at 3 AM.",
    "{C}'s warmup playlist got leaked.",
    "{C} claims they invented the corner.",
    "{C} is 'just vibing' according to sources.",
    "{C} fired their nutritionist and hired a different one.",
    "{C} has 'a lot of thoughts' about the upcoming race.",
    "{C} says this one is personal.",
    "{C} arrived early. No one knows why.",
    "{C} briefly retired then un-retired within the same afternoon.",
    "{C} described their strategy as 'go fast, then continue going fast.'",
    "{C} maintains the crash was not a crash.",
    "{C} cited 'cosmic alignment' as a factor.",
    "{C} was seen consulting a spreadsheet.",
    "{C} blocked the track photographer on social media.",
    "{C} says the other racers aren't worth discussing.",
    "{C} insists they were faster but the clock lied.",
    "{C} launched a personal brand.",
    "{C} donated their trophy to a gas station. It was declined.",
    "{C} is in talks with nobody about nothing.",
];

function loreStr(template, color) { return template.replace('{C}', color); }

function generateHeadlines(prng, dateStr, archive, finishingOrder) {
    const used = new Set();
    const lines = [];

    // Check for new season
    const curSeason = dateStr.slice(0, 7);
    const player = loadPlayer();
    const lastSeason = player.lastPlaySeason;
    if (lastSeason && lastSeason !== curSeason) {
        lines.push(makeSeasonRecap(archive, lastSeason));
    }

    // Pick 3 (or 2 if recap exists) from pool
    const poolIdx = prng.shuffle([...Array(LORE_POOL.length).keys()]);
    const needed = lines.length > 0 ? 2 : 3;
    for (const i of poolIdx) {
        if (lines.length >= lines.length + needed) break;
        const template = LORE_POOL[i];
        const color    = prng.pick(WB_NAMES);
        const headline = loreStr(template, color);
        if (!used.has(headline)) { used.add(headline); lines.push(headline); }
        if (lines.length >= (lastSeason && lastSeason !== curSeason ? 3 : 3)) break;
    }
    return lines.slice(0, 3);
}

function makeSeasonRecap(archive, lastSeason) {
    const entries = archive.filter(e => e.season === lastSeason);
    if (!entries.length) return "Last season's records were misplaced. The filing cabinet is under investigation.";
    const wins = {}, lasts = {};
    for (const n of WB_NAMES) { wins[n] = 0; lasts[n] = 0; }
    for (const e of entries) {
        if (e.winner) wins[e.winner] = (wins[e.winner]||0)+1;
        const loser = e.finishingOrder?.at(-1);
        if (loser) lasts[loser] = (lasts[loser]||0)+1;
    }
    const top  = WB_NAMES.slice().sort((a,b)=>wins[b]-wins[a])[0];
    const bot  = WB_NAMES.slice().sort((a,b)=>lasts[b]-lasts[a])[0];
    const mo   = new Date(lastSeason+'-15').toLocaleString('en',{month:'long'});
    const winsN = wins[top];
    if (!winsN) return `${mo} season summary: inconclusive. The data is fine. Something else is wrong.`;
    return `Season recap (${mo}): ${top} dominated with ${winsN} win${winsN>1?'s':''}. ${bot} would rather not talk about it.`;
}

// ── Economy ───────────────────────────────────────────────────────────────────
function applyDailyEconomy(player, tax) {
    const today  = todayStr();
    const season = seasonStr();

    if (player.lastPlayDate === today) return;  // already applied today

    // Tax first (before daily coins)
    if (tax > 0) player.balance = Math.max(0, player.balance - tax);

    // Monthly bonus (first play of new month)
    if (player.lastPlaySeason !== season) {
        player.balance      += 50;
        player.lastPlaySeason = season;
        // Reset all racer stats for new season
        const racers = loadRacers();
        for (const n of WB_NAMES) {
            Object.assign(racers[n], {
                currentSpeed: 100, consecutiveWins: 0, consecutiveLasts: 0,
                winnerBonus: 0, depressionDebuff: false,
            });
        }
        saveRacers(racers);
    }

    // Daily coins
    player.balance     += 10;
    player.lastPlayDate = today;
}

// ── Payout calculation ────────────────────────────────────────────────────────
function calcPayout(won, wager, aiBets, playerRacer) {
    const pool = aiBets
        .filter(b => b.racer !== playerRacer)
        .reduce((s, b) => s + b.wager, 0);
    if (won) {
        return pool >= wager ? wager * 2 : wager + pool;
    }
    return 0;
}

// ── Post-race racer state update ──────────────────────────────────────────────
function applyRaceResults(racers, finishingOrder, dnfSet) {
    const winner = finishingOrder[0];
    const last   = finishingOrder[finishingOrder.length - 1];

    for (const n of WB_NAMES) {
        racers[n].totalRaces++;
        if (dnfSet.has(n)) racers[n].dnfs++;
        const pos = finishingOrder.indexOf(n);
        if (pos < 3 && !dnfSet.has(n)) racers[n].podiumFinishes++;
    }

    // Everyone not 1st: reset win streak/bonus
    for (const n of WB_NAMES) {
        if (n !== winner) {
            racers[n].currentSpeed    = 100;
            racers[n].winnerBonus     = 0;
            racers[n].consecutiveWins = 0;
        }
    }

    // Last-place debuff
    if (last) {
        racers[last].depressionDebuff = true;
        racers[last].currentSpeed     = Math.max(50, racers[last].currentSpeed - 2);
        racers[last].consecutiveLasts++;
        if (racers[last].consecutiveLasts >= 5) {
            // Mercy rule
            racers[last].winnerBonus      = 6;
            racers[last].currentSpeed     = 106;
            racers[last].consecutiveLasts = 0;
        }
    }

    // Winner bonus
    if (winner && !dnfSet.has(winner)) {
        if (racers[winner].depressionDebuff) racers[winner].depressionDebuff = false;
        racers[winner].consecutiveWins = Math.min(3, racers[winner].consecutiveWins + 1);
        racers[winner].careerWins++;
        const bonusLevels = [2, 4, 6];
        const nb = bonusLevels[racers[winner].consecutiveWins - 1] || 6;
        if (nb > racers[winner].winnerBonus) {
            racers[winner].winnerBonus = nb;
        }
        racers[winner].currentSpeed = 100 + racers[winner].winnerBonus;
    }

    return racers;
}

// ── Race visual simulation ────────────────────────────────────────────────────
function getVisualProgress(racerName, elapsed, daily) {
    const { finishTimes, phaseMults, dnfSet, dnfTimes, speeds } = daily;
    if (dnfSet.has(racerName)) {
        const dnfT = dnfTimes[racerName] || 0;
        if (elapsed >= dnfT) return { prog: dnfT / finishTimes[racerName] || 0.5, done: true, dnf: true };
    }
    const ft = finishTimes[racerName];
    if (elapsed >= ft) return { prog: 1, done: true, dnf: false };
    const norm = elapsed / ft;
    const mults = phaseMults[racerName];
    const phase = Math.min(2, Math.floor(norm * 3));
    const phaseLocal = norm * 3 - phase;
    let prog = 0;
    for (let i = 0; i < phase; i++) prog += mults[i] / 3;
    prog += mults[phase] * phaseLocal / 3;
    // Converge to linear in final 15%
    if (norm > 0.85) {
        const cf = (norm - 0.85) / 0.15;
        prog = prog * (1 - cf) + norm * cf;
    }
    return { prog: Math.min(1, Math.max(0, prog)), done: false, dnf: false };
}

// ── Canvas race state ─────────────────────────────────────────────────────────
let canvas, ctx, track;
let raceStartTime = null;
let racerState    = {};   // name → {prog, done, dnf, finishedAt}
let finishedOrder = [];
let dnfOrder      = [];
let animHandle    = null;
let currentDaily  = null;
let currentBet    = null;  // { racer, wager }
let isReplay      = false;

function initCanvas() {
    canvas = document.getElementById('wb-canvas');
    const shell = document.querySelector('.wb-shell');
    const H = Math.min(window.innerHeight - 120, 680);
    const W = Math.min(shell?.offsetWidth || 1100, 1100);
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
}

function buildTrackForToday() {
    const prng = makePRNG(todayStr() + '_track');
    track = buildTrack(prng, canvas.width, canvas.height);
    // Show circuit name in the race header
    const numEl = document.getElementById('wb-circuit-name');
    if (numEl) {
        numEl.textContent = track.circuitName;
        numEl.title       = track.circuitLocation;
    }
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        bg:      style.getPropertyValue('--bg').trim()      || '#0a0a0a',
        border:  style.getPropertyValue('--border').trim()  || '#1e1c1a',
        text:    style.getPropertyValue('--text').trim()    || '#f0ebe0',
        textDim: style.getPropertyValue('--text-dim').trim()|| '#8a857a',
    };
}

function drawScene(elapsed) {
    if (!ctx || !track) return;
    const TC  = getThemeColors();
    const weather = currentDaily?.weather;
    const fog = weather === 'Fog' ? 0.55 : 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = TC.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { pts, SAMPLES, GATE_X, GATE_Y, crowd, greenery, stands } = track;

    // ── Greenery patches (outside track, subtle) ────────────────────────────
    for (const g of greenery) {
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.fillStyle = g.color;
        ctx.globalAlpha = fog * g.a;
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Track surface ────────────────────────────────────────────────────────
    ctx.globalAlpha = fog;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < SAMPLES; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.lineWidth   = 20;
    ctx.strokeStyle = '#2a2826';
    ctx.stroke();

    // Track border lines (white kerbs feel)
    ctx.lineWidth   = 20;
    ctx.strokeStyle = TC.border;
    ctx.globalAlpha = fog * 0.9;
    ctx.stroke();

    // Center dashed white line
    ctx.setLineDash([8, 10]);
    ctx.lineWidth   = 1;
    ctx.strokeStyle = TC.textDim;
    ctx.globalAlpha = fog * 0.18;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < SAMPLES; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── Grandstands ──────────────────────────────────────────────────────────
    for (const s of stands) {
        ctx.globalAlpha = fog * s.a;
        // Stand base (bleacher rows)
        const rows = s.rows;
        const rowH = s.h / rows;
        for (let r = 0; r < rows; r++) {
            const shade = 0.12 + r * 0.03;
            ctx.fillStyle = `rgba(${Math.round(shade*255)},${Math.round(shade*240)},${Math.round(shade*230)},1)`;
            ctx.fillRect(s.x, s.y + r * rowH, s.w, rowH - 0.5);
        }
        // Tiny crowd dots
        for (const dot of s.dots) {
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
            ctx.fillStyle = dot.c;
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;

    // ── Start/finish gate ────────────────────────────────────────────────────
    // Find track direction at gate for perpendicular line
    const g0 = pts[0], g1 = pts[Math.min(4, SAMPLES-1)];
    const dx = g1.x - g0.x, dy = g1.y - g0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;  // perpendicular
    const gateLen = 18;

    ctx.globalAlpha = fog * 0.9;
    ctx.lineWidth = 3;
    ctx.strokeStyle = TC.text;
    ctx.beginPath();
    ctx.moveTo(GATE_X + nx * gateLen, GATE_Y + ny * gateLen);
    ctx.lineTo(GATE_X - nx * gateLen, GATE_Y - ny * gateLen);
    ctx.stroke();

    // Chequered flag pattern (4 squares)
    const sqSize = 5;
    for (let s = 0; s < 4; s++) {
        ctx.fillStyle = s % 2 === 0 ? '#fff' : '#000';
        ctx.globalAlpha = fog * 0.75;
        ctx.fillRect(
            GATE_X + nx * (s * sqSize - gateLen) - sqSize/2,
            GATE_Y + ny * (s * sqSize - gateLen) - sqSize/2,
            sqSize, sqSize
        );
    }
    ctx.globalAlpha = 1;

    // ── Racers ───────────────────────────────────────────────────────────────
    for (const name of WB_NAMES) {
        const st = racerState[name];
        if (!st) continue;
        const { prog, done, dnf } = st;
        const pt = trackPoint(track, prog);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = WB_COLORS[name];
        ctx.globalAlpha = (dnf && done) ? 0.3 : fog;
        ctx.fill();

        // Thin dark ring for legibility
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = (dnf && done) ? 0.2 : fog * 0.8;
        ctx.stroke();

        if (done && !dnf) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = fog * 0.9;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Race status ──────────────────────────────────────────────────────────
    const statusEl = document.getElementById('wb-race-status');
    if (statusEl) {
        const remaining = WB_NAMES.filter(n => !racerState[n]?.done);
        statusEl.textContent = remaining.length > 0
            ? `${remaining.length} racer${remaining.length > 1 ? 's' : ''} still racing`
            : '';
    }
}

// ── Race animation loop ───────────────────────────────────────────────────────
function raceLoop(timestamp) {
    if (!raceStartTime) raceStartTime = timestamp;
    const elapsed = (timestamp - raceStartTime) / 1000;

    for (const name of WB_NAMES) {
        if (racerState[name]?.done) continue;
        const result = getVisualProgress(name, elapsed, currentDaily);
        racerState[name] = result;
        if (result.done) {
            if (result.dnf) {
                if (!dnfOrder.includes(name)) dnfOrder.push(name);
            } else {
                if (!finishedOrder.includes(name)) finishedOrder.push(name);
                racerState[name].prog = 1;  // snap to finish
            }
        }
    }

    drawScene(elapsed);

    const allDone = WB_NAMES.every(n => racerState[n]?.done);
    if (!allDone) {
        animHandle = requestAnimationFrame(raceLoop);
    } else {
        onRaceComplete();
    }
}

function onRaceComplete() {
    if (animHandle) cancelAnimationFrame(animHandle);
    const entry = buildArchiveEntry(currentBet, currentDaily);
    if (!isReplay) {
        applyEndOfRace(entry, currentBet, currentDaily);
    }
    setTimeout(() => showResultsFromEntry(entry, currentBet), 600);
}

// ── Build archive entry ───────────────────────────────────────────────────────
function buildArchiveEntry(bet, daily) {
    const player = loadPlayer();
    const { finishingOrder, dnfSet, weather, speeds, aiBets, headlines } = daily;
    const won    = bet && finishingOrder[0] === bet.racer && !dnfSet.has(bet.racer);
    const payout = bet ? calcPayout(won, bet.wager, aiBets, bet.racer) : 0;

    return {
        date:         todayStr(),
        season:       seasonStr(),
        weather,
        finishingOrder,
        winner:       finishingOrder[0],
        dnfs:         [...dnfSet],
        playerBet: bet ? { racer: bet.racer, wager: bet.wager, result: won ? 'win' : 'lose', payout } : null,
        aiBets,
        headlines,
        replaySeed:   todayStr(),
        racerSpeedsAtRaceStart: { ...speeds },
    };
}

function applyEndOfRace(entry, bet, daily) {
    // Update player balance
    const player = loadPlayer();
    if (bet) {
        const won = entry.playerBet.result === 'win';
        if (won)  player.balance += entry.playerBet.payout;
        else      player.balance  = Math.max(0, player.balance - bet.wager);
    }
    savePlayer(player);

    // Update racer states
    let racers = loadRacers();
    racers = applyRaceResults(racers, entry.finishingOrder, daily.dnfSet);
    saveRacers(racers);

    // Save locally
    appendArchive(entry);
    saveToday(entry);
    updateBalanceDisplay();

    // Sync to server cache so global archive knows about this race
    fetch('/api/weball/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    }).catch(() => {});  // fire and forget
}

// ── UI ────────────────────────────────────────────────────────────────────────
function showScreen(id) {
    const screens = document.querySelectorAll('.wb-screen');
    screens.forEach(s => s.style.display = 'none');
    if (id === 'done-or-prerace') {
        const today = loadToday();
        id = today ? 'done' : 'prerace';
    }
    const target = document.getElementById(`wb-screen-${id}`);
    if (target) target.style.display = '';
    if (id === 'archive') renderArchive();
}

function updateBalanceDisplay() {
    const player = loadPlayer();
    const el = document.getElementById('wb-balance-display');
    if (el) el.textContent = `⬡ ${player.balance}`;
}

function setWager(n) {
    const input = document.getElementById('wb-wager-input');
    if (input) input.value = n;
    updatePoolPreview();
}

function setWagerAll() {
    const player = loadPlayer();
    setWager(player.balance);
}

// ── Pre-race screen ───────────────────────────────────────────────────────────
let _daily = null;
let _selectedRacer = null;

function renderPreRace() {
    const daily  = _daily;
    const racers = loadRacers();

    // Circuit name (from F1 track data)
    const circuit = getTrackForDate(todayStr());
    const circuitEl = document.getElementById('wb-circuit-name');
    if (circuitEl) {
        circuitEl.textContent = circuit.name;
        circuitEl.title       = circuit.location;
    }

    // Weather badge
    const WEATHER_ICONS = { Sunny:'☀', Cloudy:'☁', Fog:'🌫', Snow:'❄', Rain:'🌧' };
    document.getElementById('wb-weather-badge').textContent =
        `${WEATHER_ICONS[daily.weather] || ''} ${daily.weather}`;

    // Season badge
    const season = new Date(seasonStr()+'-15').toLocaleString('en',{month:'long',year:'numeric'});
    document.getElementById('wb-season-badge').textContent = season;

    // Headlines
    const hlEl = document.getElementById('wb-headlines');
    hlEl.innerHTML = daily.headlines.map(h =>
        `<p class="wb-headline">"${h}"</p>`
    ).join('');

    // Tax message
    if (daily.taxMsg) {
        hlEl.insertAdjacentHTML('beforeend',
            `<p class="wb-tax-msg">${daily.taxMsg}</p>`);
    }

    // Racer options
    const grid = document.getElementById('wb-racer-options');
    grid.innerHTML = WB_NAMES.map(name => {
        const r = racers[name];
        const stars = '⭐'.repeat(r.consecutiveWins);
        const skulls = r.consecutiveLasts > 0
            ? `<span class="wb-streak-bad">${'▽'.repeat(r.consecutiveLasts)}</span>`
            : '';
        return `
            <button class="wb-racer-option" data-racer="${name}"
                    onclick="selectRacer('${name}')"
                    style="--rc:${WB_COLORS[name]}">
                <span class="wb-racer-dot" style="background:${WB_COLORS[name]}"></span>
                <span class="wb-racer-name">${name}</span>
                <span class="wb-streaks">${stars}${skulls}</span>
            </button>`;
    }).join('');

    // AI bets
    const aiEl = document.getElementById('wb-ai-bets');
    aiEl.innerHTML = daily.aiBets.map(b => `
        <div class="wb-ai-bettor">
            <span class="wb-ai-id">${b.id}</span>
            <span class="wb-racer-dot wb-racer-dot--sm" style="background:${WB_COLORS[b.racer]}"></span>
            <span class="wb-ai-wager">⬡${b.wager}</span>
        </div>`).join('');

    // Default select first racer
    selectRacer(WB_NAMES[0]);

    const wagerInput = document.getElementById('wb-wager-input');
    if (wagerInput) wagerInput.addEventListener('input', updatePoolPreview);
    updatePoolPreview();
}

function selectRacer(name) {
    _selectedRacer = name;
    document.querySelectorAll('.wb-racer-option').forEach(btn => {
        btn.classList.toggle('wb-racer-option--selected', btn.dataset.racer === name);
    });
    updatePoolPreview();
}

function updatePoolPreview() {
    const daily   = _daily;
    const player  = loadPlayer();
    const wager   = Math.min(player.balance, Math.max(1, parseInt(document.getElementById('wb-wager-input')?.value) || 1));
    const pool    = daily.aiBets.filter(b => b.racer !== _selectedRacer).reduce((s,b) => s+b.wager, 0);
    const el      = document.getElementById('wb-pool-preview');
    const winAmt  = pool >= wager ? wager * 2 : wager + pool;
    if (el) el.textContent = `Win: ⬡${winAmt} · Lose: −⬡${wager} · Balance: ⬡${player.balance}`;
}

function startRaceFromBet() {
    const player = loadPlayer();
    const raw    = parseInt(document.getElementById('wb-wager-input')?.value) || 1;
    const wager  = Math.min(player.balance, Math.max(1, raw));
    if (!_selectedRacer || wager < 1 || wager > player.balance) return;

    currentBet  = { racer: _selectedRacer, wager };
    isReplay    = false;
    launchRace();
}

function startReplay() {
    currentBet = null;
    isReplay   = true;
    launchRace();
}

function launchRace() {
    // Reset race state
    racerState    = {};
    finishedOrder = [];
    dnfOrder      = [];
    raceStartTime = null;
    if (animHandle) cancelAnimationFrame(animHandle);

    for (const n of WB_NAMES) racerState[n] = { prog: 0, done: false, dnf: false };

    showScreen('race');

    // Give DOM time to show canvas, then init + start
    requestAnimationFrame(() => {
        initCanvas();
        buildTrackForToday();
        drawScene(0);
        requestAnimationFrame(ts => {
            raceStartTime = ts;
            animHandle = requestAnimationFrame(raceLoop);
        });
    });
}

// ── Results screen ────────────────────────────────────────────────────────────
function showResultsFromEntry(entry, bet) {
    const el = document.getElementById('wb-result-content');
    const won = bet && entry.playerBet?.result === 'win';
    const circuit = getTrackForDate(entry.date || todayStr());

    const orderHTML = entry.finishingOrder.map((name, i) => {
        const isDNF = entry.dnfs.includes(name);
        const pos   = isDNF ? 'DNF' : `${i+1}${['st','nd','rd'][i]||'th'}`;
        return `<div class="wb-result-row">
            <span class="wb-result-pos">${pos}</span>
            <span class="wb-racer-dot" style="background:${WB_COLORS[name]}"></span>
            <span class="wb-result-name">${name}</span>
            ${name === entry.winner ? '<span class="wb-result-crown">✦</span>' : ''}
        </div>`;
    }).join('');

    let betHTML = '';
    if (bet && entry.playerBet) {
        const p = entry.playerBet;
        betHTML = `<div class="wb-bet-result ${won ? 'wb-bet-win' : 'wb-bet-lose'}">
            ${won
                ? `✓ You backed ${p.racer}. Won ⬡${p.payout} (+⬡${p.payout - p.wager})`
                : `✗ You backed ${p.racer}. Lost ⬡${p.wager}`}
        </div>`;
    }

    const player = loadPlayer();
    el.innerHTML = `
        <p class="wb-circuit-display">${circuit.name}</p>
        <p style="font-size:11px;color:var(--text-dimmer);margin:-12px 0 20px 0;letter-spacing:0.06em">${circuit.location} · ${entry.weather || ''}</p>
        <div class="wb-result-order">${orderHTML}</div>
        ${betHTML}
        <p class="wb-result-balance">Balance: ⬡${player.balance}</p>`;

    showScreen('results');
}

// ── Archive screen ────────────────────────────────────────────────────────────
function renderArchive() {
    const archive = loadArchive();
    const el = document.getElementById('wb-archive-list');
    if (!archive.length) {
        el.innerHTML = '<p class="error-msg" style="margin-top:16px">> no races yet.</p>';
        return;
    }
    el.innerHTML = archive.map((e, idx) => {
        const date  = new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
        const order = e.finishingOrder.map(n =>
            `<span class="wb-racer-dot wb-racer-dot--sm" style="background:${WB_COLORS[n]};opacity:${e.dnfs.includes(n)?0.35:1}"></span>`
        ).join('');
        const betLine = e.playerBet
            ? (e.playerBet.result === 'win'
                ? `<span style="color:var(--accent-done)">+⬡${e.playerBet.payout - e.playerBet.wager}</span>`
                : `<span style="color:var(--accent-error)">−⬡${e.playerBet.wager}</span>`)
            : '';
        return `
            <div class="wb-archive-entry">
                <div class="wb-archive-date">${date} · ${e.weather}</div>
                <div class="wb-archive-dots">${order}</div>
                ${betLine ? `<div class="wb-archive-bet">${betLine}</div>` : ''}
            </div>`;
    }).join('');
}

// ── Done screen ───────────────────────────────────────────────────────────────
function renderDoneScreen(entry) {
    const el = document.getElementById('wb-done-summary');
    const bet = entry.playerBet;
    const won = bet?.result === 'win';
    el.innerHTML = `
        <div class="wb-result-order">
            ${entry.finishingOrder.map((n, i) => `
                <div class="wb-result-row">
                    <span class="wb-result-pos">${entry.dnfs.includes(n)?'DNF':`${i+1}${['st','nd','rd'][i]||'th'}`}</span>
                    <span class="wb-racer-dot" style="background:${WB_COLORS[n]}"></span>
                    <span class="wb-result-name">${n}</span>
                </div>`).join('')}
        </div>
        ${bet ? `<div class="wb-bet-result ${won?'wb-bet-win':'wb-bet-lose'}">
            ${won ? `✓ Won ⬡${bet.payout}` : `✗ Lost ⬡${bet.wager}`} on ${bet.racer}
        </div>` : ''}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
    const params   = new URLSearchParams(window.location.search);
    const replayDate = params.get('replay');

    // ── Replay a specific date from the archive ──────────────────────────
    if (replayDate) {
        // Try to find it in localStorage archive
        const arc = loadArchive();
        const entry = arc.find(e => e.date === replayDate);
        if (entry) {
            // Rebuild daily data for that date using stored speeds
            const speeds = entry.racerSpeedsAtRaceStart || {};
            const weather = entry.weather || 'Sunny';
            const replayPRNG = makePRNG(replayDate);
            const phaseMults = {};
            for (const n of WB_NAMES) {
                const m0 = replayPRNG.float(0.72, 1.28);
                const m1 = replayPRNG.float(0.72, 1.28);
                const m2 = Math.max(0.44, Math.min(1.56, 3 - m0 - m1));
                phaseMults[n] = [m0, m1, m2];
            }
            const dnfSet = new Set(entry.dnfs || []);
            const dnfTimes = {};
            const finishTimes = {};
            for (const n of WB_NAMES) {
                const sp = speeds[n] || 100;
                if (dnfSet.has(n)) {
                    finishTimes[n] = Infinity;
                    dnfTimes[n] = replayPRNG.float(0.2, 0.85) * (BASE_RACE_TIME / (sp / 100));
                } else {
                    finishTimes[n] = BASE_RACE_TIME / (sp / 100);
                }
            }
            currentDaily = { weather, speeds, dnfSet, dnfTimes, finishTimes, phaseMults,
                             headlines: entry.headlines || [], tax: 0, taxMsg: null, aiBets: entry.aiBets || [] };
            currentBet  = null;
            isReplay    = true;
            updateBalanceDisplay();
            launchRace();
            return;
        }
        // Not in localStorage — try server (via fetch to history data)
        // For now fall through to today's view
    }

    // ── Normal today flow ────────────────────────────────────────────────
    const today = loadToday();
    let player  = loadPlayer();

    _daily = getDailyData(todayStr());

    if (!today) {
        applyDailyEconomy(player, _daily.tax);
        player = loadPlayer();
    }

    updateBalanceDisplay();
    currentDaily = _daily;

    if (today) {
        renderDoneScreen(today);
        showScreen('done');
    } else {
        renderPreRace();
        showScreen('prerace');
    }
}

init();
