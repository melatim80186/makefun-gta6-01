// SOLMAR — Streets of Gold. Central tuning: every number and colour
// the game uses lives here so the other modules stay small and readable.

// Fixed simulation step (seconds per tick).
export const DT = 1 / 60;

// World size and road layout.
export const WORLD_W = 3600;
export const WORLD_H = 2800;
export const ROAD_W = 72;

// Avenue x positions (vertical roads) and street y positions (horizontal).
export const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
export const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];

// West edge: sand starts at the beach line, water starts further west.
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
  hp: 100,
};

// Ambient traffic and pedestrians.
export const TRAFFIC = { count: 16, speedMin: 95, speedMax: 150, spacing: 70 };
export const PEDS = { count: 26, walk: 55, flee: 190 };

// Wanted level: heat, decay and how many police each star level fields.
export const WANTED = {
  max: 5,
  quietTime: 8,
  decayEvery: 6,
  bustHold: 1.2,
  policeCars: [0, 1, 2, 3, 4, 5],
  footCops: [0, 1, 1, 2, 2, 3],
};

// Money: fines, services and side-job payouts.
export const MONEY = { bustFine: 200, spray: 100, gold: 250, courier: 150 };

// localStorage keys for the save slot and the best-cash record.
export const SAVE_KEY = 'solmar.save.v1';
export const BEST_KEY = 'solmar.best.v1';

// Sun-soaked coastal palette: golden-hour grass, sand and sea,
// warm roof tiles, and the HUD colours.
export const PALETTE = {
  grass: '#7fae56',
  dryGrass: '#a8a35c',
  sand: '#e8cf9a',
  water: '#3f8fb5',
  deepWater: '#2a6d92',
  asphalt: '#3c3f45',
  laneYellow: '#e8c33c',
  sidewalk: '#9a9aa0',
  curb: '#6f6f76',
  roofTerracotta: '#c96f4a',
  roofOchre: '#d9a441',
  roofSlate: '#5d6b7a',
  roofMauve: '#8f6b7d',
  roofGreen: '#5e8a5a',
  roofGlass: '#7fa8b8',
  palm: '#3f7d3a',
  park: '#5d9e4a',
  playerWhite: '#f2f2ee',
  playerRed: '#d43a2f',
  copBlue: '#2f5fd0',
  pedSkin: '#e0b184',
  panel: '#14161cd9',
  text: '#f5f1e6',
  muted: '#b8b4a8',
  gold: '#f0c040',
  red: '#e04030',
  green: '#4fc06a',
  missionYellow: '#ffd94a',
  objectiveCyan: '#4ad8e0',
};

// Font stacks: system sans for body text, Trebuchet for display type.
export const FONTS = {
  sans: 'system-ui, sans-serif',
  display: "'Trebuchet MS', system-ui, sans-serif",
};

// Named places the story and side jobs point at.
export const PLACES = {
  garage: { x: 1030, y: 540, label: "Vera's Garage" },
  marina: { x: 360, y: 2380, label: 'Marina Drop' },
  hotWheels: { x: 2430, y: 1030, label: 'Hot Wheels' },
  breakers: { x: 2830, y: 1830, label: "Breakers' Turf" },
  warehouse: { x: 3230, y: 770, label: 'Portside Warehouse' },
  bank: { x: 1730, y: 1490, label: 'Solmar Bank' },
  general: { x: 2130, y: 410, label: 'Solmar General' },
  layLowNorth: { x: 1330, y: 2210, label: 'Lay Low Motors' },
  layLowSouth: { x: 2930, y: 410, label: 'Lay Low Motors' },
};
