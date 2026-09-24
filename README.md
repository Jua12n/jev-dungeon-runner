# Jev Dungeon Runner

**Jev Dungeon Runner** is a browser game that demonstrates how to use **Jev as a structured decision layer inside software**.

Jev does not write dialogue, generate game text, or control the engine directly. Instead, every turn the game sends Jev a compact state object and asks one bounded `choice` question: **what should the runner do next?** The Phaser engine then validates and applies the selected action using deterministic game rules.

This repository is designed as a portfolio/project-study repo: it includes a playable game, a real Jev API integration, a local mock/fallback path, a bilingual UI, and an in-app Learning Wizard that explains the decision pipeline step by step.

---

## Live concept

You play **against Jev**.

- Jev controls the runner.
- Jev tries to reach the portal before the timer expires.
- You have **3 enemy placements** during the whole run.
- To place an enemy, press **Space** or click **Select enemy tile**, then click an empty tile.
- If Jev reaches the portal, **you lose**.
- If the timer reaches zero or Jev is defeated, **you win**.

The run starts only when the player presses **Play**, so the page can load without immediately spending API calls.

---

## Why this project exists

Most AI demos are chatbots. This project demonstrates another pattern:

> AI as a fast, typed, auditable decision function inside a normal application.

The architecture keeps responsibilities separate:

| Layer | Responsibility |
|---|---|
| Phaser | Rendering, input, timer, board drawing, scene lifecycle |
| Game rules | World state, legal actions, collisions, combat, win/loss logic |
| Jev | Select one typed action from a bounded action set |
| API endpoint | Keep `JEV_API_KEY` server-side and normalize Jev responses |
| UI panels | Explain state, probabilities, trace events, and learning flow |

---

## Features

- Browser-playable Phaser game.
- Real Jev decision loop through `/api/decision`.
- Local mock/fallback if Jev fails or `JEV_API_KEY` is missing.
- Manual adversarial gameplay: place enemies to block Jev.
- Random dungeon generation.
- Sprite-based pixel-art board.
- Bilingual UI: English and Spanish.
- Tetris-inspired arcade interface.
- Learning Wizard that pauses the game and walks through:
  - `WorldState`
  - the Jev payload
  - the Jev API request shape
  - `Choice`, `Noul`, and `Score`
  - the returned decision
  - state mutation via `applyAction`
  - the full runtime loop
- Debug panel with confidence, probabilities, path hints, memory, and action trace.

---

## Tech stack

- **TypeScript**
- **Phaser 3** for the game scene
- **Vite** for local dev/build
- **Tailwind CSS v4** for UI styling
- **Zod** for runtime validation of Jev decisions
- **TypeSafe AI Jev System One API**
- **Playwright** for browser-based UI checks during development

---

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```txt
http://localhost:5173/
```

The game works without a key because the frontend falls back to a local mock decision engine if `/api/decision` fails.

---

## Enable real Jev decisions

Edit `.env`:

```env
JEV_API_KEY=your_jev_api_key_here
JEV_MODEL=jev-latest
```

Then run:

```bash
npm run dev
```

Important:

- Do **not** create `VITE_JEV_API_KEY`.
- Vite exposes `VITE_*` variables to the browser.
- The real key must stay server-side.
- This project routes browser calls through `/api/decision`.

---

## Scripts

```bash
npm run dev        # Vite dev server + local /api/decision middleware
npm run dev:mock   # Force mock mode
npm run build      # Type-check + production build
npm run preview    # Preview production build locally
npm run dev:vercel # Optional Vercel-style local dev
```

---

## How the decision loop works

Every turn follows this pipeline:

```txt
Phaser update loop
  -> runDecisionTurn()
  -> buildJevGameState(world)
  -> requestJevDecision(gameState)
  -> POST /api/decision
  -> server calls Jev /v1/systemone
  -> Jev returns one choice
  -> decision is validated
  -> applyAction(world, decision.action)
  -> renderWorld()
```

The important detail is that Jev does **not** mutate the game. Jev only returns a typed action. The deterministic game engine decides whether that action is legal and how it affects the world.

---

## Jev action contract

The action space is closed:

```ts
type JevAction =
  | 'MOVE_UP'
  | 'MOVE_DOWN'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'ATTACK'
  | 'PICKUP'
  | 'USE_POTION'
  | 'WAIT';
```

Jev receives only legal actions for the current turn. For example, `ATTACK` is only legal when an enemy is adjacent, and `USE_POTION` is only legal when the runner has a potion and HP is below max.

---

## Jev API shape

The server calls TypeSafe AI's System One endpoint:

```txt
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <JEV_API_KEY>
```

The game uses a `choice` question:

```json
{
  "model": "jev-latest",
  "state": {
    "turn": 12,
    "player": { "hp": 88, "coins": 1, "potions": 1, "x": 4, "y": 7 },
    "nearest": {
      "enemy": { "direction": "left", "distance": 3 },
      "potion": { "direction": "down", "distance": 8 },
      "coin": { "direction": "right", "distance": 5 },
      "exit": { "direction": "right", "distance": 14 }
    },
    "legalActions": ["MOVE_UP", "MOVE_RIGHT", "WAIT"],
    "loopWarning": false
  },
  "questions": {
    "next_action": {
      "type": "choice",
      "instructions": "Choose exactly one next action...",
      "criteria": {
        "MOVE_UP": "Move one tile up when it improves survival, collection, or route to portal.",
        "MOVE_RIGHT": "Move one tile right when it improves survival, collection, or route to portal.",
        "WAIT": "Wait only when no better legal action exists."
      }
    }
  }
}
```

Expected response shape:

```json
{
  "answers": {
    "next_action": {
      "type": "choice",
      "choice": "MOVE_RIGHT",
      "confidence": 0.87,
      "probabilities": {
        "MOVE_RIGHT": 0.87,
        "MOVE_UP": 0.1,
        "WAIT": 0.03
      }
    }
  }
}
```

---

## Choice vs Noul vs Score

Jev supports different structured decision primitives. This game primarily uses **Choice**.

| Primitive | Meaning | Used here? | Example |
|---|---|---:|---|
| Choice | Select one option from a predefined set | Yes | Which action should Jev take next? |
| Noul | Yes/no probability | Explained in Learning Wizard | Is Jev trapped? Is this placement dangerous? |
| Score | Numeric/rubric score | Explained in Learning Wizard | Rate danger from 0 to 3 |

Movement is best modeled as `Choice` because the engine needs exactly one action from a known union.

---

## Project structure

```txt
jev-dungeon-runner/
  api/
    decision.ts              # Server-only Jev API call and response normalization
  docs/
    ARCHITECTURE.md          # High-level architecture and flow
    JEV_PIPELINE.md          # Detailed Jev request/response pipeline
    LEARNING_MODE.md         # Learning Wizard behavior and purpose
    DEPLOYMENT.md            # Deployment guide
  public/assets/
    enemy.png
    main-front.png
    main-side.png
    portal.png
    potion.png
    sword.png
  src/
    ai/
      decisionClient.ts      # Browser client for /api/decision
      decisionSchema.ts      # Zod validation for decisions
      mockBrain.ts           # Local fallback brain
      types.ts               # JevGameState, JevAction, JevDecision
    game/
      map/world.ts           # WorldState, dungeon generation, rules, mutations
      scenes/DungeonScene.ts # Phaser scene, input, rendering, Learning Wizard
    ui/DecisionPanel.ts      # Runtime Jev debug panel
    i18n.ts                  # English/Spanish UI switching
    main.ts                  # Phaser bootstrapping
    style.css                # Tailwind/shadcn-style tokens and game UI styles
  index.html
  vite.config.ts             # Vite + local /api/decision middleware
```

---

## Learning Wizard

The Learning Wizard is a built-in walkthrough for people studying the project.

Open it with **Learning mode**.

When opened:

- the game pauses;
- the timer freezes;
- Jev stops taking live turns;
- the wizard shows a mini dungeon using the same sprites as the board;
- Next/Prev steps execute or inspect specific parts of the pipeline.

Wizard steps:

1. Big picture
2. Current `WorldState`
3. What Jev receives
4. Exact Jev request shape
5. Decision response
6. State mutation
7. Human counter-move
8. Full runtime loop

This is intentionally verbose so reviewers can understand the architecture without reading every source file first.

---

## Security model

The API key is never sent to the browser.

```txt
Browser
  -> POST /api/decision
  -> server/local middleware reads JEV_API_KEY
  -> server calls TypeSafe AI
  -> server returns typed decision
```

Avoid this:

```env
VITE_JEV_API_KEY=...
```

That would expose the key in client-side JavaScript.

---

## Fallback behavior

If the Jev API call fails, the game still runs.

`src/ai/decisionClient.ts` catches request/validation errors and uses `mockBrain.ts` as a local fallback. This keeps demos stable even when:

- no API key is configured;
- the API is unavailable;
- local dev middleware is not running;
- a response fails validation.

The debug panel shows the decision source:

- `jev`
- `mock`
- `fallback`

---

## Deployment

Recommended: **Vercel**.

1. Push the repository to GitHub.
2. Import it in Vercel.
3. Add environment variables:

```env
JEV_API_KEY=your_real_key
JEV_MODEL=jev-latest
```

4. Deploy.

The frontend is static, and `api/decision.ts` runs as a serverless API route.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for more detail.

---

## Development notes

- Use the Learning Wizard when changing the decision pipeline.
- Keep Jev outputs bounded to the `JevAction` union.
- Do not let Jev mutate `WorldState` directly.
- Keep deterministic rules in `world.ts`.
- Keep API keys server-side.
- Prefer adding new decision questions as typed, bounded outputs.

---

## Portfolio framing

Suggested project description:

> Jev Dungeon Runner is a browser game showing how to integrate a non-generative AI model as a typed decision layer. Jev receives structured game state, selects one legal action, and the deterministic Phaser engine validates and applies it. The project includes real API integration, fallback decisions, bilingual UI, adversarial gameplay, and a built-in Learning Wizard for studying the decision pipeline.
