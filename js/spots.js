// ============================================================================
// spots.js: ALL editable data lives here. Tweak tags, coordinates and
// scoring weights without touching any logic.
// ============================================================================

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------
export const CONFIG = {
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
// Spots
//
// Field guide:
//   shortName    optional label for the wheel (keep ≤ 15 characters)
//   noise        NOISE level (QUIET 0, CHILL 1, BUZZY 2, LOUD 3)
//   noiseRules   time-of-day overrides: [{ fromHour, toHour, noise }]
//                (window wraps past midnight when fromHour > toHour)
//   goodFor      'solo' | 'group' | 'both'
//   coffee       0 none, 1 market/food nearby, 2 coffee on site
//   coffeeDays   days the coffee/market counts (null = every day)
//   oftenFull    0 no, 1 sometimes, 2 yes
//   groupSpace   group rooms / big tables → bonus for groups of 4+
//   lockIn       focused, library-style vibe (stressed people like it)
//   comfy        cozy dorm-style seating (food-coma people like it)
//   outlets      'few' | 'ok' | 'many'
//   lowPriority  flat penalty
//   requiresCar  removed unless the group has a car / will walk far
//   closedDays   days the spot is closed entirely
//   timeRules    [{ fromHour, toHour, penalty, why }] time-based penalties
//   quirks       ['instruments'] → bad for "silence please"
//   lat/lng/coordSource  from AT (below): spots in the same building share coordinates
// ---------------------------------------------------------------------------
const base = {
  noiseRules: [],
  coffee: 0,
  coffeeDays: null,
  oftenFull: 0,
  groupSpace: false,
  lockIn: false,
  comfy: false,
  outlets: 'ok',
  lowPriority: false,
  requiresCar: false,
  closedDays: [],
  timeRules: [],
  quirks: [],
  vibe: '', // one cute line shown under the spot name on the result screen
};

const spot = (s) => ({ ...base, ...s });

// Building coordinates, shared by every spot inside that building.
// coordSource: 'osm' (OpenStreetMap building outline) | 'you' (checked by hand)
const AT = {
  walc: { lat: 40.42738, lng: -86.91323, coordSource: 'osm' },
  stew: { lat: 40.42506, lng: -86.91274, coordSource: 'osm' },
  beering: { lat: 40.42557, lng: -86.91608, coordSource: 'osm' },
  frieda: { lat: 40.42828, lng: -86.91965, coordSource: 'osm' },
  honorsNorth: { lat: 40.42678, lng: -86.91974, coordSource: 'osm' },
  honorsSouth: { lat: 40.42578, lng: -86.91949, coordSource: 'osm' },
  winifred: { lat: 40.42785, lng: -86.92033, coordSource: 'osm' },
  krach: { lat: 40.42761, lng: -86.92123, coordSource: 'osm' },
  hagle: { lat: 40.42707, lng: -86.91882, coordSource: 'osm' },
  uhall: { lat: 40.42569, lng: -86.91511, coordSource: 'you' },
  pmu: { lat: 40.4247, lng: -86.911, coordSource: 'you' },
  rawls: { lat: 40.42369, lng: -86.90982, coordSource: 'osm' },
  southHall: { lat: 40.42581, lng: -86.9285, coordSource: 'you' },
  dsai: { lat: 40.429, lng: -86.91419, coordSource: 'you' },
  chaneyHale: { lat: 40.42859, lng: -86.91552, coordSource: 'osm' },
  downtown: { lat: 40.41687, lng: -86.88931, coordSource: 'osm' }, // ~Tippecanoe County Public Library
  msee: { lat: 40.42934, lng: -86.91267, coordSource: 'osm' },
  burtonMorgan: { lat: 40.42375, lng: -86.92285, coordSource: 'osm' },
  meredithSouth: { lat: 40.4256, lng: -86.92317, coordSource: 'osm' },
};

// Tag each building's coordinates with its key, so spots know which building they're in
// (the wheel shows at most one spot per building).
for (const [key, at] of Object.entries(AT)) at.building = key;

export const SPOTS = [
  spot({
    id: 'walc', name: 'WALC', fullName: 'Wilmeth Active Learning Center', ...AT.walc,
    noise: NOISE.LOUD,
    noiseRules: [{ fromHour: 19, toHour: 6, noise: NOISE.QUIET }], // quiet after ~7pm
    goodFor: 'both', oftenFull: 2, groupSpace: true, outlets: 'many',
    vibe: 'Huge, bright, outlets everywhere. Crowded and loud by day, library-quiet after 7pm.',
    mapsQuery: 'Wilmeth Active Learning Center, West Lafayette, IN',
  }),

  // --- Stewart Center ---
  spot({
    id: 'stew', name: 'Stew library', shortName: 'Stew', fullName: 'Stewart Center library', ...AT.stew,
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    vibe: 'Old-school library lock-in. Phones down, heads down.',
    mapsQuery: 'Stewart Center, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'stew-basement', name: 'Stew basement', ...AT.stew,
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    vibe: 'Down in the basement, where the real lock-ins happen. 🔒',
    mapsQuery: 'Stewart Center, Purdue University, West Lafayette, IN',
  }),

  spot({
    id: 'beering', name: 'Beering Hall', ...AT.beering,
    noise: NOISE.CHILL, goodFor: 'both',
    vibe: 'Low-key tables tucked in the halls. Not many seats, but it gets the job done.',
    mapsQuery: 'Beering Hall, Purdue University, West Lafayette, IN',
  }),

  // --- Frieda Parker Hall ---
  spot({
    id: 'frieda-common', name: 'Frieda Parker common area', shortName: 'Frieda commons', ...AT.frieda,
    noise: NOISE.CHILL, goodFor: 'both', groupSpace: true, comfy: true,
    timeRules: [{ fromHour: 22, toHour: 6, penalty: 3, why: 'the common area lights go off after 10pm' }],
    vibe: 'Cozy dorm common area with nice tables, until the lights go off at 10.',
    mapsQuery: 'Frieda Parker Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'frieda-rooms', name: 'Frieda Parker study rooms', shortName: 'Frieda rooms', ...AT.frieda,
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, groupSpace: true,
    vibe: 'Your own little room, lights on all night. Grab one if you can, they go fast.',
    mapsQuery: 'Frieda Parker Hall, Purdue University, West Lafayette, IN',
  }),

  // --- Honors College and Residences ---
  spot({
    id: 'honors-north-library', name: 'Honors North library', shortName: 'Hogwarts lib', fullName: 'Honors North "Hogwarts" library', ...AT.honorsNorth,
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true, outlets: 'few',
    vibe: 'The Hogwarts library. Silent, gorgeous, and very lock-in. Bring a charged laptop. 🪄',
    mapsQuery: 'Honors College and Residences North, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-north', name: 'Honors North (outside the library)', shortName: 'Honors North', ...AT.honorsNorth,
    noise: NOISE.BUZZY, goodFor: 'both',
    vibe: 'The rest of Honors North: chattier, and you can actually talk.',
    mapsQuery: 'Honors College and Residences North, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-south-lobby', name: 'Honors South lobby', shortName: 'Honors S lobby', ...AT.honorsSouth,
    noise: NOISE.BUZZY, goodFor: 'group', groupSpace: true,
    vibe: 'Big lobby tables that fit the whole crew.',
    mapsQuery: 'Honors College and Residences South, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-south-lounge', name: 'Honors South study lounge', shortName: 'Honors S lounge', ...AT.honorsSouth,
    noise: NOISE.CHILL, goodFor: 'both', comfy: true,
    vibe: 'Comfy dorm study lounge with tables.',
    mapsQuery: 'Honors College and Residences South, Purdue University, West Lafayette, IN',
  }),

  spot({
    id: 'winifred-red-room', name: 'Winifred Red Room', shortName: 'Red Room', fullName: 'Winifred Parker Hall Red Room', ...AT.winifred,
    noise: NOISE.CHILL, goodFor: 'both', coffee: 1, oftenFull: 1, groupSpace: true,
    vibe: 'Nice tables in the Red Room, with the market right there for snack runs. ❤️',
    mapsQuery: 'Winifred Parker Hall, Purdue University, West Lafayette, IN',
  }),

  // --- Krach Leadership Center ---
  spot({
    id: 'krach-4', name: 'Krach 4th floor', shortName: 'Krach 4th', fullName: 'Krach Leadership Center, 4th floor', ...AT.krach,
    noise: NOISE.CHILL, goodFor: 'both', lockIn: true,
    vibe: 'Solid study floor. Talk it out or lock in, both work.',
    mapsQuery: 'Krach Leadership Center, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'krach-2', name: 'Krach 2nd floor', shortName: 'Krach 2nd', fullName: 'Krach Leadership Center, 2nd floor', ...AT.krach,
    noise: NOISE.CHILL, goodFor: 'both', lockIn: true,
    vibe: 'Solid study floor. Talk it out or lock in, both work.',
    mapsQuery: 'Krach Leadership Center, Purdue University, West Lafayette, IN',
  }),

  spot({
    id: 'hagle', name: 'Hagle Hall', ...AT.hagle,
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, quirks: ['instruments'],
    vibe: 'More chill than lock-in, with a live band-practice soundtrack. 🎺',
    mapsQuery: 'Hagle Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'uhall', name: 'University Hall', ...AT.uhall,
    noise: NOISE.QUIET, goodFor: 'solo', oftenFull: 2,
    vibe: 'Classic and pretty quiet. Grab a seat if you can find one.',
    mapsQuery: 'University Hall, Purdue University, West Lafayette, IN',
  }),

  // --- Purdue Memorial Union ---
  spot({
    id: 'pmu-market', name: 'PMU by Boiler Market', shortName: 'PMU market', ...AT.pmu,
    noise: NOISE.CHILL, goodFor: 'both', coffee: 2, lockIn: true, groupSpace: true,
    vibe: 'The quieter side of PMU: tall tables, lock-in mode, and Boiler Market for snacks.',
    mapsQuery: 'Purdue Memorial Union, West Lafayette, IN',
  }),
  spot({
    id: 'pmu-walkons', name: "PMU by Walk-On's", shortName: "PMU Walk-On's", ...AT.pmu,
    noise: NOISE.LOUD, goodFor: 'group', coffee: 2, groupSpace: true,
    vibe: 'Noisy, but the tall tables are great for working as a group.',
    mapsQuery: 'Purdue Memorial Union, West Lafayette, IN',
  }),

  spot({
    id: 'rawls', name: 'Rawls / Krannert', shortName: 'Rawls/Krannert', fullName: 'Rawls Hall / Krannert', ...AT.rawls,
    noise: NOISE.CHILL, goodFor: 'both',
    vibe: 'A little farther than usual, but the seats are alright.',
    mapsQuery: 'Rawls Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'south-hall', name: 'South Hall', ...AT.southHall,
    noise: NOISE.CHILL, goodFor: 'group', coffee: 1, groupSpace: true, comfy: true,
    vibe: 'Shiny new dorm with big conference rooms, a bit out west by Hillenbrand.',
    mapsQuery: 'South Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'dsai', name: 'DSAI (2nd floor)', shortName: 'DSAI', fullName: 'Hall of Data Science and AI, 2nd floor', ...AT.dsai,
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    vibe: 'Quiet, clean, and seriously lock-in. Head up to the 2nd floor.',
    mapsQuery: 'Hall of Data Science and AI, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'chaney-hale', name: 'Chaney-Hale', fullName: 'Chaney-Hale Hall of Science', ...AT.chaneyHale,
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, lowPriority: true,
    vibe: 'Busy science building, with people heading to labs all the time.',
    mapsQuery: 'Chaney-Hale Hall of Science, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'downtown', name: 'Downtown Lafayette', shortName: 'Downtown', fullName: 'Downtown Lafayette (coffee shops / Tippecanoe library)', ...AT.downtown,
    noise: NOISE.BUZZY, goodFor: 'both', coffee: 2, requiresCar: true,
    vibe: 'Coffee shops or the Tippecanoe library downtown. A real change of scenery.',
    mapsQuery: 'coffee shops downtown Lafayette, IN',
  }),
  spot({
    id: 'msee', name: 'MSEE', fullName: 'Materials and Electrical Engineering Building', ...AT.msee,
    noise: NOISE.CHILL, goodFor: 'both',
    vibe: 'Chill engineering-building study area.',
    mapsQuery: 'MSEE Building, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'burton-morgan', name: 'Burton Morgan', fullName: 'Burton D. Morgan Center for Entrepreneurship', ...AT.burtonMorgan,
    noise: NOISE.QUIET, goodFor: 'solo', coffee: 1, coffeeDays: [1, 2, 3, 4, 5], lockIn: true,
    closedDays: [0, 6], // closed weekends
    vibe: 'Quiet lock-in with big windows, and a market on weekdays.',
    mapsQuery: 'Burton D. Morgan Center for Entrepreneurship, West Lafayette, IN',
  }),
  spot({
    id: 'meredith-south', name: 'Meredith South', ...AT.meredithSouth,
    noise: NOISE.CHILL, goodFor: 'both', comfy: true,
    vibe: 'Nice, calm dorm study spaces.',
    mapsQuery: 'Meredith South Hall, Purdue University, West Lafayette, IN',
  }),
];

// ---------------------------------------------------------------------------
// Dining courts: the fallback starting point. Coordinates from OpenStreetMap.
// ---------------------------------------------------------------------------
export const DINING_COURTS = [
  { id: 'earhart', name: 'Earhart', lat: 40.42567, lng: -86.92525, coordSource: 'osm' },
  { id: 'ford', name: 'Ford', lat: 40.4321, lng: -86.91963, coordSource: 'osm' },
  { id: 'hillenbrand', name: 'Hillenbrand', lat: 40.42662, lng: -86.92686, coordSource: 'osm' },
  { id: 'wiley', name: 'Wiley', lat: 40.42854, lng: -86.92077, coordSource: 'osm' },
  { id: 'windsor', name: 'Windsor', lat: 40.42698, lng: -86.921, coordSource: 'osm' },
];
