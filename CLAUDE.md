# Study Spot Picker (Purdue)

A web app that ends the "idk, where do you want to study?" debate. Friends finish eating at a dining court, pass one phone around, each answers a quick mood quiz, and the app spins a wheel between the 3 spots that fit the group best.

## Who it's for
- Groups of **2–6 friends** at Purdue who clash because they're in different moods.
- Used **right after eating at a dining court**, so the pick is for *right now*.

## Tech constraints
- Plain HTML/CSS/JS, single page, no backend, no build step. Must work well on a phone.
- Keep spot data in one easy-to-edit file (`spots.js` or `spots.json`) so tags can be tweaked without touching logic.
- Weather: Open-Meteo API (free, no key). West Lafayette ≈ 40.4237, -86.9212.

## Flow
0. **Opening page**: a cute, minimal title screen ("Which study spot?") with a "Tap to play" button.
1. **Start screen**: choose the mode (quiz or wild), the number of players (2–6), "Feel like walking?" (anywhere's fine / keep it close), spots on the wheel (3–6), and "Up for Downtown?" (car or long walk). **Only if they pick "Keep it close"**, ask for the starting point with a "Use my location" button (browser geolocation). If location is denied or unavailable, fall back to choosing the dining court you're leaving from (Earhart, Ford, Hillenbrand, Wiley, Windsor).
2. **Pass-the-phone quiz**: each player enters a name and taps through the questions. A "pass to next person" screen in between hides the previous answers.
3. **Scoring** (see below), using the current weather plus the current day and time.
4. **Wheel**: the top spots (group picks 3–6, default 5; at most one per building), with slices weighted by score so the best fit is likelier. Spin animation.
5. **Result**: the spot, a one-line "why" (e.g. "Quiet enough for the stressed people, coffee nearby, and it's 41° and drizzly"), and a Google Maps link.
6. **One reroll** per session (it re-spins the same spots, or the next set of spots if everyone hates them).

## Quiz (one tap per question)
1. **Stress**: chill / kinda stressed / panicking
2. **Energy**: wired / normal / food-coma tired
3. **Noise**: silence please / background buzz / want to talk
4. **Work type**: solo reading/writing / problem sets together / group project
5. **How long**: quick hour / a few hours / until they kick us out
6. **Coffee?**: yes / don't care

## Scoring rules
- Each answer adds or subtracts points per spot based on its tags.
- **Avoid misery over majority**: if any player would strongly dislike a spot (e.g. "panicking" + "silence please" vs. a loud spot), apply a big penalty. The goal is the fewest unhappy people, not the most votes.
- **Hard filters** (remove the spot entirely):
  - Burton Morgan on Saturday/Sunday.
  - Stew library / Stew basement when the library is closed or closing within ~45 min.
  - Downtown Lafayette unless the group said they have a car / will walk far.
- **Distance**: only counts if the group picks "Keep it close" on the start screen. Then: penalty based on the walk from the user's location (or chosen dining court), and in rain, snow, or cold (< 40°F) penalize far spots and downtown more (no distance penalty in nice weather). Otherwise distance is ignored and location is optional. Show the approximate walking time on the result screen when known (e.g. "~8 min walk").
- **Time of day**: WALC is "loud" before ~7pm and "quiet" after.
- **Low priority** spots get a flat penalty.
- **Often full** spots get a small penalty, bigger for longer sessions and bigger groups.
- Groups of 4+ get a bonus for spots with group rooms or big tables.

## Spots
Assume the group can get into every spot, dorms included. Opening hours are **not** used for filtering or scoring (every spot is assumed open), except Burton Morgan, which is closed on weekends, and the Stew library and basement, which follow Purdue Libraries hours: Sun 1pm–12am, Mon–Thu 8am–12am, Fri 8am–6pm, Sat 1–5pm (checked Nov 2026; re-check each semester at lib.purdue.edu/hours).

| Spot | Noise | Good for | Coffee/food | Often full | Other |
|---|---|---|---|---|---|
| WALC | loud and crowded by day, quieter at night | both | — | yes | big, lots of outlets; 24/7 with PUID swipe |
| Stew library | quiet | solo | — | no | good lock-in; library hours |
| Stew basement | quiet | solo | — | no | good lock-in; library hours |
| Beering Hall | chill | both | — | no | few spots, but alright |
| Frieda Parker common area | chill | both | — | no | dorm, nice tables; lights off after 10pm |
| Frieda Parker study rooms | chill | both | — | yes | lit at night |
| Honors North library ("Hogwarts") | quiet | solo | — | no | lock-in; few outlets |
| Honors North (outside the library) | chatty | both | — | no | — |
| Honors South lobby | buzzy | group | — | no | tables for large groups |
| Honors South study lounge | chill | both | — | no | comfy dorm, tables |
| Winifred Red Room | chill | both | market nearby | sometimes | nice tables |
| Krach 4th floor | chill | both | — | no | can talk or lock in |
| Krach 2nd floor | chill | both | — | no | can talk or lock in |
| Hagle Hall | chill | both | — | yes | can hear instruments; more chill than lock-in |
| University Hall | quiet | solo | — | yes | — |
| PMU by Boiler Market | quieter | both | market + food | no | lock-in at tall tables |
| PMU by Walk-On's | loud | group | food | no | tall tables, good for group study |
| Rawls / Krannert | chill | both | — | no | a bit far; seats alright |
| South Hall | chill | group | connects to Hillenbrand Dining | no | new dorm, large conference rooms; farther west |
| DSAI (2nd floor) | quiet | solo | — | no | clean, lock-in |
| Chaney-Hale | chill | both | — | yes | labs, people coming and going; **low priority** |
| Downtown Lafayette (coffee shops / Tippecanoe library) | buzzy | both | coffee | no | car or long walk only |
| MSEE | chill | both | — | no | — |
| Lawson (CS building) | busy on school days, quiet on weekends | both | On-the-GO (school days) | sometimes | — |
| Burton Morgan (Entre) | quiet | solo | market (weekdays) | no | windows, lock-in; **closed weekends** |
| Meredith South | chill | both | — | no | nice dorm |


### Distances
Geolocation only works on HTTPS or localhost. That's fine for GitHub Pages and local testing, but don't open the file directly as file://. Give each spot approximate lat/lng coordinates, and each dining court too. Compute walking distance from them. Put all coordinates in the data file and **list them for me to verify on a map**, since guesses could be off.

## Look and feel
Not decided yet. Keep it clean and mobile-first for now, with big tap targets. A weather-reactive theme might come later.

## Later ideas (not v1)
- Thumbs up/down after a session to learn what the group likes
- Fairness memory (whoever lost last time gets a bit more weight)
- Shared link so everyone votes from their own phone
- Focus timer after the pick
- Weather-reactive theme
