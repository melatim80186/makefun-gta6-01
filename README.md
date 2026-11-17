# SOLMAR — Streets of Gold

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/melatim80186/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/melatim80186/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01) (gta6-01).

**SOLMAR — Streets of Gold** is a top-down open-world crime game in the
spirit of GTA: a sun-soaked coastal city to explore on foot and by car.
You owe Vera Solano $5,000 — work 8 story jobs to pay it off, steal cars,
dodge the police, and grab gold along the way. Everything is original:
our own city, characters, story, art, and sounds.

## Features

- Open world: a 3600×2800 city with a road grid, beach and water on the
  west edge, a park, palms, traffic, and pedestrians.
- 8 story jobs for Vera Solano — car theft, timed deliveries, a turf
  fight, vault holds, checkpoint getaways, and the $5,000 payoff.
- Wanted-star police system (0–5 stars): police cars chase you, foot
  officers try to bust you; heat decays when you lay low.
- Steal cars and drive: arcade physics with acceleration, braking,
  handbrake drift, and sports cars that outrun the law.
- Combat on foot: fists and a pistol, armed gang enemies, cash drops.
- Side activities: 12 hidden gold bars ($250 each), repeatable courier
  jobs ($150), and Lay Low spray shops that clear your wanted level ($100).
- HUD with cash, health, weapon, wanted stars, mission line, and a live
  minimap; title, pause, busted/wasted, and story-complete screens.
- Autosave after every job (localStorage); synth sound effects and a
  music loop (WebAudio, no audio files).
- Static files only — no build step, no network requests.

## How to play

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and play.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run (on foot) |
| E | Enter / exit car |
| F | Punch |
| Click | Shoot (pistol, on foot) |
| Space | Handbrake (in car) |
| H | Horn |
| P / Esc | Pause |
| M | Mute |

## Layout

- `game/` — the game: `index.html` plus `src/` (config, city, world,
  missions, traffic, police, combat, render, HUD, audio, input, save).
- `screenshots/` — 4 screenshots of the game itself (chase, street,
  mission, title).
- `main.ts` — the submission program (copies `game/` and `screenshots/`
  to `/output` and writes `dossier.json`).
- `serve.ts` — dev static server.

## License

MIT — see [LICENSE](LICENSE).
