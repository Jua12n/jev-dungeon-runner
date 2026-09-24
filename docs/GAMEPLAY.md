# Gameplay

This document explains the game rules from a player perspective.

## Roles

### Jev

Jev controls the runner. It tries to reach the portal before the timer expires.

### Human player

The human player tries to stop Jev by placing enemies on the board.

---

## Win and loss conditions

You win if:

- the timer reaches `00:00`; or
- Jev's HP reaches zero.

You lose if:

- Jev reaches the portal.

---

## Timer

Each run lasts one minute.

The timer starts only after pressing **Play**. This prevents accidental API calls when the page loads.

Opening the Learning Wizard pauses the timer.

---

## Human actions

You have three enemy placements per run.

To place an enemy:

1. Press **Space** or click **Select enemy tile**.
2. Click an empty floor tile.
3. The enemy is placed if the tile is valid.
4. Cooldown starts.

Invalid placement targets:

- walls;
- player tile;
- portal;
- potions;
- relics;
- existing enemies;
- outside the board.

---

## Jev actions

Jev can choose one legal action per turn:

```ts
MOVE_UP
MOVE_DOWN
MOVE_LEFT
MOVE_RIGHT
ATTACK
PICKUP
USE_POTION
WAIT
```

The available action list changes based on the current state.

Examples:

- `ATTACK` appears only when an enemy is adjacent.
- `USE_POTION` appears only if Jev has a potion and is not at full HP.
- movement actions appear only if the destination is not blocked.

---

## Board items

| Sprite | Meaning |
|---|---|
| Main character | Jev-controlled runner |
| Portal | Jev's escape target |
| Enemy | Blocks movement and damages Jev |
| Potion | Adds a potion to inventory |
| Sword / relic | Collectible score item |

---

## Combat

If Jev is adjacent to an enemy after an action, the enemy hits back.

Jev may choose `ATTACK` when an enemy is adjacent. Attacking removes that enemy but costs some HP.

---

## Random generation

Each reset creates a new dungeon layout.

The generator ensures there is enough reachable floor space before accepting a map.

Randomized elements include:

- player start;
- walls;
- portal;
- enemies;
- potions;
- relics.

---

## Strategy tips

- Do not waste all enemies early.
- Watch Jev's path hints in the debug panel.
- Place enemies near chokepoints when possible.
- Use Learning Mode to inspect what Jev sees before it decides.
