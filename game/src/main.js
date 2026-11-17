// SOLMAR — Streets of Gold, a top-down open-city game for make.fun gta6-01.
// Boot and fixed-step loop: screens, saves, screenshots and the world step.
import { createAudio } from './audio.js';
import { createInput, ACTIONS } from './input.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import {
  drawHud,
  drawTitle,
  drawHowToPlay,
  drawPaused,
  drawBusted,
  drawStoryComplete,
} from './hud.js';
import {
  loadGame,
  clearSave,
  hasSave,
  readBest,
  saveBest,
} from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const MENU_MASK = ACTIONS.CONFIRM | ACTIONS.PAUSE | ACTIONS.MUTE;
const ALL_ACTIONS = 0xff;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot') || '';
const seedText = params.get('seed');
const seed = seedText === null
  ? (Math.random() * 0x100000000) >>> 0
  : (parseInt(seedText, 10) >>> 0);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');

const audio = createAudio();
const input = createInput(canvas);
const world = createWorld({ seed, input, audio });
const renderer = createRenderer(canvas);
// The world aims the pistol through the camera, so it needs the renderer.
world.camera = renderer.camera;
world.screenToWorld = renderer.screenToWorld;

function announce(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function fit() {
  renderer.resize();
}
window.addEventListener('resize', fit);
fit();

let screen = 'title';
// Option 0 is always the first menu entry: Continue with a save,
// New Game without one — so the default selection is 0 either way.
let titleSelected = 0;
let pauseSelected = 0;
let lastDir = 0;
let best = readBest() || 0;
let storyShown = false;
let shotScreen = 'play';

function paint() {
  // The renderer and HUD read the STATE (player, cars, wanted, mission);
  // the state also carries the city, so one object feeds both.
  const st = world.state;
  renderer.drawWorld(st);
  const w = canvas.width;
  const h = canvas.height;
  if (screen === 'play') {
    drawHud(ctx, st, w, h);
  } else if (screen === 'title') {
    drawTitle(ctx, w, h, titleSelected, hasSave());
  } else if (screen === 'howto') {
    drawHowToPlay(ctx, w, h);
  } else if (screen === 'paused') {
    drawHud(ctx, st, w, h);
    drawPaused(ctx, st, w, h, pauseSelected);
  } else if (screen === 'busted' || screen === 'wasted') {
    drawHud(ctx, st, w, h);
    drawBusted(ctx, st, w, h, screen);
  } else if (screen === 'story') {
    drawHud(ctx, st, w, h);
    drawStoryComplete(ctx, st, w, h);
  }
}

function runShot() {
  const staged = stageShot(shotName, world, input);
  if (staged) {
    if (staged.screen) shotScreen = staged.screen;
    if (typeof staged.best === 'number') best = staged.best;
  }
  screen = shotScreen;
  paint();
  paint();
  window.__shotReady = true;
}

function startGame(fresh) {
  audio.unlock();
  input.takeActions(ALL_ACTIONS);
  if (fresh) {
    clearSave();
    world.reset();
    storyShown = false;
  } else {
    const saved = loadGame();
    if (saved) {
      const st = world.state;
      st.player.cash = saved.cash || 0;
      st.player.x = saved.playerX ?? st.player.x;
      st.player.y = saved.playerY ?? st.player.y;
      st.goldFoundIds = (saved.goldFound || []).slice();
      st.stats.goldFound = st.goldFoundIds.length;
      // Already-found gold bars stay collected.
      st.pickups = st.pickups.filter(
        (pk) => pk.kind !== 'gold' || !st.goldFoundIds.includes(pk.goldId),
      );
      st.stats.carsStolen = saved.carsStolen || 0;
      st.stats.missionsDone = saved.missionsDone || 0;
      st.missionIndex = saved.missionIndex || 0;
      st.storyDone = !!saved.storyDone;
      st.mission = null;
      st.nextMissionIn = 2;
      storyShown = !!saved.storyDone;
    }
  }
  best = Math.max(best, world.state.player.cash || 0);
  screen = 'play';
  announce('Playing Solmar. Good luck, the debt is $5,000.');
}

function titleConfirm() {
  audio.click();
  // The menu list drops Continue when there is no save, so resolve the
  // highlighted entry by name instead of by a fixed index.
  const opts = hasSave()
    ? ['Continue', 'New Game', 'How to Play']
    : ['New Game', 'How to Play'];
  const choice = opts[titleSelected];
  if (choice === 'Continue') {
    startGame(false);
  } else if (choice === 'New Game') {
    startGame(true);
  } else {
    screen = 'howto';
  }
}

function moveSelection(dir, count, current) {
  return (current + dir + count) % count;
}

function stepTitle(dt) {
  world.attract = true;
  world.step(dt);
  const actions = input.takeActions(MENU_MASK);
  if (actions & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());
  const dir = input.direction().y;
  if (dir !== 0 && dir !== lastDir) {
    titleSelected = moveSelection(dir, hasSave() ? 3 : 2, titleSelected);
    audio.click();
  }
  lastDir = dir;
  if (actions & ACTIONS.CONFIRM) titleConfirm();
}

function stepHowTo() {
  world.attract = true;
  const actions = input.takeActions(MENU_MASK);
  if (actions & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());
  if (actions & ACTIONS.CONFIRM) {
    audio.click();
    screen = 'title';
  }
}

function stepPaused() {
  const actions = input.takeActions(MENU_MASK);
  if (actions & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());
  const dir = input.direction().y;
  if (dir !== 0 && dir !== lastDir) {
    pauseSelected = (pauseSelected + dir + 3) % 3;
    audio.click();
  }
  lastDir = dir;
  if (actions & ACTIONS.PAUSE) {
    screen = 'play';
    return;
  }
  if (actions & ACTIONS.CONFIRM) {
    audio.click();
    if (pauseSelected === 0) {
      screen = 'play';
    } else if (pauseSelected === 1) {
      world.state.mission = null;
      world.state.nextMissionDelay = 0.5;
      screen = 'play';
    } else {
      world.saveNow();
      screen = 'title';
      titleSelected = hasSave() ? 0 : 1;
      announce('Saved. Solmar title screen.');
    }
  }
}

function stepEndScreen() {
  const actions = input.takeActions(MENU_MASK);
  if (actions & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());
  if (actions & ACTIONS.CONFIRM) {
    audio.click();
    world.state.busted = false;
    world.state.wasted = false;
    if (screen === 'story') storyShown = true;
    screen = 'play';
  }
}

function tick(dt) {
  if (screen === 'title') {
    stepTitle(dt);
    return;
  }
  if (screen === 'howto') {
    stepHowTo();
    return;
  }
  if (screen === 'paused') {
    stepPaused();
    return;
  }
  if (screen === 'busted' || screen === 'wasted' || screen === 'story') {
    stepEndScreen();
    return;
  }
  const actions = input.takeActions(MENU_MASK);
  if (actions & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());
  if (actions & ACTIONS.PAUSE) {
    pauseSelected = 0;
    screen = 'paused';
    return;
  }
  world.attract = false;
  world.step(dt);
  const st = world.state;
  const cash = st.player.cash || 0;
  if (cash > best) {
    best = cash;
    saveBest(best);
  }
  if (st.busted) {
    audio.busted();
    screen = 'busted';
    announce('Busted. Pay the fine and get back out there.');
  } else if (st.wasted) {
    audio.busted();
    screen = 'wasted';
    announce('Wasted. You wake up at Solmar General.');
  } else if (st.storyDone && !storyShown) {
    screen = 'story';
    announce('Paid in full. Legend of Solmar.');
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  acc += elapsed;
  let guard = 0;
  while (acc >= STEP && guard < 5) {
    tick(STEP);
    acc -= STEP;
    guard += 1;
  }
  if (guard === 5) acc = 0;
  paint();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    pauseSelected = 0;
    screen = 'paused';
  }
});

if (shotName) {
  runShot();
} else {
  announce('Solmar title screen. Choose Continue, New Game, or How to Play.');
  requestAnimationFrame(frame);
}
