// SOLMAR — Streets of Gold (make.fun gta6-01)
// Central tuning: every number and colour the game uses lives here,
// so the rest of the game reads values from this one module.
export const FIXED_DT = 1 / 60;

export const WORLD = {
  width: 3600,
  height: 2800,
  roadWidth: 72,
  avenues: [480, 880, 1280, 1680, 2080, 2480, 2880, 3280],
  streets: [360, 720, 1080, 1440, 1800, 2160, 2520],
  beachX: 480, // west of this is sand
  waterX: 240, // west of this is water
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 320,
  maxHp: 100,
  punchRange: 34,
  punchDamage: 20,
  punchCooldown: 0.35,
  shootCooldown: 0.22,
  pistolDamage: 34,
  pistolRange: 420,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 430,
  brake: 700,
  reverseMax: 210,
  maxSpeed: 520,
  sportsMaxSpeed: 660,
  drag: 0.55,
  steer: 2.5,
  grip: 8.5,
  maxHp: 100,
};

export const TRAFFIC = { count: 16, minSpeed: 95, maxSpeed: 150, spacing: 70 };

export const PEDS = { count: 26, walkSpeed: 55, fleeSpeed: 190 };

export const WANTED = {
  max: 5,
  quietTime: 8, // seconds with no police nearby before heat starts to drop
  decayInterval: 6, // seconds per star lost once quiet
  bustHold: 1.2, // seconds a foot cop must stand next to the player to bust
  policeCars: [0, 1, 2, 3, 4, 5], // police cars per wanted level 0-5
  footCops: [0, 1, 1, 2, 2, 3], // foot officers per wanted level 0-5
};

export const MONEY = { bustFine: 200, sprayCost: 100, goldValue: 250, courierReward: 150 };

export const KEYS = { save: 'solmar.save.v1', best: 'solmar.best.v1' };

export const PALETTE = {
  grass: '#5da24a',
  dryGrass: '#a8a05c',
  sand: '#e0c98f',
  water: '#2e7fa8',
  deepWater: '#1d5a7d',
  asphalt: '#3a3a40',
  laneYellow: '#e8c832',
  sidewalk: '#9a9a92',
  curb: '#6e6e66',
  roofTerracotta: '#c46a4a',
  roofOchre: '#d9a441',
  roofSlate: '#5a6a7a',
  roofMauve: '#9a6a7a',
  roofGreen: '#5a8a5a',
  roofGlass: '#7a9ab0',
  palm: '#3f7a3a',
  park: '#4a8a3f',
  playerWhite: '#f5f5f0',
  playerAccent: '#d83232',
  copBlue: '#2a4ad8',
  pedSkin: '#d9a878',
  panel: 'rgba(12, 14, 20, 0.82)',
  text: '#f5f2e8',
  muted: '#a8a89e',
  gold: '#f2c14e',
  red: '#e03a2a',
  green: '#4ac25a',
  missionYellow: '#ffd94a',
  objectiveCyan: '#4ad8e0',
};

export const FONTS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
};

export const PLACES = {
  garage: { x: 1030, y: 540, label: "Vera's Garage" },
  marina: { x: 360, y: 2380, label: 'Marina Drop' },
  sportsCar: { x: 2430, y: 1030, label: 'Hot Wheels' },
  turf: { x: 2830, y: 1830, label: "Breakers' Turf" },
  warehouse: { x: 3230, y: 770, label: 'Portside Warehouse' },
  bank: { x: 1730, y: 1490, label: 'Solmar Bank' },
  hospital: { x: 2130, y: 410, label: 'Solmar General' },
  sprayNorth: { x: 1330, y: 2210, label: 'Lay Low Motors' },
  spraySouth: { x: 2930, y: 410, label: 'Lay Low Motors' },
};

export const CONFIG = {
  FIXED_DT,
  WORLD,
  PLAYER,
  CAR,
  TRAFFIC,
  PEDS,
  WANTED,
  MONEY,
  KEYS,
  PALETTE,
  FONTS,
  PLACES,
};
