// ==========================================
// パズルゲーム 修正版プログラム
// ==========================================

const SPECIAL_RAINBOW = 'rainbow';
const SPECIAL_BOMB = 'bomb';

// ゲーム状態管理用変数
let score = 0;
let totalClearTime = 0;
let isGameOver = false;
let gameMode = 'title'; // 'title', 'battle', 'clear'

// バトル・じゃんけん・アイテム用変数
let attackNoticeTimer = 0;
let attackNoticeText = "";
let opponentTurnNoticeTimer = 0;
let opponentTurnNoticeText = "";
let activeItems = []; // 使用中のアイテムリスト（例: ['penetrate', 'double_ojama']）

// パーティクル管理
let particles = [];

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    for (let p of particles) {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ------------------------------------------
// お邪魔玉計算ロジック（アイテム併用対応）
// ------------------------------------------
function calculateOjamaCount(baseDeletedCount) {
    let multiplier = 1;
    let hasPenetrate = false;
    let hasDoubleOjama = false;

    // アクティブなアイテムのチェックと効果の重複適用
    for (let item of activeItems) {
        if (item === 'double_ojama') {
            multiplier *= 2; // 2倍効果
        }
        if (item === 'penetrate') {
            hasPenetrate = true;
        }
        // その他のアイテム効果があればここに追加
    }

    // デフォルトの計算（消した数 × 基本倍率）にアイテム倍率を乗算
    let ojamaCount = baseDeletedCount * multiplier;

    // 貫通アイテムがある場合の追加補正や処理（必要に応じて）
    if (hasPenetrate) {
        // 例：貫通効果でさらにボーナスやお邪魔貫通力が加わる場合
        ojamaCount = Math.floor(ojamaCount * 1.2); 
    }

    return ojamaCount;
}

// ------------------------------------------
// 画面描画・UI関連
// ------------------------------------------
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameMode === 'title') {
        drawTitleBackground();
    } else if (gameMode === 'clear') {
        drawGameClearScreen();
    } else {
        // バトル画面等の描画
        updateParticles();
        drawParticles();
    }

    // 攻撃通知メッセージの描画
    if (attackNoticeTimer > 0) {
        attackNoticeTimer--;
        ctx.save();
        ctx.fillStyle = "rgba(255, 0, 0, 0.85)";
        ctx.fillRect(10, canvas.height / 2 - 90, 285, 50);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, canvas.height / 2 - 90, 285, 50);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(attackNoticeText, 152, canvas.height / 2 - 65);
        ctx.restore();
    }

    // 相手のターン通知メッセージの描画
    if (opponentTurnNoticeTimer > 0) {
        opponentTurnNoticeTimer--;
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 255, 0.85)";
        ctx.fillRect(10, canvas.height / 2 - 30, 285, 50);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, canvas.height / 2 - 30, 285, 50);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(opponentTurnNoticeText, 152, canvas.height / 2 - 5);
        ctx.restore();
    }
}

// ------------------------------------------
// バトル中の勝敗判定・ライン到達チェック
// ------------------------------------------
function checkGameOverCondition(playerHeight, opponentHeight, maxLimitHeight) {
    if (isGameOver) return;

    // プレイヤー側がラインを超えた場合 -> プレイヤーの敗北（相手の勝利）
    if (playerHeight >= maxLimitHeight) {
        isGameOver = true;
        triggerBattleResult(false, "相手の勝利！玉が限界ラインを超えました。");
    } 
    // 相手側がラインを超えた場合 -> 相手の敗北（プレイヤーの勝利）
    else if (opponentHeight >= maxLimitHeight) {
        isGameOver = true;
        triggerBattleResult(true, "あなたの勝利！相手の玉が限界ラインを超えました。");
    }
}

function triggerBattleResult(isPlayerWin, message) {
    attackNoticeText = message;
    attackNoticeTimer = 180; // 3秒間表示
    setTimeout(() => {
        gameMode = 'battle_result';
        drawBattleResultScreen();
    }, 2000);
}

// ------------------------------------------
// じゃんけん後のターン開始処理の修正
// ------------------------------------------
function startBattleAfterJanken(winner, choice) {
    // choice: 'first' (先攻) または 'second' (後攻)
    isGameOver = false;
    gameMode = 'battle';
    
    if (winner === 'player') {
        if (choice === 'first') {
            opponentTurnNoticeText = "あなたの先攻です！ゲームを開始します。";
        } else {
            opponentTurnNoticeText = "あなたは後攻です。相手のターンから始まります。";
        }
    } else {
        opponentTurnNoticeText = "相手が先攻を選びました。バトルスタート！";
    }
    
    opponentTurnNoticeTimer = 120; // 2秒間通知表示を維持してスムーズにゲーム開始
}

// ------------------------------------------
// 各種描画補助関数
// ------------------------------------------
function drawBubble(x, y, color, radius, isOjama = false, isMystery = false) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (color === SPECIAL_RAINBOW) {
        let grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, '#ff4d4d');
        grad.addColorStop(0.4, '#ffff4d');
        grad.addColorStop(0.6, '#4dff4d');
        grad.addColorStop(0.8, '#4da6ff');
        grad.addColorStop(1.0, '#ff4dda');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌈', x, y);
    } else if (color === SPECIAL_BOMB) {
        let grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
        grad.addColorStop(0, '#ff9999');
        grad.addColorStop(0.5, '#ff2222');
        grad.addColorStop(1.0, '#550000');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', x, y);
    } else {
        let grad = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, color);
        grad.addColorStop(1, getDarkerColor(color));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (isMystery) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 4;
            ctx.fillText('？', x, y);
            ctx.shadowBlur = 0;
        } else if (isOjama) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.arc(x, y, radius - 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawUnbreakableBubble(x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    let grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#cccccc');
    grad.addColorStop(1.0, '#666666');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#222';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', x, y);
    ctx.restore();
}

function getDarkerColor(hex) {
    let num = parseInt(hex.replace('#',''), 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.floor(r * 0.6);
    g = Math.floor(g * 0.6);
    b = Math.floor(b * 0.6);
    return `rgb(${r},${g},${b})`;
}

function drawTitleBackground() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGameClearScreen() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateParticles();
    drawParticles();

    ctx.fillStyle = "#ffcc00";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✨ GAME CLEAR! ✨", canvas.width / 2, 160);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`全ステージクリアおめでとうございます！`, canvas.width / 2, 210);
    ctx.fillText(`最終スコア: ${score}`, canvas.width / 2, 250);
    ctx.fillText(`トータルクリアタイム: ${totalClearTime}秒`, canvas.width / 2, 285);
    ctx.textAlign = "left";
}

function drawBattleResultScreen() {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateParticles();
    drawParticles();
}

function promptNameInput() {
    let playerName = prompt("ランキング用のお名前を入力してください（3文字〜10文字）:", "名無しプレイヤー");
    if (playerName) {
        alert(`${playerName}さんの記録を保存しました！（総合スコア: ${score}）`);
    }
    returnToTitle();
}

function update() {
    // 毎フレームの更新処理
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// 初期化実行
// showScreen('screen-title'); // 外部定義の画面切り替え関数がある場合は適宜利用してください
requestAnimationFrame(gameLoop);
