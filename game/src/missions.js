import { PLACES } from './config.js';

// Named spots, taken from PLACES with the spec numbers as the fallback
// so a renamed place entry can never move a mission target.
function spot(place, fx, fy) {
  const x = place && typeof place.x === 'number' ? place.x : fx;
  const y = place && typeof place.y === 'number' ? place.y : fy;
  return { x, y };
}

const GARAGE = spot(PLACES.garage, 1030, 540);
// Vera's Garage sits inside its block (buildings cover the point), so the
// closest a car can legally pull up is ~116 units away, ~104 on foot.
// A 90-unit radius could never trigger — 130 means "at the garage door".
const GARAGE_REACH = 130;
const MARINA = spot(PLACES.marina, 360, 2380);
const WAREHOUSE = spot(PLACES.warehouse, 3230, 770);
const BANK = spot(PLACES.bank, 1730, 1490);
const LAY_LOW = spot(PLACES.layLowSouth, 2930, 410);
const TURF = spot(PLACES.turf, 2830, 1830);

// Vera Solano's eight jobs. The player owes her $5,000, and every job
// pays that debt down until the last one settles it for good.
export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    giver: 'Vera Solano',
    reward: 200,
    brief: 'Steal a car for Vera and bring it to her garage.',
    wanted: 0,
    steps: [
      { type: 'steal', label: 'Steal any car' },
      { type: 'reach', x: GARAGE.x, y: GARAGE.y, radius: GARAGE_REACH, label: "Bring it to Vera's Garage" },
    ],
  },
  {
    id: 2,
    title: 'The Drop',
    giver: 'Vera Solano',
    reward: 350,
    brief: 'Run a package down to the Marina before the clock runs out.',
    wanted: 1,
    steps: [
      { type: 'reach', x: MARINA.x, y: MARINA.y, radius: 90, seconds: 90, label: 'Deliver to the Marina' },
    ],
  },
  {
    id: 3,
    title: 'Hot Wheels',
    giver: 'Vera Solano',
    reward: 500,
    brief: 'Lift the yellow Comet Downtown and bring it home to Vera.',
    wanted: 0,
    steps: [
      { type: 'stealMarked', label: 'Steal the yellow Comet' },
      { type: 'reach', x: GARAGE.x, y: GARAGE.y, radius: GARAGE_REACH, label: 'Bring the Comet to the Garage' },
    ],
  },
  {
    id: 4,
    title: 'Payback',
    giver: 'Vera Solano',
    reward: 600,
    brief: "Teach the Breakers a lesson on their own turf, then report back.",
    wanted: 1,
    steps: [
      { type: 'defeat', count: 3, x: TURF.x, y: TURF.y, label: 'Defeat 3 Breakers' },
      { type: 'reach', x: GARAGE.x, y: GARAGE.y, radius: GARAGE_REACH, label: 'Report back to Vera' },
    ],
  },
  {
    id: 5,
    title: 'Silent Alarm',
    giver: 'Vera Solano',
    reward: 800,
    brief: "Hold the warehouse door while Vera's crew works inside.",
    wanted: 2,
    steps: [
      { type: 'hold', x: WAREHOUSE.x, y: WAREHOUSE.y, radius: 90, seconds: 5, label: 'Hold the warehouse door' },
      { type: 'reach', x: GARAGE.x, y: GARAGE.y, radius: GARAGE_REACH, seconds: 120, label: 'Get back to the Garage' },
    ],
  },
  {
    id: 6,
    title: 'Getaway Driver',
    giver: 'Vera Solano',
    reward: 1000,
    brief: 'Thread three checkpoints across Solmar before time runs out.',
    wanted: 3,
    steps: [
      {
        type: 'checkpoints',
        points: [
          { x: 880, y: 720 },
          { x: 2480, y: 1800 },
          { x: 3280, y: 360 },
        ],
        seconds: 150,
        label: 'Hit the checkpoints',
      },
    ],
  },
  {
    id: 7,
    title: 'The Big Score',
    giver: 'Vera Solano',
    reward: 1500,
    brief: 'Crack the bank vault, then lay low across town.',
    wanted: 2,
    steps: [
      { type: 'hold', x: BANK.x, y: BANK.y, radius: 90, seconds: 6, label: 'Crack the vault' },
      { type: 'reach', x: LAY_LOW.x, y: LAY_LOW.y, radius: 100, seconds: 150, label: 'Reach Lay Low Motors' },
    ],
  },
  {
    id: 8,
    title: 'Paid in Full',
    giver: 'Vera Solano',
    reward: 0,
    brief: 'Hand Vera the $5,000 you owe her and walk away clean.',
    wanted: 0,
    steps: [
      { type: 'earn', amount: 5000, x: GARAGE.x, y: GARAGE.y, radius: GARAGE_REACH, label: 'Bring $5,000 to Vera' },
    ],
  },
];

// ---- runtime ----

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Where the player counts as standing: the car when driving, else on foot.
function actorPos(S) {
  const car = S.player.car;
  if (car && typeof car.x === 'number' && typeof car.y === 'number') {
    return { x: car.x, y: car.y };
  }
  return { x: S.player.x, y: S.player.y };
}

function toast(S, text, seconds) {
  S.toastText = text;
  S.toastTime = seconds;
}

export function startMission(S, index) {
  const job = MISSIONS[index];
  S.mission = { index, step: 0, timer: 0, hold: 0, defeated: 0, cpIndex: 0 };
  S.wanted = Math.max(S.wanted, job.wanted);
  if (index === 2) S.flags.spawnMarked = true;
  if (index === 3) S.flags.spawnEnemiesAt = { x: TURF.x, y: TURF.y, count: 3 };
  toast(S, job.title + ' — ' + job.brief, 6);
  const first = job.steps[0];
  if (first && first.seconds) S.mission.timer = first.seconds;
}

export function updateMission(S, dt) {
  if (!S.mission) return null;
  const job = MISSIONS[S.mission.index];
  const step = job.steps[S.mission.step];
  if (!step) return null;
  const pos = actorPos(S);
  let done = false;

  if (step.type === 'steal') done = !!S.flags.stole;
  else if (step.type === 'stealMarked') done = !!S.flags.stoleMarked;
  else if (step.type === 'reach') done = dist(pos.x, pos.y, step.x, step.y) <= step.radius;
  else if (step.type === 'defeat') done = S.mission.defeated >= step.count;
  else if (step.type === 'hold') {
    if (dist(pos.x, pos.y, step.x, step.y) <= step.radius) S.mission.hold += dt;
    else S.mission.hold = Math.max(0, S.mission.hold - dt * 0.5);
    done = S.mission.hold >= step.seconds;
  } else if (step.type === 'checkpoints') {
    const point = step.points[S.mission.cpIndex];
    if (point && dist(pos.x, pos.y, point.x, point.y) <= 70) S.mission.cpIndex += 1;
    done = S.mission.cpIndex >= step.points.length;
  } else if (step.type === 'earn') {
    done = S.player.cash >= step.amount && dist(pos.x, pos.y, step.x, step.y) <= step.radius;
  }

  if (done) {
    if (job.id === 7 && S.mission.step === 0) {
      S.wanted = 4;
      toast(S, 'The alarm is up — 4 stars!', 6);
    }
    if (S.mission.step >= job.steps.length - 1) return 'complete';
    S.mission.step += 1;
    S.mission.hold = 0;
    const next = job.steps[S.mission.step];
    S.mission.timer = next && next.seconds ? next.seconds : 0;
    return null;
  }

  if (step.seconds) {
    S.mission.timer -= dt;
    if (S.mission.timer <= 0) {
      S.mission.timer = 0;
      return 'failed';
    }
  }
  return null;
}

export function missionText(S) {
  if (!S.mission) return '';
  const job = MISSIONS[S.mission.index];
  const step = job.steps[S.mission.step];
  if (!step) return job.title;
  let text = job.title + ' — ' + step.label;
  if (step.type === 'hold') {
    text += ' hold ' + Math.floor(S.mission.hold) + 's/' + step.seconds + 's';
  } else if (step.type === 'defeat') {
    text += ' defeated ' + S.mission.defeated + '/' + step.count;
  } else if (step.type === 'checkpoints') {
    text += ' checkpoint ' + Math.min(S.mission.cpIndex + 1, step.points.length) + '/' + step.points.length;
  } else if (step.type === 'earn') {
    text += ' $' + S.player.cash + '/$' + step.amount;
  }
  if (step.seconds) text += ' ' + Math.ceil(S.mission.timer) + 's left';
  return text;
}

export function startCourier(S) {
  const p = S.city.randomRoadPoint();
  S.courier = { phase: 'pickup', x: p.x, y: p.y, tx: 0, ty: 0, timer: 0, cooldown: 0 };
}

export function updateCourier(S, dt) {
  const c = S.courier;
  if (!c) return;
  if (c.phase === 'pickup') {
    if (dist(S.player.x, S.player.y, c.x, c.y) <= 60) {
      const p = S.city.randomRoadPoint();
      c.phase = 'deliver';
      c.tx = p.x;
      c.ty = p.y;
      c.timer = 75;
    }
  } else if (c.phase === 'deliver') {
    if (dist(S.player.x, S.player.y, c.tx, c.ty) <= 60) {
      S.player.cash += 150;
      toast(S, '+$150 courier paid', 4);
      c.phase = 'cooldown';
      c.cooldown = 20;
      return;
    }
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = 0;
      toast(S, 'Delivery failed', 4);
      c.phase = 'cooldown';
      c.cooldown = 15;
    }
  } else if (c.phase === 'cooldown') {
    c.cooldown -= dt;
    if (c.cooldown <= 0) {
      c.cooldown = 0;
      c.phase = 'idle';
    }
  }
}
