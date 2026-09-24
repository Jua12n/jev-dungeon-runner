import type { JevAction, JevGameState } from './types';

export function chooseMockAction(state: JevGameState): JevAction {
  if (state.player.hp <= 35 && state.player.potions > 0) {
    return 'USE_POTION';
  }

  const adjacentEnemy = Object.values(state.adjacent).includes('enemy');
  if (adjacentEnemy && state.player.hp > 30) {
    return 'ATTACK';
  }

  if (state.player.hp < 55 && state.nearest.potion.direction !== 'unknown') {
    return moveToward(state.nearest.potion.direction, state.legalActions) ?? 'WAIT';
  }

  if (state.nearest.coin.direction !== 'unknown' && state.player.coins < 4) {
    return moveToward(state.nearest.coin.direction, state.legalActions) ?? 'WAIT';
  }

  if (state.nearest.exit.direction !== 'unknown') {
    return moveToward(state.nearest.exit.direction, state.legalActions) ?? 'WAIT';
  }

  return state.legalActions.find((action) => action.startsWith('MOVE_')) ?? 'WAIT';
}

function moveToward(direction: string, legalActions: JevAction[]): JevAction | undefined {
  const actionByDirection: Record<string, JevAction> = {
    up: 'MOVE_UP',
    down: 'MOVE_DOWN',
    left: 'MOVE_LEFT',
    right: 'MOVE_RIGHT',
  };
  const action = actionByDirection[direction];
  return action && legalActions.includes(action) ? action : undefined;
}
