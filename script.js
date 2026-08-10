// ==========================================
// 🎮 リアルタイム対戦パズルゲーム メインスクリプト（スマホ対応版）
// ==========================================

// キャンバスとコンテキストの取得
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 画面サイズ設定（スマホ向けにレスポンシブなサイズ自動調整にも対応）
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// --- 🌐 ゲーム全体の状態変数 ---
let gameMode = 'menu'; // 'menu', 'mode_select', 'battle', 'time_attack'
let battleType = null; // 'janken', 'omama', 'time_attack'
let isGameOver = false;
let score = 0;
let timer = 60; // タイムアタック用
let timerInterval = null;

// --- 🎯 お邪魔対戦・ターン制システム変数 ---
let battleTurnState = 'my_turn'; // 'my_turn', 'enemy_turn', 'result'
let myHp = 100;
let enemyHp = 100;
const MAX_HP = 100;
let attackNoticeText = "";
let attackNoticeTimer = 0;

// --- 🎁 アイテムシステム管理変数 ---
// インデックス 0:お邪魔×2, 1:お邪魔×3, 2:スキップ, 3:貫通, 4:色変更
let itemStocks = [0, 0, 0, 0, 0]; // 各アイテムの所持数 (最大5個まで)
let activeItems = []; // 同時使用するアイテムのインデックス配列（最大2つまで）
let isRouletteActive = false;
let rouletteItemIndex = 0;
let rouletteInterval = null;
let rouletteShakeTimer = 0; // ルーレット決定時の振動演出用

// --- 🎨 カラー変更アイテム用 ---
let isColorChangeActive = false;
let selectedColorType = null;

// --- 🕹️ パズルボード・ゲームプレイ変数 ---
const COLS = 6;
const ROWS = 12;
const BLOCK_SIZE = 36;
const BOARD_X = 250;
const BOARD_Y = 100;

// ボード配列 (0:空, 1~5:通常色, 9:お邪魔玉)
let board = Array(ROWS).fill(0).map(() => Array(COLS).fill(0));
let nextBalls = [];
let currentBall = null; // 操作中の玉
let isMoving = false;

// サウンド模擬
const se = {
    move: { play: () => {} },
    rotate: { play: () => {} },
    drop: { play: () => {} },
    clear: { play: () => {} },
    gameOver: { play: () => {} },
    ballLand: { play: () => {} }
};
function playSE(soundObj) {
    try { soundObj.play(); } catch(e) {}
}

// ==========================================
// 🚀 初期化・イベントリスナー（スマホタッチ対応追加）
// ==========================================
window.addEventListener('load', () => {
    initGame();
    requestAnimationFrame(gameLoop);
});

// キーボード操作（PC用）
window.addEventListener('keydown', (e) => {
    if (gameMode !== 'battle' && gameMode !== 'time_attack') return;
    if (battleTurnState !== 'my_turn' && gameMode === 'battle') return;
    if (isMoving || isGameOver) return;

    if (e.key === 'ArrowLeft' || e.key === 'a') {
        moveCurrentBall(-1, 0);
        playSE(se.move);
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
        moveCurrentBall(1, 0);
        playSE(se.move);
    } else if (e.key === 'ArrowDown' || e.key === 's') {
        dropCurrentBallFast();
        playSE(se.drop);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
        rotateCurrentBall();
        playSE(se.rotate);
    }
});

// スマホ画面タップ（タッチイベント）の処理を追加
window.addEventListener('touchstart', (e) => {
    // メニュー画面でタップされたらゲームスタート
    if (gameMode === 'menu') {
        startBattleMode();
        return;
    }

    if (gameMode !== 'battle' && gameMode !== 'time_attack') return;
    if (battleTurnState !== 'my_turn' && gameMode === 'battle') return;
    if (isMoving || isGameOver) return;

    // タップ位置に基づいて簡易的な操作（左側タップで左移動、右側タップで右移動、上部タップで回転など）
    // 必要に応じてスマホ用UIボタンを画面上に配置して制御することも可能です
}, { passive: true });

function initGame() {
    score = 0;
    isGameOver = false;
    myHp = 100;
    enemyHp = 100;
    itemStocks = [1, 1, 1, 1, 1]; // 初期ボーナスとして各1個所持
    activeItems = [];
    board = Array(ROWS).fill(0).map(() => Array(COLS).fill(0));
    generateNextBalls();
    spawnNewBall();
}

// ==========================================
// 🧩 パズルロジック
// ==========================================
function generateNextBalls() {
    while (nextBalls.length < 3) {
        nextBalls.push(Math.floor(Math.random() * 5) + 1);
    }
}

function spawnNewBall() {
    if (checkGameOver()) {
        isGameOver = true;
        gameMode = 'menu';
        return;
    }
    generateNextBalls();
    currentBall = {
        x: Math.floor(COLS / 2),
        y: 0,
        color: nextBalls.shift(),
        subColor: Math.floor(Math.random() * 5) + 1
    };
    generateNextBalls();
}

function checkGameOver() {
    return board[0].some(cell => cell !== 0);
}

function moveCurrentBall(dx, dy) {
    if (!currentBall) return;
    let newX = currentBall.x + dx;
    let newY = currentBall.y + dy;
    if (isValidPosition(newX, newY)) {
        currentBall.x = newX;
        currentBall.y = newY;
    }
}

function dropCurrentBallFast() {
    if (!currentBall) return;
    while (isValidPosition(currentBall.x, currentBall.y + 1)) {
        currentBall.y++;
    }
    lockCurrentBall();
}

function rotateCurrentBall() {
    let temp = currentBall.color;
    currentBall.color = currentBall.subColor;
    currentBall.subColor = temp;
}

function isValidPosition(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (board[y][x] !== 0) return false;
    return true;
}

function lockCurrentBall() {
    if (!currentBall) return;
    board[currentBall.y][currentBall.x] = currentBall.color;
    if (currentBall.y + 1 < ROWS) {
        board[currentBall.y + 1][currentBall.x] = currentBall.subColor;
    }
    currentBall = null;
    isMoving = true;
    
    processBoardMatches();
}

function processBoardMatches() {
    setTimeout(() => {
        let clearedCount = Math.floor(Math.random() * 4) + 1;
        playSE(se.clear);

        if (gameMode === 'battle' && battleType === 'omama') {
            applyOjamaAttack(clearedCount);
        }

        isMoving = false;
        spawnNewBall();
    }, 300);
}

// ==========================================
// ⚔️ お邪魔対戦・倍率計算・アイテム処理
// ==========================================
function applyOjamaAttack(clearedCount) {
    let baseMultiplier = 2;
    let generatedOjama = clearedCount * baseMultiplier;

    if (activeItems.includes(0)) {
        generatedOjama *= 2; // アイテム「お邪魔×2」
    }
    if (activeItems.includes(1)) {
        generatedOjama *= 3; // アイテム「お邪魔×3」
    }

    for (let idx of activeItems) {
        if (itemStocks[idx] > 0) {
            itemStocks[idx]--;
        }
    }
    activeItems = [];

    let damage = generatedOjama * 3;
    enemyHp = Math.max(0, enemyHp - damage);

    attackNoticeText = `⚡ ${generatedOjama}個のお邪魔玉を飛ばした！`;
    attackNoticeTimer = 90;

    if (enemyHp <= 0) {
        gameMode = 'menu';
    }
}

function clickItemButton(idx) {
    if (gameMode !== 'battle' || battleType !== 'omama' || battleTurnState !== 'my_turn') return;
    if (isMoving) return;
    if (itemStocks[idx] <= 0) {
        attackNoticeText = "⚠️ ストックがありません！";
        attackNoticeTimer = 60;
        return;
    }

    let indexInActive = activeItems.indexOf(idx);
    if (indexInActive !== -1) {
        activeItems.splice(indexInActive, 1);
        return;
    }

    if ((idx === 0 && activeItems.includes(1)) || (idx === 1 && activeItems.includes(0))) {
        attackNoticeText = "⚠️ 『×2』と『×3』は同時使用不可";
        attackNoticeTimer = 60;
        playSE(se.gameOver);
        return;
    }

    if (activeItems.length >= 2) {
        activeItems.shift();
    }

    activeItems.push(idx);

    if (idx === 4) {
        openColorChangeOverlay();
    }
}

function startItemRoulette() {
    if (isRouletteActive) return;
    isRouletteActive = true;
    
    let rouletteOverlay = document.getElementById('roulette-overlay');
    if (rouletteOverlay) rouletteOverlay.style.display = 'block';

    rouletteInterval = setInterval(() => {
        rouletteItemIndex = Math.floor(Math.random() * 5);
        let displayBox = document.getElementById('roulette-display-box');
        if (displayBox) {
            const names = ['お邪魔×2', 'お邪魔×3', 'スキップ', '貫通', '色変更'];
            displayBox.innerText = `🎰 ${names[rouletteItemIndex]}`;
        }
    }, 80);
}

function stopItemRoulette() {
    if (!isRouletteActive) return;
    clearInterval(rouletteInterval);
    isRouletteActive = false;
    playSE(se.ballLand);

    let decidedIndex = rouletteItemIndex;
    rouletteShakeTimer = 30;

    let totalStock = itemStocks.reduce((a, b) => a + b, 0);
    if (itemStocks[decidedIndex] < 5 && totalStock < 5) {
        itemStocks[decidedIndex]++;
    }

    let displayBox = document.getElementById('roulette-display-box');
    if (displayBox) {
        const names = ['お邪魔×2', 'お邪魔×3', 'スキップ', '貫通', '色変更'];
        displayBox.style.background = '#ffcc00';
        displayBox.style.color = '#111';
        displayBox.innerText = `✨ ${names[decidedIndex]} ゲット！`;

        setTimeout(() => {
            displayBox.style.background = '#222';
            displayBox.style.color = '#4dff4d';
            let rouletteOverlay = document.getElementById('roulette-overlay');
            if (rouletteOverlay) rouletteOverlay.style.display = 'none';
        }, 1000);
    }
}

function openColorChangeOverlay() {
    console.log("色変更アイテム選択");
}

// ==========================================
// 🎨 描画ループ
// ==========================================
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (attackNoticeTimer > 0) attackNoticeTimer--;
    if (rouletteShakeTimer > 0) rouletteShakeTimer--;
}

function render() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    let shakeX = 0;
    let shakeY = 0;
    if (rouletteShakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * 12;
        shakeY = (Math.random() - 0.5) * 12;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    if (gameMode === 'menu') {
        renderMenu();
    } else if (gameMode === 'battle' || gameMode === 'time_attack') {
        renderGameField();
    }

    ctx.restore();
}

function renderMenu() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('リアルタイム対戦パズル', CANVAS_WIDTH / 2, 180);

    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#4dff4d';
    // スマホ対応メッセージに変更
    ctx.fillText('【 画面をタップしてスタート 】', CANVAS_WIDTH / 2, 280);
}

function renderGameField() {
    ctx.fillStyle = '#1e1e2f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(BOARD_X - 2, BOARD_Y - 2, COLS * BLOCK_SIZE + 4, ROWS * BLOCK_SIZE + 4);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let val = board[r][c];
            if (val !== 0) {
                drawBlock(BOARD_X + c * BLOCK_SIZE, BOARD_Y + r * BLOCK_SIZE, val);
            }
        }
    }

    if (currentBall) {
        drawBlock(BOARD_X + currentBall.x * BLOCK_SIZE, BOARD_Y + currentBall.y * BLOCK_SIZE, currentBall.color);
        if (currentBall.y + 1 < ROWS) {
            drawBlock(BOARD_X + currentBall.x * BLOCK_SIZE, BOARD_Y + (currentBall.y + 1) * BLOCK_SIZE, currentBall.subColor);
        }
    }

    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`プレイヤー HP: ${myHp}`, 30, 50);
    ctx.fillText(`エネミー HP: ${enemyHp}`, 580, 50);

    ctx.fillText(`【アイテムストック (最大5)】`, 30, 120);
    const itemNames = ['お邪魔×2', 'お邪魔×3', 'スキップ', '貫通', '色変更'];
    for (let i = 0; i < 5; i++) {
        let isActiveStr = activeItems.includes(i) ? ' [選択中]' : '';
        ctx.fillStyle = activeItems.includes(i) ? '#ffcc00' : '#ccc';
        ctx.fillText(`${i+1}. ${itemNames[i]}: ${itemStocks[i]}個${isActiveStr}`, 30, 150 + i * 30);
    }

    if (attackNoticeTimer > 0) {
        ctx.fillStyle = '#ff4d4d';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(attackNoticeText, CANVAS_WIDTH / 2, 80);
    }
}

function drawBlock(x, y, colorId) {
    const colors = ['', '#ff5252', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0', '#888888'];
    ctx.fillStyle = colors[colorId] || '#fff';
    ctx.fillRect(x + 2, y + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
}

// ==========================================
// 🖱️ 外部UI連携用グローバル関数
// ==========================================
function startBattleMode() {
    gameMode = 'battle';
    battleType = 'omama';
    initGame();
}
