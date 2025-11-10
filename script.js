// script.js — Fullscreen Dino-style game with sound effects + Reset HS button

// ---------------- CONFIG ----------------
const CONFIG = {
  playerScale: 3.4,
  maxPlayerHeight: 220,
  globalObstacleScale: 1.3,
  obstacleScales: [1, 1, 0.9, 1, 1, 1, 1, 0.9, 1],
  safetyMargin: 8,
  maxFixedObsHeight: 180
};
window.CONFIG = CONFIG;

// ---------------- DOM refs & assets ----------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerImg = document.getElementById('playerImg');
const highscoreGif = document.getElementById('highscoreGif');
const startBtn = document.getElementById('startBtn');
const resetHighBtn = document.getElementById('resetHighBtn');
const statText = document.getElementById('statText');
const scoreSpan = document.getElementById('score');

startBtn.disabled = true;

// ---------------- AUDIO ----------------
const sounds = {
  background: new Audio('assets/background.mp3'),
  jump: new Audio('assets/jump.mp3'),
  hit: new Audio('assets/hit.mp3'),
  highscore: new Audio('assets/highscore.mp3'),
  gameover: new Audio('assets/gameover.mp3')
};

// ensure background loops
sounds.background.loop = true;
sounds.background.volume = 0.90;
sounds.jump.volume = 0.20;
sounds.hit.volume = 0.80;
sounds.highscore.volume = 0.90;
sounds.gameover.volume = 0.90;

// ---------------- IMAGE ASSETS ----------------
const ASSETS = {
  background: 'assets/background.png',
  gameover: 'assets/gameover.png',
  highscore: 'assets/highscore.gif',
  player: 'assets/player.gif',
  obstacles: [
    'assets/obstacle1.png','assets/obstacle2.png','assets/obstacle3.png','assets/obstacle4.png',
    'assets/obstacle5.png','assets/obstacle6.png','assets/obstacle7.png','assets/obstacle8.png','assets/obstacle9.png'
  ]
};

let images = {};
let toLoad = 0, loaded = 0, failed = 0;

function queueImage(key, path){
  toLoad++;
  const img = new Image();
  img.src = path;
  img.onload = () => { images[key] = img; loaded++; checkAll(); };
  img.onerror = (e) => { console.error('Failed to load', path, e); failed++; loaded++; checkAll(); };
}

queueImage('background', ASSETS.background);
queueImage('gameover', ASSETS.gameover);
queueImage('highscore', ASSETS.highscore);
ASSETS.obstacles.forEach((p, i) => queueImage('obs' + (i+1), p));

toLoad++;
playerImg.onload = () => { images['player'] = playerImg; loaded++; checkAll(); };
playerImg.onerror = () => { failed++; loaded++; checkAll(); };
playerImg.src = ASSETS.player;

highscoreGif.onerror = () => console.warn('highscore.gif failed to load');

function checkAll(){
  if(loaded >= toLoad){
    statText.textContent = failed ? `ready (assets failed: ${failed})` : 'ready';
    startBtn.disabled = false;
    resizeCanvas();
    resetPlayerPosition();
    applyConfig();
  }
}

// ---------------- responsive canvas ----------------
let DPR = window.devicePixelRatio || 1;
let groundHeight = 24;
let canvasBottom = (window.innerHeight || 600) - groundHeight;

function resizeCanvas(){
  DPR = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  groundHeight = Math.max(24, Math.floor(h * 0.06));
  canvasBottom = h - groundHeight;

  resetPlayerPosition();
  applyConfig();
}
window.addEventListener('resize', resizeCanvas);

// ---------------- game state ----------------
let running = false;
let lastTime = 0;
const fpsInterval = 1000/60;
let score = 0;
let gameSpeed = Math.max(4, Math.floor((window.innerWidth||960)/250));
let spawnTimer = 0;
let minGap = Math.floor((window.innerWidth||960) * 0.45);
let sinceLastObstacle = minGap + 1;

const player = {
  x: 0, y: 0, width: 64, height: 64,
  vy: 0, gravity: 0.55, jumpForce: -20.0, isJumping: false
};

let obstacles = [];
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; if((e.code==='Space'||e.code==='ArrowUp') && !running) startGame(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });

startBtn.addEventListener('click', startGame);
resetHighBtn.addEventListener('click', resetHighscore);

// ---------------- apply CONFIG ----------------
function applyConfig(){
  const naturalW = playerImg.naturalWidth || 64;
  const naturalH = playerImg.naturalHeight || 64;

  const viewportScale = Math.min(2, window.innerHeight / 600);
  const targetHeight = Math.min(CONFIG.maxPlayerHeight, Math.floor(naturalH * CONFIG.playerScale * viewportScale));
  const scale = targetHeight / naturalH;

  player.width = Math.floor(naturalW * scale);
  player.height = Math.floor(naturalH * scale);
  player.x = Math.floor(window.innerWidth * 0.065);
  player.y = canvasBottom - player.height;

  playerImg.style.left = player.x + 'px';
  playerImg.style.top = player.y + 'px';
  playerImg.style.width = player.width + 'px';
}
window.applyConfig = applyConfig;

// ---------------- reset highscore button ----------------
function resetHighscore(){
  localStorage.removeItem('feat_highscore');
  statText.textContent = 'Highscore reset!';
  console.log('High score cleared manually.');
  highscoreGif.style.display = 'none';
  setTimeout(() => {
    statText.textContent = running ? 'running' : 'idle';
  }, 1500);
}

// ---------------- obstacle logic ----------------
function spawnObstacle(){
  const idx = Math.floor(Math.random() * ASSETS.obstacles.length) + 1;
  const img = images['obs' + idx];
  const natW = img ? img.width : 28;
  const natH = img ? img.height : 72;
  const per = CONFIG.obstacleScales[idx-1] || 1;
  const gw = CONFIG.globalObstacleScale || 1;

  let w = natW * per * gw * (window.innerWidth / 960);
  let h = natH * per * gw * (window.innerHeight / 360);
  const maxJump = (Math.abs(player.jumpForce)**2)/(2*player.gravity);
  const allowed = Math.min(Math.floor(maxJump - CONFIG.safetyMargin), CONFIG.maxFixedObsHeight);
  if(h > allowed){ const sc = allowed/h; h*=sc; w*=sc; }

  const obs = {
    img, _assetIndex: idx,
    x: window.innerWidth + 20,
    y: canvasBottom - h,
    width: w,
    height: h,
    speed: gameSpeed + Math.random() * 1.2
  };
  obstacles.push(obs);
  sinceLastObstacle = 0;
}

function updateObstacles(dt){
  for(let i = obstacles.length - 1; i >= 0; i--){
    const o = obstacles[i];
    o.x -= o.speed;
    if(o.x + o.width < -50) obstacles.splice(i,1);
  }
}

function drawObstacles(){
  for(const o of obstacles){
    if(o.img && o.img.complete) ctx.drawImage(o.img, o.x, o.y, o.width, o.height);
  }
}

// ---------------- player physics ----------------
function updatePlayer(){
  const jumpPressed = keys['Space'] || keys['ArrowUp'];
  if(jumpPressed && !player.isJumping){
    player.vy = player.jumpForce;
    player.isJumping = true;
    if (sounds.jump) { sounds.jump.currentTime = 0; sounds.jump.play(); }
  }
  if(player.isJumping){
    player.vy += player.gravity;
    player.y += player.vy;
    if(player.y >= canvasBottom - player.height){
      player.y = canvasBottom - player.height;
      player.isJumping = false;
      player.vy = 0;
    }
  }
  playerImg.style.left = player.x + 'px';
  playerImg.style.top = player.y + 'px';
  playerImg.style.width = player.width + 'px';
}

function checkCollision(a,b){
  return a.x < b.x + b.width &&
         a.x + a.width > b.x &&
         a.y < b.y + b.height &&
         a.y + a.height > b.y;
}

// ---------------- main loop & start ----------------
function startGame(){
  if(running) return;
  running = true;
  statText.textContent = 'running';
  lastTime = performance.now();
  score = 0;
  obstacles = [];
  sinceLastObstacle = minGap + 1;
  player.vy = 0;
  player.y = canvasBottom - player.height;
  highscoreGif.style.display = 'none';

  // start background music
  try {
    sounds.background.currentTime = 0;
    sounds.background.play();
  } catch (e) {
    console.warn('Autoplay blocked, will play on user input.');
  }

  requestAnimationFrame(loop);
}

function stopBackground(){
  try { sounds.background.pause(); sounds.background.currentTime = 0; } catch {}
}

function resetPlayerPosition(){
  const cssH = canvas.clientHeight || window.innerHeight;
  groundHeight = Math.max(24, Math.floor(cssH * 0.06));
  canvasBottom = cssH - groundHeight;
  applyConfig();
}

function loop(now){
  if(!running) return;
  const dt = now - lastTime;
  if(dt < fpsInterval/2){ requestAnimationFrame(loop); return; }
  lastTime = now;

  ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
  const bg = images.background;
  if(bg && bg.complete) ctx.drawImage(bg, 0, 0, canvas.clientWidth, canvas.clientHeight);
  else { ctx.fillStyle='#eaf2ff'; ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight); }

  sinceLastObstacle += gameSpeed;
  spawnTimer += dt;
  const spawnInterval = 800 + Math.random() * 1000;
  if(sinceLastObstacle > minGap && spawnTimer > spawnInterval){ spawnObstacle(); spawnTimer = 0; }

  score += 0.05 * (1 + gameSpeed/6) * (dt/16.67);
  scoreSpan.textContent = Math.floor(score);

  updateObstacles(dt);
  updatePlayer();
  drawObstacles();

  ctx.fillStyle='rgba(0,0,0,0.06)';
  ctx.fillRect(0,canvasBottom,canvas.clientWidth,groundHeight);

  const playerBox={x:player.x,y:player.y,width:player.width,height:player.height};
  for(const o of obstacles){
    const obsBox={x:o.x,y:o.y,width:o.width,height:o.height};
    if(checkCollision(playerBox,obsBox)){
      running=false;
      stopBackground();
      const finalScore=Math.floor(score);
      statText.textContent='gameover';

      if (sounds.hit) { sounds.hit.currentTime = 0; sounds.hit.play(); }
      if (sounds.gameover) { setTimeout(()=>{sounds.gameover.play();},300); }

      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);

      const go=images.gameover;
      if(go&&go.complete){
        const fit=Math.min(canvas.clientWidth/go.width,canvas.clientHeight/go.height);
        const drawW=go.width*fit, drawH=go.height*fit;
        ctx.drawImage(go,(canvas.clientWidth-drawW)/2,(canvas.clientHeight-drawH)/2,drawW,drawH);
      }

      let best=parseInt(localStorage.getItem('feat_highscore')||'0',10);
      if(finalScore>best){
        best=finalScore;
        localStorage.setItem('feat_highscore',best);

        if (sounds.highscore) { sounds.highscore.currentTime = 0; sounds.highscore.play(); }

        highscoreGif.style.display='block';
        highscoreGif.style.opacity='1';
        setTimeout(()=>{
          highscoreGif.style.transition='opacity 0.8s';
          highscoreGif.style.opacity='0';
          setTimeout(()=>{highscoreGif.style.display='none';highscoreGif.style.transition='';highscoreGif.style.opacity='1';},900);
        },3200);
      }

      console.log(`Game Over | Score: ${finalScore} | High Score: ${best}`);
      return;
    }
  }

  requestAnimationFrame(loop);
}

// initialize
resizeCanvas();
