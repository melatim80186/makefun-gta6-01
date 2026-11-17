// SOLMAR — Streets of Gold: every tuning number and colour in one place.
// Fixed-step simulation, a sun-soaked coastal city, and the places that
// drive the story. Nothing here touches the DOM or the network.

// Fixed simulation step: 60 updates per second.
// DT is the name the world step uses for the same constant.
export const STEP = 1 / 60;
export const DT = STEP;

// World size in world units.
export const WORLD_W = 3600;
export const WORLD_H = 2800;

// Road grid: 8 avenues run north-south, 7 streets run east-west.
export const ROAD_W = 72;
export const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
export const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];

// West edge: sand starts at the beach line, water further west.
export const BEACH_X = 480;
export const WATER_X = 240;

// On-foot player tuning.
export const PLAYER = {
  radius: 13,
  walk: 210,
  run: 320,
  maxHp: 100,
  punchRange: 34,
  punchDamage: 20,
  punchCooldown: 0.35,
  shootCooldown: 0.22,
  pistolDamage: 34,
  pistolRange: 420,
};

// Arcade car tuning.
export const CAR = {
  length: 52,
  width: 26,
  accel: 430,
  brake: 700,
  reverseMax: 210,
  maxSpeed: 520,
  sportsMax: 660,
  drag: 0.55,
  steer: 2.5,
  grip: 8.5,
  maxHp: 100,
};
// Short names the world step uses for the same numbers.
CAR.max = CAR.maxSpeed;
CAR.hp = CAR.maxHp;

// Ambient traffic and pedestrians.
export const TRAFFIC = {
  count: 16,
  minSpeed: 95,
  maxSpeed: 150,
  spacing: 70,
};
export const PEDESTRIANS = {
  count: 26,
  walk: 55,
  flee: 190,
};
// PEDS is the short name the world uses for the same tuning object.
export const PEDS = PEDESTRIANS;

// Wanted level: 0-5 stars, heat decays once the coast is clear.
export const WANTED = {
  max: 5,
  quietTime: 8,
  decayEvery: 6,
  bustHold: 1.2,
  policeCars: [0, 1, 2, 3, 4, 5],
  footCops: [0, 1, 1, 2, 2, 3],
};
// Short names the police module uses for the same numbers.
WANTED.quiet = WANTED.quietTime;
WANTED.decay = WANTED.decayEvery;
WANTED.cars = WANTED.policeCars;
WANTED.foot = WANTED.footCops;

// Money: fines, services, pickups and side-job pay, all in dollars.
export const MONEY = {
  bustFine: 200,
  spray: 100,
  gold: 250,
  courier: 150,
};

// localStorage keys for the save game and the best-cash record.
export const SAVE_KEY = 'solmar.save.v1';
export const BEST_KEY = 'solmar.best.v1';

// Golden-hour palette for the whole city.
export const PALETTE = {
  grass: '#79a75a', dryGrass: '#b5a86a', sand: '#e8d5a0',
  water: '#3f8fb8', deepWater: '#2a6a94', asphalt: '#3c3f45',
  lane: '#e8c33a', sidewalk: '#9a9a92', curb: '#6f6f68',
  roofs: ['#c96f4a', '#d9a441', '#5a6b7a', '#9a6b8a', '#5f8a5a'],
  glassRoof: '#7fa8c0', palm: '#2f7a3d', park: '#5d9e4e',
  player: '#f5f5f0', playerAccent: '#d43a2f', cop: '#2a4fd0',
  pedSkin: '#e8b98a', panel: 'rgba(16, 18, 24, 0.85)',
  text: '#f2efe6', muted: '#a8a89e', gold: '#f2c14e',
  red: '#e23b2e', green: '#3fae5a',
  mission: '#ffd94a', objective: '#39d0d8',
};

// Font stacks: plain system sans for the HUD, Trebuchet for display type.
export const FONTS = {
  ui: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  display: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
};

// Named places: the nine labelled spots the story and side jobs use.
export const PLACES = {
  garage: { x: 1030, y: 540, label: "Vera's Garage" },
  marina: { x: 360, y: 2380, label: 'Marina Drop' },
  hotWheels: { x: 2430, y: 1030, label: 'Hot Wheels' },
  turf: { x: 2830, y: 1830, label: "Breakers' Turf" },
  warehouse: { x: 3230, y: 770, label: 'Portside Warehouse' },
  bank: { x: 1730, y: 1490, label: 'Solmar Bank' },
  hospital: { x: 2130, y: 410, label: 'Solmar General' },
  sprayNorth: { x: 1330, y: 2210, label: 'Lay Low Motors' },
  spraySouth: { x: 2930, y: 410, label: 'Lay Low Motors' },
};
