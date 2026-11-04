// ============================================================================
// spots.js: ALL editable data lives here. Tweak tags, hours, coordinates and
// scoring weights without touching any logic.
// ============================================================================

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Hours for spots marked "?" in the spec. Minutes since midnight.
  // The spec only gave a close time (11pm); the 7am open is an assumption.
  PLACEHOLDER_HOURS: { open: 7 * 60, close: 23 * 60 },

  // Hard filter: drop spots closing within this many minutes.
  CLOSING_BUFFER_MIN: 45,

  // Weather lookup + geolocation sanity check center.
  WEST_LAFAYETTE: { lat: 40.4237, lng: -86.9212 },
  MAX_DISTANCE_FROM_CAMPUS_KM: 3, // GPS fix farther than this → ask for a dining court

  // Walking-time model.
  WALK_SPEED_KMH: 4.8,
  DETOUR_FACTOR: 1.3, // straight line → real sidewalk distance

  // Misery ("avoid misery over majority").
  MISERY_THRESHOLD: -3, // a player's utility below this = miserable
  MISERY_PENALTY: 10,   // subtracted per miserable player

  // Distance.
  FREE_WALK_MIN: 5,          // walks shorter than this cost nothing
  DISTANCE_PENALTY_PER_MIN: 0.3,
  WEATHER_DISTANCE_FACTOR: { bad: 2, meh: 1, nice: 0 }, // spec: nice weather removes the penalty
  BAD_WEATHER_DOWNTOWN_PENALTY: 3,

  // Flat modifiers.
  LOW_PRIORITY_PENALTY: 3,
  GROUP_SPACE_BONUS: 2,  // for groups of 4+
  GROUP_SPACE_MIN_PLAYERS: 4,
  OFTEN_FULL_BASE: 1,    // multiplied by oftenFull (0/1/2) and session/group factors
  CLOSES_BEFORE_SESSION_END_PENALTY: 1.5, // per player, if the spot closes mid-session

  // Session length in minutes for each "How long" answer.
  SESSION_MINUTES: { quick: 60, few: 180, late: 300 },

  // Wheel slice share limits.
  WHEEL_MIN_SHARE: 0.15,
  WHEEL_MAX_SHARE: 0.6,

  // Weather categories.
  COLD_F: 40,
  NICE_MIN_F: 55,
  NICE_MAX_F: 85,
};

// Noise scale used everywhere.
export const NOISE = { QUIET: 0, CHILL: 1, BUZZY: 2, LOUD: 3 };

// ---------------------------------------------------------------------------
// Hours presets. Keys are JS Date#getDay() (0 = Sunday). Values are
// [open, close] in minutes since midnight; close may exceed 1440 for
// past-midnight closing (1440 = 12am).
// Library hours from Purdue Libraries (2023). RE-CHECK BEFORE FINALS.
// ---------------------------------------------------------------------------
export const HOURS = {
  ALWAYS: '24/7',
  STEW: {
    1: [8 * 60, 24 * 60], // Mon 8am–12am
    2: [8 * 60, 24 * 60],
    3: [8 * 60, 24 * 60],
    4: [8 * 60, 24 * 60], // Thu
    5: [8 * 60, 17 * 60], // Fri 8am–5pm
    6: [13 * 60, 17 * 60], // Sat 1–5pm
    0: [13 * 60, 24 * 60], // Sun 1pm–12am
  },
};

// ---------------------------------------------------------------------------
// Spots
//
// Field guide:
//   noise        NOISE level (QUIET 0, CHILL 1, BUZZY 2, LOUD 3)
//   noiseRules   time-of-day overrides: [{ fromHour, toHour, noise }]
//                (window wraps past midnight when fromHour > toHour)
//   goodFor      'solo' | 'group' | 'both'
//   coffee       0 none, 1 market/food nearby, 2 coffee on site
//   coffeeDays   days the coffee/market counts (null = every day)
//   oftenFull    0 no, 1 sometimes, 2 yes
//   roomsOftenFull  study rooms are often taken (matters only for group work)
//   groupSpace   group rooms / big tables → bonus for groups of 4+
//   lockIn       focused, library-style vibe (stressed people like it)
//   comfy        cozy dorm-style seating (food-coma people like it)
//   outlets      'few' | 'ok' | 'many'
//   lowPriority  flat penalty
//   requiresCar  removed unless the group has a car / will walk far
//   closedDays   days the spot is closed entirely
//   hours        HOURS preset, or null → CONFIG.PLACEHOLDER_HOURS
//   timeRules    [{ fromHour, toHour, penalty, why }] time-based penalties
//   quirks       ['instruments'] → bad for "silence please"
//   lat/lng      APPROXIMATE, verify on a map (see README)
//   coordConfidence  'medium' | 'low': how sure the coordinate guess is
// ---------------------------------------------------------------------------
const base = {
  noiseRules: [],
  coffee: 0,
  coffeeDays: null,
  oftenFull: 0,
  roomsOftenFull: false,
  groupSpace: false,
  lockIn: false,
  comfy: false,
  outlets: 'ok',
  lowPriority: false,
  requiresCar: false,
  closedDays: [],
  hours: null,
  timeRules: [],
  quirks: [],
  notes: '',
};

const spot = (s) => ({ ...base, ...s });

export const SPOTS = [
  spot({
    id: 'walc', name: 'WALC', fullName: 'Wilmeth Active Learning Center',
    lat: 40.4274, lng: -86.9131, coordConfidence: 'medium',
    noise: NOISE.LOUD,
    noiseRules: [{ fromHour: 19, toHour: 6, noise: NOISE.QUIET }], // quiet after ~7pm
    goodFor: 'both', oftenFull: 2, groupSpace: true, outlets: 'many',
    hours: HOURS.ALWAYS, notes: '24/7 with PUID swipe. Big, lots of outlets.',
    mapsQuery: 'Wilmeth Active Learning Center, West Lafayette, IN',
  }),
  spot({
    id: 'stew', name: 'Stewart Center library', shortName: 'Stew', fullName: 'Stewart Center (Hicks/Stew library)',
    lat: 40.4251, lng: -86.9128, coordConfidence: 'medium',
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    hours: HOURS.STEW, notes: 'Lock-in spot.',
    mapsQuery: 'Stewart Center, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'beering', name: 'Beering Hall',
    lat: 40.4254, lng: -86.9162, coordConfidence: 'medium',
    noise: NOISE.CHILL, goodFor: 'both',
    notes: 'Few spots, but alright.',
    mapsQuery: 'Beering Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'frieda', name: 'Frieda Parker Hall',
    lat: 40.4266, lng: -86.9240, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'both', roomsOftenFull: true, groupSpace: true, comfy: true,
    timeRules: [{ fromHour: 22, toHour: 6, penalty: 3, why: 'common area lights go off after 10pm' }],
    notes: 'Dorm, nice tables. Study rooms often full.',
    mapsQuery: 'Frieda Parker Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-north', name: 'Honors North',
    lat: 40.4281, lng: -86.9236, coordConfidence: 'low',
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true, outlets: 'few',
    notes: '"Hogwarts library" lock-in. Few outlets.',
    mapsQuery: 'Honors College and Residences North, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-south', name: 'Honors South',
    lat: 40.4275, lng: -86.9236, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'both', comfy: true, groupSpace: true,
    notes: 'Comfy dorm, tables.',
    mapsQuery: 'Honors College and Residences South, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'winifred', name: 'Winifred Parker Hall',
    lat: 40.4260, lng: -86.9240, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'both', coffee: 1, oftenFull: 1, groupSpace: true,
    notes: 'Nice tables, market nearby.',
    mapsQuery: 'Winifred Parker Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'hagle', name: 'Hagle Hall',
    lat: 40.4279, lng: -86.9157, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, quirks: ['instruments'],
    notes: 'Bands building, you can hear instruments.',
    mapsQuery: 'Hagle Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'uhall', name: 'University Hall',
    lat: 40.4257, lng: -86.9151, coordConfidence: 'medium',
    noise: NOISE.QUIET, goodFor: 'solo', oftenFull: 2,
    mapsQuery: 'University Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'pmu', name: 'PMU', fullName: 'Purdue Memorial Union',
    lat: 40.4247, lng: -86.9110, coordConfidence: 'medium',
    noise: NOISE.LOUD, goodFor: 'group', coffee: 2, groupSpace: true,
    notes: 'Market + food, nice tall tables.',
    mapsQuery: 'Purdue Memorial Union, West Lafayette, IN',
  }),
  spot({
    id: 'rawls', name: 'Rawls / Krannert', fullName: 'Rawls Hall / Krannert (Parrish Library)',
    lat: 40.4236, lng: -86.9108, coordConfidence: 'medium',
    noise: NOISE.CHILL, goodFor: 'both',
    hours: HOURS.STEW, // Parrish Library: same as Stew
    notes: 'A bit far, seats alright.',
    mapsQuery: 'Rawls Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'south-hall', name: 'South Hall',
    lat: 40.4258, lng: -86.9285, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'group', coffee: 1, groupSpace: true, comfy: true,
    notes: 'New dorm, large conference rooms, connects to Hillenbrand Dining. Farther west.',
    mapsQuery: 'South Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'dsai', name: 'DSAI (2nd floor)', fullName: 'Hall of Data Science and AI',
    lat: 40.4290, lng: -86.9142, coordConfidence: 'low',
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    notes: 'Clean, lock-in.',
    mapsQuery: 'Hall of Data Science and AI, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'chaney-hale', name: 'Chaney-Hale',
    lat: 40.4266, lng: -86.9122, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, lowPriority: true,
    notes: 'Labs, people coming and going.',
    mapsQuery: 'Chaney-Hale Hall of Science, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'downtown', name: 'Downtown Lafayette', fullName: 'Downtown Lafayette (coffee shops / Tippecanoe library)',
    lat: 40.4170, lng: -86.8890, coordConfidence: 'medium', // ~Tippecanoe County Public Library
    noise: NOISE.BUZZY, goodFor: 'both', coffee: 2, requiresCar: true,
    notes: 'Car or long walk only.',
    mapsQuery: 'coffee shops downtown Lafayette, IN',
  }),
  spot({
    id: 'msee', name: 'MSEE', fullName: 'Materials and Electrical Engineering Building',
    lat: 40.4295, lng: -86.9118, coordConfidence: 'medium',
    noise: NOISE.CHILL, goodFor: 'both',
    mapsQuery: 'MSEE Building, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'burton-morgan', name: 'Burton Morgan', fullName: 'Burton D. Morgan Center for Entrepreneurship',
    lat: 40.4223, lng: -86.9232, coordConfidence: 'low',
    noise: NOISE.QUIET, goodFor: 'solo', coffee: 1, coffeeDays: [1, 2, 3, 4, 5], lockIn: true,
    closedDays: [0, 6], // closed weekends
    notes: 'Windows, lock-in. Market on weekdays.',
    mapsQuery: 'Burton D. Morgan Center for Entrepreneurship, West Lafayette, IN',
  }),
  spot({
    id: 'meredith-south', name: 'Meredith South',
    lat: 40.4248, lng: -86.9233, coordConfidence: 'low',
    noise: NOISE.CHILL, goodFor: 'both', comfy: true,
    notes: 'Nice dorm.',
    mapsQuery: 'Meredith South Hall, Purdue University, West Lafayette, IN',
  }),
];

// ---------------------------------------------------------------------------
// Dining courts: the fallback starting point. APPROXIMATE, verify on a map.
// ---------------------------------------------------------------------------
export const DINING_COURTS = [
  { id: 'earhart', name: 'Earhart', lat: 40.4256, lng: -86.9250, coordConfidence: 'low' },
  { id: 'ford', name: 'Ford', lat: 40.4321, lng: -86.9196, coordConfidence: 'medium' },
  { id: 'hillenbrand', name: 'Hillenbrand', lat: 40.4268, lng: -86.9268, coordConfidence: 'low' },
  { id: 'wiley', name: 'Wiley', lat: 40.4285, lng: -86.9207, coordConfidence: 'low' },
  { id: 'windsor', name: 'Windsor', lat: 40.4262, lng: -86.9212, coordConfidence: 'low' },
];
