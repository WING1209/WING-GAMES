/* ===================================================
   ○o WING GAME玉 o○ - 完全修正版 script.js
   =================================================== */

class SoundSystem {
    constructor() {
        this.ctx = null;
        this.isPlayingBgm = false;
        this.bgmTimer = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playSE(type) {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'shot') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'pop') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'bomb') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        }
    }

    startRandomBGM() {
        this.init();
        if (this.isPlayingBgm) return;
        this.isPlayingBgm = true;

        const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
        let step = 0;

        const playNote = () => {
            if (!this.isPlayingBgm || !this.ctx) return;
            const freq = scale[Math.floor(Math.random() * scale.length)];
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.25);

            this.bgmTimer = setTimeout(playNote, 220 + (step % 4 === 0 ? 80 : 0));
            step++;
        };
        playNote();
    }

    stopBGM() {
        this.isPlayingBgm = false;
        if (this.bgmTimer) clearTimeout(this.bgmTimer);
    }
}

const audio = new SoundSystem();

// --- 画面UI切り替え制御 ---
function showScreen(screenId) {
    document.querySelectorAll('.overlay-screen').forEach(el => el.classList.remove('active'));
    if (screenId) {
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');
    }
}

// 1. PRESS TO START（1タップ目）➔ BGM開始 ＆ あそびかた表示
function handleTitleTap() {
    audio.playSE('click');
    audio.startRandomBGM();
    showScreen('screen-how-to-play');
}

// 2. あそびかたの「次へ」タップ ➔ モード選択表示
function goToModeSelect() {
    audio.playSE('click');
    showScreen('screen-mode-select');
}

// モード選択画面へ戻る
function backToModeSelect() {
    audio.playSE('click');
    showScreen('screen-mode-select');
}

// ① 一人で遊ぶ
function startSinglePlay() {
    audio.playSE('click');
    showScreen(null);
    startNewGame('single');
}

// ② フレンド対戦メニュー
function openFriendBattleMenu() {
    audio.playSE('click');
    showScreen('screen-friend-menu');
}

// ③ ランキング
function showRankingBoard() {
    audio.playSE('click');
    renderRankingTable();
    showScreen('screen-ranking');
}

// ④ 終了
function exitGame() {
    audio.playSE('click');
    audio.stopBGM();
    showScreen('screen-title'); // 最初に戻る
}

function cancelNetwork(target = 'screen-mode-select') {
    audio.playSE('click');
    if (peer) { peer.destroy(); peer = null; }
    showScreen(target);
}

// --- ゲームロジック ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const BUBBLE_RADIUS = 16;
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const ROWS = 12;
const COLS = 10;
const COLORS = ['#ff4d4d', '#4dff4d', '#4d94ff', '#ffff4d', '#ff4dff'];

let grid = [];
let currentBubble = null;
let nextBubble = null;
let bullet = null;
let isDragging = false;
let aimAngle = Math.PI / 2;
let score = 0;
let currentStage = 1;
let bombCount = 2;
let gameMode = 'single';
let isGameOver = false;

function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initGrid() {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            if (r < 4) {
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                grid[r][c] = { color: color, type: 'normal' };
            } else {
                grid[r][c] = null;
            }
        }
    }
}

function createRandomBubble() {
    const rand = Math.random();
    if (rand < 0.05 && bombCount > 0) {
        return { color: '#ffcc00', type: 'bomb' };
    } else if (rand < 0.08) {
        return { color: '#ffffff', type: 'rainbow' };
    }
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return { color: color, type: 'normal' };
}

function startNewGame(mode) {
    gameMode = mode;
    score = 0;
    currentStage = 1;
    bombCount = 2;
    isGameOver = false;
    initGrid();
    currentBubble = createRandomBubble();
    nextBubble = createRandomBubble();
    requestAnimationFrame(gameLoop);
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (bullet || isGameOver) return;
    isDragging = true;
    updateAim(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDragging) return;
    updateAim(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (isDragging && !bullet) {
        isDragging = false;
        shoot();
    }
}, { passive: false });

function updateAim(touchX, touchY) {
    const rect = canvas.getBoundingClientRect();
    const x = touchX - rect.left;
    const y = touchY - rect.top;
    const shooterX = canvas.width / 2;
    const shooterY = canvas.height - 70;

    const dx = x - shooterX;
    const dy = y - shooterY;
    if (dy < -10) {
        aimAngle = Math.atan2(-dy, dx);
    }
}

function shoot() {
    audio.playSE('shot');
    const shooterX = canvas.width / 2;
    const shooterY = canvas.height - 70;
    const speed = 12;

    bullet = {
        x: shooterX,
        y: shooterY,
        vx: Math.cos(aimAngle) * speed,
        vy: -Math.sin(aimAngle) * speed,
        bubble: currentBubble
    };

    if (currentBubble.type === 'bomb') bombCount--;
    currentBubble = nextBubble;
    nextBubble = createRandomBubble();
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const offsetX = (canvas.width - COLS * BUBBLE_DIAMETER) / 2;
    const offsetY = 40;

    if (bullet) {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        if (bullet.x - BUBBLE_RADIUS <= offsetX || bullet.x + BUBBLE_RADIUS >= offsetX + COLS * BUBBLE_DIAMETER) {
            bullet.vx *= -1;
            bullet.x = Math.max(offsetX + BUBBLE_RADIUS, Math.min(bullet.x, offsetX + COLS * BUBBLE_DIAMETER - BUBBLE_RADIUS));
        }

        if (bullet.y - BUBBLE_RADIUS <= offsetY || checkCollision(bullet, offsetX, offsetY)) {
            snapToGrid(bullet, offsetX, offsetY);
            bullet = null;
        }
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const b = grid[r][c];
            if (b) {
                const bx = offsetX + c * BUBBLE_DIAMETER + BUBBLE_RADIUS;
                const by = offsetY + r * BUBBLE_DIAMETER + BUBBLE_RADIUS;
                drawBubble(bx, by, b);
            }
        }
    }

    const deadLineY = offsetY + (ROWS - 1) * BUBBLE_DIAMETER;
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(offsetX, deadLineY);
    ctx.lineTo(offsetX + COLS * BUBBLE_DIAMETER, deadLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isDragging && !bullet) {
        const sx = canvas.width / 2;
        const sy = canvas.height - 70;
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(aimAngle) * 120, sy - Math.sin(aimAngle) * 120);
        ctx.stroke();
    }

    if (currentBubble) drawBubble(canvas.width / 2, canvas.height - 70, currentBubble);
    if (nextBubble) drawBubble(canvas.width / 2 - 60, canvas.height - 70, nextBubble, 0.7);
    if (bullet) drawBubble(bullet.x, bullet.y, bullet.bubble);

    if (!isGameOver) {
        requestAnimationFrame(gameLoop);
    }
}

function drawBubble(x, y, bubble, scale = 1) {
    const r = BUBBLE_RADIUS * scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = bubble.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();

    if (bubble.type === 'bomb') {
        ctx.fillStyle = '#000';
        ctx.font = `${12 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', x, y);
    } else if (bubble.type === 'rainbow') {
        ctx.fillStyle = '#000';
        ctx.font = `${12 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x, y);
    }
}

function checkCollision(b, offsetX, offsetY) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                const bx = offsetX + c * BUBBLE_DIAMETER + BUBBLE_RADIUS;
                const by = offsetY + r * BUBBLE_DIAMETER + BUBBLE_RADIUS;
                const dist = Math.hypot(b.x - bx, b.y - by);
                if (dist < BUBBLE_DIAMETER - 2) return true;
            }
        }
    }
    return false;
}

function snapToGrid(b, offsetX, offsetY) {
    let c = Math.floor((b.x - offsetX) / BUBBLE_DIAMETER);
    let r = Math.floor((b.y - offsetY) / BUBBLE_DIAMETER);
    c = Math.max(0, Math.min(COLS - 1, c));
    r = Math.max(0, Math.min(ROWS - 1, r));

    grid[r][c] = b.bubble;

    if (b.bubble.type === 'bomb') {
        audio.playSE('bomb');
        explodeBomb(r, c);
    } else if (b.bubble.type === 'rainbow') {
        audio.playSE('pop');
        triggerRainbow(r, c);
    } else {
        audio.playSE('pop');
        checkMatches(r, c);
    }

    removeFloatingBubbles();
    checkGameOverOrClear();
}

function explodeBomb(row, col) {
    for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(COLS - 1, col + 1); c++) {
            if (grid[r][c]) {
                grid[r][c] = null;
                score += 100;
            }
        }
    }
}

function triggerRainbow(row, col) {
    let targetColor = null;
    const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let [dr, dc] of neighbors) {
        let nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc]) {
            targetColor = grid[nr][nc].color;
            break;
        }
    }
    grid[row][col] = null;
    if (targetColor) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] && grid[r][c].color === targetColor) {
                    grid[r][c] = null;
                    score += 150;
                }
            }
        }
    }
}

function checkMatches(row, col) {
    const targetColor = grid[row][col].color;
    const matched = [];
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

    function dfs(r, c) {
        visited[r][c] = true;
        matched.push({ r, c });
        const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
        for (let [dr, dc] of neighbors) {
            let nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc]) {
                if (grid[nr][nc] && grid[nr][nc].color === targetColor) {
                    dfs(nr, nc);
                }
            }
        }
    }

    dfs(row, col);

    if (matched.length >= 3) {
        matched.forEach(pos => { grid[pos.r][pos.c] = null; });
        score += matched.length * 100;
    }
}

function removeFloatingBubbles() {
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

    function dfs(r, c) {
        visited[r][c] = true;
        const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
        for (let [dr, dc] of neighbors) {
            let nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc]) {
                if (grid[nr][nc]) dfs(nr, nc);
            }
        }
    }

    for (let c = 0; c < COLS; c++) {
        if (grid[0][c] && !visited[0][c]) dfs(0, c);
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] && !visited[r][c]) {
                grid[r][c] = null;
                score += 200;
            }
        }
    }
}

function checkGameOverOrClear() {
    let hasBubbles = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) { hasBubbles = true; break; }
        }
    }

    if (!hasBubbles) {
        document.getElementById('clear-score-text').innerText = `SCORE: ${score}`;
        showScreen('screen-stage-clear');
        return;
    }

    for (let c = 0; c < COLS; c++) {
        if (grid[ROWS - 1][c]) {
            isGameOver = true;
            document.getElementById('gameover-score-text').innerText = `FINAL SCORE: ${score}`;
            showScreen('screen-game-over');
            return;
        }
    }
}

function nextStageAction() {
    currentStage++;
    bombCount = 2;
    initGrid();
    showScreen(null);
    requestAnimationFrame(gameLoop);
}

// --- 通信＆ランキング ---
let peer = null;
let conn = null;
let hostBattleType = 'タイムアタック';
let hostTargetWins = 1;

function setupRole(role) {
    audio.playSE('click');
    if (role === 'host') {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById('display-room-code').innerText = roomCode;
        showScreen('screen-host-wait');

        peer = new Peer('wing-game-' + roomCode);
        peer.on('connection', (c) => {
            conn = c;
            setupConnectionListeners();
            showScreen('screen-host-rule-setup');
        });
    } else {
        showScreen('screen-guest-join');
    }
}

function setHostBattleType(type) {
    audio.playSE('click');
    hostBattleType = type;
    document.getElementById('btn-mode-ta').className = type === 'タイムアタック' ? 'menu-btn sub' : 'menu-btn gray';
    document.getElementById('btn-mode-ojama').className = type === 'お邪魔対戦' ? 'menu-btn sub' : 'menu-btn gray';
}

function setHostTargetWins(wins) {
    audio.playSE('click');
    hostTargetWins = wins;
    document.getElementById('btn-win-1').className = wins === 1 ? 'menu-btn' : 'menu-btn gray';
    document.getElementById('btn-win-2').className = wins === 2 ? 'menu-btn' : 'menu-btn gray';
}

function confirmHostBattleStart() {
    audio.playSE('click');
    if (conn) conn.send({ type: 'rule', mode: hostBattleType, wins: hostTargetWins });
    const rulesText = `・モード: ${hostBattleType}<br>・勝利条件: ${hostTargetWins}本先取`;
    document.getElementById('rules-text-content').innerHTML = rulesText;
    showScreen('screen-battle-rules-desc');
}

function joinRoom() {
    audio.playSE('click');
    const code = document.getElementById('input-room-code').value;
    if (code.length === 4) {
        peer = new Peer();
        peer.on('open', () => {
            conn = peer.connect('wing-game-' + code);
            setupConnectionListeners();
            showScreen('screen-guest-wait-rule');
        });
    }
}

function setupConnectionListeners() {
    conn.on('data', (data) => {
        if (data.type === 'rule') {
            const rulesText = `・モード: ${data.mode}<br>・勝利条件: ${data.wins}本先取`;
            document.getElementById('rules-text-content').innerHTML = rulesText;
            showScreen('screen-battle-rules-desc');
        }
    });
}

function readyToStartBattle() {
    audio.playSE('click');
    showScreen(null);
    startNewGame('battle');
}

function renderRankingTable() {
    const body = document.getElementById('ranking-list-body');
    const records = JSON.parse(localStorage.getItem('wing_game_scores') || '[]');
    if (records.length === 0) {
        body.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        return;
    }
    body.innerHTML = records.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.name}</td>
            <td>STAGE ${r.stage}</td>
            <td>${r.time}</td>
            <td>${r.score}</td>
        </tr>
    `).join('');
}
