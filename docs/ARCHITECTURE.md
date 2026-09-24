# Architecture

This document explains how Jev Dungeon Runner is organized and why each layer exists.

## Core idea

The project separates **AI judgment** from **game authority**.

Jev is allowed to decide between bounded actions, but it is never allowed to directly mutate the game world. The game engine owns all deterministic rules.

```txt
Jev = decision function
Phaser + world.ts = authority over game state
```

This matters because it keeps the system debuggable and safe:

- Jev cannot invent new actions.
- Jev cannot teleport the player.
- Jev cannot bypass walls.
- Jev cannot modify HP or inventory directly.
- Every decision is validated and applied by normal TypeScript code.

---

## Runtime layers

```txt
index.html
  -> static UI shell, controls, panels, language buttons

src/main.ts
  -> initializes i18n
  -> boots Phaser

src/game/scenes/DungeonScene.ts
  -> Phaser scene lifecycle
  -> loads sprites
  -> registers keyboard/mouse/UI handlers
  -> controls Play / pause / Learning Wizard
  -> calls Jev decision loop
  -> renders the board

src/game/map/world.ts
  -> creates random dungeon
  -> stores world state
  -> computes legal actions
  -> validates enemy placement
  -> applies Jev actions
  -> resolves combat, item pickup, win/loss

src/ai/decisionClient.ts
  -> browser-side fetch wrapper for /api/decision
  -> validates response with Zod
  -> falls back to mock brain on failure

api/decision.ts
  -> server-side endpoint
  -> reads JEV_API_KEY
  -> calls TypeSafe AI Jev System One API
  -> normalizes output into JevDecision
```

---

## Data ownership

### `WorldState`

`WorldState` is the authoritative state of the game.

It contains:

- current turn;
- player position, HP, relic count, potion count;
- walls;
- entities: enemies, potions, relics, portal;
- enemy HP values;
- current turn combat effects for slash/impact rendering;
- recent action history;
- recent position history;
- status: playing, won, or lost;
- last message.

The UI is never the source of truth. The UI only displays the current `WorldState`.

### `JevGameState`

`JevGameState` is a compact decision payload derived from `WorldState`.

It contains only what Jev needs to choose a next action:

- player state;
- adjacent tile types;
- nearest target hints;
- legal actions;
- recent actions;
- recent positions;
- loop warning;
- rules.

This keeps the model request smaller and easier to inspect.

---

## Game loop

A normal live turn looks like this:

```txt
update(time)
  if run not started -> return
  if learning wizard open -> return
  if timer expired -> player wins
  if turn delay not reached -> return
  runDecisionTurn()
```

`runDecisionTurn()` does the AI work:

```txt
runDecisionTurn()
  thinking = true
  gameState = buildJevGameState(world)
  decision = await requestJevDecision(gameState)
  world = applyAction(world, decision.action)
  thinking = false
  renderWorld()
```

---

## Human interaction loop

The human player can place enemies manually.

```txt
button or Space
  -> startEnemyPlacement()
  -> check run started
  -> check drops left
  -> check cooldown
  -> placementMode = true

board click
  -> tryPlaceEnemyAtPointer(pointer)
  -> convert pointer pixel to grid position
  -> placeEnemyAt(world, position)
  -> validate tile
  -> add enemy entity with hp: 2
  -> consume one drop
  -> start cooldown
```

The placement controls are intentionally visible below the dungeon board so the player does not have to open an explanatory card during play.

Validation prevents placement on:

- walls;
- player tile;
- portal;
- potions;
- relics;
- existing enemies;
- outside the board.

---

## Combat authority

Combat is deterministic and lives in `world.ts`, not in Jev.

Rules:

- adjacency means only the four cardinal directions: up, down, left, right;
- diagonals do not count;
- `ATTACK` can damage only one adjacent enemy per Jev turn;
- enemies have 2 HP, so one attack does not instantly remove them;
- after Jev acts, only one adjacent enemy may strike back;
- enemy strike damage is 34 HP, so Jev dies in three hits from full health;
- `combatEffects` records transient visual markers, while the actual HP/entity changes are already resolved in state.

Phaser reads `combatEffects` only for presentation. It does not use effects to decide damage.

---

## Learning Wizard architecture

The Learning Wizard is not just static documentation. It pauses the game and executes or inspects stages of the pipeline.

When opened:

- `developerMode = true`;
- Phaser `update()` returns before live decisions;
- the timer is frozen via paused-time accounting;
- Next/Prev steps call `executeDeveloperStep()`;
- the wizard shows a mini dungeon view, the current state, the relevant trace, and explanatory text.

This allows people studying the project to see the decision pipeline in slow motion.

---

## Why not let Jev decide everything?

The point of this project is not to replace code with AI. The point is to use AI only where judgment is useful.

Good use of Jev here:

- choosing from legal actions;
- evaluating tactical context;
- deciding when to use a potion;
- avoiding loops;
- prioritizing survival vs progress.

Bad use of Jev here:

- enforcing collision rules;
- modifying HP;
- determining whether a tile is occupied;
- checking if the timer expired;
- deciding if an API key is valid.

Those are deterministic tasks and belong in normal code.
