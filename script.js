const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 画面切り替えユーティリティ ---
function showScreen(screenId) {
    document.querySelectorAll('.overlay-screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
    }
}

function goToHowToPlay() {
    showScreen('screen-how-to-play');
}

function returnToTitle() {
    gameState = 'TITLE';
    showScreen('screen-title');
}

// --- ゲーム定数・パラメータ ---
const COLS = 6;
const RADIUS = 22;
const DIAMETER = RADIUS * 2;
const ROW_OFFSET = RADIUS;

const COLORS = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff'];

let grid = [];
let currentBubble = null;
let nextColor = 0;
let score = 0;
let bombs = 2;
let gameState = 'TITLE'; // TITLE, PLAYING, OJAMASHOOT, WIN, GAMEOVER

// お邪魔演出用キュー・ステート
let ojamaQueue = [];
let currentOjaming = null; 

function initGame() {
    grid = [];
    for (let r = 0; r < 12; r++) {
        let row = [];
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (r < 2) {
                row.push({ color: Math.floor(Math.random() * COLORS.length), isOjama: false });
            } else {
                row.push(null);
            }
        }
        grid.push(row);
    }
    nextColor = Math.floor(Math.random() * COLORS.length);
    spawnBubble();
}

function spawnBubble() {
    currentBubble = {
        x: canvas.width / 2,
        y: canvas.height - 40,
        vx: 0,
        vy: 0,
        color: nextColor,
        isOjama: false
    };
    nextColor = Math.floor(Math.random() * COLORS.length);
}

function startSinglePlay() {
    score = 0;
    bombs = 2;
    initGame();
    gameState = 'PLAYING';
    showScreen(''); // オーバーレイを全て閉じる
}

// --- 座標変換 ---
function gridToScreen(r, c) {
    let isOdd = (r % 2 === 1);
    let x = c * DIAMETER + RADIUS + (isOdd ? ROW_OFFSET : 0) + 20;
    let y = r * (DIAMETER * 0.866) + RADIUS + 20;
    return { x, y };
}

function screenToGrid(x, y) {
    let r = Math.round((y - 20 - RADIUS) / (DIAMETER * 0.866));
    if (r < 0) r = 0;
    if (r >= grid.length) r = grid.length - 1;
    let isOdd = (r % 2 === 1);
    let c = Math.round((x - 20 - RADIUS - (isOdd ? ROW_OFFSET : 0)) / DIAMETER);
    let maxCols = (r % 2 === 0) ? COLS : COLS - 1;
    if (c < 0) c = 0;
    if (c >= maxCols) c = maxCols;
    return { r, c };
}

// --- 入力（タッチ・クリック） ---
canvas.addEventListener('click', (e) => {
    if (gameState !== 'PLAYING') return;
    if (!currentBubble || currentBubble.vy !== 0) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    let angle = Math.atan2(mouseY - currentBubble.y, mouseX - currentBubble.x);
    let speed = 12;
    currentBubble.vx = Math.cos(angle) * speed;
    currentBubble.vy = Math.sin(angle) * speed;
});

// --- 更新処理 ---
function update() {
    // 1. お邪魔玉演出中の処理（1個ずつ順番に射出）
    if (gameState === 'OJAMASHOOT') {
        if (!currentOjaming && ojamaQueue.length > 0) {
            let color = ojamaQueue.shift();
            // 画面真ん中より下側（例: y = 480付近）からスタート
            currentOjaming = {
                x: canvas.width / 2,
                y: 480,
                color: color,
                isOjama: true,
                vy: -10
            };
        }

        if (currentOjaming) {
            currentOjaming.y += currentOjaming.vy;

            // 天井（y <= 60）または上部の既存玉に接触したら停止して定着
            let hit = false;
            if (currentOjaming.y <= 60 || checkCollisionWithExisting(currentOjaming.x, currentOjaming.y)) {
                hit = true;
            }

            if (hit) {
                insertOjamaToGrid(currentOjaming.color);
                currentOjaming = null;

                // すべてのキューが完全に射出し終わったら、通常プレイおよび勝利判定を再開
                if (ojamaQueue.length === 0) {
                    gameState = 'PLAYING';
                }
            }
        }
        return;
    }

    if (gameState !== 'PLAYING') return;

    // 通常玉の移動処理
    if (currentBubble && currentBubble.vy !== 0) {
        currentBubble.x += currentBubble.vx;
        currentBubble.y += currentBubble.vy;

        // 壁反射
        if (currentBubble.x - RADIUS < 0) {
            currentBubble.x = RADIUS;
            currentBubble.vx *= -1;
        } else if (currentBubble.x + RADIUS > canvas.width) {
            currentBubble.x = canvas.width - RADIUS;
            currentBubble.vx *= -1;
        }

        // 天井衝突または既存玉への接触
        let hit = false;
        if (currentBubble.y - RADIUS <= 20) {
            hit = true;
        } else {
            hit = checkCollisionWithExisting(currentBubble.x, currentBubble.y);
        }

        if (hit) {
            snapCurrentBubble();
        }
    }
}

function checkCollisionWithExisting(x, y) {
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] !== null) {
                let pos = gridToScreen(r, c);
                let dist = Math.hypot(pos.x - x, pos.y - y);
                if (dist <= DIAMETER * 0.95) {
                    return true;
                }
            }
        }
    }
    return false;
}

function insertOjamaToGrid(color) {
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] === null) {
                grid[r][c] = { color: color, isOjama: true };
                return;
            }
        }
    }
}

function snapCurrentBubble() {
    let { r, c } = screenToGrid(currentBubble.x, currentBubble.y);
    
    if (r < 0) r = 0;
    if (r >= grid.length) r = grid.length - 1;
    let maxCols = (r % 2 === 0) ? COLS : COLS - 1;
    if (c >= maxCols) c = maxCols;

    if (grid[r][c] !== null) {
        let found = false;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                let nr = r + dr;
                let nc = c + dc;
                if (nr >= 0 && nr < grid.length) {
                    let mc = (nr % 2 === 0) ? COLS : COLS - 1;
                    if (nc >= 0 && nc < mc && grid[nr][nc] === null) {
                        r = nr;
                        c = nc;
                        found = true;
                        break;
                    }
                }
            }
            if (found) break;
        }
    }

    if (r < grid.length && c < grid[r].length) {
        grid[r][c] = { color: currentBubble.color, isOjama: currentBubble.isOjama };
        
        let cleared = checkMatches(r, c, currentBubble.color);
        if (cleared.length >= 3) {
            cleared.forEach(pos => {
                grid[pos.r][pos.c] = null;
            });
            score += cleared.length * 100;
            dropFloatingBubbles();
        }
    }

    // 勝利判定（お邪魔玉演出中以外のみ有効）
    if (gameState === 'PLAYING') {
        checkWinCondition();
    }

    if (gameState === 'PLAYING') {
        spawnBubble();
    }
}

function checkMatches(startR, startC, color) {
    let visited = Array.from({length: grid.length}, () => Array(COLS).fill(false));
    let matchGroup = [];
    let queue = [{r: startR, c: startC}];
    visited[startR][startC] = true;

    while (queue.length > 0) {
        let curr = queue.shift();
        matchGroup.push(curr);

        let neighbors = getNeighbors(curr.r, curr.c);
        for (let n of neighbors) {
            if (!visited[n.r][n.c] && grid[n.r][n.c] !== null) {
                let cell = grid[n.r][n.c];
                let cellColor = (typeof cell === 'object') ? cell.color : cell;

                if (cellColor === color) {
                    visited[n.r][n.c] = true;
                    queue.push(n);
                }
            }
        }
    }
    return matchGroup;
}

function getNeighbors(r, c) {
    let isOdd = (r % 2 === 1);
    let directions = isOdd ? [
        {r: -1, c: 0}, {r: -1, c: 1},
        {r: 0, c: -1}, {r: 0, c: 1},
        {r: 1, c: 0}, {r: 1, c: 1}
    ] : [
        {r: -1, c: -1}, {r: -1, c: 0},
        {r: 0, c: -1}, {r: 0, c: 1},
        {r: 1, c: -1}, {r: 1, c: 0}
    ];

    let results = [];
    let maxCols = (r % 2 === 0) ? COLS : COLS - 1;

    for (let d of directions) {
        let nr = r + d.r;
        let nc = c + d.c;
        let nMaxCols = (nr >= 0 && nr % 2 === 0) ? COLS : COLS - 1;
        if (nr >= 0 && nr < grid.length && nc >= 0 && nc < nMaxCols) {
            results.push({r: nr, c: nc});
        }
    }
    return results;
}

function dropFloatingBubbles() {
    let connected = Array.from({length: grid.length}, () => Array(COLS).fill(false));
    let queue = [];

    for (let c = 0; c < grid[0].length; c++) {
        if (grid[0][c] !== null) {
            connected[0][c] = true;
            queue.push({r: 0, c: c});
        }
    }

    while (queue.length > 0) {
        let curr = queue.shift();
        let neighbors = getNeighbors(curr.r, curr.c);
        for (let n of neighbors) {
            if (!connected[n.r][n.c] && grid[n.r][n.c] !== null) {
                connected[n.r][n.c] = true;
                queue.push(n);
            }
        }
    }

    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] !== null && !connected[r][c]) {
                grid[r][c] = null;
                score += 50;
            }
        }
    }
}

function checkWinCondition() {
    let hasBalls = false;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] !== null) {
                hasBalls = true;
                break;
            }
        }
        if (hasBalls) break;
    }
    if (!hasBalls) {
        gameState = 'WIN';
    }
}

// テスト用にお邪魔玉の飛来をトリガーする関数
function triggerOjamaTest(colorIndex) {
    ojamaQueue.push(colorIndex);
    ojamaQueue.push(colorIndex); // 2つ連続でお邪魔玉をテスト追加
    gameState = 'OJAMASHOOT';
}

// --- 描画処理 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // グリッドの玉を描画
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            let cell = grid[r][c];
            if (cell !== null) {
                let pos = gridToScreen(r, c);
                let colorIdx = (typeof cell === 'object') ? cell.color : cell;
                let isOjama = (typeof cell === 'object') ? cell.isOjama : false;
                drawBubble(pos.x, pos.y, COLORS[colorIdx], isOjama);
            }
        }
    }

    // 操作中の玉を描画
    if (currentBubble && gameState === 'PLAYING') {
        drawBubble(currentBubble.x, currentBubble.y, COLORS[currentBubble.color], currentBubble.isOjama);
    }

    // 射出中のお邪魔玉を描画
    if (currentOjaming) {
        drawBubble(currentOjaming.x, currentOjaming.y, COLORS[currentOjaming.color], true);
    }

    // 勝利時の画面表示
    if (gameState === 'WIN') {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VICTORY!', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.fillText('画面をタップしてタイトルへ', canvas.width / 2, canvas.height / 2 + 30);
        ctx.textAlign = 'left';
    }
}

function drawBubble(x, y, color, isOjama) {
    ctx.beginPath();
    ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // お邪魔玉の場合は×を消去し、外枠を太めの赤色に変更
    if (isOjama) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
    } else {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
    }
    ctx.stroke();
}

// --- メインループ ---
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// 初期化実行開始
initGame();
loop();

// 勝利画面タップでタイトルに戻る
canvas.addEventListener('click', () => {
    if (gameState === 'WIN') {
        returnToTitle();
    }
});
