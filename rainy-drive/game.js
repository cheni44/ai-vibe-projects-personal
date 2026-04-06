'use strict';

// ─── Canvas ──────────────────────────────────────────────────────────────────
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const wrapper = document.getElementById('gameWrapper');

// applyLayout: positions wrapper and sets canvas buffer dimensions.
// On portrait mobile we rotate the wrapper -90° using exact pixel values so
// the game always renders landscape — more reliable than CSS media queries on
// iOS Safari where vw/vh inside a transformed fixed element misbehave.
function applyLayout() {
  const isMobile = navigator.maxTouchPoints > 0;
  const W = window.innerWidth, H = window.innerHeight;
  const portrait = H > W;

  if (isMobile && portrait) {
    // Wrapper: landscape box (H × W) rotated to fill the portrait screen
    Object.assign(wrapper.style, {
      position: 'fixed', top: H + 'px', left: '0px',
      right: 'auto',     bottom: 'auto',
      width: H + 'px',   height: W + 'px',
      transformOrigin: 'left top',
      transform: 'rotate(-90deg)',
    });
    canvas.width  = H;   // landscape width  = portrait height
    canvas.height = W;   // landscape height = portrait width
  } else {
    Object.assign(wrapper.style, {
      position: 'fixed', top: '0', left: '0',
      right: '0',        bottom: '0',
      width: '',         height: '',
      transformOrigin: '', transform: '',
    });
    canvas.width  = W;
    canvas.height = H;
  }
}
window.addEventListener('resize', applyLayout);
window.addEventListener('orientationchange', () => setTimeout(applyLayout, 150));
applyLayout();

// ─── Utilities ───────────────────────────────────────────────────────────────
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand  = (a, b)      => a + Math.random() * (b - a);
const pick  = arr         => arr[Math.floor(Math.random() * arr.length)];

// ─── Layout (fractions of screen) ────────────────────────────────────────────
// VP_Y=0.30 → horizon higher up, more road visible (closer driver POV)
// ROAD_HW=0.64 → wider perspective, more enveloping highway feel
// ROAD_BOTTOM=0.84 → slightly larger dashboard, more cabin immersion
const VP_Y        = 0.25;
const ROAD_BOTTOM = 0.84;
const ROAD_HW     = 0.68;

const vpX  = () => canvas.width  / 2;
const vpY  = () => canvas.height * VP_Y;
const botY = () => canvas.height * ROAD_BOTTOM;

// Perspective: z=0 → horizon (far), z=1 → player (near)
function projX(roadX, z) { return vpX() + roadX * canvas.width * ROAD_HW * z; }
function projY(z)         { return vpY() + (botY() - vpY()) * z; }

// ─── Game constants ───────────────────────────────────────────────────────────
const LANES        = [-0.60, 0, 0.60];
const CAR_HALF_W   = 0.13;
const CAR_H_PX     = 100;
const HIT_Z_MIN    = 0.80;
const HIT_Z_MAX    = 1.05;
const HIT_X_THRESH = CAR_HALF_W + 0.12;
const CAR_COLORS   = [
  '#c0392b','#e74c3c','#2980b9','#3498db',
  '#16a085','#1abc9c','#8e44ad','#9b59b6',
  '#d35400','#e67e22','#7f8c8d','#95a5a6',
];

// ─── Vehicle type definitions (個性化車輛) ────────────────────────────────────
// minLaneIdx: 0=可用全部車道, 1=不能用最左側車道(大卡車/遊覽車)
const VEHICLE_TYPES = [
  { type:'sedan',    label:'轎車',   baseKph:100, kphRange:10, minLaneIdx:0,
    wMult:1.00, hMult:1.00, weight:5,
    colors:['#c0392b','#e74c3c','#2980b9','#3498db','#16a085','#8e44ad','#d35400','#1a1a2e','#2c3e50'],
    brands:['Toyota','Honda','BMW','Benz','Audi','Nissan','Lexus','Kia'] },
  { type:'sports',   label:'跑車',   baseKph:120, kphRange:20, minLaneIdx:0,
    wMult:1.18, hMult:0.70, weight:2,
    colors:['#c0392b','#e74c3c','#f39c12','#8e44ad','#e67e22','#f1c40f','#1a1a2e'],
    brands:['Ferrari','Porsche','Lambo','BMW M','Benz AMG','Audi R8'] },
  { type:'van',      label:'貨車',   baseKph:90,  kphRange:5,  minLaneIdx:0,
    wMult:1.12, hMult:1.40, weight:3,
    colors:['#bdc3c7','#95a5a6','#7f8c8d','#d5d8dc','#aab7b8','#e8e8e8'],
    brands:['Ford','Isuzu','Toyota','Mercedes','Mitsubishi'] },
  { type:'bigtruck', label:'大卡車', baseKph:100, kphRange:10, minLaneIdx:1,
    wMult:1.52, hMult:2.20, weight:2,
    colors:['#aab7b8','#85929e','#626567','#d5d8dc','#f0b27a','#2c3e50'],
    brands:['Volvo','Scania','MAN','Benz','DAF'] },
  { type:'bus',      label:'遊覽車', baseKph:95,  kphRange:15, minLaneIdx:1,
    wMult:1.38, hMult:2.05, weight:2,
    colors:['#d4e6f1','#a9cce3','#f1948a','#82e0aa','#f8c471','#85c1e9','#eeeeee'],
    brands:['Mercedes','MAN','Setra','Volvo','NEOPLAN'] },
];
// ─── 後座乘客台詞 ─────────────────────────────────────────────────────────────
const PASSENGER_LINES = [
  { speaker: '老婆', text: '啊！小心！',     pitch: 1.5, rate: 1.3 },
  { speaker: '老婆', text: '你在幹嘛！',     pitch: 1.4, rate: 1.2 },
  { speaker: '老婆', text: '慢一點啦！',     pitch: 1.5, rate: 1.1 },
  { speaker: '老婆', text: '我的天哪！',     pitch: 1.6, rate: 1.3 },
  { speaker: '老婆', text: '嚇死我了！',     pitch: 1.4, rate: 1.2 },
  { speaker: '老婆', text: '你要命嗎！',     pitch: 1.5, rate: 1.4 },
  { speaker: '兒子', text: '爸爸前面有車！', pitch: 1.8, rate: 1.4 },
  { speaker: '兒子', text: '好可怕喔！',     pitch: 1.9, rate: 1.3 },
  { speaker: '兒子', text: '啊～我要下車！', pitch: 2.0, rate: 1.5 },
  { speaker: '兒子', text: '爸爸小心！',     pitch: 1.8, rate: 1.5 },
  { speaker: '兒子', text: '撞到了啦！',     pitch: 2.0, rate: 1.6 },
];

function pickVehicleType() {
  const total = VEHICLE_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of VEHICLE_TYPES) { r -= t.weight; if (r <= 0) return t; }
  return VEHICLE_TYPES[0];
}

// ─── Scene configs for 國道一號 segments ─────────────────────────────────────
function seededRand(seed) {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}
const SCENE_CONFIGS = {
  urban_north: {
    label: '北部都市段',
    skyColors: ['#485060','#637580','#8ea0ac','#aabbc5'],
    grassRGB: [45, 68, 40], treePineFrac: 0.28, hasBuildings: true,
    buildingRGBA: 'rgba(62,72,82,0.52)',
    mountainRGBA: 'rgba(98,110,120,0.40)', hillRGBA: 'rgba(70,88,80,0.50)',
  },
  suburban: {
    label: '桃竹苗段',
    skyColors: ['#505e6c','#70848e','#9eaeb8','#bbc8ce'],
    grassRGB: [52, 78, 44], treePineFrac: 0.55, hasBuildings: false,
    buildingRGBA: null,
    mountainRGBA: 'rgba(110,126,136,0.42)', hillRGBA: 'rgba(78,100,88,0.50)',
  },
  plains: {
    label: '中部平原段',
    skyColors: ['#4e5e78','#6e88a2','#94b2c6','#b4cad8'],
    grassRGB: [60, 90, 50], treePineFrac: 0.44, hasBuildings: false,
    buildingRGBA: null,
    mountainRGBA: 'rgba(108,126,142,0.36)', hillRGBA: 'rgba(84,106,94,0.48)',
  },
  flatlands: {
    label: '雲嘉平原段',
    skyColors: ['#576678','#768696','#a0b0ba','#bccad0'],
    grassRGB: [66, 94, 54], treePineFrac: 0.28, hasBuildings: false,
    buildingRGBA: null,
    mountainRGBA: 'rgba(115,130,138,0.26)', hillRGBA: 'rgba(88,108,98,0.36)',
  },
  tropical: {
    label: '南部都市段',
    skyColors: ['#486070','#6888a0','#96b2c0','#b8d0d8'],
    grassRGB: [50, 100, 44], treePineFrac: 0.12, hasBuildings: true,
    buildingRGBA: 'rgba(60,70,78,0.48)',
    mountainRGBA: 'rgba(100,118,128,0.32)', hillRGBA: 'rgba(74,98,84,0.50)',
  },
};
let currentSceneKey = 'plains';

// ─── Web Audio rain & thunder ────────────────────────────────────────────────
let audioCtx = null, rainGainNode = null, masterGainNode = null, noiseBuf = null;

function initAudio() {
  if (audioCtx) { audioCtx.resume(); return; }
  try {
    audioCtx       = new (window.AudioContext || window.webkitAudioContext)();
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = 0.82;
    masterGainNode.connect(audioCtx.destination);

    // Long noise buffer for variety
    const rate = audioCtx.sampleRate;
    noiseBuf   = audioCtx.createBuffer(1, rate * 8, rate);
    const d    = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    rainGainNode = audioCtx.createGain();
    rainGainNode.gain.value = 1.1;

    // ── Car-cabin reverb: small-room delay + feedback ──────────────────────
    // Simulates the enclosed resonance of the car interior
    const cabDelay = audioCtx.createDelay(0.20);
    cabDelay.delayTime.value = 0.058;   // 58 ms room reflection
    const cabFB    = audioCtx.createGain(); cabFB.gain.value = 0.20; // 20% feedback
    const cabWet   = audioCtx.createGain(); cabWet.gain.value = 0.30; // wet mix
    cabDelay.connect(cabFB); cabFB.connect(cabDelay); // feedback loop
    cabDelay.connect(cabWet); cabWet.connect(masterGainNode);

    // Low-cut to remove sub-bass rumble that muddies indoor sound
    const hiPass = audioCtx.createBiquadFilter();
    hiPass.type = 'highpass'; hiPass.frequency.value = 55;

    rainGainNode.connect(hiPass);
    hiPass.connect(cabDelay);          // wet path → reverb
    hiPass.connect(masterGainNode);    // dry path

    function addLayer(type, freq, Q, vol) {
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const flt = audioCtx.createBiquadFilter();
      flt.type = type; flt.frequency.value = freq;
      if (Q !== null) flt.Q.value = Q;
      const gn = audioCtx.createGain(); gn.gain.value = vol;
      src.connect(flt); flt.connect(gn); gn.connect(rainGainNode);
      src.start();
    }
    // In-car rain profile (heard through metal roof & glass, muffled):
    addLayer('bandpass',  340, 2.8, 0.42);   // heavy drumming on metal roof
    addLayer('bandpass',  620, 2.2, 0.30);   // secondary hood/pillars tap
    addLayer('bandpass',  950, 3.0, 0.18);   // muffled windshield glass patter
    addLayer('lowpass',   160, null, 0.22);  // cabin ambient low-frequency body
    addLayer('lowpass',    55, null, 0.10);  // wind pressure buffet (sub-bass)
  } catch(e) { console.warn('Audio unavailable:', e); }
}

// Single heavy raindrop thudding on metal roof
function playRoofDrop() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 480;
    osc.type = 'sine';
    const t = audioCtx.currentTime;
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.14);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.45 + (g?.rainIntensity ?? 1) * 0.25, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(flt); flt.connect(env); env.connect(masterGainNode);
    osc.start(t); osc.stop(t + 0.28);
  } catch(_) {}
}

function updateAudioIntensity() {
  if (!rainGainNode || !audioCtx) return;
  rainGainNode.gain.setTargetAtTime(
    clamp(g.rainIntensity * 0.95, 0.4, 2.2), audioCtx.currentTime, 0.5);
}

function playThunder() {
  if (!audioCtx) return;
  try {
    const rate = audioCtx.sampleRate;
    const dur  = 2.8 + Math.random() * 2.2;
    const tbuf = audioCtx.createBuffer(1, Math.ceil(rate * (dur + 0.6)), rate);
    const td   = tbuf.getChannelData(0);
    for (let i = 0; i < td.length; i++) td[i] = Math.random() * 2 - 1;

    const src  = audioCtx.createBufferSource(); src.buffer = tbuf;
    const flt  = audioCtx.createBiquadFilter();
    flt.type   = 'lowpass'; flt.frequency.value = 155;
    const env  = audioCtx.createGain();
    const t    = audioCtx.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(3.0, t + 0.04);
    env.gain.setValueAtTime(3.0, t + 0.04 + Math.random() * 0.25);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(env); env.connect(masterGainNode);
    src.start(t); src.stop(t + dur + 0.1);
  } catch(_) {}
}

// ─── Blinker sound (方向燈聲音) ───────────────────────────────────────────────
function playBlinkerTick(highTone) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = highTone ? 1320 : 880;
    const t = audioCtx.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.10, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    osc.connect(env); env.connect(masterGainNode);
    osc.start(t); osc.stop(t + 0.08);
  } catch(_) {}
}

// ─── Tilt control (disabled — use buttons only) ───────────────────────────────
const tiltX = 0; // kept as constant for legacy references

// ─── Wind system ─────────────────────────────────────────────────────────────
const wind = { vx: -12, nextGust: rand(2, 5), gustTimer: 0, gustStrength: 0 };
function resetWind() { wind.vx = -12; wind.nextGust = rand(2,5); wind.gustTimer = 0; wind.gustStrength = 0; }
function updateWind(dt) {
  wind.nextGust -= dt;
  if (wind.nextGust <= 0) {
    wind.gustStrength = rand(1.2, 3.2);
    wind.gustTimer    = rand(1.5, 5.0);
    wind.nextGust     = rand(4, 12);
  }
  if (wind.gustTimer > 0) { wind.gustTimer -= dt; wind.vx = lerp(wind.vx, -wind.gustStrength * 20, dt * 3); }
  else                     { wind.vx = lerp(wind.vx, -12, dt * 0.8); }
}

// ─── State ───────────────────────────────────────────────────────────────────
let g = {}, running = false, lastTime = 0, bestScore = 0;

function initGame() {
  resetWind();
  g = {
    playerX: 0,
    // ── 車道系統 ───────────────────────────────────────────────────────────────
    laneIdx:       1,   // 0=左, 1=中, 2=右 (起始在中間)
    targetLaneIdx: 1,
    laneProgress:  0,
    laneState:     'idle',  // 'idle' | 'changing' | 'canceling'
    laneDir:       0,       // -1=左 | 0=無 | 1=右
    prevLeft:      false,
    prevRight:     false,
    cars: [],
    rainFar: [], rainMid: [], rainNear: [],
    wsDrop: [], wsSheets: [], rainCurtains: [],
    splashes: [],
    puddles: [
      { x: -0.28, z: 0.52, w: 0.20, d: 0.050 },
      { x:  0.50, z: 0.66, w: 0.24, d: 0.065 },
      { x: -0.58, z: 0.80, w: 0.28, d: 0.070 },
      { x:  0.12, z: 0.38, w: 0.17, d: 0.040 },
      { x: -0.08, z: 0.72, w: 0.14, d: 0.035 },
    ],
    score: 0, speed: 1, throttle: 1.0, wiperSpeedMult: 1.0,
    rainIntensity: 1.6, intensityTarget: 1.6, intensityTimer: 0,
    alive: true, time: 0, spawnT: 0,
    wiperA: -0.45, wiperDir: 1,
    lightning: 0, lightningNext: rand(3, 8),
    blinkerDir: 0, blinkerFlash: 0, blinkerOn: false,
    blinkerFlashCount: 0,
    sceneConfig: SCENE_CONFIGS[currentSceneKey] || SCENE_CONFIGS.plains,
    keys: {},
  };

  // Clouds for daytime sky
  g.clouds = Array.from({length: 7}, () => ({
    x:     rand(0, 1.1),
    y:     rand(0.12, 0.82),
    w:     rand(0.18, 0.46),
    h:     rand(0.08, 0.18),
    speed: rand(0.008, 0.022),
    alpha: rand(0.28, 0.52),
    dark:  rand(0.55, 0.80),
  }));
  // Roadside trees
  g.trees = [];
  for (let i = 0; i < 18; i++) g.trees.push(makeTreeRow(i / 18));

  for (let i = 0; i < 640; i++) g.rainFar.push(newRainFar(true));
  for (let i = 0; i < 340; i++) g.rainMid.push(newRainMid(true));
  for (let i = 0; i < 150; i++) g.rainNear.push(newRainNear(true));
  for (let i = 0; i < 42;  i++) g.wsDrop.push(newWsDrop(true));
  for (let i = 0; i < 5;   i++) g.rainCurtains.push(newRainCurtain(true));

  // 預先填充高速公路上的車輛（分散在不同距離）
  [0.12, 0.22, 0.34, 0.47, 0.60].forEach(z => { if (Math.random() < 0.60) spawnCar(z); });

  // 後座乘客狀態
  g.screamCooldown = 7.0;           // 開始後 7 秒安靜
  g.screamDisplay  = { text: '', timer: 0 };
}

// ─── Factories ───────────────────────────────────────────────────────────────
function newRainFar(init = false) {
  return {
    x: rand(0, canvas.width),
    y: init ? rand(0, canvas.height * 0.82) : rand(-28, canvas.height * (VP_Y + 0.10)),
    vy: rand(10, 20), len: rand(5, 16), alpha: rand(0.14, 0.34),
  };
}
function newRainMid(init = false) {
  return {
    x: rand(0, canvas.width),
    y: init ? rand(0, canvas.height) : -22,
    vy: rand(20, 38), len: rand(16, 38), alpha: rand(0.25, 0.58),
  };
}
function newRainNear(init = false) {
  return {
    x: rand(0, canvas.width),
    y: init ? rand(0, canvas.height) : -32,
    vy: rand(36, 62), len: rand(40, 82), alpha: rand(0.40, 0.75),
  };
}
function newWsDrop(init = false) {
  return {
    x:         rand(canvas.width * 0.10, canvas.width * 0.90),
    y:         init ? rand(canvas.height * 0.06, canvas.height * 0.80)
                    : rand(canvas.height * 0.06, canvas.height * 0.54),
    size:      rand(2, 7),
    phase:     (init && Math.random() < 0.40) ? 'streak' : 'idle',
    idleTimer: rand(0.12, 1.6),
    vy: 0, drift: rand(-14, 14),
    trail: [],
  };
}
function newRainCurtain(init = false) {
  return {
    x:     init ? rand(0, canvas.width) : (Math.random() < 0.5 ? -500 : canvas.width + 500),
    w:     rand(180, 480),
    speed: rand(45, 120) * (Math.random() < 0.5 ? -1 : 1),
    alpha: rand(0.07, 0.22),
  };
}
function makeTreeRow(z) {
  return {
    z,
    xL:    -(0.72 + rand(0.10, 0.20)),
    xR:     (0.72 + rand(0.10, 0.20)),
    sizeK:  rand(0.10, 0.18),
    type:   Math.random() < 0.55 ? 'pine' : 'round',
  };
}
function updateTrees(dt) {
  const spd = 0.52 * g.speed * g.throttle;
  for (let i = 0; i < g.trees.length; i++) {
    g.trees[i].z += spd * dt;
    if (g.trees[i].z > 1.02) g.trees[i] = makeTreeRow(rand(0, 0.05));
  }
}
function spawnCar(initZ = 0.02) {
  const vtype = pickVehicleType();
  // 大卡車/遊覽車 不占最左側車道 (minLaneIdx=1 → 只能用 LANES[1], LANES[2])
  const availableLanes = LANES.slice(vtype.minLaneIdx);
  const lane = pick(availableLanes);
  if (g.cars.some(c => Math.abs(c.x - lane) < 0.05 && Math.abs(c.z - initZ) < 0.15)) return;
  const kph = vtype.baseKph + (Math.random() * 2 - 1) * vtype.kphRange;
  g.cars.push({
    x: lane, z: initZ,
    color: pick(vtype.colors),
    brand: pick(vtype.brands),
    type:  vtype.type,
    label: vtype.label,
    kph,
    wMult: vtype.wMult,
    hMult: vtype.hMult,
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(dt) {
  if (!g.alive) return;
  dt = Math.min(dt, 0.05);
  g.time  += dt;
  g.score  = Math.floor(g.time * 12 * Math.max(0.5, g.throttle));
  g.speed  = 1 + g.time * 0.022;  // 較慢加速，初始 100 km/h

  if (g.keys.speedUp)   g.throttle       = Math.min(2.0, g.throttle       + dt * 0.7);
  if (g.keys.speedDown) g.throttle       = Math.max(0.4, g.throttle       - dt * 0.7);
  if (g.keys.wiperUp)   g.wiperSpeedMult = Math.min(3.0, g.wiperSpeedMult + dt * 1.5);
  if (g.keys.wiperDown) g.wiperSpeedMult = Math.max(0.3, g.wiperSpeedMult - dt * 1.5);

  g.intensityTimer -= dt;
  if (g.intensityTimer <= 0) {
    g.intensityTarget = rand(1.0, 2.8);
    g.intensityTimer  = rand(3, 10);
  }
  g.rainIntensity = lerp(g.rainIntensity, g.intensityTarget, dt * 0.45);

  updateAudioIntensity();
  updateWind(dt);
  updatePlayer(dt);
  updateCars(dt);
  updateRain(dt);
  updateWindshield(dt);
  updateWipers(dt);
  updateLightning(dt);
  updateSplashes(dt);
  maybeScream(dt);
  updateTrees(dt);
  for (const c of g.clouds) { c.x -= c.speed * dt; if (c.x + c.w < -0.1) c.x = 1.1; }
}

function updatePlayer(dt) {
  // ── 邊緣偵測：只偵測「按下」的那一幀，不偵測持續按住 ──────────────────────
  const nowLeft  = g.keys['ArrowLeft']  || g.keys['a'] || g.keys['A'] || g.keys.touchLeft;
  const nowRight = g.keys['ArrowRight'] || g.keys['d'] || g.keys['D'] || g.keys.touchRight;
  const tapLeft  = nowLeft  && !g.prevLeft;
  const tapRight = nowRight && !g.prevRight;
  g.prevLeft  = nowLeft;
  g.prevRight = nowRight;

  const LANE_CHANGE_SPD = 1 / 3.0; // 換道需 3 秒（方向燈閃 3+ 下）
  const LANE_CANCEL_SPD = 2.2;     // 取消換道快速退回

  // ── 車道狀態機 ──────────────────────────────────────────────────────────────
  if (g.laneState === 'idle') {
    if (tapLeft  && g.laneIdx > 0) {
      g.targetLaneIdx = g.laneIdx - 1;
      g.laneProgress  = 0;
      g.laneState     = 'changing';
      g.laneDir       = -1;
    } else if (tapRight && g.laneIdx < LANES.length - 1) {
      g.targetLaneIdx = g.laneIdx + 1;
      g.laneProgress  = 0;
      g.laneState     = 'changing';
      g.laneDir       = 1;
    }
  } else if (g.laneState === 'changing') {
    // 按反方向 → 取消，回到原本車道
    if ((tapRight && g.laneDir === -1) || (tapLeft && g.laneDir === 1)) {
      g.laneState = 'canceling';
    } else {
      g.laneProgress = Math.min(1, g.laneProgress + dt * LANE_CHANGE_SPD);
      if (g.laneProgress >= 1) {
        g.laneIdx      = g.targetLaneIdx;
        g.laneProgress = 0;
        g.laneState    = 'idle';
      }
    }
  } else if (g.laneState === 'canceling') {
    // 退回原始車道
    g.laneProgress = Math.max(0, g.laneProgress - dt * LANE_CANCEL_SPD);
    if (g.laneProgress <= 0) {
      g.targetLaneIdx = g.laneIdx;
      g.laneState     = 'idle';
      g.laneDir       = 0;
    }
  }

  // playerX 由車道插值決定
  g.playerX = lerp(LANES[g.laneIdx], LANES[g.targetLaneIdx], g.laneProgress);

  // ── 方向燈：換道時亮，取消/完成時熄 ────────────────────────────────────────
  if (g.laneState === 'changing') {
    if (g.blinkerDir !== g.laneDir) {
      g.blinkerDir        = g.laneDir;
      g.blinkerFlash      = 0;
      g.blinkerFlashCount = 0;
    }
    const CYCLE = 0.72;
    g.blinkerFlash += dt;
    const wasOn = g.blinkerOn;
    g.blinkerOn = (g.blinkerFlash % CYCLE) < CYCLE * 0.5;
    if (g.blinkerOn && !wasOn) { g.blinkerFlashCount++; playBlinkerTick(g.blinkerFlashCount % 2 === 1); }
  } else {
    g.blinkerDir = 0;
    g.blinkerOn  = false;
  }
}

function updateCars(dt) {
  g.spawnT -= dt;
  if (g.spawnT <= 0) {
    spawnCar();
    g.spawnT = Math.max(0.5, rand(1.6, 2.8) / Math.sqrt(g.speed * g.throttle));
  }
  const playerKph = (62 + g.speed * 38) * g.throttle;
  const refSpd    = 0.52 * g.speed * g.throttle;
  for (let i = g.cars.length - 1; i >= 0; i--) {
    const c = g.cars[i];
    // 純速差模型：只有「玩家速度 − 車輛速度」才決定靠近或遠去
    // 玩家較快 → 該車接近 (z↑)；車輛較快 → 遠去 (z↓)
    const approachRate = refSpd * (playerKph - c.kph) / 15;
    c.z += approachRate * dt;
    // 碰撞閾值依車寬縮放
    const hitThresh = CAR_HALF_W * c.wMult + CAR_HALF_W * 0.85;
    if (c.z >= HIT_Z_MIN && c.z <= HIT_Z_MAX && Math.abs(c.x - g.playerX) < hitThresh) {
      g.alive = false; showGameOver(); return;
    }
    if (c.z > 1.15 || c.z < -0.04) g.cars.splice(i, 1);
  }
}

function updateRain(dt) {
  const sp = g.speed * g.throttle, ri = g.rainIntensity;

  // Wrap horizontally instead of random-respawn, so rain stays evenly distributed
  for (const r of g.rainFar) {
    r.x += wind.vx * dt * 60 * 0.22;
    r.y += r.vy * dt * 60 * sp * ri * 0.50;
    if      (r.y > canvas.height * (VP_Y + 0.12)) { Object.assign(r, newRainFar()); }
    else if (r.x < -50)                { r.x = canvas.width  + 50; }
    else if (r.x > canvas.width + 50)  { r.x = -50; }
  }
  for (const r of g.rainMid) {
    r.x += wind.vx * dt * 60 * 0.58;
    r.y += r.vy * dt * 60 * sp * ri;
    if      (r.y > canvas.height + 30) { Object.assign(r, newRainMid()); }
    else if (r.x < -60)                { r.x = canvas.width  + 60; }
    else if (r.x > canvas.width + 60)  { r.x = -60; }
  }
  for (const r of g.rainNear) {
    r.x += wind.vx * dt * 60;
    r.y += r.vy * dt * 60 * sp * ri * 1.1;
    if      (r.y > canvas.height + 45) { Object.assign(r, newRainNear()); }
    else if (r.x < -80)                { r.x = canvas.width  + 80; }
    else if (r.x > canvas.width + 80)  { r.x = -80; }
  }
  for (const c of g.rainCurtains) {
    c.x += c.speed * dt;
    if (c.x >  canvas.width + c.w + 300) c.x = -c.w - 300;
    if (c.x < -c.w - 300)                c.x =  canvas.width + c.w + 300;
  }
  if (Math.random() < dt * 28 * ri)
    g.splashes.push({ x: rand(-0.88, 0.88), z: rand(0.18, 0.95), t: 0, life: rand(0.14, 0.38) });

  // Random heavy drops thumping on metal roof
  if (Math.random() < dt * 3.5 * ri) playRoofDrop();
}

function updateWindshield(dt) {
  if (Math.random() < g.rainIntensity * 5.0 * dt && g.wsDrop.length < 80)
    g.wsDrop.push(newWsDrop(false));

  for (let i = g.wsDrop.length - 1; i >= 0; i--) {
    const d = g.wsDrop[i];
    if (d.phase === 'idle') {
      d.idleTimer -= dt;
      if (d.idleTimer <= 0) { d.phase = 'streak'; d.vy = rand(90, 270) * g.rainIntensity; }
    } else {
      d.y += d.vy * dt; d.x += d.drift * dt;
      d.trail.push({ x: d.x, y: d.y });
      if (d.trail.length > 26) d.trail.shift();
      if (d.y > canvas.height * ROAD_BOTTOM + 22) g.wsDrop.splice(i, 1);
    }
  }
  if (Math.random() < g.rainIntensity * 0.8 * dt && g.wsSheets.length < 7)
    g.wsSheets.push({ y: canvas.height * 0.065, speed: rand(100, 280), alpha: rand(0.06, 0.20), h: rand(8, 28) });
  for (let i = g.wsSheets.length - 1; i >= 0; i--) {
    g.wsSheets[i].y += g.wsSheets[i].speed * dt;
    if (g.wsSheets[i].y > canvas.height * ROAD_BOTTOM) g.wsSheets.splice(i, 1);
  }
  clearWiperDrops();
}

function clearWiperDrops() {
  const W = canvas.width, H = canvas.height;
  const pivY = botY() + H * 0.020, len = W * 0.44;
  for (const d of g.wsDrop) {
    if (d.phase === 'streak') continue;
    if (isNearBlade(d.x, d.y, W*0.14, pivY,  g.wiperA, len) ||
        isNearBlade(d.x, d.y, W*0.86, pivY, -g.wiperA, len))
      { d.phase = 'streak'; d.vy = rand(150, 320); }
  }
}
function isNearBlade(px, py, bx, by, angle, len) {
  const ex = bx+Math.sin(angle)*len, ey = by-Math.cos(angle)*len;
  const dx = ex-bx, dy = ey-by, l2 = dx*dx+dy*dy;
  if (!l2) return false;
  const t = clamp(((px-bx)*dx+(py-by)*dy)/l2, 0, 1);
  return Math.hypot(px-(bx+t*dx), py-(by+t*dy)) < 22;
}

function updateWipers(dt) {
  // Sweep from -0.45 (outer edge, behind A-pillar) to +0.85 (past centre)
  const spd = Math.PI * 1.1 * Math.sqrt(g.speed) * g.wiperSpeedMult;
  g.wiperA += g.wiperDir * spd * dt;
  if (g.wiperA >  0.85) { g.wiperA =  0.85; g.wiperDir = -1; }
  if (g.wiperA < -0.45) { g.wiperA = -0.45; g.wiperDir =  1; }
}

function updateLightning(dt) {
  g.lightningNext -= dt;
  if (g.lightningNext <= 0) {
    g.lightning     = 0.20;
    g.lightningNext = rand(3, 11) / g.rainIntensity;
    playThunder();
  }
  if (g.lightning > 0) g.lightning = Math.max(0, g.lightning - dt * 5);
}
function updateSplashes(dt) {
  for (let i = g.splashes.length - 1; i >= 0; i--) {
    g.splashes[i].t += dt;
    if (g.splashes[i].t > g.splashes[i].life) g.splashes.splice(i, 1);
  }
}

// ─── 後座乘客尖叫 ─────────────────────────────────────────────────────────────
function maybeScream(dt) {
  if (!g.alive) return;
  // 永遠更新字幕計時器
  if (g.screamDisplay.timer > 0) g.screamDisplay.timer -= dt;
  // 冷卻中
  if (g.screamCooldown > 0) { g.screamCooldown -= dt; return; }

  // 計算尖叫機率
  const closeCar = g.cars.find(c =>
    Math.abs(c.x - g.playerX) < CAR_HALF_W * c.wMult + 0.22 &&
    c.z >= 0.52 && c.z < HIT_Z_MIN
  );
  let chance = dt * 0.004;                               // 背景低機率（隨機偶爾）
  if (closeCar)          chance = dt * 2.2;              // 同車道有近車 → 高機率
  if (g.lightning > 0.12) chance = Math.max(chance, dt * 0.55); // 閃電驚嚇

  if (Math.random() > chance) return;

  const line = pick(PASSENGER_LINES);
  g.screamDisplay  = { text: `${line.speaker}：「${line.text}」`, timer: 2.8 };
  g.screamCooldown = 5.0 + Math.random() * 6.0;

  try {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(line.text);
      utt.lang   = 'zh-TW';
      utt.rate   = line.rate;
      utt.pitch  = line.pitch;
      utt.volume = 0.95;
      speechSynthesis.speak(utt);
    }
  } catch(_) {}
}

// ─── Draw: Sky (daytime overcast, scene-aware) ───────────────────────────────
function drawSky() {
  const W = canvas.width, H = canvas.height, vy = vpY();
  const sc = g.sceneConfig || SCENE_CONFIGS.plains;
  const [c0, c1, c2, c3] = sc.skyColors;
  const sky = ctx.createLinearGradient(0, 0, 0, vy);
  sky.addColorStop(0,    c0);
  sky.addColorStop(0.40, c1);
  sky.addColorStop(0.80, c2);
  sky.addColorStop(1,    c3);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, vy + 2);
  drawClouds(vy);
  const fog = ctx.createLinearGradient(0, vy - H*0.12, 0, vy + H*0.06);
  fog.addColorStop(0,   'rgba(190,210,220,0)');
  fog.addColorStop(0.5, `rgba(200,215,225,${0.28 + g.rainIntensity * 0.10})`);
  fog.addColorStop(1,   'rgba(190,210,220,0)');
  ctx.fillStyle = fog; ctx.fillRect(0, vy - H*0.12, W, H*0.18);
}

function drawClouds(vy) {
  if (!g.clouds) return;
  const W = canvas.width;
  ctx.save();
  for (const c of g.clouds) {
    const cx = c.x * W;
    const cy = c.y * vy;
    const cw = c.w * W;
    const ch = c.h * vy;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) * 0.55);
    const dc = Math.round(c.dark * 255);
    gr.addColorStop(0,   `rgba(${dc},${dc+6},${dc+12},${c.alpha})`);
    gr.addColorStop(0.65,`rgba(${dc},${dc+6},${dc+12},${c.alpha * 0.7})`);
    gr.addColorStop(1,   `rgba(${dc},${dc+6},${dc+12},0)`);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw * 0.5, ch * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Second lobe for fluffy look
    ctx.beginPath();
    ctx.ellipse(cx - cw*0.22, cy + ch*0.08, cw*0.35, ch*0.40, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + cw*0.20, cy + ch*0.12, cw*0.30, ch*0.38, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Draw: Background (mountains + distant treeline + city buildings) ─────────
function drawBackground() {
  const W = canvas.width, vy = vpY();
  const sc = g.sceneConfig || SCENE_CONFIGS.plains;
  ctx.save();
  // Far mountains
  ctx.fillStyle = sc.mountainRGBA;
  ctx.beginPath(); ctx.moveTo(0, vy);
  const m1 = [[0,0],[0.06,-0.09],[0.13,-0.03],[0.21,-0.10],[0.29,-0.04],
               [0.37,-0.11],[0.45,-0.02],[0.53,-0.09],[0.61,-0.04],
               [0.69,-0.12],[0.77,-0.03],[0.85,-0.10],[0.93,-0.04],[1,-0.07],[1,0]];
  for (const [px,py] of m1) ctx.lineTo(px*W, vy + py*vy);
  ctx.closePath(); ctx.fill();
  // Nearer hills
  ctx.fillStyle = sc.hillRGBA;
  ctx.beginPath(); ctx.moveTo(0, vy);
  const m2 = [[0,0],[0.04,-0.06],[0.10,-0.02],[0.18,-0.07],[0.26,-0.03],
               [0.34,-0.06],[0.42,-0.01],[0.50,-0.05],[0.58,-0.02],
               [0.66,-0.07],[0.74,-0.02],[0.82,-0.06],[0.90,-0.02],[1,-0.05],[1,0]];
  for (const [px,py] of m2) ctx.lineTo(px*W, vy + py*vy);
  ctx.closePath(); ctx.fill();
  // City buildings (urban_north / tropical)
  if (sc.hasBuildings && sc.buildingRGBA) {
    ctx.fillStyle = sc.buildingRGBA;
    let x = 0;
    while (x < W * 0.36) {
      const bw = Math.max(5, W * (0.030 + seededRand(x * 0.01) * 0.036));
      const bh = vy * (0.18 + seededRand(x * 0.01 + 3) * 0.58);
      ctx.fillRect(x, vy - bh, bw - 1, bh);
      x += bw + seededRand(x * 0.01 + 7) * W * 0.006 + 1;
    }
    x = W * 0.64;
    while (x < W) {
      const bw = Math.max(5, W * (0.030 + seededRand(x * 0.01 + 100) * 0.036));
      const bh = vy * (0.18 + seededRand(x * 0.01 + 103) * 0.58);
      ctx.fillRect(x, vy - bh, Math.min(bw - 1, W - x), bh);
      x += bw + seededRand(x * 0.01 + 107) * W * 0.006 + 1;
    }
  }
  // Distant treeline silhouette
  const [gr, gg, gb] = sc.grassRGB;
  ctx.fillStyle = `rgba(${gr-20},${gg-22},${gb-18},0.72)`;
  ctx.beginPath(); ctx.moveTo(0, vy + 2);
  for (let x = 0; x <= W; x += Math.max(3, W * 0.008)) {
    const h = Math.sin(x*0.006)*0.022 + Math.sin(x*0.019)*0.014 + Math.sin(x*0.041)*0.008;
    ctx.lineTo(x, vy - h * vy + 2);
  }
  ctx.lineTo(W, vy + 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ─── Draw: Roadside (grass + shoulder + guardrails, scene-aware) ─────────────
function drawRoadside() {
  const W = canvas.width, vx = vpX(), vy = vpY(), by = botY();
  const rw = W * ROAD_HW, pOff = g.playerX;
  const sc = g.sceneConfig || SCENE_CONFIGS.plains;
  const [gr, gg, gb] = sc.grassRGB;
  ctx.save();
  const gL = ctx.createLinearGradient(0, vy, 0, by);
  gL.addColorStop(0, `rgba(${gr},${gg},${gb},0.88)`);
  gL.addColorStop(1, `rgba(${gr-8},${gg-10},${gb-6},0.95)`);
  ctx.fillStyle = gL;
  ctx.beginPath();
  ctx.moveTo(vx, vy); ctx.lineTo(vx - rw, by); ctx.lineTo(0, by); ctx.lineTo(0, vy);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(vx, vy); ctx.lineTo(vx + rw, by); ctx.lineTo(W, by); ctx.lineTo(W, vy);
  ctx.closePath(); ctx.fill();
  // Guardrail beam
  ctx.strokeStyle = 'rgba(168,175,182,0.62)';
  ctx.lineWidth = Math.max(1.5, W * 0.004);
  ctx.beginPath(); ctx.moveTo(projX(-0.74-pOff,0.04),projY(0.04)); ctx.lineTo(projX(-0.74-pOff,0.92),projY(0.92)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(projX(+0.74-pOff,0.04),projY(0.04)); ctx.lineTo(projX(+0.74-pOff,0.92),projY(0.92)); ctx.stroke();
  for (let i = 1; i <= 10; i++) {
    const z = i / 10, posY = projY(z), ph = Math.max(1.5, z * 9);
    const lx = projX(-0.74 - pOff, z), rx = projX(+0.74 - pOff, z);
    ctx.fillStyle = `rgba(155,162,170,${0.35 + z * 0.45})`;
    ctx.fillRect(lx - z*2.5, posY - ph, z*5, ph);
    ctx.fillRect(rx - z*2.5, posY - ph, z*5, ph);
  }
  ctx.restore();
}

// ─── Draw: Roadside trees ─────────────────────────────────────────────────────
function drawTree(x, y, sz, type) {
  if (sz < 2) return;
  if (type === 'pine') {
    // Two tiers of triangular foliage
    ctx.fillStyle = 'rgba(28,62,32,0.92)';
    ctx.beginPath();
    ctx.moveTo(x, y - sz); ctx.lineTo(x - sz*0.44, y); ctx.lineTo(x + sz*0.44, y);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - sz*0.70); ctx.lineTo(x - sz*0.56, y - sz*0.22); ctx.lineTo(x + sz*0.56, y - sz*0.22);
    ctx.closePath(); ctx.fill();
    // Trunk
    ctx.fillStyle = 'rgba(55,38,22,0.82)';
    ctx.fillRect(x - sz*0.055, y, sz*0.11, sz*0.22);
  } else {
    // Round deciduous
    ctx.fillStyle = 'rgba(42,78,38,0.90)';
    ctx.beginPath(); ctx.ellipse(x, y - sz*0.58, sz*0.44, sz*0.54, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(28,60,26,0.48)';
    ctx.beginPath(); ctx.ellipse(x + sz*0.12, y - sz*0.52, sz*0.32, sz*0.40, 0.4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(60,42,24,0.82)';
    ctx.fillRect(x - sz*0.055, y - sz*0.08, sz*0.11, sz*0.28);
  }
}
function drawRoadsideTrees() {
  if (!g.trees) return;
  const pOff = g.playerX;
  const sc   = g.sceneConfig || SCENE_CONFIGS.plains;
  const sorted = [...g.trees].sort((a,b) => a.z - b.z);
  for (const t of sorted) {
    if (t.z < 0.05 || t.z > 0.96) continue;
    // Re-evaluate tree type based on scene (use stored type but bias toward scene)
    const effectiveType = (Math.random() < sc.treePineFrac) ? 'pine' : 'round';
    const ty = projY(t.z);
    const sz = t.z * canvas.height * t.sizeK;
    const fogA = Math.min(0.92, t.z * 1.3);
    ctx.save(); ctx.globalAlpha = fogA;
    const lx = projX(t.xL - pOff, t.z);
    if (lx > -sz * 2 && lx < canvas.width + sz) drawTree(lx, ty, sz, t.type);
    const rx = projX(t.xR - pOff, t.z);
    if (rx > -sz && rx < canvas.width + sz * 2) drawTree(rx, ty, sz, t.type);
    ctx.restore();
  }
}

// ─── Draw: Road (all content shifted by -playerX for first-person perspective)
function drawRoad() {
  const W = canvas.width, vx = vpX(), vy = vpY(), by = botY(), rw = W * ROAD_HW;
  const pOff = g.playerX;  // FIX: offset everything by player position

  // Road surface — daytime grey wet asphalt
  const road = ctx.createLinearGradient(vx, vy, vx, by);
  road.addColorStop(0, '#484848'); road.addColorStop(1, '#565656');
  ctx.fillStyle = road;
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx+rw, by); ctx.lineTo(vx-rw, by); ctx.closePath(); ctx.fill();

  drawRoadWaterChannels(vx, vy, by, rw, pOff);
  drawPuddles(pOff);

  const sheen = ctx.createLinearGradient(vx, vy, vx, by);
  sheen.addColorStop(0,    'rgba(140,170,195,0)');
  sheen.addColorStop(0.65, `rgba(140,170,195,${0.10 + g.rainIntensity*0.07})`);
  sheen.addColorStop(1,    `rgba(160,195,220,${0.25 + g.rainIntensity*0.12})`);
  ctx.fillStyle = sheen;
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx+rw, by); ctx.lineTo(vx-rw, by); ctx.closePath(); ctx.fill();

  drawSplashRings(pOff);

  // Lane dividers shifted by playerX
  for (const lx of [-1/3, 1/3]) {
    for (let i = 0; i < 18; i++) {
      const z0 = i/18, z1 = (i+0.46)/18;
      ctx.strokeStyle = 'rgba(192,192,192,0.50)';
      ctx.lineWidth = Math.max(0.5, 2*z1);
      ctx.beginPath();
      ctx.moveTo(projX(lx - pOff, z0), projY(z0));
      ctx.lineTo(projX(lx - pOff, z1), projY(z1));
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(215,215,215,0.65)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx+rw, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx-rw, by); ctx.stroke();
}

function drawRoadWaterChannels(vx, vy, by, rw, pOff) {
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const z = 0.22 + i * 0.10;
    const cy = vy + (by - vy) * z;
    const hw = rw * z;
    ctx.strokeStyle = `rgba(150,200,240,${(0.06 + g.rainIntensity*0.04) * (0.4 + Math.random()*0.6)})`;
    ctx.lineWidth = Math.max(0.5, z * 3);
    ctx.beginPath();
    ctx.moveTo(vx - hw*0.85, cy); ctx.lineTo(vx + hw*0.85, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPuddles(pOff) {
  for (const p of g.puddles) {
    const cx = projX(p.x - pOff, p.z), cy = projY(p.z);
    const pw = p.w * canvas.width * ROAD_HW * p.z;
    const ph = p.d * canvas.height * p.z * 0.5;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, pw, ph, 0, 0, Math.PI*2);
    const gr = ctx.createRadialGradient(cx, cy-ph*0.3, 0, cx, cy, Math.max(pw, ph));
    gr.addColorStop(0,   `rgba(108,162,230,${0.32 + g.rainIntensity*0.12})`);
    gr.addColorStop(0.7,  'rgba(70,120,200,0.16)');
    gr.addColorStop(1,    'rgba(50,90,170,0)');
    ctx.fillStyle = gr; ctx.fill(); ctx.restore();
  }
}

function drawSplashRings(pOff) {
  for (const s of g.splashes) {
    const cx = projX(s.x - pOff, s.z), cy = projY(s.z);
    const p = s.t / s.life, r = 18 * s.z * p;
    ctx.strokeStyle = `rgba(200,230,255,${(1-p)*0.52*s.z})`;
    ctx.lineWidth = Math.max(0.5, 1.8*s.z);
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r*0.28, 0, 0, Math.PI*2); ctx.stroke();
  }
}

// ─── Draw: Rain ──────────────────────────────────────────────────────────────
function drawRainLayer(arr, color, lw, cap) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  const ri = Math.min(cap, g.rainIntensity);
  for (const r of arr) {
    ctx.globalAlpha = r.alpha * ri;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + wind.vx*(r.len/r.vy), r.y + r.len);
    ctx.stroke();
  }
  ctx.restore();
}
function drawRainCurtains() {
  ctx.save();
  for (const c of g.rainCurtains) {
    const alpha = c.alpha * g.rainIntensity;
    const gr = ctx.createLinearGradient(c.x - c.w/2, 0, c.x + c.w/2, 0);
    gr.addColorStop(0,   'rgba(185,215,248,0)');
    gr.addColorStop(0.5, `rgba(185,215,248,${alpha})`);
    gr.addColorStop(1,   'rgba(185,215,248,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(c.x - c.w/2, 0, c.w, canvas.height * ROAD_BOTTOM);
  }
  ctx.restore();
}

// ─── Draw: Car spray (fan widening toward camera) ────────────────────────────
function drawCarSpray(c) {
  const { x: rx, z, wMult, hMult } = c;
  if (z < 0.10) return;
  const pOff = g.playerX;
  const cx = projX(rx - pOff, z), cy = projY(z);
  const w  = CAR_HALF_W * 2 * canvas.width * ROAD_HW * z * wMult;
  const h  = CAR_H_PX * z * hMult;
  const op = Math.min(1,(z-0.10)/0.35) * 0.55 * g.rainIntensity * Math.min(g.throttle, 1.6);
  if (op < 0.01) return;
  ctx.save();
  const spH = h * 1.2, spW = w * 2.2;
  const gr = ctx.createLinearGradient(cx, cy, cx, cy + spH);
  gr.addColorStop(0,    `rgba(190,225,255,${op*0.55})`);
  gr.addColorStop(0.35, `rgba(190,225,255,${op*0.22})`);
  gr.addColorStop(1,    'rgba(190,225,255,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(cx-w*0.44, cy); ctx.lineTo(cx-spW/2, cy+spH);
  ctx.lineTo(cx+spW/2, cy+spH); ctx.lineTo(cx+w*0.44, cy);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

// ─── Per-type car draw helpers ────────────────────────────────────────────────
function drawBrandLabel(cx, cy, w, h, brand, yFrac) {
  if (w < 18) return;
  ctx.save();
  const fs = clamp(Math.round(w * 0.20), 7, 26);
  ctx.font          = `bold ${fs}px Arial, sans-serif`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.shadowColor   = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur    = 3;
  ctx.fillStyle     = 'rgba(225,225,225,0.82)';
  ctx.fillText(brand, cx, cy - h * yFrac);
  ctx.restore();
}

// Sedan — 3-box silhouette (trunk + cabin + roof) viewed from rear
function drawSedan(cx, cy, w, h, color, z, brand) {
  const rw = w / 2;
  const roofW = rw * 0.68;
  // Lower body (bumper to beltline)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw,        cy);
  ctx.lineTo(cx + rw,        cy);
  ctx.lineTo(cx + rw * 0.94, cy - h * 0.46);
  ctx.lineTo(cx - rw * 0.94, cy - h * 0.46);
  ctx.closePath(); ctx.fill();
  // Cabin (beltline to roof) — narrower trapezoid
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw * 0.94, cy - h * 0.46);
  ctx.lineTo(cx + rw * 0.94, cy - h * 0.46);
  ctx.lineTo(cx + roofW,     cy - h * 0.98);
  ctx.lineTo(cx - roofW,     cy - h * 0.98);
  ctx.closePath(); ctx.fill();
  // Rear window (trapezoid glass)
  ctx.fillStyle = 'rgba(110,150,200,0.52)';
  ctx.beginPath();
  ctx.moveTo(cx - rw * 0.74, cy - h * 0.50);
  ctx.lineTo(cx + rw * 0.74, cy - h * 0.50);
  ctx.lineTo(cx + roofW * 0.86, cy - h * 0.94);
  ctx.lineTo(cx - roofW * 0.86, cy - h * 0.94);
  ctx.closePath(); ctx.fill();
  // Window reflection
  ctx.fillStyle = 'rgba(200,230,255,0.20)';
  ctx.beginPath();
  ctx.moveTo(cx - rw * 0.70, cy - h * 0.52);
  ctx.lineTo(cx - rw * 0.18, cy - h * 0.52);
  ctx.lineTo(cx - roofW * 0.30, cy - h * 0.92);
  ctx.lineTo(cx - roofW * 0.78, cy - h * 0.92);
  ctx.closePath(); ctx.fill();
  // Trunk seam
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(0.5, z * 1.2);
  ctx.beginPath(); ctx.moveTo(cx - rw*0.92, cy - h*0.38); ctx.lineTo(cx + rw*0.92, cy - h*0.38); ctx.stroke();
  // Taillights (L + R blocks)
  ctx.shadowColor = '#ff1100'; ctx.shadowBlur = 14*z*(1+g.rainIntensity*0.4);
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(cx - rw,        cy - h*0.26, rw*0.26, h*0.14);
  ctx.fillRect(cx + rw*0.74,   cy - h*0.26, rw*0.26, h*0.14);
  ctx.fillStyle = 'rgba(255,60,0,0.50)';
  ctx.fillRect(cx - rw*0.74,   cy - h*0.24, rw*1.48, h*0.04);
  ctx.shadowBlur = 0;
  // License plate
  ctx.fillStyle = 'rgba(230,230,230,0.65)';
  ctx.fillRect(cx - rw*0.22, cy - h*0.10, rw*0.44, h*0.08);
  // Chrome bumper
  ctx.fillStyle = 'rgba(185,185,185,0.28)';
  ctx.fillRect(cx - rw*0.92, cy - h*0.04, rw*1.84, h*0.03);
  // Body shine
  const shine = ctx.createLinearGradient(cx, cy-h, cx, cy-h*0.58);
  shine.addColorStop(0, 'rgba(255,255,255,0.20)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine; ctx.fillRect(cx-roofW, cy-h, roofW*2, h*0.52);
  drawBrandLabel(cx, cy, w, h, brand, 0.57);
}

// Sports car — very wide, very low, wedge profile
function drawSportsCar(cx, cy, w, h, color, z, brand) {
  const rw = w / 2;
  const roofW = rw * 0.55; // very narrow roof
  // Lower body (flat and wide)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw,        cy);
  ctx.lineTo(cx + rw,        cy);
  ctx.lineTo(cx + rw * 0.96, cy - h * 0.40);
  ctx.lineTo(cx - rw * 0.96, cy - h * 0.40);
  ctx.closePath(); ctx.fill();
  // Cabin (very small and sloped)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw * 0.96, cy - h * 0.40);
  ctx.lineTo(cx + rw * 0.96, cy - h * 0.40);
  ctx.lineTo(cx + roofW,     cy - h * 0.98);
  ctx.lineTo(cx - roofW,     cy - h * 0.98);
  ctx.closePath(); ctx.fill();
  // Ducktail spoiler
  ctx.fillStyle = 'rgba(18,18,18,0.72)';
  ctx.beginPath();
  ctx.moveTo(cx - rw*0.78, cy - h*0.96);
  ctx.lineTo(cx + rw*0.78, cy - h*0.96);
  ctx.lineTo(cx + rw*0.66, cy - h*1.05);
  ctx.lineTo(cx - rw*0.66, cy - h*1.05);
  ctx.closePath(); ctx.fill();
  // Rear window (tiny, steeply raked)
  ctx.fillStyle = 'rgba(110,150,200,0.58)';
  ctx.beginPath();
  ctx.moveTo(cx - rw*0.66, cy - h*0.44);
  ctx.lineTo(cx + rw*0.66, cy - h*0.44);
  ctx.lineTo(cx + roofW*0.80, cy - h*0.94);
  ctx.lineTo(cx - roofW*0.80, cy - h*0.94);
  ctx.closePath(); ctx.fill();
  // Wide LED taillight strip
  ctx.shadowColor = '#ff1100'; ctx.shadowBlur = 18*z*(1+g.rainIntensity*0.4);
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(cx - rw,        cy - h*0.20, rw*0.28, h*0.10);
  ctx.fillRect(cx + rw*0.72,   cy - h*0.20, rw*0.28, h*0.10);
  ctx.fillStyle = 'rgba(255,40,0,0.68)';
  ctx.fillRect(cx - rw*0.72,   cy - h*0.18, rw*1.44, h*0.04);
  ctx.shadowBlur = 0;
  // Diffuser panel
  ctx.fillStyle = 'rgba(14,14,14,0.78)';
  ctx.fillRect(cx - rw*0.90,   cy - h*0.13, rw*1.80, h*0.13);
  // Exhaust pipes
  ctx.fillStyle = 'rgba(90,90,90,0.80)';
  ctx.beginPath(); ctx.ellipse(cx - rw*0.24, cy - h*0.055, rw*0.07, h*0.045, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + rw*0.24, cy - h*0.055, rw*0.07, h*0.045, 0, 0, Math.PI*2); ctx.fill();
  const shine = ctx.createLinearGradient(cx, cy-h, cx, cy-h*0.60);
  shine.addColorStop(0, 'rgba(255,255,255,0.30)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine; ctx.fillRect(cx-roofW, cy-h, roofW*2, h*0.48);
  drawBrandLabel(cx, cy, w, h, brand, 0.48);
}

// Van — tall boxy cargo van with cab + cargo distinction
function drawVan(cx, cy, w, h, color, z, brand) {
  const rw = w / 2;
  // Full body (nearly rectangular with slight top taper)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw,        cy);
  ctx.lineTo(cx + rw,        cy);
  ctx.lineTo(cx + rw * 0.97, cy - h);
  ctx.lineTo(cx - rw * 0.97, cy - h);
  ctx.closePath(); ctx.fill();
  // Cab windows (lower 40%)
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(cx - rw*0.86, cy - h*0.44, rw*1.72, h*0.24);
  ctx.fillStyle = 'rgba(110,155,210,0.42)';
  ctx.fillRect(cx - rw*0.78, cy - h*0.42, rw*1.56, h*0.17);
  // Cargo door divider (between cab and cargo)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(cx - rw, cy - h*0.48, rw*2, h*0.04);
  // Cargo door seams
  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = Math.max(0.6, z*1.4);
  ctx.beginPath(); ctx.moveTo(cx, cy-h*0.96); ctx.lineTo(cx, cy-h*0.52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - rw*0.52, cy-h*0.74); ctx.lineTo(cx - rw*0.08, cy-h*0.74); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + rw*0.08, cy-h*0.74); ctx.lineTo(cx + rw*0.52, cy-h*0.74); ctx.stroke();
  // Taillights
  ctx.shadowColor = '#ff1100'; ctx.shadowBlur = 11*z*(1+g.rainIntensity*0.4);
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(cx - rw,       cy - h*0.18, rw*0.22, h*0.12);
  ctx.fillRect(cx + rw*0.78,  cy - h*0.18, rw*0.22, h*0.12);
  ctx.shadowBlur = 0;
  // Bumper
  ctx.fillStyle = 'rgba(55,55,55,0.58)';
  ctx.fillRect(cx - rw*0.94, cy - h*0.07, rw*1.88, h*0.07);
  const shine = ctx.createLinearGradient(cx, cy-h, cx, cy-h*0.56);
  shine.addColorStop(0, 'rgba(255,255,255,0.16)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine; ctx.fillRect(cx-rw, cy-h, rw*2, h*0.44);
  drawBrandLabel(cx, cy, w, h, brand, 0.75);
}

// Big truck — cab-over with tall separate trailer
function drawBigTruck(cx, cy, w, h, color, z, brand) {
  const rw = w / 2;
  const trailerTop = cy - h;
  const cabH = h * 0.38;
  const trailerH = h * 0.64;
  // ── Trailer ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#667078';
  ctx.beginPath();
  ctx.moveTo(cx - rw*0.46, trailerTop);
  ctx.lineTo(cx + rw*0.46, trailerTop);
  ctx.lineTo(cx + rw*0.48, trailerTop + trailerH);
  ctx.lineTo(cx - rw*0.48, trailerTop + trailerH);
  ctx.closePath(); ctx.fill();
  // Trailer door seams
  ctx.strokeStyle = 'rgba(35,35,35,0.62)';
  ctx.lineWidth = Math.max(0.8, z*2.2);
  ctx.beginPath(); ctx.moveTo(cx, trailerTop); ctx.lineTo(cx, trailerTop + trailerH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-rw*0.45, trailerTop + trailerH*0.36); ctx.lineTo(cx+rw*0.45, trailerTop + trailerH*0.36); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-rw*0.45, trailerTop + trailerH*0.70); ctx.lineTo(cx+rw*0.45, trailerTop + trailerH*0.70); ctx.stroke();
  // Reflector strips
  ctx.fillStyle = 'rgba(255,165,0,0.72)';
  ctx.fillRect(cx-rw*0.44, trailerTop + trailerH*0.24, rw*0.88, h*0.017);
  ctx.fillRect(cx-rw*0.44, trailerTop + trailerH*0.58, rw*0.88, h*0.017);
  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.fillRect(cx-rw*0.44, trailerTop + trailerH*0.258, rw*0.88, h*0.010);
  drawBrandLabel(cx, cy, w, h, brand, 0.80);
  // ── Cab ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw,      cy);
  ctx.lineTo(cx + rw,      cy);
  ctx.lineTo(cx + rw*0.94, cy - cabH);
  ctx.lineTo(cx - rw*0.94, cy - cabH);
  ctx.closePath(); ctx.fill();
  // Air deflector
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.fillRect(cx - rw*0.44, cy - cabH - h*0.04, rw*0.88, h*0.06);
  // Cab windshield
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(cx - rw*0.72, cy - cabH, rw*1.44, cabH*0.52);
  ctx.fillStyle = 'rgba(110,155,210,0.38)';
  ctx.fillRect(cx - rw*0.62, cy - cabH + cabH*0.04, rw*1.24, cabH*0.38);
  // Big taillights
  ctx.shadowColor = '#ff1100'; ctx.shadowBlur = 22*z*(1+g.rainIntensity*0.4);
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(cx - rw,       cy - h*0.17, rw*0.22, h*0.14);
  ctx.fillRect(cx + rw*0.78,  cy - h*0.17, rw*0.22, h*0.14);
  ctx.shadowBlur = 0;
  // Mudflaps
  ctx.fillStyle = 'rgba(22,22,22,0.72)';
  ctx.fillRect(cx - rw,       cy - h*0.09, rw*0.22, h*0.09);
  ctx.fillRect(cx + rw*0.78,  cy - h*0.09, rw*0.22, h*0.09);
  // Chrome bumper
  ctx.fillStyle = 'rgba(175,178,182,0.42)';
  ctx.fillRect(cx - rw*0.90, cy - h*0.04, rw*1.80, h*0.03);
}

// Tour bus — very tall with two rows of windows
function drawBus(cx, cy, w, h, color, z, brand) {
  const rw = w / 2;
  // Main body (tall, slight taper at top)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - rw,        cy);
  ctx.lineTo(cx + rw,        cy);
  ctx.lineTo(cx + rw * 0.96, cy - h);
  ctx.lineTo(cx - rw * 0.96, cy - h);
  ctx.closePath(); ctx.fill();
  // Roof cap (slightly darker)
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(cx - rw*0.96, cy - h, rw*1.92, h*0.07);
  // Two rows of windows (5 per row)
  for (let row = 0; row < 2; row++) {
    const winW = w * 0.11, winH = h * 0.14;
    const winY = cy - h * (0.88 - row * 0.19);
    for (let i = 0; i < 5; i++) {
      const wx = cx - rw*0.84 + i*(rw*1.68/4) - winW/2;
      ctx.fillStyle = 'rgba(0,0,0,0.40)';      ctx.fillRect(wx, winY, winW, winH);
      ctx.fillStyle = 'rgba(110,155,210,0.38)'; ctx.fillRect(wx+1, winY+1, winW-2, winH-2);
      // Curtain hint
      if (Math.random() < 0.3) {
        ctx.fillStyle = 'rgba(220,200,180,0.20)'; ctx.fillRect(wx+1, winY+1, winW*0.4, winH-2);
      }
    }
  }
  // Decorative stripe
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(cx - rw, cy - h*0.52, rw*2, h*0.05);
  drawBrandLabel(cx, cy, w, h, brand, 0.64);
  // Rear panel
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(cx - rw, cy - h*0.47, rw*2, h*0.20);
  // Wide taillights
  ctx.shadowColor = '#ff1100'; ctx.shadowBlur = 16*z*(1+g.rainIntensity*0.4);
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(cx - rw,        cy - h*0.24, rw*0.26, h*0.14);
  ctx.fillRect(cx + rw*0.74,   cy - h*0.24, rw*0.26, h*0.14);
  ctx.fillStyle = 'rgba(255,60,0,0.55)';
  ctx.fillRect(cx - rw*0.74,   cy - h*0.22, rw*1.48, h*0.04);
  ctx.shadowBlur = 0;
  const shine = ctx.createLinearGradient(cx, cy-h, cx, cy-h*0.68);
  shine.addColorStop(0, 'rgba(255,255,255,0.17)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine; ctx.fillRect(cx-rw, cy-h, rw*2, h*0.34);
}

// ─── Draw: Cars (offset by playerX for correct first-person perspective) ──────
function drawCars() {
  const sorted = [...g.cars].sort((a, b) => a.z - b.z);
  for (const c of sorted) { drawCarSpray(c); drawCar(c); }
}
function drawCar(c) {
  const { x, z, color, type, wMult, hMult, brand } = c;
  if (z < 0.02) return;
  const pOff = g.playerX;
  const cx = projX(x - pOff, z), cy = projY(z);
  const w  = CAR_HALF_W * 2 * canvas.width * ROAD_HW * z * wMult;
  const h  = CAR_H_PX * z * hMult;
  if (w < 1 || h < 1) return;
  const fogAlpha = Math.min(1, z*1.1) / (1 + (1-z)*g.rainIntensity*0.9);
  ctx.save(); ctx.globalAlpha = Math.max(0.12, fogAlpha);
  switch (type) {
    case 'sports':   drawSportsCar(cx, cy, w, h, color, z, brand); break;
    case 'van':      drawVan     (cx, cy, w, h, color, z, brand); break;
    case 'bigtruck': drawBigTruck(cx, cy, w, h, color, z, brand); break;
    case 'bus':      drawBus     (cx, cy, w, h, color, z, brand); break;
    default:         drawSedan   (cx, cy, w, h, color, z, brand); break;
  }
  ctx.restore();
}

// ─── Draw: Lightning flash ────────────────────────────────────────────────────
function drawLightning() {
  if (g.lightning <= 0) return;
  ctx.fillStyle = `rgba(218,230,255,${((g.lightning/0.20)*0.36).toFixed(3)})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── Draw: Windshield drops & water sheets ────────────────────────────────────
function drawWindshieldDrops() {
  ctx.save();
  for (const d of g.wsDrop) {
    const sa = 0.22 + d.size * 0.022;
    if (d.phase === 'idle') {
      ctx.fillStyle = `rgba(126,192,255,${sa+0.06})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI*2); ctx.fill();
    } else if (d.trail.length > 1) {
      ctx.strokeStyle = `rgba(126,192,255,${sa})`; ctx.lineWidth = d.size*0.72;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(d.trail[0].x, d.trail[0].y);
      for (const p of d.trail) ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = `rgba(170,218,255,${sa+0.20})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size*0.78, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawWsSheets() {
  ctx.save();
  for (const s of g.wsSheets) {
    const wL = canvas.width*0.07, wR = canvas.width*0.93;
    const gr = ctx.createLinearGradient(0, s.y-2, 0, s.y+s.h+2);
    gr.addColorStop(0,   'rgba(126,192,255,0)');
    gr.addColorStop(0.5, `rgba(126,192,255,${s.alpha})`);
    gr.addColorStop(1,   'rgba(126,192,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(wL, s.y-2, wR-wL, s.h+4);
  }
  ctx.restore();
}

// ─── Draw: Wipers ─────────────────────────────────────────────────────────────
// Pivots sit just below the glass bottom (hidden behind dashboard).
// Arms sweep from behind the A-pillars across to past centre, covering
// the full windshield width.
function drawWipers() {
  const W = canvas.width, H = canvas.height;
  const pivY  = botY() + H  * 0.020;   // slightly below glass edge
  const len   = W * 0.44;              // long enough to reach centre
  drawOneWiper(W * 0.14, pivY, len,  g.wiperA);
  drawOneWiper(W * 0.86, pivY, len, -g.wiperA);
}
function drawOneWiper(px, py, len, angle) {
  const sin = Math.sin(angle), cos = Math.cos(angle);
  // Arm connector (short, thin metal)
  const ax = px + sin * len * 0.08, ay = py - cos * len * 0.08;
  // Blade tip
  const ex = px + sin * len,        ey = py - cos * len;

  ctx.save();
  ctx.lineCap = 'round';

  // Metal arm
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ax, ay); ctx.stroke();

  // Rubber blade — dark body + reflective highlight so it's visible on dark glass
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#303030';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(150, 185, 220, 0.65)';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();

  ctx.restore();
}

// ─── Draw: Windshield frame & dashboard ──────────────────────────────────────
// Thicker A-pillars + rearview mirror = closer, more enclosed driver POV
function drawWindshieldFrame() {
  const W = canvas.width, H = canvas.height, by = botY();
  // Top header bar (ceiling)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H * 0.070);
  // Left A-pillar — extra wide at top for very close driver POV
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W*0.20, H*0.070);
  ctx.lineTo(W*0.072, by);
  ctx.lineTo(0, by);
  ctx.closePath(); ctx.fill();
  // Right A-pillar
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W*0.80, H*0.070);
  ctx.lineTo(W*0.928, by);
  ctx.lineTo(W, by);
  ctx.closePath(); ctx.fill();
  // A-pillar interior edge sheen (warm grey — daytime ambient)
  ctx.fillStyle = 'rgba(70,65,60,0.30)';
  ctx.beginPath();
  ctx.moveTo(W*0.165, H*0.070);
  ctx.lineTo(W*0.20, H*0.070);
  ctx.lineTo(W*0.072, by);
  ctx.lineTo(W*0.060, by);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W*0.835, H*0.070);
  ctx.lineTo(W*0.80, H*0.070);
  ctx.lineTo(W*0.928, by);
  ctx.lineTo(W*0.940, by);
  ctx.closePath(); ctx.fill();
  // ── Rearview mirror (center top) ──────────────────────────────────────────
  const mirW = W * 0.082, mirH = H * 0.028;
  const mirX = W / 2,     mirY = H * 0.076;
  // Bracket
  ctx.fillStyle = '#181818';
  ctx.fillRect(mirX - W*0.004, H*0.042, W*0.008, mirY - H*0.042);
  // Mirror housing
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(mirX - mirW/2, mirY - mirH/2, mirW, mirH);
  // Mirror glass (dark blue-grey tint)
  ctx.fillStyle = 'rgba(75,95,130,0.35)';
  ctx.fillRect(mirX - mirW/2 + 2, mirY - mirH/2 + 2, mirW - 4, mirH - 4);
  // Vignette around windshield edges
  const vig = ctx.createRadialGradient(W/2, H*0.48, H*0.16, W/2, H*0.48, H*0.70);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, by);
}
function drawDashboard() {
  const W = canvas.width, H = canvas.height, top = botY();
  // Hood shadow fade just below glass
  const hood = ctx.createLinearGradient(0, top - H*0.05, 0, top);
  hood.addColorStop(0, 'rgba(8,8,8,0)'); hood.addColorStop(1, 'rgba(8,8,8,0.60)');
  ctx.fillStyle = hood; ctx.fillRect(0, top - H*0.05, W, H*0.05);
  // Dashboard surface
  const dash = ctx.createLinearGradient(0, top, 0, H);
  dash.addColorStop(0, '#1c1c1c'); dash.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = dash; ctx.fillRect(0, top, W, H - top);
  // Steering wheel
  const sx = W/2, sy = H*0.97, sr = W*0.072;
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = W*0.014;
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#1e1e1e';
  ctx.beginPath(); ctx.arc(sx, sy, sr*0.14, 0, Math.PI*2); ctx.fill();
  ctx.lineCap = 'round'; ctx.lineWidth = W*0.009;
  for (let i = 0; i < 3; i++) {
    const a = (i/3)*Math.PI*2 - Math.PI/2; ctx.strokeStyle = '#252525';
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a)*sr*0.14, sy + Math.sin(a)*sr*0.14);
    ctx.lineTo(sx + Math.cos(a)*sr*0.88, sy + Math.sin(a)*sr*0.88);
    ctx.stroke();
  }
  // Speedometer cluster (left of steering wheel)
  const kmph = Math.round((62 + g.speed*38) * g.throttle);
  const spX = W*0.28, spY = sy - sr*0.2, spR = W*0.042;
  ctx.strokeStyle = '#252525'; ctx.lineWidth = W*0.010;
  ctx.beginPath(); ctx.arc(spX, spY, spR, 0, Math.PI*2); ctx.stroke();
  // Needle
  const needleAngle = -Math.PI*0.75 + (Math.min(kmph, 220)/220) * Math.PI*1.5;
  ctx.strokeStyle = '#dd4422'; ctx.lineWidth = W*0.005;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(spX, spY);
  ctx.lineTo(spX + Math.cos(needleAngle)*spR*0.76, spY + Math.sin(needleAngle)*spR*0.76);
  ctx.stroke();
  ctx.fillStyle = '#202020';
  ctx.beginPath(); ctx.arc(spX, spY, spR*0.12, 0, Math.PI*2); ctx.fill();
}

function drawRainHaze() {
  const a = Math.min(0.22, (g.rainIntensity - 1.0) * 0.08);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(145,158,168,${a})`;  // grey haze for daytime
  ctx.fillRect(0, 0, canvas.width, canvas.height * ROAD_BOTTOM);
}

// ─── Draw: Blinker indicator (方向燈) ─────────────────────────────────────────
function drawBlinker() {
  if (g.blinkerDir === 0) return;
  const W = canvas.width, H = canvas.height;
  const isLeft = g.blinkerDir === -1;

  // ── HUD 大箭頭 (上方顯示) ──────────────────────────────────────────────────
  ctx.save();
  const litAlpha  = g.blinkerOn ? 0.96 : 0.18;
  const sz   = W * 0.034;
  const ay   = H * 0.108;
  const ax1  = isLeft ? W * 0.300 : W * 0.700;
  const ax2  = isLeft ? W * 0.340 : W * 0.660;

  function arrowTri(ax, flip) {
    ctx.beginPath();
    if (flip) {
      ctx.moveTo(ax - sz,  ay);
      ctx.lineTo(ax,       ay - sz * 0.56);
      ctx.lineTo(ax,       ay + sz * 0.56);
    } else {
      ctx.moveTo(ax + sz,  ay);
      ctx.lineTo(ax,       ay - sz * 0.56);
      ctx.lineTo(ax,       ay + sz * 0.56);
    }
    ctx.closePath();
  }
  // 前箭頭 (全亮)
  ctx.globalAlpha = litAlpha;
  ctx.fillStyle = '#f5a520';
  if (g.blinkerOn) { ctx.shadowColor = '#f5a520'; ctx.shadowBlur = sz * 1.4; }
  arrowTri(ax1, isLeft); ctx.fill();
  ctx.shadowBlur = 0;
  // 後箭頭 (半透)
  ctx.globalAlpha = litAlpha * 0.55;
  arrowTri(ax2, isLeft); ctx.fill();
  ctx.restore();

  // ── Dashboard 小指示燈 ─────────────────────────────────────────────────────
  const dashTop = botY();
  const dashY   = dashTop + (H - dashTop) * 0.18;
  const dashX   = isLeft ? W * 0.42 : W * 0.58;
  const ds      = W * 0.016;
  ctx.save();
  ctx.globalAlpha = g.blinkerOn ? 0.92 : 0.14;
  ctx.fillStyle = '#f5a520';
  if (g.blinkerOn) { ctx.shadowColor = '#f5a520'; ctx.shadowBlur = 10; }
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(dashX - ds, dashY);
    ctx.lineTo(dashX,      dashY - ds * 0.56);
    ctx.lineTo(dashX,      dashY + ds * 0.56);
  } else {
    ctx.moveTo(dashX + ds, dashY);
    ctx.lineTo(dashX,      dashY - ds * 0.56);
    ctx.lineTo(dashX,      dashY + ds * 0.56);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ─── Draw: HUD ───────────────────────────────────────────────────────────────
function drawHUD() {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.font = `bold ${Math.round(W*0.028)}px 'Courier New',monospace`;
  ctx.fillStyle = 'rgba(152,208,255,0.88)'; ctx.textAlign = 'left';
  ctx.fillText(`▶ ${g.score} m`, W*0.085, H*0.105);
  const kph = Math.round((62 + g.speed*38) * g.throttle);
  ctx.font = `bold ${Math.round(W*0.036)}px 'Courier New',monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'right';
  ctx.fillText(`${kph} km/h`, W*0.915, H*0.105);
  const tv = document.getElementById('throttleVal');
  if (tv) tv.textContent = g.throttle.toFixed(1) + '×';

  // 後座乘客尖叫字幕
  if (g.screamDisplay && g.screamDisplay.timer > 0) {
    const a = Math.min(1, g.screamDisplay.timer / 0.4);
    ctx.globalAlpha  = a;
    ctx.font         = `bold ${Math.round(W*0.032)}px sans-serif`;
    ctx.fillStyle    = '#FFE57A';
    ctx.textAlign    = 'center';
    ctx.shadowColor  = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur   = 12;
    ctx.fillText(g.screamDisplay.text, W * 0.5, H * 0.79);
    ctx.shadowBlur   = 0;
  }
  ctx.restore();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky();                                           // daytime overcast sky + clouds
  drawBackground();                                    // mountains + treeline
  drawRainLayer(g.rainFar,  '#9dc5d5', 0.5, 2.2);    // lighter rain for daytime
  drawRainCurtains();
  drawRoadside();                                      // grass + guardrails outside road
  drawRoadsideTrees();                                 // trees alongside road
  drawRoad();
  drawRainLayer(g.rainMid,  '#b5d5e5', 1.0, 2.2);
  drawCars();
  drawRainLayer(g.rainNear, '#cce5f2', 1.6, 2.2);
  drawRainHaze();
  drawLightning();
  drawWindshieldDrops();
  drawWsSheets();
  drawWipers();
  drawWindshieldFrame();
  drawDashboard();
  drawBlinker();
  drawHUD();
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function loop(ts) {
  if (!running) return;
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt); render();
  requestAnimationFrame(loop);
}

function startGame() {
  document.getElementById('gameOverScreen').classList.add('hidden');
  document.getElementById('leftControls').classList.remove('hidden');
  document.getElementById('rightControls').classList.remove('hidden');
  if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
  initGame();
  running = true; lastTime = performance.now();
  requestAnimationFrame(loop);
}
function showGameOver() {
  running = false;
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch(_) {}
  document.getElementById('leftControls').classList.add('hidden');
  document.getElementById('rightControls').classList.add('hidden');
  if (g.score > bestScore) bestScore = g.score;
  document.getElementById('finalScore').textContent = `本次距離：${g.score} 公尺`;
  document.getElementById('bestScore').textContent  = `最佳紀錄：${bestScore} 公尺`;
  document.getElementById('gameOverScreen').classList.remove('hidden');
}

// ─── Input ── FIX: preventDefault on arrow keys so browser doesn't scroll ───
window.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))
    e.preventDefault();
  if (g?.keys) g.keys[e.key] = true;
  if ((e.key === 'Enter' || e.key === ' ') &&
      !document.getElementById('gameOverScreen').classList.contains('hidden'))
    startGame();
});
window.addEventListener('keyup', e => { if (g?.keys) g.keys[e.key] = false; });

// ─── Side button bindings ─────────────────────────────────────────────────────
function bindSideBtn(id, keyName) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const press = e => {
    e.preventDefault(); e.stopPropagation();
    if (g?.keys) g.keys[keyName] = true;
    btn.classList.add('pressing');
  };
  const release = e => {
    e.stopPropagation();
    if (g?.keys) g.keys[keyName] = false;
    btn.classList.remove('pressing');
  };
  ['mousedown','touchstart'].forEach(evt => btn.addEventListener(evt, press,   { passive: false }));
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => btn.addEventListener(evt, release));
}
bindSideBtn('btnBrake',     'speedDown');
bindSideBtn('btnLeft',      'touchLeft');
bindSideBtn('btnWiperSlow', 'wiperDown');
bindSideBtn('btnAccel',     'speedUp');
bindSideBtn('btnRight',     'touchRight');
bindSideBtn('btnWiperFast', 'wiperUp');

document.getElementById('startBtn').addEventListener('click', () => {
  const sel = document.getElementById('sceneSelect');
  if (sel) currentSceneKey = sel.value || 'plains';
  document.getElementById('startScreen').classList.add('hidden');
  initAudio();
  startGame();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  initAudio();
  startGame();
});
