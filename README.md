# Study Spot Picker (Purdue)

Ends the "idk, where do you want to study?" debate. See `CLAUDE.md` for the spec.

## Run locally

Geolocation and ES modules need http(s) or localhost, so don't open the file as `file://`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

**Location tips**
- Open `http://localhost:8000`, not the `http://[::]:8000` link Python prints. Browsers block location there (the app now redirects automatically).
- On a **phone**, location needs **https**. Opening `http://<your-mac's-IP>:8000` works, but location is blocked, so you'll pick a dining court instead. Host it on GitHub Pages to get https.
- On a Mac, the browser needs Location Services on: System Settings → Privacy & Security → Location Services.

## Modes

- **🎯 Fit the group**: everyone takes the quiz, and the wheel spins between the 3 best-fitting spots.
- **🎲 Wild**: no quiz. The wheel spins between 6 random spots with equal odds. Hard filters still apply (no Burton Morgan on weekends, no Downtown without a car).

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

## Coordinates

Building centers from OpenStreetMap building outlines (checked November 2026) or checked by hand.

| Place | Type | Lat, Lng | Source | Check |
|---|---|---|---|---|
| Earhart | dining court | 40.42567, -86.92525 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42567,-86.92525) |
| Ford | dining court | 40.43210, -86.91963 | OpenStreetMap | [map](https://www.google.com/maps?q=40.4321,-86.91963) |
| Hillenbrand | dining court | 40.42662, -86.92686 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42662,-86.92686) |
| Wiley | dining court | 40.42854, -86.92077 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42854,-86.92077) |
| Windsor | dining court | 40.42698, -86.92100 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42698,-86.921) |
| Wilmeth Active Learning Center | spot | 40.42738, -86.91323 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42738,-86.91323) |
| Stewart Center (Hicks/Stew library) | spot | 40.42506, -86.91274 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42506,-86.91274) |
| Beering Hall | spot | 40.42557, -86.91608 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42557,-86.91608) |
| Frieda Parker Hall | spot | 40.42828, -86.91965 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42828,-86.91965) |
| Honors North | spot | 40.42678, -86.91974 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42678,-86.91974) |
| Honors South | spot | 40.42578, -86.91949 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42578,-86.91949) |
| Winifred Parker Hall | spot | 40.42785, -86.92033 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42785,-86.92033) |
| Hagle Hall | spot | 40.42707, -86.91882 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42707,-86.91882) |
| University Hall | spot | 40.42569, -86.91511 | you | [map](https://www.google.com/maps?q=40.42569,-86.91511) |
| Purdue Memorial Union | spot | 40.42470, -86.91100 | you | [map](https://www.google.com/maps?q=40.4247,-86.911) |
| Rawls Hall / Krannert (Parrish Library) | spot | 40.42369, -86.90982 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42369,-86.90982) |
| South Hall | spot | 40.42581, -86.92850 | you | [map](https://www.google.com/maps?q=40.42581,-86.9285) |
| Hall of Data Science and AI | spot | 40.42900, -86.91419 | you | [map](https://www.google.com/maps?q=40.429,-86.91419) |
| Chaney-Hale | spot | 40.42859, -86.91552 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42859,-86.91552) |
| Downtown Lafayette (coffee shops / Tippecanoe library) | spot | 40.41687, -86.88931 | OpenStreetMap | [map](https://www.google.com/maps?q=40.41687,-86.88931) |
| Materials and Electrical Engineering Building | spot | 40.42934, -86.91267 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42934,-86.91267) |
| Burton D. Morgan Center for Entrepreneurship | spot | 40.42375, -86.92285 | OpenStreetMap | [map](https://www.google.com/maps?q=40.42375,-86.92285) |
| Meredith South | spot | 40.42560, -86.92317 | OpenStreetMap | [map](https://www.google.com/maps?q=40.4256,-86.92317) |

## Tests

Open `http://localhost:8000/tests.html`, or run them in Node:

```sh
node --no-warnings --experimental-detect-module --input-type=module -e "import('./js/tests.js').then(m => m.runAndPrint())"
```
