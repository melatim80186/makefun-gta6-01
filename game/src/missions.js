// missions.js — SOLMAR story jobs and the courier side job.
// Eight jobs for Vera Solano: the player owes her $5,000 and works it
// off one job at a time, from stealing a first car to paying in full.
// Plain data plus small runtime helpers; no imports, no network.

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Vera Solano',
    reward: 200,
    brief: 'Steal any car and bring it to my garage. No questions, no cops.',
    wantedOnStart: 0,
    steps: [
      { type: 'steal' },
      { type: 'reach', x: 1030, y: 540, radius: 90 },
    ],
  },
  {
    id: 'the-drop',
    title: 'The Drop',
    giver: 'Vera Solano',
    reward: 350,
    brief: 'Take the package down to the Marina. Ninety seconds, no stops.',
    wantedOnStart: 1,
    steps: [
      { type: 'reach', x: 360, y: 2380, radius: 90, seconds: 90 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Vera Solano',
    reward: 500,
    brief: 'A yellow Comet is parked Downtown. Take it — and bring it home.',
    wantedOnStart: 0,
    steps: [
      { type: 'stealMarked' },
      { type: 'reach', x: 1030, y: 540, radius: 90 },
    ],
  },
  {
    id: 'payback',
    title: 'Payback',
    giver: 'Vera Solano',
    reward: 600,
    brief: 'The Breakers think they own the turf. Show them otherwise.',
    wantedOnStart: 0,
    steps: [
      { type: 'defeat', count: 3, x: 2830, y: 1830 },
      { type: 'reach', x: 1030, y: 540, radius: 90 },
    ],
  },
  {
    id: 'silent-alarm',
    title: 'Silent Alarm',
    giver: 'Vera Solano',
    reward: 800,
    brief: 'Crack the warehouse door, then get back here before they notice.',
    wantedOnStart: 2,
    steps: [
      { type: 'hold', x: 3230, y: 770, radius: 80, seconds: 5 },
      { type: 'reach', x: 1030, y: 540, radius: 90, seconds: 120 },
    ],
  },
  {
    id: 'getaway-driver',
    title: 'Getaway Driver',
    giver: 'Vera Solano',
    reward: 1000,
    brief: 'Three checkpoints, two and a half minutes, half the city behind you.',
    wantedOnStart: 3,
    steps: [
      {
        type: 'checkpoints',
        seconds: 150,
        points: [
          { x: 880, y: 720, radius: 80 },
          { x: 2480, y: 1800, radius: 80 },
          { x: 3280, y: 1080, radius: 80 },
        ],
      },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Vera Solano',
    reward: 1500,
    brief: 'Crack the bank vault, then lay low. This one clears the board.',
    wantedOnStart: 2,
    steps: [
      { type: 'hold', x: 1730, y: 1490, radius: 80, seconds: 6 },
      { type: 'reach', x: 1330, y: 2210, radius: 90, seconds: 150 },
    ],
  },
  {
    id: 'paid-in-full',
    title: 'Paid in Full',
    giver: 'Vera Solano',
    reward: 0,
    brief: 'Bring $5,000 to the garage and the debt is done. Legend of Solmar.',
    wantedOnStart: 0,
    steps: [
      { type: 'earn', amount: 5000, x: 1030, y: 540, radius: 90 },
    ],
  },
];

export function jobByIndex(i) {
  if (typeof i !== 'number' || i < 0 || i >= MISSIONS.length) return null;
  return MISSIONS[i];
}

// ---- runtime: operates on a plain state object (duck-typed) ----

function playerPos(state, world) {
  const p = (state && state.player) || (world && world.player) || null;
  if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
  return null;
}

function playerCash(state) {
  if (state && state.player && typeof state.player.cash === 'number') return state.player.cash;
  if (state && typeof state.cash === 'number') return state.cash;
  return 0;
}

function distTo(p, x, y) {
  const dx = p.x - x;
  const dy = p.y - y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function startMission(state, index) {
  const job = jobByIndex(index);
  if (!state || !job) return null;
  if (!state.flags) state.flags = {};
  state.flags.carStolen = false;
  state.flags.cometStolen = false;
  state.flags.defeated = 0;
  state.flags.spawnComet = job.id === 'hot-wheels';
  state.flags.spawnBreakers = job.id === 'payback';
  const first = job.steps[0] || {};
  state.mission = {
    job, stepIndex: 0, timer: first.seconds || 0,
    holdTime: 0, defeated: 0, checkpointIndex: 0,
    failed: false, complete: false,
  };
  state.wanted = Math.max(state.wanted || 0, job.wantedOnStart || 0);
  state.toast = { text: job.title + ' — ' + job.brief, t: 6 };
  return state.mission;
}

export function updateMission(state, dt, world) {
  if (!state || !state.mission) return null;
  const m = state.mission;
  if (m.complete || m.failed || !m.job) return null;
  const step = m.job.steps[m.stepIndex];
  if (!step) { m.complete = true; return 'complete'; }
  if (step.seconds && (step.type === 'reach' || step.type === 'checkpoints')) {
    m.timer -= dt;
    if (m.timer <= 0) { m.failed = true; return 'failed'; }
  }
  const p = playerPos(state, world);
  const flags = state.flags || {};
  let done = false;
  if (step.type === 'steal') done = !!flags.carStolen;
  else if (step.type === 'stealMarked') done = !!flags.cometStolen;
  else if (step.type === 'reach') done = !!p && distTo(p, step.x, step.y) <= (step.radius || 90);
  else if (step.type === 'defeat') done = (flags.defeated || 0) >= (step.count || 0);
  else if (step.type === 'hold') {
    if (p && distTo(p, step.x, step.y) <= (step.radius || 80)) {
      m.holdTime += dt;
      if (m.holdTime >= (step.seconds || 5)) done = true;
    } else m.holdTime = Math.max(0, m.holdTime - dt);
  } else if (step.type === 'checkpoints') {
    const pts = step.points || [];
    const pt = pts[m.checkpointIndex];
    if (p && pt && distTo(p, pt.x, pt.y) <= (pt.radius || 80)) {
      m.checkpointIndex += 1;
      if (m.checkpointIndex >= pts.length) done = true;
    }
  } else if (step.type === 'earn') {
    done = playerCash(state) >= (step.amount || 0)
      && !!p && distTo(p, step.x, step.y) <= (step.radius || 90);
  }
  if (!done) return null;
  m.stepIndex += 1;
  m.holdTime = 0;
  m.checkpointIndex = 0;
  if (m.stepIndex >= m.job.steps.length) { m.complete = true; return 'complete'; }
  const next = m.job.steps[m.stepIndex];
  m.timer = (next && next.seconds) || 0;
  if (m.job.id === 'the-big-score' && m.stepIndex === 1) state.wanted = 4;
  return null;
}

export function missionTarget(state) {
  const m = state && state.mission;
  if (!m || !m.job || m.complete || m.failed) return null;
  const step = m.job.steps[m.stepIndex];
  if (!step) return null;
  if (step.type === 'stealMarked') return { x: 2430, y: 1030 };
  if (step.type === 'checkpoints') {
    const pt = (step.points || [])[m.checkpointIndex];
    return pt ? { x: pt.x, y: pt.y } : null;
  }
  if (typeof step.x === 'number' && typeof step.y === 'number') return { x: step.x, y: step.y };
  return null;
}

export function missionText(state) {
  const m = state && state.mission;
  if (!m || !m.job) return '';
  const job = m.job;
  const step = job.steps[m.stepIndex];
  if (!step) return job.title + ' — done';
  let label = '';
  if (step.type === 'steal') label = 'Steal a car';
  else if (step.type === 'stealMarked') label = 'Steal the yellow Comet';
  else if (step.type === 'reach') label = 'Reach the marker' + (step.seconds ? ' — ' + Math.ceil(Math.max(0, m.timer)) + 's' : '');
  else if (step.type === 'defeat') label = 'Defeat Breakers ' + ((state.flags && state.flags.defeated) || 0) + '/' + (step.count || 0);
  else if (step.type === 'hold') label = 'Hold the door ' + Math.floor(m.holdTime) + '/' + (step.seconds || 0) + 's';
  else if (step.type === 'checkpoints') label = 'Checkpoint ' + (m.checkpointIndex + 1) + '/' + (step.points || []).length + ' — ' + Math.ceil(Math.max(0, m.timer)) + 's';
  else if (step.type === 'earn') label = 'Bring $' + (step.amount || 0) + ' — have $' + playerCash(state);
  return job.title + ' — ' + label;
}

// ---- courier side job: pickup, then a timed 75 s delivery for $150 ----

export function startCourier(state) {
  if (!state) return null;
  let pt = null;
  if (state.city && typeof state.city.randomRoadPoint === 'function') {
    try { pt = state.city.randomRoadPoint(state.rng); } catch (e) { pt = null; }
  }
  if (!pt || typeof pt.x !== 'number') pt = { x: 880, y: 720 };
  state.courier = { stage: 'pickup', x: pt.x, y: pt.y, timer: 0, cooldown: 0 };
  return state.courier;
}

export function updateCourier(state, dt, world) {
  if (!state) return;
  if (!state.courier) state.courier = { stage: 'idle', x: 0, y: 0, timer: 0, cooldown: 0 };
  const c = state.courier;
  if (c.stage === 'cooldown') {
    c.cooldown -= dt;
    if (c.cooldown <= 0) c.stage = 'idle';
    return;
  }
  if (c.stage === 'idle') {
    if (!state.mission && c.cooldown <= 0) startCourier(state);
    return;
  }
  const p = playerPos(state, world);
  if (!p) return;
  if (c.stage === 'pickup') {
    if (distTo(p, c.x, c.y) <= 70) {
      let pt = null;
      if (state.city && typeof state.city.randomRoadPoint === 'function') {
        try { pt = state.city.randomRoadPoint(state.rng); } catch (e) { pt = null; }
      }
      if (!pt || typeof pt.x !== 'number') pt = { x: 2480, y: 1800 };
      c.stage = 'delivery';
      c.x = pt.x; c.y = pt.y; c.timer = 75;
    }
    return;
  }
  if (c.stage === 'delivery') {
    c.timer -= dt;
    if (distTo(p, c.x, c.y) <= 70) {
      if (state.player) state.player.cash = playerCash(state) + 150;
      else state.cash = playerCash(state) + 150;
      c.stage = 'cooldown'; c.cooldown = 20;
      state.toast = { text: 'Courier delivery done — +$150', t: 4 };
      return;
    }
    if (c.timer <= 0) {
      c.stage = 'cooldown'; c.cooldown = 15;
      state.toast = { text: 'Courier delivery failed', t: 4 };
    }
  }
}
