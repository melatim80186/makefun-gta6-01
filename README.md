# SOLMAR — Streets of Gold

A top-down 2D open-world crime game built for the make.fun gta6-01
contest ("Make GTA 6"). You play Mars Delgado, a driver fresh out of
luck in the sun-soaked coastal city of Solmar, who owes Vera Solano
$5,000 — and the only way out is eight jobs across the city, one stolen
car at a time.

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/melatim80186/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/melatim80186/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

## How to play

Serve the `game/` folder with any static file server, then open
`index.html` in desktop Chrome. For example:

```
npx serve game
# or: python3 -m http.server --directory game
```

No build step, no network requests, no libraries — plain ES modules and
Canvas 2D. Pick **New Game** on the title screen (or **Continue** if a
save exists). The first job starts a few seconds after you begin.

## Controls

- **WASD / arrow keys** — move on foot, drive when in a car
- **Shift** — run on foot
- **E** — enter / exit a car
- **F** — punch
- **Mouse click** — shoot the pistol (mouse aims)
- **Space** — handbrake while driving
- **H** — horn
- **P / Esc** — pause
- **M** — mute the music and sound effects

## The 8 story jobs

All eight jobs come from Vera Solano, and they chain automatically —
the next one starts a few seconds after the last pays out. A failed job
retries after a short wait.

1. **First Wheels** — steal any car and drive it to Vera's Garage. ($200)
2. **The Drop** — deliver the package to the Marina within 90 seconds. ($350)
3. **Hot Wheels** — steal the yellow Comet Downtown and bring it back. ($500)
4. **Payback** — defeat 3 Breakers on their turf, then report back. ($600)
5. **Silent Alarm** — hold the warehouse door for 5 seconds, then get back
   within 120 seconds. ($800)
6. **Getaway Driver** — hit 3 checkpoints within 150 seconds. ($1,000)
7. **The Big Score** — crack the bank vault (hold 6 seconds), then reach
   Lay Low Motors within 150 seconds. ($1,500)
8. **Paid in Full** — bring $5,000 to Vera's Garage and clear the debt. ($0)

Finish all eight and the story ends with "PAID IN FULL" — after that,
Solmar is yours to roam freely.

## Side activities

- **Courier jobs** — repeatable deliveries worth $150 each. Touch the blue
  marker, then reach the next one within 75 seconds.
- **Gold bars** — 12 hidden bars scattered at block corners, $250 apiece.
- **Lay Low Motors** — two spray shops. Drive in while wanted and pay $100
  to clear all your stars.
- **Combat and pickups** — fists and a pistol (ammo pickups grant 24 rounds),
  health pickups, and $40 cash dropped by defeated enemies.

## Wanted level

Stealing a car, hitting a pedestrian, or ramming a police car raises your
wanted level (0–5 stars). Police cars chase you through the streets and
foot officers sprint you down — stand next to one for a moment and you get
BUSTED. Lay low out of sight and the heat cools off, one star at a time.
Getting busted or wasted costs a fine and sends you back to the garage or
the hospital, and the active job fails.

## Sound and save

All sound is synthesized live with WebAudio — engine hum, a two-tone
police siren, gunshots, and a 16-step bass-and-lead music loop. Progress
autosaves to localStorage on every completed job, bust, and wasted, and
on Save & Quit from the pause menu.
