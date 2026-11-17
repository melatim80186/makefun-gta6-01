// missions.js — SOLMAR story jobs + courier side job.
// Eight jobs for Vera Solano: the player owes her $5,000, and each
// completed job pays part of it back. Steps are plain data; the
// runtime below walks them from the live world state.
//
// Step shapes: steal (any car), stealMarked (the yellow Comet),
// reach (x, y, r, optional seconds), defeat (count at x, y),
// hold (stay in r of x, y for seconds), checkpoints (ordered
// points within seconds), earn (cash amount while at x, y).

export const MISSIONS = [
  { id: 'first-wheels', title: 'First Wheels', giver: 'Vera Solano', reward: 200,
    brief: 'Vera needs wheels. Steal any car and bring it to her garage.',
    wanted: 0, steps: [{ type: 'steal' }, { type: 'reach', x: 1030, y: 540, r: 90 }] },
  { id: 'the-drop', title: 'The Drop', giver: 'Vera Solano', reward: 350,
    brief: 'A package for the Marina. Ninety seconds — do not dawdle.',
    wanted: 1, steps: [{ type: 'reach', x: 360, y: 2380, r: 90, seconds: 90 }] },
  { id: 'hot-wheels', title: 'Hot Wheels', giver: 'Vera Solano', reward: 500,
    brief: 'A yellow Comet is parked Downtown. Steal it and bring it home.',
    wanted: 0, steps: [{ type: 'stealMarked' }, { type: 'reach', x: 1030, y: 540, r: 90 }] },
  { id: 'payback', title: 'Payback', giver: 'Vera Solano', reward: 600,
    brief: 'Three Breakers jumped one of ours. Settle it at their turf.',
    wanted: 0, steps: [{ type: 'defeat', count: 3, x: 2830, y: 1830 }, { type: 'reach', x: 1030, y: 540, r: 90 }] },
  { id: 'silent-alarm', title: 'Silent Alarm', giver: 'Vera Solano', reward: 800,
    brief: 'Hold the warehouse door while the crew works, then get back.',
    wanted: 2, steps: [{ type: 'hold', x: 3230, y: 770, r: 80, seconds: 5 }, { type: 'reach', x: 1030, y: 540, r: 90, seconds: 120 }] },
  { id: 'getaway-driver', title: 'Getaway Driver', giver: 'Vera Solano', reward: 1000,
    brief: 'Three checkpoints, two and a half minutes, cops everywhere.',
    wanted: 3, steps: [{ type: 'checkpoints', seconds: 150, points: [{ x: 880, y: 720 }, { x: 2480, y: 1440 }, { x: 1680, y: 2520 }] }] },
  { id: 'the-big-score', title: 'The Big Score', giver: 'Vera Solano', reward: 1500,
    brief: 'Crack the bank vault, then lose the heat at Lay Low Motors.',
    wanted: 2, steps: [{ type: 'hold', x: 1730, y: 1490, r: 80, seconds: 6 }, { type: 'reach', x: 2930, y: 410, r: 100, seconds: 150 }] },
  { id: 'paid-in-full', title: 'Paid in Full', giver: 'Vera Solano', reward: 0,
    brief: 'Bring $5,000 to the garage and the debt is done. Legend.',
    wanted: 0, steps: [{ type: 'earn', amount: 5000, x: 1030, y: 540, r: 90 }] },
];

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Only reach / checkpoints steps carry a countdown; a hold step's
// seconds are its duration, not a timer, so they get no countdown.
function stepTimer(step) {
  if (step.type !== 'reach' && step.type !== 'checkpoints') return null;
  return typeof step.seconds === 'number' ? step.seconds : null;
}

// Start job `index` (0-based) on the world state: fresh mission object,
// timer for the first timed step, wanted floor, spawn flags for the
// Comet / the Breakers, and a 6-second toast with title + brief.
export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return null;
  const step = def.steps[0];
  state.mission = { index, def, step, stepIndex: 0, timer: stepTimer(step), hold: 0, checkpoint: 0 };
  if (def.wanted > 0 && state.wanted < def.wanted) state.wanted = def.wanted;
  state.wantedFloor = def.wanted || 0;
  state.spawnComet = def.id === 'hot-wheels';
  state.spawnBreakers = def.id === 'payback';
  state.flags = state.flags || {};
  state.flags.stoleCar = false;
  state.flags.stoleMarked = false;
  state.defeated = 0;
  const text = def.title + ' — ' + def.brief;
  state.toast = { text, until: (state.time || 0) + 6 };
  state.message = text;
  return state.mission;
}

function advanceMission(state) {
  const m = state.mission;
  m.stepIndex += 1;
  m.hold = 0;
  m.checkpoint = 0;
  if (m.stepIndex >= m.def.steps.length) return 'complete';
  const step = m.def.steps[m.stepIndex];
  m.step = step;
  m.timer = stepTimer(step);
  // The Big Score: cracking the vault brings the whole city down on you.
  if (m.def.id === 'the-big-score' && m.stepIndex === 1) {
    state.wanted = Math.max(state.wanted, 4);
    state.wantedFloor = 4;
  }
  return null;
}

function defeatedCount(state) {
  if (typeof state.defeated === 'number') return state.defeated;
  if (Array.isArray(state.enemies)) return state.enemies.filter((e) => e.down).length;
  return 0;
}

// Current target point for the marker / minimap, or null when the
// step has no single location (plain steal has none; the marked
// Comet waits Downtown at 2430, 1030).
export function missionTarget(state) {
  const m = state.mission;
  if (!m) return null;
  const step = m.def.steps[m.stepIndex];
  if (!step) return null;
  if (step.type === 'reach' || step.type === 'hold' || step.type === 'earn') return { x: step.x, y: step.y };
  if (step.type === 'defeat') return { x: step.x, y: step.y };
  if (step.type === 'checkpoints') return step.points[Math.min(m.checkpoint, step.points.length - 1)];
  if (step.type === 'stealMarked') return { x: 2430, y: 1030 };
  return null;
}

// Advance the active job from the live world state. Returns
// 'complete' on the last step, 'failed' on a timeout, else null.
export function updateMission(state, dt) {
  const m = state.mission;
  if (!m) return null;
  const p = state.player;
  const step = m.def.steps[m.stepIndex];
  if (!step) return 'complete';
  // Timed steps count down; running out fails the job.
  if (m.timer !== null && m.timer !== undefined) {
    m.timer -= dt;
    if (m.timer <= 0) { m.timer = 0; return 'failed'; }
  }
  let done = false;
  if (step.type === 'steal') {
    done = !!(state.flags && state.flags.stoleCar);
  } else if (step.type === 'stealMarked') {
    done = !!(state.flags && state.flags.stoleMarked);
  } else if (step.type === 'reach') {
    done = dist(p.x, p.y, step.x, step.y) <= step.r;
  } else if (step.type === 'defeat') {
    done = defeatedCount(state) >= step.count;
  } else if (step.type === 'hold') {
    if (dist(p.x, p.y, step.x, step.y) <= step.r) {
      m.hold += dt;
      if (m.hold >= step.seconds) done = true;
    } else {
      m.hold = Math.max(0, m.hold - dt);
    }
  } else if (step.type === 'checkpoints') {
    const target = step.points[m.checkpoint];
    if (target && dist(p.x, p.y, target.x, target.y) <= 90) {
      m.checkpoint += 1;
      if (m.checkpoint >= step.points.length) done = true;
    }
  } else if (step.type === 'earn') {
    done = p.cash >= step.amount && dist(p.x, p.y, step.x, step.y) <= step.r;
  }
  if (!done) return null;
  return advanceMission(state);
}

function stepLabel(state) {
  const step = state.mission.def.steps[state.mission.stepIndex];
  switch (step.type) {
    case 'steal': return 'Steal a car';
    case 'stealMarked': return 'Steal the yellow Comet';
    case 'reach': return 'Get to the marker';
    case 'defeat': return 'Defeat the Breakers';
    case 'hold': return 'Hold the spot';
    case 'checkpoints': return 'Hit the checkpoints';
    case 'earn': return 'Bring the cash';
    default: return '';
  }
}

// HUD line for the active job: title + step label + live numbers.
export function missionText(state) {
  const m = state.mission;
  if (!m) return '';
  const step = m.def.steps[m.stepIndex];
  if (!step) return m.def.title;
  let line = m.def.title + ' — ' + stepLabel(state);
  if (m.timer !== null && m.timer !== undefined) line += '  ' + Math.ceil(m.timer) + 's';
  if (step.type === 'hold') line += '  ' + Math.min(step.seconds, Math.floor(m.hold)) + '/' + step.seconds + 's';
  if (step.type === 'defeat') line += '  ' + defeatedCount(state) + '/' + step.count;
  if (step.type === 'checkpoints') line += '  ' + m.checkpoint + '/' + step.points.length;
  if (step.type === 'earn') line += '  $' + Math.min(step.amount, state.player.cash) + '/$' + step.amount;
  return line;
}

// --- Courier side job: $150 a delivery, repeatable. ---
const COURIER_PAY = 150;
const COURIER_TIME = 75;
const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];

function randomRoadPoint(state) {
  if (state.city && typeof state.city.randomRoadPoint === 'function') return state.city.randomRoadPoint();
  const rng = state.rng;
  const pick = (arr) => arr[Math.floor((rng ? rng.next() : Math.random()) * arr.length)];
  return { x: pick(AVENUES), y: pick(STREETS) };
}

export function startCourier(state) {
  const point = randomRoadPoint(state);
  state.courier = { phase: 'pickup', x: point.x, y: point.y, timer: null, cooldown: 0 };
  return state.courier;
}

export function updateCourier(state, dt) {
  if (!state.courier) state.courier = { phase: 'idle', x: 0, y: 0, timer: null, cooldown: 0 };
  const c = state.courier;
  const p = state.player;
  if (c.phase === 'idle') {
    c.cooldown -= dt;
    // Only respawn while no story job is running.
    if (c.cooldown <= 0 && !state.mission) startCourier(state);
    return null;
  }
  if (c.phase === 'pickup') {
    if (dist(p.x, p.y, c.x, c.y) <= 70) {
      const drop = randomRoadPoint(state);
      c.phase = 'deliver'; c.x = drop.x; c.y = drop.y; c.timer = COURIER_TIME;
    }
    return null;
  }
  // Deliver: timed run to the drop-off.
  c.timer -= dt;
  if (c.timer <= 0) {
    state.courier = { phase: 'idle', x: 0, y: 0, timer: null, cooldown: 15 };
    return 'failed';
  }
  if (dist(p.x, p.y, c.x, c.y) <= 70) {
    p.cash += COURIER_PAY;
    state.toast = { text: 'Courier delivered +$' + COURIER_PAY, until: (state.time || 0) + 4 };
    state.message = 'Courier delivered +$' + COURIER_PAY;
    state.courier = { phase: 'idle', x: 0, y: 0, timer: null, cooldown: 20 };
    return 'complete';
  }
  return null;
}
