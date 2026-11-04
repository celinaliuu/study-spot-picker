# Study Spot Picker (Purdue)

Ends the "idk, where do you want to study?" debate. See `CLAUDE.md` for the spec.

## Run locally

Geolocation and ES modules need http(s) or localhost, so don't open the file as `file://`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Editing spots

Everything tweakable is in [`js/spots.js`](js/spots.js): tags, coordinates, and scoring weights (`CONFIG`).
Opening hours are not checked: every spot is assumed open except Burton Morgan, which is closed on weekends (`closedDays`).

## How scoring works (short version)

1. **Hard filters** remove a spot if it's Burton Morgan on a weekend or if it's Downtown and the group has no car.
2. Each player gets a **utility** per spot from their answers (noise fit scaled by stress, work type, energy, session length, coffee).
3. **Avoid misery:** a player is *miserable* if their utility is below `MISERY_THRESHOLD` or a veto hits ("silence please" at a buzzy/loud spot or Hagle's instruments, "want to talk" at a silent spot, group work at a solo-only spot). Each miserable player costs `MISERY_PENALTY`, and ranking sorts by **fewest miserable first**, score second.
4. **Group modifiers** cover distance (scaled by weather), low priority, often full (worse for long sessions and big groups), group-space bonus for 4+, and time rules (Frieda after 10pm).
5. The wheel gets the top 3, with slices proportional to score and clamped to 15–60%.

## Assumptions to check

These are judgment calls where the spec was silent or ambiguous. All of them are `CONFIG` values or data fields in `js/spots.js`:

- **Energy** has no rule in the spec. Food-coma players favor comfy spots, coffee, and short walks; wired players tolerate more noise.
- **Nice weather** sets the distance penalty to 0, per the spec (`WEATHER_DISTANCE_FACTOR.nice`). I'd suggest `0.4`, since a 25-min walk still costs something.
- **Downtown with a car** counts as a short drive (flat −3), not a ~45-min walk.
- **WALC** is quiet from 7pm to 6am.
- **Location more than 3 km from campus** is treated as a bad fix, and the dining court picker shows instead.
- **"None of these"** is an explicit reroll button that shows ranks 4–6. "Spin again" re-spins the same 3. Either one uses up the single reroll.

## Coordinates to verify

These are **guesses**. Click each map link and fix anything in `js/spots.js` that's off.
"low" confidence means it's probably within a block or two but could be on the wrong building.

| Place | Type | Lat, Lng | Confidence | Check |
|---|---|---|---|---|
| Earhart | dining court | 40.4256, -86.9250 | low | [map](https://www.google.com/maps?q=40.4256,-86.925) |
| Ford | dining court | 40.4321, -86.9196 | medium | [map](https://www.google.com/maps?q=40.4321,-86.9196) |
| Hillenbrand | dining court | 40.4268, -86.9268 | low | [map](https://www.google.com/maps?q=40.4268,-86.9268) |
| Wiley | dining court | 40.4285, -86.9207 | low | [map](https://www.google.com/maps?q=40.4285,-86.9207) |
| Windsor | dining court | 40.4262, -86.9212 | low | [map](https://www.google.com/maps?q=40.4262,-86.9212) |
| Wilmeth Active Learning Center | spot | 40.4274, -86.9131 | medium | [map](https://www.google.com/maps?q=40.4274,-86.9131) |
| Stewart Center (Hicks/Stew library) | spot | 40.4251, -86.9128 | medium | [map](https://www.google.com/maps?q=40.4251,-86.9128) |
| Beering Hall | spot | 40.4254, -86.9162 | medium | [map](https://www.google.com/maps?q=40.4254,-86.9162) |
| Frieda Parker Hall | spot | 40.4266, -86.9240 | low | [map](https://www.google.com/maps?q=40.4266,-86.924) |
| Honors North | spot | 40.4281, -86.9236 | low | [map](https://www.google.com/maps?q=40.4281,-86.9236) |
| Honors South | spot | 40.4275, -86.9236 | low | [map](https://www.google.com/maps?q=40.4275,-86.9236) |
| Winifred Parker Hall | spot | 40.4260, -86.9240 | low | [map](https://www.google.com/maps?q=40.426,-86.924) |
| Hagle Hall | spot | 40.4279, -86.9157 | low | [map](https://www.google.com/maps?q=40.4279,-86.9157) |
| University Hall | spot | 40.4257, -86.9151 | medium | [map](https://www.google.com/maps?q=40.4257,-86.9151) |
| Purdue Memorial Union | spot | 40.4247, -86.9110 | medium | [map](https://www.google.com/maps?q=40.4247,-86.911) |
| Rawls Hall / Krannert (Parrish Library) | spot | 40.4236, -86.9108 | medium | [map](https://www.google.com/maps?q=40.4236,-86.9108) |
| South Hall | spot | 40.4258, -86.9285 | low | [map](https://www.google.com/maps?q=40.4258,-86.9285) |
| Hall of Data Science and AI | spot | 40.4290, -86.9142 | low | [map](https://www.google.com/maps?q=40.429,-86.9142) |
| Chaney-Hale | spot | 40.4266, -86.9122 | low | [map](https://www.google.com/maps?q=40.4266,-86.9122) |
| Downtown Lafayette (coffee shops / Tippecanoe library) | spot | 40.4170, -86.8890 | medium | [map](https://www.google.com/maps?q=40.417,-86.889) |
| Materials and Electrical Engineering Building | spot | 40.4295, -86.9118 | medium | [map](https://www.google.com/maps?q=40.4295,-86.9118) |
| Burton D. Morgan Center for Entrepreneurship | spot | 40.4223, -86.9232 | low | [map](https://www.google.com/maps?q=40.4223,-86.9232) |
| Meredith South | spot | 40.4248, -86.9233 | low | [map](https://www.google.com/maps?q=40.4248,-86.9233) |

## Tests

Open `http://localhost:8000/tests.html`, or run them in Node:

```sh
node --no-warnings --experimental-detect-module --input-type=module -e "import('./js/tests.js').then(m => m.runAndPrint())"
```
