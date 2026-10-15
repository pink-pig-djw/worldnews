// Shared constants: categories, colours, refresh cadence.

export const CATEGORIES = [
  { id: 'conflict', color: '#ff4d5e', icon: 'crosshair' },
  { id: 'unrest', color: '#ff9645', icon: 'megaphone' },
  { id: 'disaster', color: '#ffcc33', icon: 'alert' },
  { id: 'politics', color: '#4c8dff', icon: 'landmark' },
  { id: 'diplomacy', color: '#a47cff', icon: 'chat' },
  { id: 'economy', color: '#22c993', icon: 'trend' },
  { id: 'society', color: '#ff7eb6', icon: 'heart' },
  { id: 'science', color: '#4fd8ef', icon: 'atom' },
  { id: 'other', color: '#9aa5b1', icon: 'news' },
];

export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Subtype -> icon. Falls back to the category icon.
export const SUB_ICON = {
  airstrike: 'plane', missile: 'rocket', drone: 'drone', shelling: 'burst', clash: 'swords', attack: 'flame',
  naval: 'ship', ceasefire: 'flag', military: 'shield', nuclear: 'radiation',
  quake: 'quake', flood: 'waves', storm: 'cyclone', fire: 'flame', volcano: 'volcano', heat: 'thermo',
  landslide: 'mountain', accident: 'alert', drought: 'thermo', tsunami: 'waves', dust: 'wind', snow: 'snow',
  protest: 'megaphone', riot: 'flame', coup: 'crown', strike: 'hand', arrests: 'lock',
  election: 'ballot', court: 'gavel', sanctions: 'ban', summit: 'chat', treaty: 'pen',
  space: 'satellite', tech: 'cpu', climate: 'leaf', health: 'heart', humanitarian: 'aid', migration: 'route',
};

export const HAZARD_COLOR = { red: '#ff3b47', orange: '#ff9a3c', green: '#3fd28a', null: '#ffcc33' };
export const QUAKE_COLOR = '#ffb02e';

export const DATA_URL = 'data/latest.json';
export const REFRESH_MS = 5 * 60 * 1000;
export const LIVE_QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';

export const TIME_WINDOWS = [6, 12, 24, 48];

export const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
