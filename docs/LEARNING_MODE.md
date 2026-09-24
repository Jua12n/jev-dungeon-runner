# Learning Wizard

The Learning Wizard is an in-app documentation mode for studying how the game works.

It exists because this project is meant to be reviewed, studied, and extended. Instead of only explaining the architecture in markdown, the game can pause itself and walk through the runtime pipeline step by step.

## How to open it

Click:

```txt
Learning mode
```

When the wizard opens:

- the game pauses;
- the timer freezes;
- Jev stops making live turns;
- the mini board shows the current dungeon using the same sprites as the Phaser scene;
- Next/Prev buttons execute or inspect each stage.

Closing the wizard resumes the run.

If you are studying the project to reuse the pattern in your own app, open this wizard first, then move slowly through the steps while comparing the visible board, the mini board, and the JSON payload.

---

## How to study or reuse the pattern

Use the wizard as a map for your own integration:

1. Start with the visible board and understand the game state.
2. Inspect `WorldState`, which is the source of truth.
3. Compare `WorldState` with the smaller `JevGameState` sent to Jev.
4. Look at the exact `choice` request shape.
5. Inspect the returned `JevDecision`.
6. Watch how deterministic code applies that decision.
7. Notice that combat, enemy HP, cooldowns, and win/loss are normal TypeScript rules, not AI-generated behavior.

The reusable architecture is:

```txt
structured app state
  -> compact decision payload
  -> bounded Jev choice
  -> validated response
  -> deterministic state mutation
  -> UI render
```

---

## Wizard steps

### 1. Big picture

Explains the purpose of the project: Jev is a decision layer, not a text generator.

### 2. Current WorldState

Shows the current source-of-truth object:

- player position;
- HP;
- entities;
- enemy HP;
- combat effects;
- walls;
- status;
- message;
- item counts.

### 3. What Jev receives

Executes or displays `buildJevGameState(world)`.

This shows the exact structured payload sent to the decision layer.

### 4. Exact Jev request shape

Shows the server-side request preview:

- endpoint;
- auth location;
- model;
- state;
- `questions.next_action`;
- `type: 'choice'`;
- action criteria.

Also explains `Choice`, `Noul`, and `Score`.

### 5. Decision response

Makes a paused real Jev decision request when available.

This step shows:

- selected action;
- confidence;
- probabilities;
- response source.

### 6. State mutation

Applies the current learning decision through:

```txt
applyAction(world, decision.action)
```

The wizard then shows how `WorldState` changed, including movement, pickups, enemy HP, one-enemy-per-turn counterattacks, and `combatEffects` used for slash/impact visuals.

### 7. Human counter-move

Explains manual enemy placement. The live placement bar is visible below the dungeon board, while this wizard explains what happens behind that UI:

```txt
startEnemyPlacement()
tryPlaceEnemyAtPointer(pointer)
placeEnemyAt(world, position)
```

Placed enemies start with 2 HP. This makes each placement meaningful because Jev cannot delete a new enemy with a single attack.

### 8. Full runtime loop

Connects all methods into the live gameplay loop:

```txt
update()
runDecisionTurn()
buildJevGameState()
requestJevDecision()
applyAction()
renderWorld()
```

---

## Why the wizard pauses the game

Without pausing, the game changes while the user is reading. That makes it hard to understand which state belongs to which decision.

The wizard freezes:

- timer;
- live Jev turns;
- automatic movement.

This makes each step reproducible and inspectable.

---

## Trace events

The wizard records method-level trace events such as:

- `Scene.create()`
- `WorldState inspected`
- `buildJevGameState(world)`
- `requestJevDecision(gameState)`
- `Jev decision received`
- `applyAction(world, decision.action)`
- `startEnemyPlacement()`
- `placeEnemyAt(world, position)`
- `applyAction(world, decision.action)` combat resolution
- `combatEffects` visual rendering

These traces are not just console logs. They are shown inside the UI so reviewers can understand the project without opening DevTools.

---

## Mini dungeon view

The wizard mini board uses the same asset files as the game board:

- `main-front.png`
- `enemy.png`
- `portal.png`
- `potion.png`
- `sword.png`

This helps connect the JSON state to the visual state.

---

## Extending the wizard

To add a new step:

1. Increase `DEVELOPER_STEPS` in `DungeonScene.ts`.
2. Add a new entry in `developerSteps(...)`.
3. Add a matching trace stage in `traceStageFor(...)`.
4. Optionally add executable behavior in `executeDeveloperStep()`.

A good wizard step should answer:

- What code is running?
- What data does it read?
- What data does it write?
- What should the viewer notice?
