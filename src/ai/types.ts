export const JEV_ACTIONS = [
  'MOVE_UP',
  'MOVE_DOWN',
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'ATTACK',
  'PICKUP',
  'USE_POTION',
  'WAIT',
] as const;

export type JevAction = (typeof JEV_ACTIONS)[number];

export type TileKind = 'floor' | 'wall' | 'player' | 'enemy' | 'potion' | 'coin' | 'exit';

export type DirectionHint = 'up' | 'down' | 'left' | 'right' | 'same' | 'unknown';

export interface JevGameState {
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

export interface JevDecision {
  action: JevAction;
  confidence: number;
  source: 'jev' | 'mock' | 'fallback';
  probabilities?: Partial<Record<JevAction, number>>;
}
