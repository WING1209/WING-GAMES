/* ==========================================
   ○o WING GAME玉 o○ - メインスクリプト (Ver.1.06 iOS対応版)
   ========================================== */

// --- 定数・ゲーム設定 ---
const COLS = 8;
const ROWS = 12;
const BUBBLE_COLORS = 5; // 0:なし, 1:赤, 2:緑, 3:青, 4:黄, 5:紫
const REAL_COLOR_HEX = {
    1: '#ff4d4d',
    2: '#2ecc71',
    3: '#3498db',
    4: '#f1c40f',
    5: '#9b59b6'
};

// --- キャンバス・DOM要素の取得 ---
let canvas, ctx;

// --- グローバル変数 ---
let currentScreen = 'screen-title';
let gameMode = 'solo'; // 'solo' or 'battle'
let battleType = 'タイムアタック'; // 'タイムアタック' or 'お邪魔対戦'
let targetWins = 1;
let myRole = ''; // 'host' or 'guest'

// ソロプレイ用
let soloStage = 1;
let soloScore = 0;
let soloBubblesPopped = 0;

// バトルプレイ用
let peer = null;
let conn = null;
let roomCode = '';
let myWins = 0;
let opponentWins = 0;
let battleTimer = 60; // タイムアタック用
let battleTimerInterval = null;

// ゲーム盤面・操作ステート
let grid = []; 
let currentBubble = null; 
let nextBubble = null;    
let currentSpecial = null; 
let nextSpecial = null;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let touchCurrentX = 0;
let touchCurrentY = 0;

let shooterX = 200; // 後でキャンバスサイズに合わせて初期化
let shooterY = 690;
let bubbleRadius = 20;

let flyingBubble = null; 

// アイテム関連
let bombAvailable = true;
let rainbowAvailable = true;
let activeItem = null; 

// 消去カウント（自分・相手）
let myPopCount = 0;
let oppPopCount = 0;
let gameLoopActive = false;

// --- 起動時初期化 ---
window.addEventListener('load', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // キャンバスの内部解像度を固定（HTMLのwidth="400" height="750"に合わせる）
    shooterX = canvas.width / 2;
    shooterY = canvas.height - 60;

    initGrid();
    showScreen('screen-title');
    
    // iOSでのタッチ無効化による誤作動を防ぐため、HTML側のonclickとtouchendを両方サポート
    setupGlobalTouchEvents();
    
    requestAnimationFrame(gameLoop);
});

// --- iOS対応の画面タッチ・クリック補助 ---
function setupGlobalTouchEvents() {
    // タイトル画面の特別タップ対応（iOS対策）
    const titleScreen = document.getElementById('screen-title');
    if (titleScreen) {
        const handleTitleTouch = (e) => {
            e.preventDefault();
            goToHowToPlay();
        };
        titleScreen.addEventListener('click', handleTitleTouch);
        titleScreen.addEventListener('touchend', handleTitleTouch);
    }
}

// --- 画面遷移管理 ---
function showScreen(screenId) {
    document.querySelectorAll('.overlay-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
        currentScreen = screenId;
    }
}

function goToHowToPlay() {
    showScreen('screen-how-to-play');
}

function returnToTitle() {
    cleanupBattle();
    showScreen('screen-title');
}

// --- グリッド初期化 ---
function initGrid() {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
        let row = [];
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            row.push(0);
        }
        grid.push(row);
    }
}

// --- ソロプレイ開始 ---
function startSinglePlay() {
    gameMode = 'solo';
    soloStage = 1;
    soloScore = 0;
    soloBubblesPopped = 0;
    startStage(soloStage);
}

function startStage(stageNum) {
    initGrid();
    let fillRows = Math.min(3 + Math.floor(stageNum / 2), 7);
    for (let r = 0; r < fillRows; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            grid[r][c] = Math.floor(Math.random() * BUBBLE_COLORS) + 1;
        }
    }
    
    spawnNewBubble();
    spawnNewBubble();
    
    bombAvailable = true;
    rainbowAvailable = true;
    activeItem = null;
    myPopCount = 0;
    oppPopCount = 0;

    showScreen(''); // ゲーム画面へ（すべてのオーバーレイを非表示）
    gameLoopActive = true;
}

// --- 玉の生成 ---
function spawnNewBubble() {
    currentBubble = nextBubble || (Math.floor(Math.random() * BUBBLE_COLORS) + 1);
    currentSpecial = nextSpecial || null;
    
    nextBubble = Math.floor(Math.random() * BUBBLE_COLORS) + 1;
    let rand = Math.random();
    if (rand < 0.1) nextSpecial = 'bomb';
    else if (rand < 0.18) nextSpecial = 'rainbow';
    else nextSpecial = null;
}

// ==========================================
// 操作・タッチイベント（iOS完全対応・座標ズレ防止）
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('gameCanvas');
    if (!canvasEl) return;
    
    function getCanvasPos(e) {
        const rect = canvasEl.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const scaleX = canvasEl.width / rect.width;
        const scaleY = canvasEl.height / rect.height;
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    // iOSでのタッチ遅延・反応抜けを防ぐため passive: false を維持
    canvasEl.addEventListener('touchstart', (e) => {
        if (!gameLoopActive || flyingBubble) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        
        // 右側アイテムボタン（ボム）
        if (pos.x > canvasEl.width - 90 && pos.y > canvasEl.height - 130 && pos.y < canvasEl.height - 70) {
            if (bombAvailable) {
                activeItem = activeItem === 'bomb' ? null : 'bomb';
            }
            return;
        }
        // 右側アイテムボタン（レインボー）
        if (pos.x > canvasEl.width - 90 && pos.y > canvasEl.height - 65) {
            if (rainbowAvailable) {
                activeItem = activeItem === 'rainbow' ? null : 'rainbow';
            }
            return;
        }

        isDragging = true;
        dragStartX = pos.x;
        dragStartY = pos.y;
        touchCurrentX = pos.x;
        touchCurrentY = pos.y;
    }, { passive: false });

    canvasEl.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        touchCurrentX = pos.x;
        touchCurrentY = pos.y;
    }, { passive: false });

    canvasEl.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        isDragging = false;
        shootBubble();
    }, { passive: false });

    // マウス操作（PC用）
    canvasEl.addEventListener('mousedown', (e) => {
        if (!gameLoopActive || flyingBubble) return;
        const pos = getCanvasPos(e);
        
        if (pos.x > canvasEl.width - 90 && pos.y > canvasEl.height - 130 && pos.y < canvasEl.height - 70) {
            if (bombAvailable) activeItem = activeItem === 'bomb' ? null : 'bomb';
            return;
        }
        if (pos.x > canvasEl.width - 90 && pos.y > canvasEl.height - 65) {
            if (rainbowAvailable) activeItem = activeItem === 'rainbow' ? null : 'rainbow';
            return;
        }

        isDragging = true;
        dragStartX = pos.x;
        dragStartY = pos.y;
        touchCurrentX = pos.x;
        touchCurrentY = pos.y;
    });

    canvasEl.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const pos = getCanvasPos(e);
        touchCurrentX = pos.x;
        touchCurrentY = pos.y;
    });

    canvasEl.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        shootBubble();
    });
});

// --- 玉の発射処理 ---
function shootBubble() {
    let dx = touchCurrentX - shooterX;
    let dy = touchCurrentY - shooterY;
    
    if (dy >= -10) return; 

    let angle = Math.atan2(dy, dx);
    let speed = 12;
    
    let colorToUse = currentBubble;
    let specialToUse = currentSpecial;
    
    if (activeItem === 'bomb') {
        specialToUse = 'bomb';
        bombAvailable = false;
    } else if (activeItem === 'rainbow') {
        specialToUse = 'rainbow';
        rainbowAvailable = false;
    }
    activeItem = null;

    flyingBubble = {
        x: shooterX,
        y: shooterY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colorToUse,
        special: specialToUse
    };

    spawnNewBubble();
}

// ==========================================
// メインゲームループ＆描画
// ==========================================
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (!gameLoopActive) return;

    if (flyingBubble) {
        flyingBubble.x += flyingBubble.vx;
        flyingBubble.y += flyingBubble.vy;

        if (flyingBubble.x - bubbleRadius < 0) {
            flyingBubble.x = bubbleRadius;
            flyingBubble.vx *= -1;
        } else if (flyingBubble.x + bubbleRadius > canvas.width) {
            flyingBubble.x = canvas.width - bubbleRadius;
            flyingBubble.vx *= -1;
        }

        if (flyingBubble.y - bubbleRadius < 40) {
            snapBubbleToGrid();
            return;
        }

        let hit = checkGridCollision();
        if (hit) {
            snapBubbleToGrid();
        }
    }
}

function checkGridCollision() {
    for (let r = 0; r < grid.length; r++) {
        let colsInRow = grid[r].length;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] !== 0) {
                let pos = getBubblePosition(r, c);
                let dist = Math.hypot(flyingBubble.x - pos.x, flyingBubble.y - pos.y);
                if (dist < bubbleRadius * 1.8) {
                    return true;
                }
            }
        }
    }
    return false;
}

function getBubblePosition(r, c) {
    let rowOffset = (r % 2 === 1) ? bubbleRadius : 0;
    let x = c * (bubbleRadius * 2) + bubbleRadius + 15 + rowOffset;
    let y = r * (bubbleRadius * 1.7) + 60;
    return { x, y };
}

function snapBubbleToGrid() {
    let bestR = 0;
    let bestC = 0;
    let minDist = Infinity;

    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] === 0) {
                let pos = getBubblePosition(r, c);
                let dist = Math.hypot(flyingBubble.x - pos.x, flyingBubble.y - pos.y);
                if (dist < minDist) {
                    minDist = dist;
                    bestR = r;
                    bestC = c;
                }
            }
        }
    }

    if (bestR >= 0 && bestR < ROWS) {
        let matchedColor = flyingBubble.color;
        let special = flyingBubble.special;
        flyingBubble = null;

        if (special === 'bomb') {
            let popped = 0;
            for (let r = Math.max(0, bestR - 1); r <= Math.min(ROWS - 1, bestR + 1); r++) {
                let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
                for (let c = Math.max(0, bestC - 1); c <= Math.min(colsInRow - 1, bestC + 1); c++) {
                    if (grid[r][c] !== 0) {
                        grid[r][c] = 0;
                        popped++;
                    }
                }
            }
            addScoreAndCount(popped);
        } else if (special === 'rainbow') {
            let targetColor = Math.floor(Math.random() * BUBBLE_COLORS) + 1;
            let popped = 0;
            for (let r = 0; r < ROWS; r++) {
                let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
                for (let c = 0; c < colsInRow; c++) {
                    if (grid[r][c] === targetColor) {
                        grid[r][c] = 0;
                        popped++;
                    }
                }
            }
            addScoreAndCount(popped);
        } else {
            grid[bestR][bestC] = matchedColor;
            let connected = findConnectedBubbles(bestR, bestC, matchedColor);
            if (connected.length >= 3) {
                connected.forEach(b => {
                    grid[b.r][b.c] = 0;
                });
                addScoreAndCount(connected.length);
                dropFloatingBubbles();
            }
        }

        checkGameConditions();
    }
}

function findConnectedBubbles(startR, startC, color) {
    let visited = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    let stack = [{r: startR, c: startC}];
    let connected = [];

    visited[startR][startC] = true;

    while (stack.length > 0) {
        let curr = stack.pop();
        connected.push(curr);

        let neighbors = getNeighbors(curr.r, curr.c);
        for (let n of neighbors) {
            if (!visited[n.r][n.c] && grid[n.r][n.c] === color) {
                visited[n.r][n.c] = true;
                stack.push(n);
            }
        }
    }
    return connected;
}

function getNeighbors(r, c) {
    const offsetsEven = [[-1,-1], [-1,0], [0,-1], [0,1], [1,-1], [1,0]];
    const offsetsOdd  = [[-1,0], [-1,1], [0,-1], [0,1], [1,0], [1,1]];
    let currentOffsets = (r % 2 === 1) ? offsetsOdd : offsetsEven;
    let neighbors = [];

    for (let off of currentOffsets) {
        let nr = r + off[0];
        let nc = c + off[1];
        if (nr >= 0 && nr < ROWS) {
            let colsInRow = (nr % 2 === 0) ? COLS : COLS - 1;
            if (nc >= 0 && nc < colsInRow) {
                neighbors.push({r: nr, c: nc});
            }
        }
    }
    return neighbors;
}

function dropFloatingBubbles() {
    let visited = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    let stack = [];

    let colsInRow0 = (0 % 2 === 0) ? COLS : COLS - 1;
    for (let c = 0; c < colsInRow0; c++) {
        if (grid[0][c] !== 0) {
            visited[0][c] = true;
            stack.push({r: 0, c: c});
        }
    }

    while (stack.length > 0) {
        let curr = stack.pop();
        let neighbors = getNeighbors(curr.r, curr.c);
        for (let n of neighbors) {
            if (!visited[n.r][n.c] && grid[n.r][n.c] !== 0) {
                visited[n.r][n.c] = true;
                stack.push(n);
            }
        }
    }

    let dropped = 0;
    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] !== 0 && !visited[r][c]) {
                grid[r][c] = 0;
                dropped++;
            }
        }
    }
    if (dropped > 0) {
        addScoreAndCount(dropped * 2);
    }
}

function addScoreAndCount(count) {
    if (count <= 0) return;
    soloScore += count * 100;
    soloBubblesPopped += count;
    myPopCount += count;

    if (gameMode === 'battle' && conn && conn.open) {
        conn.send({
            type: 'pop_update',
            count: count,
            myTotal: myPopCount,
            battleType: battleType
        });
    }
}

function checkGameConditions() {
    let remainingBubbles = 0;
    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] !== 0) remainingBubbles++;
        }
    }

    if (remainingBubbles === 0) {
        if (gameMode === 'solo') {
            gameLoopActive = false;
            document.getElementById('clear-score-text').innerText = `スコア: ${soloScore} pt`;
            showScreen('screen-stage-clear');
        }
    }
}

// --- 描画処理 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            let colorId = grid[r][c];
            if (colorId !== 0) {
                let pos = getBubblePosition(r, c);
                drawBubble(pos.x, pos.y, bubbleRadius, colorId, null);
            }
        }
    }

    if (isDragging) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(shooterX, shooterY);
        ctx.lineTo(touchCurrentX, touchCurrentY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawBubble(shooterX, shooterY, bubbleRadius, currentBubble, currentSpecial);

    if (flyingBubble) {
        drawBubble(flyingBubble.x, flyingBubble.y, bubbleRadius, flyingBubble.color, flyingBubble.special);
    }

    drawItemButton(canvas.width - 50, canvas.height - 100, '💣', bombAvailable, activeItem === 'bomb');
    drawItemButton(canvas.width - 50, canvas.height - 35, '★', rainbowAvailable, activeItem === 'rainbow');

    // カウント表示
    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;

    if (gameMode === 'battle') {
        ctx.fillStyle = '#4da6ff';
        ctx.fillText(`自分: ${myPopCount} 個`, 15, 10);

        ctx.fillStyle = '#ff4d4d';
        ctx.textAlign = 'right';
        ctx.fillText(`相手: ${oppPopCount} 個`, canvas.width - 15, 10);
    } else {
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`スコア: ${soloScore}`, 15, 10);

        ctx.fillStyle = '#4dff4d';
        ctx.textAlign = 'right';
        ctx.fillText(`消去数: ${soloBubblesPopped}`, canvas.width - 15, 10);
    }
    ctx.restore();
}

function drawBubble(x, y, radius, colorId, special) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    let fillColor = REAL_COLOR_HEX[colorId] || '#fff';
    ctx.fillStyle = fillColor;
    ctx.fill();
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    if (special === 'bomb') {
        ctx.fillStyle = '#000';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', x, y);
    } else if (special === 'rainbow') {
        ctx.fillStyle = '#000';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x, y);
    }
    ctx.restore();
}

function drawItemButton(x, y, symbol, available, active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#ffcc00' : (available ? '#333' : '#222');
    ctx.fill();
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeStyle = active ? '#fff' : (available ? '#ffcc00' : '#555');
    ctx.stroke();

    ctx.fillStyle = available ? '#fff' : '#666';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x, y);
    ctx.restore();
}

// ==========================================
// P2P通信・対戦マッチング処理 (PeerJS)
// ==========================================
function setupRole(role) {
    myRole = role;
    if (role === 'host') {
        showScreen('screen-host-wait');
        initPeerHost();
    } else {
        showScreen('screen-guest-join');
    }
}

function initPeerHost() {
    roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const codeEl = document.getElementById('display-room-code');
    if (codeEl) codeEl.innerText = roomCode;

    if (peer) peer.destroy();
    peer = new Peer('winggame_' + roomCode);

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnectionEvents();
        showScreen('screen-host-rule-setup');
    });

    peer.on('error', (err) => {
        console.error(err);
    });
}

function joinRoom() {
    const inputEl = document.getElementById('input-room-code');
    const inputCode = inputEl ? inputEl.value : '';
    if (inputCode.length !== 4) {
        const statusEl = document.getElementById('status-message');
        if (statusEl) statusEl.innerText = '4桁の数字を入力してください';
        return;
    }

    roomCode = inputCode;
    if (peer) peer.destroy();
    peer = new Peer();

    peer.on('open', () => {
        conn = peer.connect('winggame_' + roomCode);
        setupConnectionEvents();
        showScreen('screen-guest-wait-rule');
    });

    peer.on('error', () => {
        const statusEl = document.getElementById('status-message');
        if (statusEl) statusEl.innerText = '部屋が見つかりませんでした';
    });
}

function cancelNetwork(targetScreen) {
    if (peer) {
        peer.destroy();
        peer = null;
    }
    showScreen(targetScreen);
}

function setupConnectionEvents() {
    if (!conn) return;
    conn.on('data', (data) => {
        handlePeerData(data);
    });
    conn.on('close', () => {
        alert('対戦相手が切断しました。');
        returnToTitle();
    });
}

// --- ホスト側ルール設定 ---
let selectedHostBattleType = 'タイムアタック';
let selectedHostTargetWins = 1;

function setHostBattleType(type) {
    selectedHostBattleType = type;
    const btnTa = document.getElementById('btn-mode-ta');
    const btnOjama = document.getElementById('btn-mode-ojama');
    if (btnTa) btnTa.className = (type === 'タイムアタック') ? 'menu-btn sub' : 'menu-btn gray';
    if (btnOjama) btnOjama.className = (type === 'お邪魔対戦') ? 'menu-btn sub' : 'menu-btn gray';
}

function setHostTargetWins(wins) {
    selectedHostTargetWins = wins;
    const btn1 = document.getElementById('btn-win-1');
    const btn2 = document.getElementById('btn-win-2');
    if (btn1) btn1.className = (wins === 1) ? 'menu-btn' : 'menu-btn gray';
    if (btn2) btn2.className = (wins === 2) ? 'menu-btn' : 'menu-btn gray';
}

function confirmHostBattleStart() {
    battleType = selectedHostBattleType;
    targetWins = selectedHostTargetWins;

    if (conn && conn.open) {
        conn.send({
            type: 'start_battle_rules',
            battleType: battleType,
            targetWins: targetWins
        });
    }
    showBattleRulesDescScreen();
}

function showBattleRulesDescScreen() {
    let desc = `<b>【${battleType}】</b><br>`;
    if (battleType === 'タイムアタック') {
        desc += '・60秒間でより多くの玉を消した方の勝利！<br>';
    } else {
        desc += '・玉を消すと相手にお邪魔玉が送られます！<br>';
    }
    desc += `・<b>${targetWins}勝先取</b>で勝利となります！`;
    
    const textContent = document.getElementById('rules-text-content');
    if (textContent) textContent.innerHTML = desc;
    showScreen('screen-battle-rules-desc');
}

function readyToStartBattle() {
    if (myRole === 'host') {
        if (conn && conn.open) {
            conn.send({ type: 'launch_game' });
        }
        startBattleGame();
    } else {
        if (conn && conn.open) {
            conn.send({ type: 'guest_ready_ack' });
        }
        startBattleGame();
    }
}

function handlePeerData(data) {
    if (data.type === 'start_battle_rules') {
        battleType = data.battleType;
        targetWins = data.targetWins;
        showBattleRulesDescScreen();
    } else if (data.type === 'launch_game') {
        startBattleGame();
    } else if (data.type === 'pop_update') {
        oppPopCount = data.myTotal;
    } else if (data.type === 'rematch_request') {
        startBattleGame();
    }
}

function startBattleGame() {
    gameMode = 'battle';
    myWins = 0;
    opponentWins = 0;
    myPopCount = 0;
    oppPopCount = 0;

    initGrid();
    for (let r = 0; r < 4; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            grid[r][c] = Math.floor(Math.random() * BUBBLE_COLORS) + 1;
        }
    }

    spawnNewBubble();
    spawnNewBubble();
    bombAvailable = true;
    rainbowAvailable = true;
    activeItem = null;

    showScreen('');
    gameLoopActive = true;

    if (battleType === 'タイムアタック') {
        battleTimer = 60;
        if (battleTimerInterval) clearInterval(battleTimerInterval);
        battleTimerInterval = setInterval(() => {
            battleTimer--;
            if (battleTimer <= 0) {
                clearInterval(battleTimerInterval);
                endBattleRound();
            }
        }, 1000);
    }
}

function endBattleRound() {
    gameLoopActive = false;
    if (battleTimerInterval) clearInterval(battleTimerInterval);

    let isWin = myPopCount >= oppPopCount;
    if (isWin) myWins++;
    else opponentWins++;

    if (myWins >= targetWins || opponentWins >= targetWins) {
        const titleEl = document.getElementById('battle-result-title');
        const subEl = document.getElementById('battle-result-sub');
        if (titleEl) titleEl.innerText = myWins >= targetWins ? '🎉 総合勝利！' : '敗北...';
        if (subEl) subEl.innerText = `スコア: 自分 ${myPopCount} - 相手 ${oppPopCount}`;
        
        const loserCtrl = document.getElementById('battle-loser-controls');
        const winnerWait = document.getElementById('battle-winner-wait');
        if (loserCtrl) loserCtrl.style.display = 'flex';
        if (winnerWait) winnerWait.style.display = 'none';
        showScreen('screen-battle-result');
    } else {
        setTimeout(() => {
            startBattleGame();
        }, 2000);
    }
}

function requestRematch() {
    if (conn && conn.open) {
        conn.send({ type: 'rematch_request' });
    }
    startBattleGame();
}

function cleanupBattle() {
    if (battleTimerInterval) clearInterval(battleTimerInterval);
    if (peer) {
        peer.destroy();
        peer = null;
    }
    conn = null;
    gameLoopActive = false;
}

// --- その他メニュー用スタブ ---
function showRankingBoard() { alert('ランキング機能準備中'); }
function openSettings() { alert('画像設定機能準備中'); }
function closeSettings() { showScreen('screen-mode'); }
function checkSoloGameOverRankIn() { returnToTitle(); }
function nextStageAction() { soloStage++; startStage(soloStage); }
function retryStage() { startStage(soloStage); }
