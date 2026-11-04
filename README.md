# Study Spot Picker (Purdue)

Ends the "idk, where do you want to study?" debate. See `CLAUDE.md` for the spec.

## Run locally

Geolocation and ES modules need http(s) or localhost, so don't open the file as `file://`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Editing spots

Everything tweakable is in [`js/spots.js`](js/spots.js): tags, hours, coordinates, and scoring weights (`CONFIG`).
Spots with unknown hours use `CONFIG.PLACEHOLDER_HOURS` (7am–11pm). Change it in one place.
Library hours come from Purdue Libraries (2023). **Re-check before finals.**

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
