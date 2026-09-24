# Jev Decision Pipeline

This document explains the complete Jev integration, from game state to API request to applied game action.

## 1. WorldState is converted into JevGameState

The game starts with the full `WorldState`, which contains everything the game needs.

Jev does not receive the full object. Instead, `buildJevGameState(world)` extracts a compact payload.

Important fields:

```ts
interface JevGameState {
  turn: number;
  goal: 'survive_collect_and_escape';
  player: {
    hp: number;
    coins: number;
    potions: number;
    x: number;
    y: number;
  };
  nearest: {
    enemy: { direction: DirectionHint; distance: number | null };
    potion: { direction: DirectionHint; distance: number | null };
    coin: { direction: DirectionHint; distance: number | null };
    exit: { direction: DirectionHint; distance: number | null };
  };
  adjacent: Record<'up' | 'down' | 'left' | 'right', TileKind>;
  legalActions: JevAction[];
  recentActions: JevAction[];
  recentPositions: Array<{ x: number; y: number }>;
  loopWarning: boolean;
  rules: string[];
}
```

The payload is intentionally compact and typed. It gives Jev enough context to make a decision without giving it authority over the game.

---

## 2. Legal actions are computed before Jev is called

The game computes `legalActions` before sending the request.

Examples:

- `MOVE_UP` is legal only if the tile above is not blocked.
- `ATTACK` is legal only if an enemy is adjacent in one of the four cardinal directions.
- `USE_POTION` is legal only if Jev has a potion and HP is below max.
- `WAIT` is always available as a fallback.

This means Jev cannot return arbitrary commands. It can only select from the legal action set.

Important combat detail: Jev chooses `ATTACK`, but the deterministic engine decides which adjacent enemy is hit, how much HP that enemy has left, and whether an enemy strikes back. Jev does not directly remove entities.

---

## 3. Browser calls the local API endpoint

The browser never calls TypeSafe AI directly.

It calls:

```txt
POST /api/decision
```

That endpoint is implemented in:

```txt
api/decision.ts
```

Local development works through custom Vite middleware in:

```txt
vite.config.ts
```

That middleware lets `npm run dev` serve both the frontend and the local API route.

---

## 4. Server calls Jev System One

The server reads:

```env
JEV_API_KEY
JEV_MODEL
```

Then calls:

```txt
POST https://api.typesafe.ai/v1/systemone
```

with a `choice` question:

```json
{
  "model": "jev-latest",
  "state": { "...": "JevGameState" },
  "questions": {
    "next_action": {
      "type": "choice",
      "instructions": "Choose exactly one next action...",
      "criteria": {
        "MOVE_UP": "Move one tile up...",
        "MOVE_RIGHT": "Move one tile right...",
        "WAIT": "Wait only when no better legal action exists."
      }
    }
  }
}
```

The `criteria` object is built only from the current legal actions.

---

## 5. Jev returns a typed choice

Expected answer:

```json
{
  "type": "choice",
  "choice": "MOVE_RIGHT",
  "confidence": 0.87,
  "probabilities": {
    "MOVE_RIGHT": 0.87,
    "MOVE_UP": 0.1,
    "WAIT": 0.03
  }
}
```

The server normalizes this into:

```ts
interface JevDecision {
  action: JevAction;
  confidence: number;
  source: 'jev' | 'mock' | 'fallback';
  probabilities?: Partial<Record<JevAction, number>>;
}
```

---

## 6. The frontend validates the response

`src/ai/decisionSchema.ts` uses Zod to validate that the response matches the expected shape.

If validation fails, the frontend uses local fallback logic.

This protects the game from:

- malformed responses;
- network errors;
- missing local API route;
- unavailable Jev API;
- invalid actions.

---

## 7. The deterministic engine applies the action

The decision becomes gameplay in:

```txt
applyAction(world, decision.action)
```

This function is responsible for:

- movement;
- item pickup;
- potion use;
- cardinal-direction attack resolution;
- enemy HP updates;
- one-enemy-per-turn counterattacks;
- combat effect records used by Phaser for slash/impact rendering;
- portal win condition;
- HP loss condition;
- action and position history.

Jev selects the action. The game decides what the action actually does.

Current balance:

- enemies start with 2 HP;
- Jev damages only one adjacent enemy per `ATTACK` turn;
- one adjacent enemy can strike Jev for 34 damage after the turn;
- three enemy hits stop Jev from full HP.

---

## Why Choice is used

Movement needs exactly one action from a finite set.

That makes `choice` the correct primitive.

### Choice

Used for:

- `MOVE_UP`
- `MOVE_DOWN`
- `MOVE_LEFT`
- `MOVE_RIGHT`
- `ATTACK`
- `PICKUP`
- `USE_POTION`
- `WAIT`

### Noul

A yes/no probability. Not required for movement, but useful for questions such as:

- Is Jev trapped?
- Is this enemy placement dangerous?
- Is Jev likely to die soon?

### Score

A rubric-based numeric score. Not required for movement, but useful for questions such as:

- Rate this route from 0 to 3.
- Rate danger level from 0 to 5.
- Score potion urgency.

---

## Debugging the decision pipeline

Use the in-app Learning Wizard to step through the pipeline.

Use the Jev Debug panel to inspect:

- selected action;
- confidence;
- probabilities;
- decision source;
- loop warning;
- nearest path hints;
- recent actions.

If decisions appear odd, inspect:

1. `legalActions` — was the action available?
2. `nearest` — did path hints point in the expected direction?
3. `adjacent` — did Jev know an enemy/item was nearby?
4. `recentPositions` — was Jev trying to break a loop?
5. `probabilities` — was the decision uncertain?
