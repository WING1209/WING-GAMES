// ==========================================
// 1. オーディオ（SE / BGM）のプリロード設定
// ==========================================
const audioPath = 'audio/';

// SE（効果音）の初期化
const se = {
  ballShoot:    new Audio(`${audioPath}se/se_ball_shoot.wav`),
  ballLand:     new Audio(`${audioPath}se/se_ball_land.wav`),
  bombExplode:  new Audio(`${audioPath}se/se_bomb_explode.wav`),
  rainbowLand:  new Audio(`${audioPath}se/se_rainbow_land.wav`),
  rainbowSet:   new Audio(`${audioPath}se/se_rainbow_set.wav`),
  blockFall:    new Audio(`${audioPath}se/se_block_fall.wav`),
  gameOver:     new Audio(`${audioPath}se/se_game_over.wav`),
  stageClear:   new Audio(`${audioPath}se/se_stage_clear.wav`)
};

function playSE(sound) {
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.log("Audio play blocked:", e));
  }
}

// BGMの設定（WAVファイル対応）
const bgmList = [
  `${audioPath}bgm/bgm_play_01.wav`,
  `${audioPath}bgm/bgm_play_02.wav`,
  `${audioPath}bgm/bgm_play_03.wav`,
  `${audioPath}bgm/bgm_play_04.wav`
];
let currentBGM = null;

function playRandomBGM() {
  const randomIndex = Math.floor(Math.random() * bgmList.length);
  if (currentBGM) currentBGM.pause();
  
  currentBGM = new Audio(bgmList[randomIndex]);
  currentBGM.loop = true;
  currentBGM.play().catch(e => console.log("BGM play blocked:", e));
}

// ==========================================
// 2. ゲーム状態管理とホスト待機処理
// ==========================================
const GameState = {
  IDLE: 'IDLE',
  WAITING: 'WAITING',   // ★相手が入るまでここでストップ
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER'
};

let currentState = GameState.IDLE;
let isHost = false;

const statusText = document.getElementById('status-text');

function createRoom() {
  isHost = true;
  currentState = GameState.WAITING; // 待機状態にする
  
  statusText.innerText = "プレイヤー2の参加を待っています...";
  document.getElementById('btn-host').disabled = true;
  document.getElementById('btn-join').disabled = true;
}

function joinRoom() {
  isHost = false;
  statusText.innerText = "ホストに接続中...";
  onOpponentConnected();
}

function onOpponentConnected() {
  currentState = GameState.PLAYING;
  statusText.innerText = "対戦開始！";
  playRandomBGM();
}

// ==========================================
// 3. ループ処理
// ==========================================
function update() {
  if (currentState !== GameState.PLAYING) return;
  // ここにゲームの動的処理を記述
}

function draw() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (currentState === GameState.WAITING) {
    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("フレンドの参加を待っています...", canvas.width / 2, canvas.height / 2);
  } else if (currentState === GameState.PLAYING) {
    ctx.fillStyle = "#0f0";
    ctx.font = "20px sans-serif";
    ctx.fillText("対戦中！", 50, 30);
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
