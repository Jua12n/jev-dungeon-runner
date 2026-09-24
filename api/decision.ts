/// <reference types="node" />

type JevAction =
  | 'MOVE_UP'
  | 'MOVE_DOWN'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'ATTACK'
  | 'PICKUP'
  | 'USE_POTION'
  | 'WAIT';

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const JEV_ACTIONS: JevAction[] = [
  'MOVE_UP',
  'MOVE_DOWN',
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'ATTACK',
  'PICKUP',
  'USE_POTION',
  'WAIT',
];

const CRITERIA: Record<JevAction, string> = {
  MOVE_UP: 'Move one tile up when it helps survival, collecting, or reaching the exit.',
  MOVE_DOWN: 'Move one tile down when it helps survival, collecting, or reaching the exit.',
  MOVE_LEFT: 'Move one tile left when it helps survival, collecting, or reaching the exit.',
  MOVE_RIGHT: 'Move one tile right when it helps survival, collecting, or reaching the exit.',
  ATTACK: 'Attack an adjacent enemy only when it is legal and safer than fleeing.',
  PICKUP: 'Pick up a coin or potion on the current tile.',
  USE_POTION: 'Use a potion when health is low enough to risk death soon.',
  WAIT: 'Wait only when no better legal action is available.',
};

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const gameState = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const apiKey = process.env.JEV_API_KEY;

  if (!apiKey || process.env.JEV_MODE === 'mock') {
    res.status(200).json(mockDecision(gameState, 'mock'));
    return;
  }

  try {
    const model = process.env.JEV_MODEL ?? 'jev-latest';
    const jevResponse = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        state: gameState,
        questions: {
          next_action: {
            type: 'choice',
            instructions:
              'Choose exactly one next action for the dungeon runner. Prefer survival, then collecting useful items, then reaching the exit. Only choose legal actions from state.legalActions. Use state.nearest as path-aware first-step hints. If state.loopWarning is true or recentPositions shows an A-B-A-B pattern, break the loop: choose a different legal movement and avoid returning to the previous tile unless it is the only safe option.',
            criteria: allowedCriteria(gameState),
          },
        },
      }),
    });

    if (!jevResponse.ok) {
      throw new Error(`Jev API returned ${jevResponse.status}`);
    }

    const payload = await jevResponse.json();
    const answer = payload?.answers?.next_action;
    const action = breakLoopIfNeeded(normalizeAction(answer?.choice, gameState), gameState);

    res.status(200).json({
      action,
      confidence: clampConfidence(answer?.confidence),
      source: 'jev',
      probabilities: answer?.probabilities ?? undefined,
    });
  } catch (error) {
    console.error(error);
    res.status(200).json(mockDecision(gameState, 'fallback'));
  }
}

function allowedCriteria(gameState: unknown): Partial<Record<JevAction, string>> {
  const legal = legalActions(gameState);
  return Object.fromEntries(legal.map((action) => [action, CRITERIA[action]])) as Partial<Record<JevAction, string>>;
}

function normalizeAction(action: unknown, gameState: unknown): JevAction {
  const legal = legalActions(gameState);
  if (typeof action === 'string' && JEV_ACTIONS.includes(action as JevAction) && legal.includes(action as JevAction)) {
    return action as JevAction;
  }
  return mockAction(gameState);
}

function legalActions(gameState: unknown): JevAction[] {
  const maybeActions = (gameState as { legalActions?: unknown })?.legalActions;
  if (!Array.isArray(maybeActions)) {
    return ['WAIT'];
  }
  const legal = maybeActions.filter((action): action is JevAction => JEV_ACTIONS.includes(action as JevAction));
  return legal.length > 0 ? legal : ['WAIT'];
}

function mockDecision(gameState: unknown, source: 'mock' | 'fallback'): { action: JevAction; confidence: number; source: 'mock' | 'fallback' } {
  return {
    action: mockAction(gameState),
    confidence: source === 'mock' ? 0.7 : 0.5,
    source,
  };
}

function mockAction(gameState: unknown): JevAction {
  const state = gameState as {
    player?: { hp?: number; potions?: number; coins?: number };
    nearest?: Record<string, { direction?: string }>;
    legalActions?: JevAction[];
    adjacent?: Record<string, string>;
  };
  const legal = legalActions(gameState);

  if ((state.player?.hp ?? 100) <= 35 && (state.player?.potions ?? 0) > 0 && legal.includes('USE_POTION')) {
    return 'USE_POTION';
  }
  if (Object.values(state.adjacent ?? {}).includes('enemy') && legal.includes('ATTACK')) {
    return 'ATTACK';
  }

  const target = (state.player?.hp ?? 100) < 55 ? state.nearest?.potion : state.nearest?.coin ?? state.nearest?.exit;
  const toward = actionToward(target?.direction);
  if (toward && legal.includes(toward)) {
    return breakLoopIfNeeded(toward, gameState);
  }

  return breakLoopIfNeeded(legal.find((action) => action.startsWith('MOVE_')) ?? 'WAIT', gameState);
}

function breakLoopIfNeeded(action: JevAction, gameState: unknown): JevAction {
  const state = gameState as {
    loopWarning?: boolean;
    player?: { x?: number; y?: number };
    recentPositions?: Array<{ x?: number; y?: number }>;
  };

  if (!state.loopWarning || !action.startsWith('MOVE_')) {
    return action;
  }

  const legalMoves = legalActions(gameState).filter((candidate) => candidate.startsWith('MOVE_'));
  if (legalMoves.length <= 1) {
    return action;
  }

  const previous = state.recentPositions?.at(-2);
  const current = state.player;
  if (!previous || typeof current?.x !== 'number' || typeof current.y !== 'number') {
    return action;
  }

  const nonBacktracking = legalMoves.find((candidate) => {
    const target = targetForAction({ x: current.x, y: current.y }, candidate);
    return target && (target.x !== previous.x || target.y !== previous.y);
  });

  return nonBacktracking ?? action;
}

function targetForAction(position: { x: number; y: number }, action: JevAction): { x: number; y: number } | null {
  const targets: Partial<Record<JevAction, { x: number; y: number }>> = {
    MOVE_UP: { x: position.x, y: position.y - 1 },
    MOVE_DOWN: { x: position.x, y: position.y + 1 },
    MOVE_LEFT: { x: position.x - 1, y: position.y },
    MOVE_RIGHT: { x: position.x + 1, y: position.y },
  };
  return targets[action] ?? null;
}

function actionToward(direction: string | undefined): JevAction | null {
  const mapping: Record<string, JevAction> = {
    up: 'MOVE_UP',
    down: 'MOVE_DOWN',
    left: 'MOVE_LEFT',
    right: 'MOVE_RIGHT',
  };
  return direction ? mapping[direction] ?? null : null;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}
