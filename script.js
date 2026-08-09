const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 🔊 サウンド（SE & BGM）設定 ---
const audioPath = 'audio/';

const se = {
    ballShoot:   new Audio(`${audioPath}se/se_ball_shoot.wav`),
    ballLand:    new Audio(`${audioPath}se/se_ball_land.wav`),
    bombExplode: new Audio(`${audioPath}se/se_bomb_explode.wav`),
    rainbowLand: new Audio(`${audioPath}se/se_rainbow_land.wav`),
    rainbowSet:  new Audio(`${audioPath}se/se_rainbow_set.wav`),
    blockFall:   new Audio(`${audioPath}se/se_block_fall.wav`),
    gameOver:    new Audio(`${audioPath}se/se_game_over.mp3`),
    stageClear:  new Audio(`${audioPath}se/se_stage_clear.wav`)
};

let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    Object.values(se).forEach(sound => {
        sound.play().then(() => {
            sound.pause();
            sound.currentTime = 0;
        }).catch(() => {});
    });
}

function playSE(sound) {
    try {
        if (sound) {
            sound.currentTime = 0;
            let p = sound.play();
            if (p !== undefined) p.catch(() => {});
        }
    } catch(e) {}
}

const bgmList = [
    `${audioPath}bgm/bgm_play_01.mp3`,
    `${audioPath}bgm/bgm_play_03.mp3`,
    `${audioPath}bgm/bgm_play_04.mp3`
];
let currentBGM = null;

function playRandomBGM() {
    stopBGM();
    try {
        const randomIndex = Math.floor(Math.random() * bgmList.length);
        currentBGM = new Audio(bgmList[randomIndex]);
        currentBGM.loop = true;
        let p = currentBGM.play();
        if (p !== undefined) p.catch(() => {});
    } catch(e) {}
}

function stopBGM() {
    try {
        if (currentBGM) {
            currentBGM.pause();
            currentBGM.currentTime = 0;
            currentBGM = null;
        }
    } catch(e) {}
}

// --- 🎮 ゲーム基本パラメータ ---
const ROWS = 15; 
const COLS =  8;  
const RADIUS = 19;
const DIAMETER = RADIUS * 2;
const ROW_HEIGHT = RADIUS * Math.sqrt(3);

const BASE_COLORS = ['#ff4d4d', '#4da6ff', '#4dff4d', '#ffff4d', '#ff4dda'];
const COLOR_NAMES = {
    '#ff4d4d': '赤の玉', '#4da6ff': '青の玉', '#4dff4d': '緑の玉',
    '#ffff4d': '黄色の玉', '#ff4dda': 'ピンクの玉', 'SPECIAL_BOMB': 'ボム玉(💣)'
};
let customImages = {};
const UNBREAKABLE_COLOR = '#fff';
const TOP_MARGIN = 15; 

let grid = [];
let score = 0;
let currentStage = 1;
const maxStages = 10;

let gameMode = 'single'; // 'single' | 'battle'
let battleType = 'タイムアタック'; // 'タイムアタック' | 'お邪魔対戦'
let targetWins = 1;
let myWins = 0;
let opponentWins = 0;

let battleRole = ''; // 'host' (1P) | 'guest' (2P)
let roomCode = '';
let gameState = 'title';

// --- 🔄 ターン制・じゃんけん管理用変数 ---
let battleTurnState = 'waiting'; // 'waiting', 'janken', 'my_turn', 'opponent_turn', 'resolving'
let myJankenChoice = '';
let opponentJankenChoice = '';
let jankenResultMsg = 'じゃんけんの手を選んでください';
let currentTurnPlayer = ''; // 'host' または 'guest'
const TURN_TIME_LIMIT = 10;
let turnRemainingTime = TURN_TIME_LIMIT;
let turnTimerInterval = null;

let shooterX = 200; 
let shooterY = canvas.height - 70;
let bulletX = shooterX;
let bulletY = shooterY;
let bulletVX = 0;
let bulletVY = 0;

const SPECIAL_RAINBOW = 'SPECIAL_RAINBOW';
const SPECIAL_BOMB = 'SPECIAL_BOMB';

let bulletColor = getRandomShooterColor();
let nextColor = getRandomShooterColor();
let bombUsesLeft = 2;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let pullX = 0;
let pullY = 0;
const MAX_PULL_DISTANCE = 120;
const MIN_SPEED = 8;
const MAX_SPEED = 24;
let isMoving = false;

let fallingBubbles = [];
let flashingBubbles = [];
let particles = [];
let fireworks = [];
let battleWinner = '';

// --- 💥 画面外「下」から飛来するお邪魔玉用配列 ---
let flyingOjamaList = [];

let attackNoticeText = "";
let attackNoticeTimer = 0;
let shakeTimer = 0;

// タイマー関連（ソロモード）
const STAGE_TIME_LIMIT = 180; 
let remainingTime = STAGE_TIME_LIMIT;
let timerInterval = null;
let totalClearTime = 0;

let peer = null;
let conn = null;
const PEER_PREFIX = 'pb-game-room-2026-v6-';

function showScreen(screenId) {
    document.querySelectorAll('.overlay-screen').forEach(s => s.style.display = 'none');
    if (screenId === '') return;
    let target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
        if (screenId === 'screen-title') {
            gameState = 'title';
            stopBGM();
            stopTimer();
            stopTurnTimer();
            let logo = target.querySelector('.title-logo');
            if (logo) {
                logo.style.animation = 'none';
                logo.offsetHeight;
                logo.style.animation = null;
            }
        }
    }
}

function goToHowToPlay() {
    unlockAudio();
    if (gameState === 'title') showScreen('screen-how-to-play');
}

function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        if (gameState === 'playing' && gameMode === 'single') {
            remainingTime--;
            if (remainingTime <= 0) {
                remainingTime = 0;
                stopTimer();
                handleTimeOutGameOver();
            }
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ⏱️ ターン制用 10秒制限タイマー
function startTurnTimer() {
    stopTurnTimer();
    turnRemainingTime = TURN_TIME_LIMIT;
    turnTimerInterval = setInterval(() => {
        if (gameState === 'playing' && gameMode === 'battle' && battleType === 'お邪魔対戦') {
            if (battleTurnState === 'my_turn') {
                turnRemainingTime--;
                if (turnRemainingTime <= 0) {
                    stopTurnTimer();
                    forceTimeoutTurnEnd();
                }
            }
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimerInterval) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
    }
}

function forceTimeoutTurnEnd() {
    isMoving = false;
    spawnBullet();
    if (conn && conn.open) {
        conn.send({ type: 'sync_turn_action', ojamaAmount: 0, didClear: false });
    }
    switchTurnToOpponent();
}

function getRandomGridColor() {
    return BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)];
}

function getRandomShooterColor() {
    if (Math.random() < 0.08) return SPECIAL_RAINBOW;
    return BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)];
}

function initGridForStage(stage) {
    grid = [];
    fallingBubbles = [];
    flashingBubbles = [];
    flyingOjamaList = [];
    
    for (let r = 0; r < ROWS; r++) {
        let row = [];
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) row.push(null);
        grid.push(row);
    }

    if (gameMode !== 'battle') {
        let maxUnbreakable = Math.min(8, stage + 1);
        let placed = 0;
        let attempts = 0;
        while (placed < maxUnbreakable && attempts < 100) {
            attempts++;
            let r = Math.floor(Math.random() * 3);
            let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
            let c = Math.floor(Math.random() * colsInRow);
            if (grid[r][c] === null) {
                grid[r][c] = { color: UNBREAKABLE_COLOR, isOjama: false };
                placed++;
            }
        }
    }

    let fillRows = (gameMode === 'battle' && battleType === 'お邪魔対戦') ? 2 : Math.min(ROWS - 5, 2 + Math.floor(stage * 0.5));
    for (let r = 0; r < fillRows; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] === null && Math.random() < 0.7) {
                grid[r][c] = { color: getRandomGridColor(), isOjama: false };
            }
        }
    }
}

function startSinglePlay() {
    closeNetwork();
    gameMode = 'single';
    gameState = 'playing';
    score = 0;
    currentStage = 1;
    bombUsesLeft = 2;
    totalClearTime = 0;
    remainingTime = STAGE_TIME_LIMIT;
    initGridForStage(currentStage);
    spawnBullet();
    playRandomBGM();
    startTimer();
    showScreen('');
}

function setupRole(role) {
    battleRole = role;
    closeNetwork();

    if (role === 'host') {
        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById('display-room-code').innerText = roomCode;
        showScreen('screen-host-wait');

        peer = new Peer(PEER_PREFIX + roomCode);
        peer.on('connection', (c) => {
            conn = c;
            setupConnectionListeners();
            showScreen('screen-host-rule-setup');
        });
        peer.on('error', () => {
            alert('接続エラーが発生しました（部屋IDが競合している可能性があります）');
            showScreen('screen-role-select');
        });
    } else {
        showScreen('screen-guest-join');
        document.getElementById('status-message').innerText = '';
    }
}

function joinRoom() {
    let code = document.getElementById('input-room-code').value;
    if (code.length !== 4) {
        document.getElementById('status-message').innerText = '4桁の数字を入力してください';
        return;
    }

    roomCode = code;
    document.getElementById('status-message').innerText = '接続中...';
    closeNetwork();
    peer = new Peer();

    peer.on('open', () => {
        conn = peer.connect(PEER_PREFIX + roomCode);
        setupConnectionListeners();
    });
    peer.on('error', () => {
        document.getElementById('status-message').innerText = '部屋が見つからないか接続に失敗しました';
    });
}

function setupConnectionListeners() {
    conn.on('open', () => {
        if (battleRole === 'guest') {
            showScreen('screen-guest-wait-rule');
        }
    });

    conn.on('data', (data) => {
        if (battleRole === 'guest') {
            // --- ゲスト側 ---
            if (data.type === 'show_rules') {
                targetWins = data.targetWins;
                battleType = data.battleType;
                displayBattleRulesDesc();
            } else if (data.type === 'ready_start') {
                executeBattleStart();
            } else if (data.type === 'start_janken') {
                openJankenScreen();
            } else if (data.type === 'sync_janken_result') {
                opponentJankenChoice = data.choice;
                checkJankenFinish();
            } else if (data.type === 'guest_role_selected') {
                currentTurnPlayer = data.turnPlayer;
                closeJankenOverlay();
                startBattleRoundLoop();
            } else if (data.type === 'sync_turn_action') {
                executeOpponentAction(data);
            } else if (data.type === 'sync_round_end') {
                myWins = data.myWins;
                opponentWins = data.opponentWins;
                checkBattleSetEnd(data.winner);
            } else if (data.type === 'rematch') {
                myWins = 0;
                opponentWins = 0;
                startNextRound();
            }
        } else {
            // --- ホスト側 ---
            if (data.type === 'sync_janken_result') {
                opponentJankenChoice = data.choice;
                checkJankenFinish();
            } else if (data.type === 'host_set_first_player') {
                currentTurnPlayer = data.turnPlayer;
                if (conn && conn.open) conn.send({ type: 'guest_role_selected', turnPlayer: currentTurnPlayer });
                closeJankenOverlay();
                startBattleRoundLoop();
            } else if (data.type === 'sync_turn_action') {
                executeOpponentAction(data);
            } else if (data.type === 'guest_game_over') {
                handleHostRoundDecide('OPPONENT');
            } else if (data.type === 'guest_request_round_win' && battleType === 'タイムアタック') {
                handleHostRoundDecide('OPPONENT');
            } else if (data.type === 'rematch') {
                myWins = 0;
                opponentWins = 0;
                if (conn && conn.open) conn.send({ type: 'rematch' });
                startNextRound();
            }
        }
    });

    conn.on('close', () => {
        if (gameState === 'playing' || gameState === 'battle_result') {
            alert('相手との通信が切断されました');
            returnToTitle();
        }
    });
}

function setHostBattleType(type) {
    battleType = type;
    document.getElementById('btn-mode-ta').className = type === 'タイムアタック' ? 'menu-btn sub' : 'menu-btn gray';
    document.getElementById('btn-mode-ojama').className = type === 'お邪魔対戦' ? 'menu-btn sub' : 'menu-btn gray';
}

function setHostTargetWins(wins) {
    targetWins = wins;
    document.getElementById('btn-win-1').className = wins === 1 ? 'menu-btn' : 'menu-btn gray';
    document.getElementById('btn-win-2').className = wins === 2 ? 'menu-btn' : 'menu-btn gray';
}

function confirmHostBattleStart() {
    if (conn && conn.open) {
        conn.send({
            type: 'show_rules',
            targetWins: targetWins,
            battleType: battleType
        });
    }
    displayBattleRulesDesc();
}

function displayBattleRulesDesc() {
    let desc = "";
    if (battleType === 'タイムアタック') {
        desc = `<b>【⏱️ タイムアタック】</b><br>画面上の消せる玉を相手より先にすべて消した方の勝利！<br><br>・勝利条件: ${targetWins}勝先取`;
    } else {
        desc = `<b>【⚔️ ターン制お邪魔対戦】</b><br>対戦開始時に1度だけじゃんけんで先攻後攻を決定！<br>以降は交互に玉を打ち、玉を消すと画面外の下からお邪魔玉が飛んできます。<br><br>・勝利条件: ${targetWins}勝先取`;
    }
    document.getElementById('rules-text-content').innerHTML = desc;
    showScreen('screen-battle-rules-desc');
}

function readyToStartBattle() {
    if (battleRole === 'host') {
        if (conn && conn.open) conn.send({ type: 'ready_start' });
        executeBattleStart();
    }
}

function executeBattleStart() {
    gameMode = 'battle';
    gameState = 'playing';
    score = 0;
    currentStage = 1;
    bombUsesLeft = 2;
    myWins = 0;
    opponentWins = 0;
    initGridForStage(currentStage);
    spawnBullet();
    playRandomBGM();

    if (battleType === 'お邪魔対戦') {
        startJankenPhase();
    } else {
        showScreen('');
    }
}

function closeNetwork() {
    if (conn) {
        try { conn.close(); } catch(e) {}
        conn = null;
    }
    if (peer) {
        try {
            peer.disconnect();
            peer.destroy();
        } catch(e) {}
        peer = null;
    }
}

function startNextRound() {
    bombUsesLeft = 2;
    initGridForStage(1);
    spawnBullet();
    gameState = 'playing';
    playRandomBGM();
    if (battleType === 'お邪魔対戦') {
        // 次のラウンドへ進む際もじゃんけんは再実施しない（直前の勝者・あるいは交互等の仕様にする場合はここを調整。今回は仕様通り初回のみのため、前回の順序を維持するか、ここで再じゃんけんするか選べますが、一般的にセット中の初回のみの場合はそのまま開始、あるいは次ラウンドの先攻交代も可能です。今回はシンプルにラウンド開始時は即プレイ開始します）
        showScreen('');
        if (battleType === 'お邪魔対戦') {
            // 毎回ラウンドごとにじゃんけんしたい場合は startJankenPhase() に変更できますが、
            // 「ゲーム開始直前に1回だけ」の仕様に合わせて、次ラウンドは直前の敗者が先攻になるなどの仕様にするか、
            // またはシンプルに毎ラウンドじゃんけんを行わないようダイレクトに開始します。
            currentTurnPlayer = (currentTurnPlayer === 'host') ? 'guest' : 'host'; // 交互に先攻を入れ替え
            startBattleRoundLoop();
        }
    } else {
        showScreen('');
    }
}

// --- ✊✌️✋ じゃんけんフェーズ（ゲーム開始時の1回のみ） ---
function startJankenPhase() {
    battleTurnState = 'janken';
    myJankenChoice = '';
    opponentJankenChoice = '';
    jankenResultMsg = 'じゃんけんの手を選んでください';
    
    let container = document.getElementById('janken-overlay');
    if (!container) {
        createJankenOverlayDOM();
    }
    document.getElementById('janken-status-msg').innerText = jankenResultMsg;
    document.getElementById('janken-choice-buttons').style.display = 'flex';
    document.getElementById('janken-role-select').style.display = 'none';
    document.getElementById('janken-overlay').style.display = 'flex';

    if (battleRole === 'host') {
        if (conn && conn.open) conn.send({ type: 'start_janken' });
    }
}

function openJankenScreen() {
    battleTurnState = 'janken';
    myJankenChoice = '';
    opponentJankenChoice = '';
    jankenResultMsg = 'じゃんけんの手を選んでください';
    document.getElementById('janken-status-msg').innerText = jankenResultMsg;
    document.getElementById('janken-choice-buttons').style.display = 'flex';
    document.getElementById('janken-role-select').style.display = 'none';
    document.getElementById('janken-overlay').style.display = 'flex';
}

function createJankenOverlayDOM() {
    let overlay = document.createElement('div');
    overlay.id = 'janken-overlay';
    overlay.className = 'overlay-screen';
    overlay.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:1000; flex-direction:column; justify-content:center; align-items:center; color:#fff;";
    
    overlay.innerHTML = `
        <div style="background:#222; padding:30px; border-radius:15px; text-align:center; width:320px; border:2px solid #555;">
            <h2 style="color:#ffcc00; margin-bottom:15px;">✊ じゃんけん勝負 ✌️</h2>
            <p style="font-size:12px; color:#aaa; margin-bottom:10px;">(ゲーム開始時の先攻・後攻決定)</p>
            <p id="janken-status-msg" style="margin-bottom:20px; font-size:14px;">じゃんけんの手を選んでください</p>
            <div id="janken-choice-buttons" style="display:flex; justify-content:center; gap:12px; margin-bottom:20px;">
                <button class="menu-btn sub" onclick="chooseJanken('rock')" style="width:75px; font-size:20px;">✊</button>
                <button class="menu-btn sub" onclick="chooseJanken('scissors')" style="width:75px; font-size:20px;">✌️</button>
                <button class="menu-btn sub" onclick="chooseJanken('paper')" style="width:75px; font-size:20px;">✋</button>
            </div>
            <div id="janken-role-select" style="display:none; flex-direction:column; gap:10px;">
                <p id="janken-winner-desc" style="color:#4dff4d; font-weight:bold; font-size:15px;"></p>
                <button class="menu-btn" onclick="selectFirstOrSecond('first')">先行で始める</button>
                <button class="menu-btn sub" onclick="selectFirstOrSecond('second')">後攻で始める</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function chooseJanken(choice) {
    myJankenChoice = choice;
    let names = { 'rock': '✊ グー', 'scissors': '✌️ チョキ', 'paper': '✋ パー' };
    document.getElementById('janken-status-msg').innerText = `あなた: ${names[choice]} を選択しました。\n相手の選択を待っています...`;
    document.getElementById('janken-choice-buttons').style.display = 'none';

    if (conn && conn.open) {
        conn.send({ type: 'sync_janken_result', choice: choice });
    }
    checkJankenFinish();
}

function checkJankenFinish() {
    if (myJankenChoice !== '' && opponentJankenChoice !== '') {
        if (myJankenChoice === opponentJankenChoice) {
            document.getElementById('janken-status-msg').innerText = "あいこです！もう一度選んでください";
            myJankenChoice = '';
            opponentJankenChoice = '';
            setTimeout(() => {
                document.getElementById('janken-choice-buttons').style.display = 'flex';
            }, 1000);
            return;
        }

        let iWon = (
            (myJankenChoice === 'rock' && opponentJankenChoice === 'scissors') ||
            (myJankenChoice === 'scissors' && opponentJankenChoice === 'paper') ||
            (myJankenChoice === 'paper' && opponentJankenChoice === 'rock')
        );

        if (iWon) {
            document.getElementById('janken-status-msg').innerText = "あなたの勝ち！ 先行か後攻を選んでください";
            document.getElementById('janken-role-select').style.display = 'flex';
        } else {
            document.getElementById('janken-status-msg').innerText = "あなたの負け... 相手の選択を待っています";
        }
    }
}

function selectFirstOrSecond(choice) {
    let turnPlayer = (choice === 'first') ? battleRole : ((battleRole === 'host') ? 'guest' : 'host');
    currentTurnPlayer = turnPlayer;
    if (conn && conn.open) {
        conn.send({ type: 'host_set_first_player', turnPlayer: turnPlayer });
    }
    closeJankenOverlay();
    startBattleRoundLoop();
}

function closeJankenOverlay() {
    let el = document.getElementById('janken-overlay');
    if (el) el.style.display = 'none';
}

function startBattleRoundLoop() {
    showScreen('');
    if (currentTurnPlayer === battleRole) {
        battleTurnState = 'my_turn';
        startTurnTimer();
    } else {
        battleTurnState = 'opponent_turn';
    }
}

function switchTurnToOpponent() {
    stopTurnTimer();
    battleTurnState = 'opponent_turn';
}

function executeOpponentAction(data) {
    if (data.ojamaAmount > 0) {
        launchOjamaProjectilesFromBottom(data.ojamaAmount);
    } else {
        battleTurnState = 'my_turn';
        startTurnTimer();
    }
}

// 💥 画面外「下」からお邪魔玉が飛んできて定着する演出
function launchOjamaProjectilesFromBottom(amount) {
    if (amount <= 0) return;
    let safeAmount = Math.min(amount, 10);

    attackNoticeText = `⚠️ お邪魔玉 +${safeAmount} 飛来中！`;
    attackNoticeTimer = 75; 
    shakeTimer = Math.min(shakeTimer + 10, 30); 
    playSE(se.bombExplode);

    for (let i = 0; i < safeAmount; i++) {
        setTimeout(() => {
            let startX = Math.random() * 260 + 50;
            let startY = canvas.height + 40; 
            let targetY = canvas.height - (Math.random() * 200 + 100); 
            let color = getRandomGridColor();
            
            flyingOjamaList.push({
                x: startX,
                y: startY,
                targetY: targetY,
                color: color,
                vy: -(6 + Math.random() * 4) 
            });
        }, i * 120);
    }
}

function applyOjamaToGrid(color) {
    let placed = false;
    for (let r = ROWS - 1; r >= 0; r--) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            if (grid[r][c] === null) {
                grid[r][c] = { color: color, isOjama: true };
                placed = true;
                break;
            }
        }
        if (placed) break;
    }

    if (!placed) {
        for (let c = 0; c < COLS; c++) {
            if (grid[0][c] === null) {
                grid[0][c] = { color: color, isOjama: true };
                break;
            }
        }
    }

    checkGameOverCondition();
}

function retryStage() {
    bombUsesLeft = 2;
    remainingTime = STAGE_TIME_LIMIT;
    initGridForStage(currentStage);
    spawnBullet();
    gameState = 'playing';
    playRandomBGM();
    startTimer();
    showScreen('');
}

function nextStageAction() {
    if (currentStage < maxStages) {
        totalClearTime += (STAGE_TIME_LIMIT - remainingTime);
        currentStage++;
        bombUsesLeft = 2;
        remainingTime = STAGE_TIME_LIMIT;
        initGridForStage(currentStage);
        spawnBullet();
        gameState = 'playing';
        startTimer();
        showScreen('');
    }
}

function returnToTitle() {
    closeNetwork();
    stopBGM();
    stopTimer();
    stopTurnTimer();
    gameState = 'title';
    showScreen('screen-title');
}

function spawnBullet() {
    bulletColor = nextColor;
    nextColor = getRandomShooterColor();
    if (bulletColor === SPECIAL_RAINBOW) playSE(se.rainbowSet);
    resetBulletPos();
    isMoving = false;
}

function resetBulletPos() {
    bulletX = shooterX;
    bulletY = shooterY;
    bulletVX = 0;
    bulletVY = 0;
    pullX = 0;
    pullY = 0;
}

function checkClearCondition() {
    if (fallingBubbles.length > 0 || flashingBubbles.length > 0 || flyingOjamaList.length > 0) return;

    let hasBreakable = false;
    for (let r = 0; r < grid.length; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            let cell = grid[r][c];
            if (cell !== null && cell.color !== UNBREAKABLE_COLOR) {
                hasBreakable = true; break;
            }
        }
        if (hasBreakable) break;
    }

    if (!hasBreakable) {
        playSE(se.stageClear);
        if (gameMode === 'battle') {
            if (battleType === 'タイムアタック') {
                if (battleRole === 'host') {
                    handleHostRoundDecide('YOU');
                } else {
                    if (conn && conn.open) conn.send({ type: 'guest_request_round_win' });
                }
            } else if (battleType === 'お邪魔対戦') {
                if (battleRole === 'host') {
                    handleHostRoundDecide('YOU');
                } else {
                    if (conn && conn.open) conn.send({ type: 'guest_request_round_win' });
                }
            }
        } else {
            if (currentStage < maxStages) {
                gameState = 'stage_clear_menu';
                document.getElementById('clear-score-text').innerText = `ステージ ${currentStage} クリア！\nスコア: ${score}`;
                showScreen('screen-stage-clear');
            } else {
                stopTimer();
                totalClearTime += (STAGE_TIME_LIMIT - remainingTime);
                initWinParticles();
                gameState = 'gameclear';
                showScreen('');
            }
        }
    }
}

function triggerSoloGameOver(msg) {
    stopTimer();
    stopBGM();
    playSE(se.gameOver);
    gameState = 'gameover_menu';
    document.getElementById('gameover-score-text').innerText = `${msg}\nスコア: ${score}`;
    showScreen('screen-game-over');
}

function checkGameOverCondition() {
    if (gameState !== 'playing') return;

    let limitRow = ROWS - 1; 

    for (let r = limitRow; r < ROWS; r++) {
        let rowCols = (r % 2 === 0) ? COLS : COLS - 1;
        for (let cc = 0; cc < rowCols; cc++) {
            if (grid[r][cc] !== null) {
                if (gameMode === 'battle') {
                    stopBGM();
                    stopTurnTimer();
                    gameState = 'gameover_menu';
                    
                    if (battleRole === 'host') {
                        handleHostRoundDecide('OPPONENT');
                    } else {
                        if (conn && conn.open) {
                            conn.send({ type: 'guest_game_over' });
                        }
                        triggerSoloGameOver("ラウンド敗北... (玉が溢れました)");
                    }
                } else {
                    triggerSoloGameOver(`ステージ ${currentStage} で終了`);
                }
                return;
            }
        }
    }
}

function handleHostRoundDecide(roundWinnerRole) {
    if (battleRole !== 'host') return;

    if (roundWinnerRole === 'YOU') {
        myWins++;
    } else {
        opponentWins++;
    }

    if (conn && conn.open) {
        conn.send({
            type: 'sync_round_end',
            myWins: myWins,
            opponentWins: opponentWins,
            winner: roundWinnerRole === 'YOU' ? 'YOU' : 'OPPONENT'
        });
    }

    checkBattleSetEnd(roundWinnerRole === 'YOU' ? 'YOU' : 'OPPONENT');
}

function handleTimeOutGameOver() {
    triggerSoloGameOver(`タイムアップ！ (ステージ ${currentStage})`);
}

function requestRematch() {
    if (battleRole === 'host') {
        myWins = 0;
        opponentWins = 0;
        if (conn && conn.open) conn.send({ type: 'rematch' });
        startNextRound();
    } else {
        if (conn && conn.open) conn.send({ type: 'rematch' });
    }
}

function checkBattleSetEnd(roundWinner) {
    if (myWins >= targetWins || opponentWins >= targetWins) {
        battleWinner = (battleRole === 'host' && myWins >= targetWins) || (battleRole === 'guest' && roundWinner === 'YOU') ? 'YOU' : 'OPPONENT';
        if (battleRole === 'guest') {
            battleWinner = (opponentWins >= targetWins) ? 'OPPONENT' : 'YOU';
        }
        
        gameState = 'battle_result';
        stopBGM();
        stopTurnTimer();
        playSE(se.gameOver);

        let titleEl = document.getElementById('battle-result-title');
        let subEl = document.getElementById('battle-result-sub');
        let loserControls = document.getElementById('battle-loser-controls');
        let winnerWait = document.getElementById('battle-winner-wait');

        if (battleWinner === 'YOU') {
            titleEl.innerText = "🏆 勝利！ WINNER!";
            titleEl.style.color = "#ffcc00";
            subEl.innerText = `勝利達成！ (${myWins}勝 - ${opponentWins}勝)`;
            initWinParticles(); 
            if (loserControls) loserControls.style.display = 'block';
            if (winnerWait) winnerWait.style.display = 'none';
        } else {
            titleEl.innerText = "💀 敗北... LOSER";
            titleEl.style.color = "#ff4d4d";
            subEl.innerText = `対戦に敗北しました (${myWins}勝 - ${opponentWins}勝)`;
            initLoseParticles(); 
            if (loserControls) loserControls.style.display = 'block';
            if (winnerWait) winnerWait.style.display = 'none';
        }

        showScreen('screen-battle-result');
    } else {
        alert(`ラウンド終了！\n現在: あなた ${myWins}勝 - 相手 ${opponentWins}勝`);
        startNextRound();
    }
}

function initWinParticles() {
    particles = [];
    fireworks = [];
}

function spawnFirework() {
    const x = Math.random() * (canvas.width - 120) + 50;
    const targetY = Math.random() * (canvas.height * 0.4) + 50;
    fireworks.push({
        x: x,
        y: canvas.height,
        targetY: targetY,
        vy: -7 - Math.random() * 3,
        color: BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)]
    });
}

function createExplosion(x, y, color) {
    const count = 40;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.2;
        const speed = Math.random() * 4 + 2;
        particles.push({
            type: 'firework_spark',
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1.0,
            color: color,
            size: Math.random() * 3 + 2
        });
    }
}

function initLoseParticles() {
    particles = [];
    fireworks = [];
    for (let i = 0; i < 80; i++) {
        particles.push({
            type: 'rain',
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            len: Math.random() * 15 + 10,
            vy: Math.random() * 6 + 10,
            color: 'rgba(120, 160, 255, 0.6)'
        });
    }
}

function updateParticles() {
    if ((gameState === 'battle_result' && battleWinner === 'YOU' || gameState === 'gameclear') && Math.random() < 0.05) {
        spawnFirework();
    }

    for (let i = fireworks.length - 1; i >= 0; i--) {
        let fw = fireworks[i];
        fw.y += fw.vy;
        if (fw.y <= fw.targetY) {
            createExplosion(fw.x, fw.y, fw.color);
            fireworks.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        if (p.type === 'firework_spark') {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.alpha -= 0.02;
            if (p.alpha <= 0) particles.splice(i, 1);
        } else if (p.type === 'rain') {
            p.y += p.vy;
            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
        }
    }
}

function drawParticles() {
    for (let fw of fireworks) {
        ctx.beginPath();
        ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = fw.color;
        ctx.fill();
        ctx.closePath();
    }

    for (let p of particles) {
        if (p.type === 'firework_spark') {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.restore();
        } else if (p.type === 'rain') {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p.y + p.len);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.closePath();
        }
    }
}

function getTouchPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
    
    let scaleX = canvas.width / rect.width;
    let scaleY = canvas.height / rect.height;

    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    x = Math.max(0, Math.min(canvas.width, x));
    y = Math.max(0, Math.min(canvas.height, y));

    return { x, y };
}

window.addEventListener('touchstart', (e) => {
    unlockAudio();
    if (gameState === 'playing') e.preventDefault();
    handleInputStart(getTouchPos(e));
}, { passive: false });

window.addEventListener('mousedown', (e) => {
    unlockAudio();
    handleInputStart(getTouchPos(e));
});

function handleInputStart(pos) {
    if (gameState === 'title') return;

    if (gameState === 'gameclear') {
        promptNameInput();
        return;
    }

    if (gameState === 'playing' && !isMoving) {
        if (gameMode === 'battle' && battleType === 'お邪魔対戦' && battleTurnState !== 'my_turn') {
            return; 
        }

        if (pos.x >= 305 && pos.x <= 395) {
            if (pos.y >= 310 && pos.y <= 385) {
                if (bombUsesLeft > 0) { bulletColor = SPECIAL_BOMB; bombUsesLeft--; }
                return;
            } else if (pos.y >= 405 && pos.y <= 465) {
                openSettings();
                return;
            }
        }

        isDragging = true;
        dragStartX = pos.x; dragStartY = pos.y;
        pullX = 0; pullY = 0;
    }
}

window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    handleDragMove(getTouchPos(e));
}, { passive: false });

window.addEventListener('mousemove', (e) => { if (isDragging) handleDragMove(getTouchPos(e)); });

function handleDragMove(pos) {
    let dx = pos.x - dragStartX;
    let dy = pos.y - dragStartY;
    let dist = Math.hypot(dx, dy);
    if (dist > MAX_PULL_DISTANCE) {
        let angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * MAX_PULL_DISTANCE;
        dy = Math.sin(angle) * MAX_PULL_DISTANCE;
    }
    pullX = dx; pullY = dy;
}

window.addEventListener('touchend', () => { if (isDragging) { isDragging = false; releaseBullet(); } });
window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; releaseBullet(); } });

function releaseBullet() {
    let pullDist = Math.hypot(pullX, pullY);
    if (pullDist < 12) { pullX = 0; pullY = 0; return; }

    let power = Math.min(1.0, pullDist / MAX_PULL_DISTANCE);
    let speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power;
    let launchAngle = Math.atan2(-pullY, -pullX);
    
    if (launchAngle < -0.05 && launchAngle > -Math.PI + 0.05) {
        bulletVX = Math.cos(launchAngle) * speed;
        bulletVY = Math.sin(launchAngle) * speed;
        isMoving = true;
        playSE(se.ballShoot);
        stopTurnTimer(); 
    }
    pullX = 0; pullY = 0;
}

function getPixelCoords(r, c) {
    let offsetX = (r % 2 === 1) ? RADIUS : 0;
    let x = c * DIAMETER + RADIUS + offsetX;
    let y = r * ROW_HEIGHT + RADIUS + TOP_MARGIN;
    return { x, y };
}

function findCellForPosition(x, y) {
    let bestR = 0, bestC = 0, minDist = Infinity;
    
    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            let pos = getPixelCoords(r, c);
            let dist = Math.hypot(x - pos.x, y - pos.y);
            if (dist < minDist) {
                minDist = dist;
                bestR = r;
                bestC = c;
            }
        }
    }

    if (grid[bestR][bestC] !== null) {
        let altMinDist = Infinity, altR = bestR, altC = bestC;
        for (let r = 0; r < ROWS; r++) {
            let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
            for (let c = 0; c < colsInRow; c++) {
                if (grid[r][c] === null) {
                    let pos = getPixelCoords(r, c);
                    let dist = Math.hypot(x - pos.x, y - pos.y);
                    if (dist < altMinDist) {
                        altMinDist = dist;
                        altR = r;
                        altC = c;
                    }
                }
            }
        }
        return { r: altR, c: altC };
    }
    return { r: bestR, c: bestC };
}

function findConnected(r, c, color, visited = new Set()) {
    let key = `${r},${c}`;
    let colsInRow = (r >= 0 && r < ROWS) ? ((r % 2 === 0) ? COLS : COLS - 1) : 0;
    if (visited.has(key) || r < 0 || r >= ROWS || c < 0 || c >= colsInRow) return [];
    
    let cell = grid[r][c];
    if (cell === null || cell.isOjama || cell.color === UNBREAKABLE_COLOR || cell.color !== color) return [];

    visited.add(key);
    let matches = [{ r, c }];
    let neighbors = (r % 2 === 0) ? [[-1,-1], [-1,0], [0,-1], [0,1], [1,-1], [1,0]] : [[-1,0], [-1,1], [0,-1], [0,1], [1,0], [1,1]];
    for (let n of neighbors) matches = matches.concat(findConnected(r + n[0], c + n[1], color, visited));
    return matches;
}

function triggerFlashEffect(cellsToFlash, extraScore = 0) {
    if (cellsToFlash.length === 0) return;
    flashingBubbles.push({ cells: cellsToFlash, timer: 30 });
    score += extraScore;
}

function removeFloating() {
    let visited = new Set();
    for (let c = 0; c < COLS; c++) {
        if (grid[0][c] !== null) markConnectedFromCeiling(0, c, visited);
    }

    let droppedCount = 0;
    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            let cell = grid[r][c];
            if (cell !== null && !visited.has(`${r},${c}`)) {
                let color = cell.color;
                let pos = getPixelCoords(r, c);
                fallingBubbles.push({ x: pos.x, y: pos.y, vy: 2 + Math.random() * 2, color: color });
                grid[r][c] = null;
                droppedCount++;
            }
        }
    }
    if (droppedCount > 0) {
        score += droppedCount * 20;
        playSE(se.blockFall);
    }
    return droppedCount;
}

function markConnectedFromCeiling(r, c, visited) {
    let key = `${r},${c}`;
    let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
    if (visited.has(key) || r < 0 || r >= ROWS || c < 0 || c >= colsInRow) return;
    if (grid[r][c] === null) return;
    visited.add(key);
    let neighbors = (r % 2 === 0) ? [[-1,-1], [-1,0], [0,-1], [0,1], [1,-1], [1,0]] : [[-1,0], [-1,1], [0,-1], [0,1], [1,0], [1,1]];
    for (let n of neighbors) markConnectedFromCeiling(r + n[0], c + n[1], visited);
}

function update() {
    if (gameState === 'gameclear' || gameState === 'battle_result') {
        updateParticles();
        return;
    }

    if (attackNoticeTimer > 0) attackNoticeTimer--;
    if (shakeTimer > 0) shakeTimer--;

    for (let i = flyingOjamaList.length - 1; i >= 0; i--) {
        let oj = flyingOjamaList[i];
        oj.y += oj.vy; 
        if (oj.y <= oj.targetY) {
            applyOjamaToGrid(oj.color);
            flyingOjamaList.splice(i, 1);
            
            if (flyingOjamaList.length === 0 && gameMode === 'battle' && battleType === 'お邪魔対戦' && battleTurnState === 'opponent_turn') {
                battleTurnState = 'my_turn';
                startTurnTimer();
            }
        }
    }

    for (let i = fallingBubbles.length - 1; i >= 0; i--) {
        let fb = fallingBubbles[i];
        fb.y += fb.vy; fb.vy += 0.6;
        if (fb.y > canvas.height + 50) fallingBubbles.splice(i, 1);
    }

    for (let i = flashingBubbles.length - 1; i >= 0; i--) {
        flashingBubbles[i].timer--;
        if (flashingBubbles[i].timer <= 0) {
            flashingBubbles.splice(i, 1);
            removeFloating();
            checkClearCondition();
        }
    }

    if (fallingBubbles.length === 0 && flashingBubbles.length === 0 && flyingOjamaList.length === 0 && gameState === 'playing') {
        checkClearCondition();
    }

    if (gameState === 'playing' && isMoving) {
        let steps = 4;
        let stepVX = bulletVX / steps;
        let stepVY = bulletVY / steps;

        for (let s = 0; s < steps; s++) {
            bulletX += stepVX;
            bulletY += stepVY;

            if (bulletX - RADIUS <= 0) { 
                bulletX = RADIUS; 
                bulletVX *= -1; 
                stepVX *= -1;
            } else if (bulletX + RADIUS >= 305) {
                bulletX = 305 - RADIUS; 
                bulletVX *= -1; 
                stepVX *= -1;
            }

            if (bulletY - RADIUS <= TOP_MARGIN) {
                bulletY = TOP_MARGIN + RADIUS;
                snapBullet();
                return;
            }

            for (let r = 0; r < ROWS; r++) {
                let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
                for (let c = 0; c < colsInRow; c++) {
                    if (grid[r][c] !== null) {
                        let pos = getPixelCoords(r, c);
                        if (Math.hypot(bulletX - pos.x, bulletY - pos.y) <= DIAMETER - 2) {
                            snapBullet();
                            return;
                        }
                    }
                }
            }
        }
    }
}

function snapBullet() {
    isMoving = false;
    let cell = findCellForPosition(bulletX, bulletY);
    
    let generatedOjama = 0;

    if (cell.r >= 0 && cell.r < ROWS) {
        let colsInRow = (cell.r % 2 === 0) ? COLS : COLS - 1;
        cell.c = Math.max(0, Math.min(colsInRow - 1, cell.c));

        if (grid[cell.r][cell.c] === null) {
            if (bulletColor === SPECIAL_BOMB) {
                playSE(se.bombExplode);
                let affectedCells = [{ r: cell.r, c: cell.c }];
                let neighbors = (cell.r % 2 === 0) ? [[-1,-1], [-1,0], [0,-1], [0,1], [1,-1], [1,0]] : [[-1,0], [-1,1], [0,-1], [0,1], [1,0], [1,1]];
                for (let n of neighbors) {
                    let nr = cell.r + n[0], nc = cell.c + n[1];
                    let nCols = (nr >= 0 && nr < ROWS) ? ((nr % 2 === 0) ? COLS : COLS - 1) : 0;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < nCols && grid[nr][nc] !== null && grid[nr][nc].color !== UNBREAKABLE_COLOR) {
                        affectedCells.push({ r: nr, c: nc });
                    }
                }
                let flashList = [];
                for (let ac of affectedCells) {
                    let targetCell = grid[ac.r][ac.c];
                    if (targetCell !== null && targetCell.color !== UNBREAKABLE_COLOR) {
                        flashList.push({ r: ac.r, c: ac.c });
                        grid[ac.r][ac.c] = null;
                        generatedOjama++;
                    }
                }
                triggerFlashEffect(flashList, flashList.length * 40);
            } else if (bulletColor === SPECIAL_RAINBOW) {
                playSE(se.rainbowLand);
                let targetColor = null;
                let neighbors = (cell.r % 2 === 0) ? [[-1,-1], [-1,0], [0,-1], [0,1], [1,-1], [1,0]] : [[-1,0], [-1,1], [0,-1], [0,1], [1,0], [1,1]];
                for (let n of neighbors) {
                    let nr = cell.r + n[0], nc = cell.c + n[1];
                    let nCols = (nr >= 0 && nr < ROWS) ? ((nr % 2 === 0) ? COLS : COLS - 1) : 0;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < nCols && grid[nr][nc] !== null && grid[nr][nc].color !== UNBREAKABLE_COLOR && !grid[nr][nc].isOjama) {
                        targetColor = grid[nr][nc].color; break;
                    }
                }
                if (targetColor !== null) {
                    let clearedCount = 0;
                    for (let r = 0; r < ROWS; r++) {
                        let rCols = (r % 2 === 0) ? COLS : COLS - 1;
                        for (let c = 0; c < rCols; c++) {
                            let gCell = grid[r][c];
                            if (gCell !== null && gCell.color === targetColor && !gCell.isOjama) {
                                let pos = getPixelCoords(r, c);
                                fallingBubbles.push({ x: pos.x, y: pos.y, vy: 2 + Math.random() * 2, color: targetColor });
                                grid[r][c] = null; clearedCount++;
                            }
                        }
                    }
                    score += clearedCount * 30;
                    let floatCount = removeFloating();
                    generatedOjama = clearedCount + floatCount;
                }
            } else {
                playSE(se.ballLand);
                grid[cell.r][cell.c] = { color: bulletColor, isOjama: false };
                let matches = findConnected(cell.r, cell.c, bulletColor);
                if (matches.length >= 3) {
                    for (let m of matches) {
                        let pos = getPixelCoords(m.r, m.c);
                        fallingBubbles.push({ x: pos.x, y: pos.y, vy: 2 + Math.random() * 2, color: bulletColor });
                        grid[m.r][m.c] = null; score += 10;
                    }
                    let floatCount = removeFloating();
                    generatedOjama = matches.length + floatCount;
                }
            }
        }
    }
    
    spawnBullet();

    if (gameMode === 'battle' && battleType === 'お邪魔対戦') {
        if (conn && conn.open) {
            conn.send({ type: 'sync_turn_action', ojamaAmount: generatedOjama, didClear: false });
        }
        switchTurnToOpponent();
    }

    checkClearCondition();
    checkGameOverCondition();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'title') { drawTitleBackground(); return; }
    if (gameState === 'gameclear') { drawGameClearScreen(); return; }
    if (gameState === 'battle_result') { drawBattleResultScreen(); return; }

    ctx.save();
    if (shakeTimer > 0) {
        let offsetX = (Math.random() - 0.5) * 10;
        let offsetY = (Math.random() - 0.5) * 10;
        ctx.translate(offsetX, offsetY);
    }

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(305, 0, 95, canvas.height);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(305, 0); ctx.lineTo(305, canvas.height); ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    if (gameMode === 'battle') {
        let roleText = battleRole === 'host' ? '1P(H)' : '2P(G)';
        ctx.fillText(`対戦[${roleText}]`, 312, 22);
        ctx.fillText(` (${targetWins}勝先取)`, 312, 38);
        ctx.fillStyle = "#ffcc00";
        ctx.fillText(`${myWins}勝 - ${opponentWins}勝`, 312, 56);
        ctx.fillStyle = "#fff";
        ctx.fillText(`${battleType}`, 312, 74);

        if (battleType === 'お邪魔対戦') {
            ctx.fillStyle = (battleTurnState === 'my_turn') ? "#4dff4d" : "#ff4d4d";
            ctx.font = "bold 12px sans-serif";
            ctx.fillText(battleTurnState === 'my_turn' ? `あなたの番 (${turnRemainingTime}s)` : "相手の番", 312, 110);
        }
    } else {
        ctx.fillStyle = "#ffcc00";
        ctx.fillText(`ST ${currentStage}/10`, 312, 25);
        ctx.fillStyle = "#fff";
        ctx.fillText(`TIME: ${remainingTime}s`, 312, 45);
    }
    ctx.fillStyle = "#4da6ff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`SCORE:`, 312, 135);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(`${score}`, 312, 153);

    ctx.fillStyle = "#aaa";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("NEXT", 336, 192);
    drawBubble(352, 232, nextColor, 17);

    let btnBg = bombUsesLeft > 0 ? "#ff5722" : "#333";
    ctx.fillStyle = btnBg;
    ctx.beginPath(); ctx.roundRect(312, 310, 80, 75, 10); ctx.fill();
    ctx.strokeStyle = bombUsesLeft > 0 ? "#fff" : "#555"; ctx.lineWidth = 2; ctx.stroke(); ctx.closePath();

    ctx.fillStyle = bombUsesLeft > 0 ? "#fff" : "#777";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💣ボム", 352, 342);
    ctx.fillText(`(${bombUsesLeft})`, 352, 364);

    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.roundRect(312, 405, 80, 60, 10); ctx.fill();
    ctx.strokeStyle = "#888"; ctx.lineWidth = 2; ctx.stroke(); ctx.closePath();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("⚙️ 設定", 352, 440);
    ctx.textAlign = "left";

    for (let r = 0; r < ROWS; r++) {
        let colsInRow = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < colsInRow; c++) {
            let cell = grid[r][c];
            if (cell !== null) {
                let pos = getPixelCoords(r, c);
                if (cell.color === UNBREAKABLE_COLOR) drawUnbreakableBubble(pos.x, pos.y, RADIUS);
                else {
                    drawBubble(pos.x, pos.y, cell.color, RADIUS);
                    if (cell.isOjama) {
                        ctx.fillStyle = "#ff3333";
                        ctx.font = "bold 11px sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("×", pos.x, pos.y);
                        ctx.textAlign = "left";
                        ctx.textBaseline = "alphabetic";
                    }
                }
            }
        }
    }

    for (let fb of flashingBubbles) {
        let phase = Math.floor(fb.timer / 10);
        let flashColor = (phase === 1) ? "#ff0000" : "#ffffff";
        for (let ac of fb.cells) {
            let pos = getPixelCoords(ac.r, ac.c);
            ctx.beginPath(); ctx.arc(pos.x, pos.y, RADIUS - 1, 0, Math.PI * 2);
            ctx.fillStyle = flashColor; ctx.fill(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.stroke(); ctx.closePath();
        }
    }

    for (let fb of fallingBubbles) drawBubble(fb.x, fb.y, fb.color, RADIUS);

    for (let oj of flyingOjamaList) {
        drawBubble(oj.x, oj.y, oj.color, RADIUS);
        ctx.fillStyle = "#ff3333";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("×", oj.x, oj.y);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }

    if (isDragging) {
        let pullDist = Math.hypot(pullX, pullY);
        if (pullDist > 8) {
            let launchAngle = Math.atan2(-pullY, -pullX);
            let guideLength = 250;
            ctx.beginPath(); ctx.moveTo(shooterX, shooterY);
            ctx.lineTo(shooterX + Math.cos(launchAngle) * guideLength, shooterY + Math.sin(launchAngle) * guideLength);
            ctx.strokeStyle = 'rgba(255, 204, 0, 0.95)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]); ctx.closePath();
        }
        ctx.beginPath(); ctx.moveTo(shooterX, shooterY); ctx.lineTo(shooterX + pullX, shooterY + pullY);
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 4; ctx.stroke(); ctx.closePath();
        drawBubble(shooterX + pullX, shooterY + pullY, bulletColor, RADIUS);
    } else if (isMoving) {
        drawBubble(bulletX, bulletY, bulletColor, RADIUS);
    } else {
        drawBubble(shooterX, shooterY, bulletColor, RADIUS);
    }

    if (attackNoticeTimer > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 0, 0, 0.85)";
        ctx.fillRect(10, canvas.height / 2 - 30, 285, 50);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, canvas.height / 2 - 30, 285, 50);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(attackNoticeText, 152, canvas.height / 2 + 2);
        ctx.restore();
    }

    ctx.restore();
}

function drawTitleBackground() {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#888888";
    ctx.fillText("Ver 1.06", canvas.width / 2, canvas.height / 2 + 75);
    ctx.restore();
}

function drawGameClearScreen() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawParticles();

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#4dff4d";
    ctx.fillText("🎉 完全攻略！ 🎉", canvas.width / 2, canvas.height / 2 - 90);

    let colorIndex = Math.floor(Date.now() / 200) % BASE_COLORS.length;
    ctx.font = "900 26px 'Segoe UI', sans-serif";
    ctx.fillStyle = BASE_COLORS[colorIndex];
    ctx.fillText("CONGRATULATIONS!", canvas.width / 2, canvas.height / 2 - 40);

    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`ALL STAGE CLEAR!`, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText(`TIME: ${totalClearTime}秒 / SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 45);

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#4da6ff";
    ctx.fillText("画面をタップしてランキング登録へ ➔", canvas.width / 2, canvas.height / 2 + 100);
    ctx.restore();
}

function drawBattleResultScreen() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawParticles();
}

function drawBubble(x, y, color, r) {
    if (customImages[color]) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(customImages[color], x - r, y - r, r * 2, r * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.closePath();
        return;
    }
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    if (color === SPECIAL_RAINBOW) {
        let colorIndex = Math.floor(Date.now() / 150) % BASE_COLORS.length;
        ctx.fillStyle = BASE_COLORS[colorIndex]; ctx.fill(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("★", x, y); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    } else if (color === SPECIAL_BOMB) {
        ctx.fillStyle = "#333"; ctx.fill(); ctx.strokeStyle = "#ff5722"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#ff5722"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("💣", x, y); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    } else {
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.closePath();
}

function drawUnbreakableBubble(x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fillStyle = UNBREAKABLE_COLOR; ctx.fill();
    ctx.strokeStyle = "#aaa"; ctx.lineWidth = 2; ctx.stroke(); ctx.closePath();
    let offset = 6;
    ctx.beginPath(); ctx.moveTo(x - offset, y - offset); ctx.lineTo(x + offset, y + offset);
    ctx.moveTo(x + offset, y - offset); ctx.lineTo(x - offset, y + offset);
    ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.closePath();
}

function openSettings() {
    let listContainer = document.getElementById('settings-list');
    listContainer.innerHTML = '';
    [...BASE_COLORS, SPECIAL_BOMB].forEach(col => {
        let rowDiv = document.createElement('div');
        rowDiv.style.cssText = "display:flex; align-items:center; justify-content:space-between; width:92%; background:#222; padding:10px 12px; margin:6px 0; border-radius:8px;";
        
        let nameSpan = document.createElement('span');
        nameSpan.style.cssText = "font-size:13px; font-weight:bold;";
        nameSpan.innerText = COLOR_NAMES[col] || col;

        let btnGroup = document.createElement('div');
        btnGroup.style.cssText = "display:flex; gap:8px;";

        let uploadBtn = document.createElement('button');
        uploadBtn.className = 'menu-btn sub';
        uploadBtn.style.cssText = "padding:8px 12px; font-size:12px; width:auto; margin:0;";
        uploadBtn.innerText = '📷 変更';

        let resetBtn = document.createElement('button');
        resetBtn.className = 'menu-btn danger';
        resetBtn.style.cssText = "padding:8px 10px; font-size:12px; width:auto; margin:0;";
        resetBtn.innerText = '🔄';
        resetBtn.onclick = () => { delete customImages[col]; openSettings(); };
        
        let fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
        fileInput.onchange = (e) => {
            let file = e.target.files[0];
            if (file) {
                let reader = new FileReader();
                reader.onload = (event) => {
                    let img = new Image();
                    img.onload = () => {
                        let tempCanvas = document.createElement('canvas');
                        let maxDim = 128;
                        let w = img.width, h = img.height;
                        if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
                        else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
                        tempCanvas.width = w; tempCanvas.height = h;
                        let tCtx = tempCanvas.getContext('2d');
                        tCtx.drawImage(img, 0, 0, w, h);
                        let resizedImg = new Image();
                        resizedImg.onload = () => {
                            customImages[col] = resizedImg;
                            openSettings();
                        };
                        resizedImg.src = tempCanvas.toDataURL('image/jpeg', 0.85);
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
        uploadBtn.onclick = () => fileInput.click();

        btnGroup.appendChild(uploadBtn);
        btnGroup.appendChild(resetBtn);

        rowDiv.appendChild(nameSpan);
        rowDiv.appendChild(btnGroup);
        rowDiv.appendChild(fileInput);
        listContainer.appendChild(rowDiv);
    });
    document.getElementById('settings-overlay').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settings-overlay').style.display = 'none';
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

showScreen('screen-title');
loop();
