// ==========================================
// 1. オーディオ（SE / BGM）の初期化設定
// ==========================================
const audioPath = 'audio/';

// SE（効果音）の定義
const se = {
  ballShoot:   new Audio(`${audioPath}se/se_ball_shoot.wav`),
  ballLand:    new Audio(`${audioPath}se/se_ball_land.wav`),
  bombExplode: new Audio(`${audioPath}se/se_bomb_explode.wav`),
  rainbowLand: new Audio(`${audioPath}se/se_rainbow_land.wav`),
  rainbowSet:  new Audio(`${audioPath}se/se_rainbow_set.wav`),
  blockFall:   new Audio(`${audioPath}se/se_block_fall.wav`),
  gameOver:    new Audio(`${audioPath}se/se_game_over.wav`),
  stageClear:  new Audio(`${audioPath}se/se_stage_clear.wav`)
};

// SE再生用関数（連打対応）
function playSE(sound) {
  if (sound) {
    sound.currentTime = 0; // 先頭に戻して再生
    sound.play().catch(e => console.log("SE Play Error:", e));
  }
}

// BGM（5種類ランダム対応）
const bgmList = [
  `${audioPath}bgm/bgm_play_01.mp3`,
  `${audioPath}bgm/bgm_play_02.mp3`,
  `${audioPath}bgm/bgm_play_03.mp3`,
  `${audioPath}bgm/bgm_play_04.mp3`,
  `${audioPath}bgm/bgm_play_05.mp3`
];
let currentBGM = null;

// ランダムBGM再生関数
function playRandomBGM() {
  const randomIndex = Math.floor(Math.random() * bgmList.length);
  
  if (currentBGM) {
    currentBGM.pause();
    currentBGM.currentTime = 0;
  }
  
  currentBGM = new Audio(bgmList[randomIndex]);
  currentBGM.loop = true; // ループ有効化
  currentBGM.play().catch(e => console.log("BGM Play Error:", e));
}


// ==========================================
// 2. ゲーム状態＆フレンド対戦（ホスト待機）管理
// ==========================================
const GameState = {
  IDLE: 'IDLE',       // 初期状態
  WAITING: 'WAITING', // ★ホスト側：フレンド参加待ち状態
  PLAYING: 'PLAYING', // 対戦中
  GAMEOVER: 'GAMEOVER'// ゲーム終了
};

let currentState = GameState.IDLE;
let isHost = false;

const statusText = document.getElementById('status-text');

// ① ホストが部屋を作る
function createRoom() {
  isHost = true;
  currentState = GameState.WAITING; // 勝手に進まないよう「待機中」に固定！
  
  statusText.innerText = "プレイヤー2の参加を待っています...";
  document.getElementById('btn-host').disabled = true;
  document.getElementById('btn-join').disabled = true;

  // ※ここで本来はネットワーク（PeerJSやWebSocket等）の接続待ちを開始します
}

// ② ゲスト（フレンド）が部屋に参加する
function joinRoom() {
  isHost = false;
  statusText.innerText = "ホストに接続中...";
  
  // 接続成功を想定して対戦を開始させる処理を実行
  onOpponentConnected();
}

// ③ 相手と接続が完了した時（対戦開始）
function onOpponentConnected() {
  currentState = GameState.PLAYING;
  statusText.innerText = "対戦開始！";
  
  // ランダムBGMを再生
  playRandomBGM();
  
  // 対戦ゲームの初期化処理
  initGame();
}


// ==========================================
// 3. ゲームメイン処理（計算＆描画）
// ==========================================
function initGame() {
  console.log("ゲーム初期化完了。対戦をスタートします。");
}

// 毎フレームの計算処理
function update() {
  // ★対戦中（PLAYING）以外はゲームの動きを停止・進行させない
  if (currentState !== GameState.PLAYING) {
    return;
  }

  // --- ここにパズルの移動・ブロック落下などの計算コードを書く ---
}

// 画面の描画処理
function draw() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  
  // 画面クリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. 相手の参加を待っている時（WAITING状態）
  if (currentState === GameState.WAITING) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("フレンドの参加を待っています...", canvas.width / 2, canvas.height / 2);
    ctx.font = "16px sans-serif";
    ctx.fillText("相手が接続するまでゲームは開始されません", canvas.width / 2, canvas.height / 2 + 40);
  } 
  // 2. 対戦中の画面描画（PLAYING状態）
  else if (currentState === GameState.PLAYING) {
    ctx.fillStyle = "#00ff00";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("対戦中！", 30, 40);
    
    // --- ここに実際のブロックや玉の描画処理を書く ---
  }
}

// メインゲームループ
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// ループ起動
gameLoop();
