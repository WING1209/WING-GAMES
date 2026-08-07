// ==========================================
// 💡 基本設定＆グローバル変数
// ==========================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ゲームのサイズ定義
const CANVAS_WIDTH = 380;
const CANVAS_HEIGHT = 640;
const BUBBLE_RADIUS = 16;
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const ROW_HEIGHT = 28; // 六角形グリッドの行高

const GRID_ROWS = 14;
const GRID_COLS = 8;
const BOARD_OFFSET_Y = 50;

// バブルの色の種類
const BUBBLE_COLORS = ["#ff4d4d", "#4da6ff", "#4dff4d", "#ffcc00", "#cc66ff", "#ff9933"];
const COLOR_NAMES = ["赤", "青", "緑", "黄", "紫", "橙"];

// ゲーム状態変数
let grid = [];
let shooter = { x: CANVAS_WIDTH / 2, y: 580, angle: -Math.PI / 2 };
let currentBubble = null;
let nextBubble = null;
let bullet = null; // 飛んでいるバブル

let score = 0;
let stage = 1;
let wins = 0;
let opponentWins = 0;
let targetWins = 1;

let gameMode = 'single'; // 'single' | 'online'
let currentBattleType = 'タイムアタック'; // 'タイムアタック' | 'ラリー対戦'
let isHost = false;
let isGameOver = false;
let isGameClear = false;

// 通信関連 (PeerJS)
let peer = null;
let conn = null;
let myPeerId = "";

// ==========================================
// 🎮 初期化 & ゲーム開始
// ==========================================
window.onload = function() {
    initGrid();
    setupControls();
    loadCustomImages();
    drawTitleBackground();
};

function initGrid() {
    grid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < GRID_COLS; c++) {
            grid[r][c] = null;
        }
    }
}

// ひとりプレイ開始
function startSinglePlay() {
    gameMode = 'single';
    stage = 1;
    score = 0;
    hideAllScreens();
    resetGameBoard();
    createInitialBubbles(3 + stage); // ステージに応じた初期配置
    requestAnimationFrame(gameLoop);
}

// ボードのリセット
function resetGameBoard() {
    initGrid();
    isGameOver = false;
    isGameClear = false;
    bullet = null;
    currentBubble = createRandomBubble();
    nextBubble = createRandomBubble();
}

function createRandomBubble() {
    const colorIndex = Math.floor(Math.random() * BUBBLE_COLORS.length);
    return {
        colorIndex: colorIndex,
        color: BUBBLE_COLORS[colorIndex]
    };
}

// 初期配置の作成
function createInitialBubbles(rows) {
    for (let r = 0; r < rows; r++) {
        const colsInRow = (r % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (Math.random() > 0.15) {
                grid[r][c] = createRandomBubble();
            }
        }
    }
}

// ==========================================
// 🕹️ 操作・コントロール
// ==========================================
function setupControls() {
    let isAiming = false;

    function handleAim(e) {
        if (isGameOver || isGameClear || bullet) return;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        const mouseX = touch.clientX - rect.left;
        const mouseY = touch.clientY - rect.top;

        // 発射台からの角度計算（上方向限定）
        let angle = Math.atan2(mouseY - shooter.y, mouseX - shooter.x);
        if (angle > -Math.PI * 0.95 && angle < -Math.PI * 0.05) {
            shooter.angle = angle;
        }
    }

    function handleShoot() {
        if (isGameOver || isGameClear || bullet || !currentBubble) return;
        
        // バブルの発射
        bullet = {
            x: shooter.x,
            y: shooter.y,
            vx: Math.cos(shooter.angle) * 12,
            vy: Math.sin(shooter.angle) * 12,
            colorIndex: currentBubble.colorIndex,
            color: currentBubble.color
        };

        currentBubble = nextBubble;
        nextBubble = createRandomBubble();
    }

    canvas.addEventListener('mousedown', (e) => { isAiming = true; handleAim(e); });
    canvas.addEventListener('mousemove', (e) => { if (isAiming) handleAim(e); });
    canvas.addEventListener('mouseup', () => { if (isAiming) { isAiming = false; handleShoot(); } });

    canvas.addEventListener('touchstart', (e) => { isAiming = true; handleAim(e); }, {passive: true});
    canvas.addEventListener('touchmove', (e) => { if (isAiming) handleAim(e); }, {passive: true});
    canvas.addEventListener('touchend', () => { if (isAiming) { isAiming = false; handleShoot(); } });
}

// ==========================================
// 🔄 ゲームメインループ
// ==========================================
function gameLoop() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawBoard();
    updateBullet();
    drawShooter();

    if (!isGameOver && !isGameClear) {
        requestAnimationFrame(gameLoop);
    }
}

// バブルの移動・衝突処理
function updateBullet() {
    if (!bullet) return;

    bullet.x += bullet.vx;
    bullet.y += bullet.vy;

    // 左右の壁反射
    if (bullet.x - BUBBLE_RADIUS <= 0 || bullet.x + BUBBLE_RADIUS >= CANVAS_WIDTH) {
        bullet.vx *= -1;
        bullet.x = Math.max(BUBBLE_RADIUS, Math.min(CANVAS_WIDTH - BUBBLE_RADIUS, bullet.x));
    }

    // 天井到着時
    if (bullet.y - BUBBLE_RADIUS <= BOARD_OFFSET_Y) {
        snapBulletToGrid();
        return;
    }

    // 既存バブルとの衝突判定
    for (let r = 0; r < GRID_ROWS; r++) {
        const colsInRow = (r % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c]) {
                const pos = getBubbleCanvasPos(r, c);
                const dist = Math.hypot(bullet.x - pos.x, bullet.y - pos.y);
                if (dist < BUBBLE_DIAMETER - 2) {
                    snapBulletToGrid();
                    return;
                }
            }
        }
    }
}

// スナップ処理＆消去・落下判定
function snapBulletToGrid() {
    // 一番近いグリッド位置を特定
    let bestR = 0, bestC = 0, minDist = Infinity;

    for (let r = 0; r < GRID_ROWS; r++) {
        const colsInRow = (r % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (!grid[r][c]) {
                const pos = getBubbleCanvasPos(r, c);
                const dist = Math.hypot(bullet.x - pos.x, bullet.y - pos.y);
                if (dist < minDist) {
                    minDist = dist;
                    bestR = r;
                    bestC = c;
                }
            }
        }
    }

    grid[bestR][bestC] = {
        colorIndex: bullet.colorIndex,
        color: bullet.color
    };

    const shotColorIndex = bullet.colorIndex;
    bullet = null;

    // 1. 同色マッチングの判定（3個以上で消去）
    const matched = findMatches(bestR, bestC, shotColorIndex);
    let poppedCount = 0;
    let droppedCount = 0;

    if (matched.length >= 3) {
        poppedCount = matched.length;
        matched.forEach(pos => {
            grid[pos.r][pos.c] = null;
        });

        // 2. ぶら下がっていない（浮いている）バブルを落とす
        droppedCount = removeFloatingBubbles();
        score += (poppedCount * 10) + (droppedCount * 20);

        // 🔥🔥🔥 ラリー対戦時のお邪魔攻撃判定 🔥🔥🔥
        checkAndSendGarbage(poppedCount, droppedCount);
    }

    // ゲーム終了判定
    checkGameStatus();
}

// ==========================================
// 🔥🔥🔥 お邪魔攻撃＆せり上げロジック 🔥🔥🔥
// ==========================================

// 落としたバブル数に応じ相手にお邪魔攻撃を送る
function checkAndSendGarbage(poppedCount, droppedCount) {
    if (gameMode !== 'online' || currentBattleType !== 'ラリー対戦') return;

    let sendLines = 0;

    // ぶら下がっているバブルをたくさん落とした場合
    if (droppedCount >= 3) sendLines = 1;
    if (droppedCount >= 6) sendLines = 2;
    if (droppedCount >= 10) sendLines = 3;

    // 同時消しボーナス
    if (poppedCount >= 5) sendLines += 1;

    if (sendLines > 0 && conn && conn.open) {
        conn.send({
            type: 'attack_garbage',
            lines: sendLines
        });
    }
}

// 攻撃を受けた時：下からランダムでお邪魔玉をせり上げる
function receiveGarbageAttack(lines) {
    for (let l = 0; l < lines; l++) {
        pushBoardDownAndAddGarbageRow();
    }
    // 画面オーバーチェック
    checkGameStatus();
}

// 盤面を1段押し下げて、空いた最上段にランダムなバブルを補充（お邪魔せり上げ）
function pushBoardDownAndAddGarbageRow() {
    for (let r = GRID_ROWS - 1; r > 0; r--) {
        grid[r] = [...grid[r - 1]];
    }

    // 最上行(0行目)に新しいお邪魔ランダム行を作成
    grid[0] = [];
    for (let c = 0; c < GRID_COLS; c++) {
        if (Math.random() > 0.2) {
            grid[0][c] = createRandomBubble();
        } else {
            grid[0][c] = null;
        }
    }
}

// ==========================================
// 🔍 ロジック補助（マッチング・浮遊判定）
// ==========================================
function getNeighbors(r, c) {
    const isEven = (r % 2 === 0);
    const offsets = isEven ? [
        {r: -1, c: -1}, {r: -1, c: 0},
        {r: 0, c: -1},  {r: 0, c: 1},
        {r: 1, c: -1},  {r: 1, c: 0}
    ] : [
        {r: -1, c: 0},  {r: -1, c: 1},
        {r: 0, c: -1},  {r: 0, c: 1},
        {r: 1, c: 0},   {r: 1, c: 1}
    ];

    const neighbors = [];
    offsets.forEach(o => {
        const nr = r + o.r;
        const nc = c + o.c;
        const maxCols = (nr % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < maxCols) {
            neighbors.push({r: nr, c: nc});
        }
    });
    return neighbors;
}

function findMatches(startR, startC, colorIndex) {
    const matched = [];
    const visited = Array.from({length: GRID_ROWS}, () => Array(GRID_COLS).fill(false));
    const queue = [{r: startR, c: startC}];
    visited[startR][startC] = true;

    while (queue.length > 0) {
        const curr = queue.shift();
        matched.push(curr);

        getNeighbors(curr.r, curr.c).forEach(n => {
            if (!visited[n.r][n.c] && grid[n.r][n.c] && grid[n.r][n.c].colorIndex === colorIndex) {
                visited[n.r][n.c] = true;
                queue.push(n);
            }
        });
    }
    return matched;
}

function removeFloatingBubbles() {
    const visited = Array.from({length: GRID_ROWS}, () => Array(GRID_COLS).fill(false));
    const queue = [];

    // 天井(0行目)に接しているバブルから探索
    for (let c = 0; c < GRID_COLS; c++) {
        if (grid[0][c]) {
            queue.push({r: 0, c: c});
            visited[0][c] = true;
        }
    }

    while (queue.length > 0) {
        const curr = queue.shift();
        getNeighbors(curr.r, curr.c).forEach(n => {
            if (!visited[n.r][n.c] && grid[n.r][n.c]) {
                visited[n.r][n.c] = true;
                queue.push(n);
            }
        });
    }

    // 天井と繋がっていない浮いているバブルを特定して削除
    let droppedCount = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
        const colsInRow = (r % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] && !visited[r][c]) {
                grid[r][c] = null;
                droppedCount++;
            }
        }
    }
    return droppedCount;
}

function checkGameStatus() {
    let hasBubbles = false;

    // デッドライン(発射台付近)に到達したか
    for (let c = 0; c < GRID_COLS; c++) {
        if (grid[GRID_ROWS - 1][c] || grid[GRID_ROWS - 2][c]) {
            isGameOver = true;
            showGameOverScreen(false);
            return;
        }
    }

    // 全消しクリア判定
    for (let r = 0; r < GRID_ROWS; r++) {
        const colsInRow = (r % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c]) {
                hasBubbles = true;
                break;
            }
        }
    }

    if (!hasBubbles) {
        isGameClear = true;
        if (gameMode === 'single') {
            showStageClearScreen();
        } else {
            showGameOverScreen(true); // オンライン戦勝利
        }
    }
}

// ==========================================
// 🎨 描画処理
// ==========================================
function getBubbleCanvasPos(r, c) {
    const isEven = (r % 2 === 0);
    const xOffset = isEven ? BUBBLE_RADIUS + 14 : BUBBLE_RADIUS * 2 + 14;
    const x = xOffset + c * BUBBLE_DIAMETER;
    const y = BOARD_OFFSET_Y + r * ROW_HEIGHT + BUBBLE_RADIUS;
    return {x, y};
}

function drawBoard() {
    // 枠線・背景ヘッダー
    ctx.fillStyle = "#1a1a24";
    ctx.fillRect(0, 0, CANVAS_WIDTH, BOARD_OFFSET_Y);
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, BOARD_OFFSET_Y);
    ctx.lineTo(CANVAS_WIDTH, BOARD_OFFSET_Y);
    ctx.stroke();

    // スコア・ステータス表示
    ctx.fillStyle = "#ffcc00";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`SCORE: ${score}`, 15, 30);

    // デッドライン表示
    ctx.strokeStyle = "rgba(255, 77, 77, 0.5)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 530);
    ctx.lineTo(CANVAS_WIDTH, 530);
    ctx.stroke();
    ctx.setLineDash([]);

    // 配置されたバブル描画
    for (let r = 0; r < GRID_ROWS; r++) {
        const colsInRow = (r % 2 === 0) ? GRID_COLS : GRID_COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c]) {
                const pos = getBubbleCanvasPos(r, c);
                drawBubble(pos.x, pos.y, grid[r][c].colorIndex);
            }
        }
    }

    // 移動中のバブル描画
    if (bullet) {
        drawBubble(bullet.x, bullet.y, bullet.colorIndex);
    }
}

function drawShooter() {
    // 照準ガイド線
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    ctx.lineTo(shooter.x + Math.cos(shooter.angle) * 120, shooter.y + Math.sin(shooter.angle) * 120);
    ctx.stroke();
    ctx.setLineDash([]);

    // 次のバブル表示
    if (nextBubble) {
        drawBubble(60, 580, nextBubble.colorIndex, 12);
        ctx.fillStyle = "#aaa";
        ctx.font = "10px sans-serif";
        ctx.fillText("NEXT", 48, 605);
    }

    // 装填バブル表示
    if (currentBubble && !bullet) {
        drawBubble(shooter.x, shooter.y, currentBubble.colorIndex);
    }
}

// ✨ バブル描画（カスタム画像対応）
let customImages = [];
function loadCustomImages() {
    for (let i = 0; i < BUBBLE_COLORS.length; i++) {
        customImages[i] = null;
    }
}

function drawBubble(x, y, colorIndex, radius = BUBBLE_RADIUS) {
    if (customImages[colorIndex]) {
        ctx.drawImage(customImages[colorIndex], x - radius, y - radius, radius * 2, radius * 2);
        return;
    }

    // グラデーション描画
    const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/4, x, y, radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.3, BUBBLE_COLORS[colorIndex]);
    grad.addColorStop(1, "#000000");

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.closePath();
}

function drawTitleBackground() {
    ctx.fillStyle = "#11111a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// ==========================================
// 🖥️ UI・画面切替処理
// ==========================================
function hideAllScreens() {
    const screens = document.querySelectorAll('.overlay-screen');
    screens.forEach(s => s.style.display = 'none');
}

function showScreen(screenId) {
    hideAllScreens();
    const target = document.getElementById(screenId);
    if (target) target.style.display = 'flex';
}

function returnToTitle() {
    hideAllScreens();
    showScreen('screen-mode');
    drawTitleBackground();
}

function showStageClearScreen() {
    hideAllScreens();
    document.getElementById('clear-score-text').innerText = `SCORE: ${score}`;
    showScreen('screen-stage-clear');
}

function nextStageAction() {
    stage++;
    hideAllScreens();
    resetGameBoard();
    createInitialBubbles(Math.min(3 + stage, 8));
    requestAnimationFrame(gameLoop);
}

function showGameOverScreen(isWin = false) {
    hideAllScreens();
    const title = document.getElementById('gameover-title-text');
    const desc = document.getElementById('gameover-score-text');

    if (gameMode === 'online') {
        if (isWin) {
            title.innerText = "YOU WIN! 🎉";
            title.style.color = "#4dff4d";
            wins++;
        } else {
            title.innerText = "YOU LOSE... 💀";
            title.style.color = "#ff4d4d";
            opponentWins++;
        }
        desc.innerText = `戦績: ${wins} 勝 - ${opponentWins} 敗`;
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "#ff4d4d";
        desc.innerText = `FINAL SCORE: ${score}`;
    }

    showScreen('screen-game-over');
}

function handleGameOverNextAction() {
    if (gameMode === 'single') {
        startSinglePlay();
    } else {
        resetGameBoard();
        hideAllScreens();
        requestAnimationFrame(gameLoop);
    }
}

// ==========================================
// 🌐 ネットワーク対戦 (PeerJS)
// ==========================================
function setupRole(role) {
    isHost = (role === 'host');
    const myCode = Math.floor(1000 + Math.random() * 9000).toString();

    peer = new Peer(myCode);

    peer.on('open', (id) => {
        myPeerId = id;
        if (isHost) {
            document.getElementById('display-room-code').innerText = id;
            showScreen('screen-host-wait');
        } else {
            showScreen('screen-guest-join');
        }
    });

    peer.on('connection', (c) => {
        conn = c;
        setupConnectionHandlers();
        if (isHost) {
            showScreen('screen-host-rule-setup');
        }
    });
}

function joinRoom() {
    const code = document.getElementById('input-room-code').value;
    if (code.length !== 4) {
        document.getElementById('status-message').innerText = "4桁の番号を入力してください";
        return;
    }

    conn = peer.connect(code);
    setupConnectionHandlers();
    showScreen('screen-guest-wait-rule');
}

function setupConnectionHandlers() {
    conn.on('open', () => {
        // 通信接続成功
    });

    conn.on('data', (data) => {
        if (data.type === 'attack_garbage') {
            // お邪魔攻撃を受信
            receiveGarbageAttack(data.lines);
        } else if (data.type === 'start_game') {
            currentBattleType = data.battleType;
            targetWins = data.targetWins;
            gameMode = 'online';
            hideAllScreens();
            resetGameBoard();
            createInitialBubbles(5);
            requestAnimationFrame(gameLoop);
        }
    });
}

function setHostBattleType(type) {
    currentBattleType = type;
    document.getElementById('btn-mode-ta').className = (type === 'タイムアタック') ? 'menu-btn sub' : 'menu-btn gray';
    document.getElementById('btn-mode-rally').className = (type === 'ラリー対戦') ? 'menu-btn sub' : 'menu-btn gray';
}

function setHostTargetWins(count) {
    targetWins = count;
    document.getElementById('btn-win-1').className = (count === 1) ? 'menu-btn' : 'menu-btn gray';
    document.getElementById('btn-win-2').className = (count === 2) ? 'menu-btn' : 'menu-btn gray';
}

function confirmHostBattleStart() {
    if (conn && conn.open) {
        conn.send({
            type: 'start_game',
            battleType: currentBattleType,
            targetWins: targetWins
        });
    }
    gameMode = 'online';
    hideAllScreens();
    resetGameBoard();
    createInitialBubbles(5);
    requestAnimationFrame(gameLoop);
}

function cancelNetwork(nextScreen) {
    if (conn) conn.close();
    if (peer) peer.destroy();
    showScreen(nextScreen);
}

// ランキング・設定表示ダミー
function showRankingBoard() { showScreen('screen-ranking'); }
function closeSettings() { document.getElementById('settings-overlay').style.display = 'none'; }
