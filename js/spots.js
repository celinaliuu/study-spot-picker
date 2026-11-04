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
//   roomsOftenFull  study rooms are often taken (matters only for group work)
//   groupSpace   group rooms / big tables → bonus for groups of 4+
//   lockIn       focused, library-style vibe (stressed people like it)
//   comfy        cozy dorm-style seating (food-coma people like it)
//   outlets      'few' | 'ok' | 'many'
//   lowPriority  flat penalty
//   requiresCar  removed unless the group has a car / will walk far
//   closedDays   days the spot is closed entirely
//   timeRules    [{ fromHour, toHour, penalty, why }] time-based penalties
//   quirks       ['instruments'] → bad for "silence please"
//   lat/lng      building center
//   coordSource  'osm' (OpenStreetMap building outline) | 'you' (checked by hand) | 'guess' (unverified)
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
  timeRules: [],
  quirks: [],
  vibe: '', // one cute line shown under the spot name on the result screen
};

const spot = (s) => ({ ...base, ...s });

export const SPOTS = [
  spot({
    id: 'walc', name: 'WALC', fullName: 'Wilmeth Active Learning Center',
    lat: 40.42738, lng: -86.91323, coordSource: 'osm',
    noise: NOISE.LOUD,
    noiseRules: [{ fromHour: 19, toHour: 6, noise: NOISE.QUIET }], // quiet after ~7pm
    goodFor: 'both', oftenFull: 2, groupSpace: true, outlets: 'many',
    vibe: "Huge, bright, outlets everywhere. Buzzing by day, library-quiet after 7pm.",
    mapsQuery: 'Wilmeth Active Learning Center, West Lafayette, IN',
  }),
  spot({
    id: 'stew', name: 'Stewart Center library', shortName: 'Stew', fullName: 'Stewart Center (Hicks/Stew library)',
    lat: 40.42506, lng: -86.91274, coordSource: 'osm',
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    vibe: "Old-school library lock-in. Phones down, heads down.",
    mapsQuery: 'Stewart Center, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'beering', name: 'Beering Hall',
    lat: 40.42557, lng: -86.91608, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both',
    vibe: "Low-key tables tucked in the halls. Not many seats, but it gets the job done.",
    mapsQuery: 'Beering Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'frieda', shortName: 'Frieda Parker', name: 'Frieda Parker Hall',
    lat: 40.42828, lng: -86.91965, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both', roomsOftenFull: true, groupSpace: true, comfy: true,
    timeRules: [{ fromHour: 22, toHour: 6, penalty: 3, why: 'common area lights go off after 10pm' }],
    vibe: "Cozy dorm with nice tables. Study rooms go fast, and the lights go off around 10.",
    mapsQuery: 'Frieda Parker Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-north', name: 'Honors North',
    lat: 40.42678, lng: -86.91974, coordSource: 'osm',
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true, outlets: 'few',
    vibe: "Hogwarts-library energy. Bring a charged laptop, outlets are rare.",
    mapsQuery: 'Honors College and Residences North, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'honors-south', name: 'Honors South',
    lat: 40.42578, lng: -86.91949, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both', comfy: true, groupSpace: true,
    vibe: "Comfy dorm vibes with plenty of tables to spread out.",
    mapsQuery: 'Honors College and Residences South, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'winifred', shortName: 'Winifred Parker', name: 'Winifred Parker Hall',
    lat: 40.42785, lng: -86.92033, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both', coffee: 1, oftenFull: 1, groupSpace: true,
    vibe: "Nice tables, and a market close by for snack runs.",
    mapsQuery: 'Winifred Parker Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'hagle', name: 'Hagle Hall',
    lat: 40.42707, lng: -86.91882, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, quirks: ['instruments'],
    vibe: "Pretty building with a live band soundtrack. 🎺",
    mapsQuery: 'Hagle Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'uhall', shortName: 'University Hall', name: 'University Hall',
    lat: 40.42569, lng: -86.91511, coordSource: 'you',
    noise: NOISE.QUIET, goodFor: 'solo', oftenFull: 2,
    vibe: "Classic, quiet, and old-school. Grab a seat if you can find one.",
    mapsQuery: 'University Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'pmu', name: 'PMU', fullName: 'Purdue Memorial Union',
    lat: 40.4247, lng: -86.911, coordSource: 'you',
    noise: NOISE.LOUD, goodFor: 'group', coffee: 2, groupSpace: true,
    vibe: "The campus living room: food, coffee, tall tables, lots of chatter.",
    mapsQuery: 'Purdue Memorial Union, West Lafayette, IN',
  }),
  spot({
    id: 'rawls', shortName: 'Rawls/Krannert', name: 'Rawls / Krannert', fullName: 'Rawls Hall / Krannert (Parrish Library)',
    lat: 40.42369, lng: -86.90982, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both',
    vibe: "Business-school calm with decent seats. A bit of a trek.",
    mapsQuery: 'Rawls Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'south-hall', name: 'South Hall',
    lat: 40.42581, lng: -86.9285, coordSource: 'you',
    noise: NOISE.CHILL, goodFor: 'group', coffee: 1, groupSpace: true, comfy: true,
    vibe: "Shiny new dorm with big conference rooms, attached to Hillenbrand.",
    mapsQuery: 'South Hall, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'dsai', shortName: 'DSAI', name: 'DSAI (2nd floor)', fullName: 'Hall of Data Science and AI',
    lat: 40.429, lng: -86.91419, coordSource: 'you',
    noise: NOISE.QUIET, goodFor: 'solo', lockIn: true,
    vibe: "Clean, modern, and seriously lock-in. Head up to the 2nd floor.",
    mapsQuery: 'Hall of Data Science and AI, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'chaney-hale', name: 'Chaney-Hale',
    lat: 40.42859, lng: -86.91552, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both', oftenFull: 2, lowPriority: true,
    vibe: "Science-building bustle, with labs and people coming and going.",
    mapsQuery: 'Chaney-Hale Hall of Science, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'downtown', shortName: 'Downtown', name: 'Downtown Lafayette', fullName: 'Downtown Lafayette (coffee shops / Tippecanoe library)',
    lat: 40.41687, lng: -86.88931, coordSource: 'osm', // ~Tippecanoe County Public Library
    noise: NOISE.BUZZY, goodFor: 'both', coffee: 2, requiresCar: true,
    vibe: "Coffee shop hopping off campus. A real change of scenery.",
    mapsQuery: 'coffee shops downtown Lafayette, IN',
  }),
  spot({
    id: 'msee', name: 'MSEE', fullName: 'Materials and Electrical Engineering Building',
    lat: 40.42934, lng: -86.91267, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both',
    vibe: "Engineering-building chill. Usually has room.",
    mapsQuery: 'MSEE Building, Purdue University, West Lafayette, IN',
  }),
  spot({
    id: 'burton-morgan', shortName: 'Burton Morgan', name: 'Burton Morgan', fullName: 'Burton D. Morgan Center for Entrepreneurship',
    lat: 40.42375, lng: -86.92285, coordSource: 'osm',
    noise: NOISE.QUIET, goodFor: 'solo', coffee: 1, coffeeDays: [1, 2, 3, 4, 5], lockIn: true,
    closedDays: [0, 6], // closed weekends
    vibe: "Big windows, quiet focus, and a market on weekdays.",
    mapsQuery: 'Burton D. Morgan Center for Entrepreneurship, West Lafayette, IN',
  }),
  spot({
    id: 'meredith-south', shortName: 'Meredith South', name: 'Meredith South',
    lat: 40.4256, lng: -86.92317, coordSource: 'osm',
    noise: NOISE.CHILL, goodFor: 'both', comfy: true,
    vibe: "Calm, comfy dorm study spaces.",
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
