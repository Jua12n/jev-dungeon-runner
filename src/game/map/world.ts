import type { DirectionHint, JevAction, JevGameState, TileKind } from '../../ai/types';
import { JEV_ACTIONS } from '../../ai/types';
import { pick } from '../../i18n';

export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 15;
export const TILE_SIZE = 28;
const ENEMY_STRIKE_DAMAGE = 34;

export type EntityKind = 'enemy' | 'potion' | 'coin' | 'exit';

export interface Position {
  x: number;
  y: number;
}

export interface Entity extends Position {
  kind: EntityKind;
  hp?: number;
}

export interface CombatEffect {
  kind: 'player_attack' | 'enemy_attack';
  from: Position;
  to: Position;
}

export interface WorldState {
  turn: number;
  player: Position & {
    hp: number;
    coins: number;
    potions: number;
  };
  walls: Set<string>;
  entities: Entity[];
  actionHistory: JevAction[];
  positionHistory: Position[];
  message: string;
  status: 'playing' | 'won' | 'lost';
  combatEffects: CombatEffect[];
}

export function createWorld(): WorldState {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const walls = createRandomWalls();
    const playerStart = randomOpenPosition(walls);
    const reachable = reachableFloorCells(walls, playerStart);

    if (reachable.length < 120) {
      continue;
    }

    const reserved = new Set<string>([key(playerStart)]);
    const exit = farthestCell(reachable, playerStart, reserved);
    reserved.add(key(exit));

    const coins = placeEntities('coin', 3, reachable, reserved, playerStart, 4);
    const potions = placeEntities('potion', 2, reachable, reserved, playerStart, 4);
    const enemies = placeEntities('enemy', 2, reachable, reserved, playerStart, 6);

    return {
      turn: 0,
      player: { ...playerStart, hp: 100, coins: 0, potions: 1 },
      walls,
      entities: [...coins, ...potions, ...enemies, { kind: 'exit', ...exit }],
      actionHistory: [],
      positionHistory: [playerStart],
      message: pick('Random dungeon generated. Jev is waking up...', 'Mazmorra generada. Jev está despertando...'),
      status: 'playing',
      combatEffects: [],
    };
  }

  return createFallbackWorld();
}

function createRandomWalls(): Set<string> {
  const walls = new Set<string>();

  for (let x = 0; x < GRID_WIDTH; x += 1) {
    walls.add(key({ x, y: 0 }));
    walls.add(key({ x, y: GRID_HEIGHT - 1 }));
  }

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    walls.add(key({ x: 0, y }));
    walls.add(key({ x: GRID_WIDTH - 1, y }));
  }

  const wallCount = 18 + Math.floor(Math.random() * 10);
  while (walls.size < GRID_WIDTH * 2 + GRID_HEIGHT * 2 - 4 + wallCount) {
    const position = randomInteriorPosition();
    walls.add(key(position));
  }

  return walls;
}

function createFallbackWorld(): WorldState {
  const walls = createBoundaryWalls();
  const playerStart = { x: 2, y: 2 };

  return {
    turn: 0,
    player: { ...playerStart, hp: 100, coins: 0, potions: 1 },
    walls,
    entities: [
      { kind: 'coin', x: 6, y: 2 },
      { kind: 'coin', x: 11, y: 6 },
      { kind: 'coin', x: 16, y: 12 },
      { kind: 'potion', x: 3, y: 12 },
      { kind: 'potion', x: 15, y: 4 },
      { kind: 'enemy', x: 7, y: 6, hp: 2 },
      { kind: 'enemy', x: 12, y: 11, hp: 2 },
      { kind: 'exit', x: 18, y: 13 },
    ],
    actionHistory: [],
    positionHistory: [playerStart],
    message: pick('Fallback dungeon loaded. Jev is waking up...', 'Mazmorra de respaldo cargada. Jev está despertando...'),
    status: 'playing',
    combatEffects: [],
  };
}

function createBoundaryWalls(): Set<string> {
  const walls = new Set<string>();
  for (let x = 0; x < GRID_WIDTH; x += 1) {
    walls.add(key({ x, y: 0 }));
    walls.add(key({ x, y: GRID_HEIGHT - 1 }));
  }
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    walls.add(key({ x: 0, y }));
    walls.add(key({ x: GRID_WIDTH - 1, y }));
  }
  return walls;
}

function randomInteriorPosition(): Position {
  return {
    x: 1 + Math.floor(Math.random() * (GRID_WIDTH - 2)),
    y: 1 + Math.floor(Math.random() * (GRID_HEIGHT - 2)),
  };
}

function randomOpenPosition(walls: Set<string>): Position {
  let position = randomInteriorPosition();
  while (walls.has(key(position))) {
    position = randomInteriorPosition();
  }
  return position;
}

function reachableFloorCells(walls: Set<string>, start: Position): Position[] {
  const queue = [start];
  const visited = new Set<string>([key(start)]);
  const cells: Position[] = [];
  const steps = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    cells.push(current);

    for (const step of steps) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      const nextKey = key(next);
      if (visited.has(nextKey) || walls.has(nextKey)) {
        continue;
      }
      visited.add(nextKey);
      queue.push(next);
    }
  }

  return cells;
}

function farthestCell(cells: Position[], from: Position, reserved: Set<string>): Position {
  return cells
    .filter((cell) => !reserved.has(key(cell)))
    .toSorted((a, b) => distance(b, from) - distance(a, from))[0];
}

function placeEntities(
  kind: EntityKind,
  count: number,
  cells: Position[],
  reserved: Set<string>,
  playerStart: Position,
  minimumDistance: number,
): Entity[] {
  const entities: Entity[] = [];
  const candidates = cells.filter((cell) => !reserved.has(key(cell)) && distance(cell, playerStart) >= minimumDistance);

  for (let index = 0; index < count && candidates.length > 0; index += 1) {
    const candidateIndex = Math.floor(Math.random() * candidates.length);
    const [position] = candidates.splice(candidateIndex, 1);
    reserved.add(key(position));
    entities.push(kind === 'enemy' ? { kind, ...position, hp: 2 } : { kind, ...position });
  }

  return entities;
}

export function placeEnemyAt(world: WorldState, position: Position): { world: WorldState; placed: boolean; reason?: string } {
  if (world.status !== 'playing') {
    return { world, placed: false, reason: pick('The run is already over.', 'La partida ya terminó.') };
  }

  if (!canPlaceEnemy(world, position)) {
    return { world, placed: false, reason: pick('Choose an empty floor tile.', 'Elige una casilla libre del suelo.') };
  }

  const nextWorld = cloneWorld(world);
  nextWorld.entities = [...nextWorld.entities, { kind: 'enemy', ...position, hp: 2 }];
  nextWorld.combatEffects = [];
  nextWorld.message = pick(`You placed an enemy at ${position.x},${position.y}.`, `Enemigo colocado en ${position.x},${position.y}.`);

  return { world: nextWorld, placed: true };
}

export function key(position: Position): string {
  return `${position.x},${position.y}`;
}

export function buildJevGameState(world: WorldState): JevGameState {
  return {
    turn: world.turn,
    goal: 'survive_collect_and_escape',
    player: { ...world.player },
    nearest: {
      enemy: nearest(world, 'enemy'),
      potion: nearest(world, 'potion'),
      coin: nearest(world, 'coin'),
      exit: nearest(world, 'exit'),
    },
    adjacent: {
      up: tileAt(world, { x: world.player.x, y: world.player.y - 1 }),
      down: tileAt(world, { x: world.player.x, y: world.player.y + 1 }),
      left: tileAt(world, { x: world.player.x - 1, y: world.player.y }),
      right: tileAt(world, { x: world.player.x + 1, y: world.player.y }),
    },
    legalActions: legalActions(world),
    recentActions: world.actionHistory.slice(-8),
    recentPositions: world.positionHistory.slice(-8),
    loopWarning: isLooping(world),
    rules: [
      'Reach the exit to win.',
      'Collecting relics improves score but survival is more important.',
      'Use potions when health is low.',
      'Attack only hits one adjacent enemy in the four cardinal directions: up, down, left, or right.',
      'Enemies also strike only in the four cardinal directions, and only one adjacent enemy can hit per turn.',
      'Avoid enemies unless adjacent and healthy enough to attack.',
      'Only choose actions present in legalActions.',
      'If loopWarning is true, break the loop by choosing a different legal movement and avoid returning to the previous tile.',
    ],
  };
}

export function applyAction(world: WorldState, action: JevAction): WorldState {
  if (world.status !== 'playing') {
    return world;
  }

  const nextWorld = cloneWorld(world);
  nextWorld.turn += 1;
  nextWorld.combatEffects = [];
  const target = targetForAction(nextWorld.player, action);

  if (action.startsWith('MOVE_') && target && canMoveTo(nextWorld, target)) {
    nextWorld.player.x = target.x;
    nextWorld.player.y = target.y;
    nextWorld.message = pick(`Jev chose ${action}.`, `Jev decidió ${action}.`);
    collectAtPlayer(nextWorld);
  } else if (action === 'ATTACK') {
    attackAdjacentEnemy(nextWorld);
  } else if (action === 'PICKUP') {
    collectAtPlayer(nextWorld);
  } else if (action === 'USE_POTION') {
    usePotion(nextWorld);
  } else {
    nextWorld.message = pick(`Jev chose ${action}; the runner waits.`, `Jev decidió ${action}; el personaje espera.`);
  }

  const strikingEnemy = adjacentEnemies(nextWorld)[0];
  if (strikingEnemy) {
    nextWorld.player.hp -= ENEMY_STRIKE_DAMAGE;
    nextWorld.combatEffects.push({ kind: 'enemy_attack', from: { x: strikingEnemy.x, y: strikingEnemy.y }, to: { x: nextWorld.player.x, y: nextWorld.player.y } });
    nextWorld.message += pick(' An adjacent enemy strikes once.', ' Un enemigo adyacente golpea una vez.');
  }

  if (entityAt(nextWorld, nextWorld.player)?.kind === 'exit') {
    nextWorld.status = 'won';
    nextWorld.message = pick('Jev reached the portal. You lose.', 'Jev llegó al portal. Has perdido.');
  }

  if (nextWorld.player.hp <= 0) {
    nextWorld.player.hp = 0;
    nextWorld.status = 'lost';
    nextWorld.message = pick('You win. Jev was stopped before reaching the portal.', 'Ganaste: Jev no logró llegar al portal.');
  }

  nextWorld.actionHistory = [...nextWorld.actionHistory, action].slice(-16);
  nextWorld.positionHistory = [...nextWorld.positionHistory, { x: nextWorld.player.x, y: nextWorld.player.y }].slice(-16);

  return nextWorld;
}

export function tileAt(world: WorldState, position: Position): TileKind {
  if (world.walls.has(key(position))) {
    return 'wall';
  }
  if (world.player.x === position.x && world.player.y === position.y) {
    return 'player';
  }
  return entityAt(world, position)?.kind ?? 'floor';
}

function cloneWorld(world: WorldState): WorldState {
  return {
    ...world,
    player: { ...world.player },
    walls: new Set(world.walls),
    entities: world.entities.map((entity) => ({ ...entity })),
    actionHistory: [...world.actionHistory],
    positionHistory: world.positionHistory.map((position) => ({ ...position })),
    combatEffects: world.combatEffects.map((effect) => ({ ...effect, from: { ...effect.from }, to: { ...effect.to } })),
  };
}

function legalActions(world: WorldState): JevAction[] {
  return JEV_ACTIONS.filter((action) => {
    const target = targetForAction(world.player, action);
    if (action.startsWith('MOVE_')) {
      return Boolean(target && canMoveTo(world, target));
    }
    if (action === 'ATTACK') {
      return isEnemyAdjacent(world);
    }
    if (action === 'PICKUP') {
      return ['coin', 'potion'].includes(entityAt(world, world.player)?.kind ?? '');
    }
    if (action === 'USE_POTION') {
      return world.player.potions > 0 && world.player.hp < 100;
    }
    return true;
  });
}

function targetForAction(position: Position, action: JevAction): Position | null {
  const targets: Partial<Record<JevAction, Position>> = {
    MOVE_UP: { x: position.x, y: position.y - 1 },
    MOVE_DOWN: { x: position.x, y: position.y + 1 },
    MOVE_LEFT: { x: position.x - 1, y: position.y },
    MOVE_RIGHT: { x: position.x + 1, y: position.y },
  };
  return targets[action] ?? null;
}

function canMoveTo(world: WorldState, position: Position): boolean {
  const entity = entityAt(world, position);
  return !world.walls.has(key(position)) && entity?.kind !== 'enemy';
}

function canPlaceEnemy(world: WorldState, position: Position): boolean {
  return (
    position.x > 0 &&
    position.y > 0 &&
    position.x < GRID_WIDTH - 1 &&
    position.y < GRID_HEIGHT - 1 &&
    !world.walls.has(key(position)) &&
    !(world.player.x === position.x && world.player.y === position.y) &&
    !entityAt(world, position)
  );
}

function entityAt(world: WorldState, position: Position): Entity | undefined {
  return world.entities.find((entity) => entity.x === position.x && entity.y === position.y);
}

function collectAtPlayer(world: WorldState): void {
  const entity = entityAt(world, world.player);
  if (entity?.kind === 'coin') {
    world.player.coins += 1;
    world.entities = world.entities.filter((candidate) => candidate !== entity);
    world.message += pick(' Relic collected.', ' Reliquia recogida.');
  }
  if (entity?.kind === 'potion') {
    world.player.potions += 1;
    world.entities = world.entities.filter((candidate) => candidate !== entity);
    world.message += pick(' Potion collected.', ' Poción recogida.');
  }
}

function usePotion(world: WorldState): void {
  if (world.player.potions <= 0) {
    world.message = pick('No potion available.', 'No hay pociones disponibles.');
    return;
  }
  world.player.potions -= 1;
  world.player.hp = Math.min(100, world.player.hp + 35);
  world.message = pick('Jev used a potion.', 'Jev usó una poción.');
}

function attackAdjacentEnemy(world: WorldState): void {
  const enemy = adjacentEnemies(world)[0];
  if (!enemy) {
    world.message = pick('Jev attacked in the four cardinal directions, but no enemy was adjacent.', 'Jev atacó en las cuatro direcciones, pero no había ningún enemigo adyacente.');
    return;
  }
  world.combatEffects.push({ kind: 'player_attack', from: { x: world.player.x, y: world.player.y }, to: { x: enemy.x, y: enemy.y } });

  const nextHp = (enemy.hp ?? 2) - 1;
  if (nextHp <= 0) {
    world.entities = world.entities.filter((entity) => entity !== enemy);
    world.message = pick('Jev finished one adjacent enemy.', 'Jev remató a un enemigo adyacente.');
    return;
  }

  enemy.hp = nextHp;
  world.message = pick('Jev hit one adjacent enemy. It is still alive.', 'Jev golpeó a un enemigo adyacente. Sigue vivo.');
}

function isEnemyAdjacent(world: WorldState): boolean {
  return adjacentEnemies(world).length > 0;
}

function adjacentEnemies(world: WorldState): Entity[] {
  const targets = cardinalNeighbors(world.player).map(key);
  return world.entities.filter((entity) => entity.kind === 'enemy' && targets.includes(key(entity)));
}

function cardinalNeighbors(position: Position): Position[] {
  return [
    { x: position.x, y: position.y - 1 },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x - 1, y: position.y },
  ];
}

function nearest(world: WorldState, kind: EntityKind): { direction: DirectionHint; distance: number | null } {
  const targets = world.entities.filter((entity) => entity.kind === kind);
  if (targets.length === 0) {
    return { direction: 'unknown', distance: null };
  }

  const path = shortestPathToAny(world, targets);
  if (path) {
    return path;
  }

  const closest = targets.toSorted((a, b) => distance(a, world.player) - distance(b, world.player))[0];
  const dx = closest.x - world.player.x;
  const dy = closest.y - world.player.y;
  const direction = Math.abs(dx) > Math.abs(dy) ? horizontalDirection(dx) : verticalDirection(dy);

  return { direction, distance: distance(closest, world.player) };
}

function shortestPathToAny(
  world: WorldState,
  targets: Position[],
): { direction: DirectionHint; distance: number | null } | null {
  const targetKeys = new Set(targets.map(key));
  const start = world.player;
  const queue: Array<{ position: Position; firstStep: DirectionHint; distance: number }> = [];
  const visited = new Set<string>([key(start)]);
  const neighbors: Array<{ direction: DirectionHint; dx: number; dy: number }> = [
    { direction: 'up', dx: 0, dy: -1 },
    { direction: 'down', dx: 0, dy: 1 },
    { direction: 'left', dx: -1, dy: 0 },
    { direction: 'right', dx: 1, dy: 0 },
  ];

  for (const neighbor of neighbors) {
    const next = { x: start.x + neighbor.dx, y: start.y + neighbor.dy };
    if (world.walls.has(key(next))) {
      continue;
    }
    queue.push({ position: next, firstStep: neighbor.direction, distance: 1 });
    visited.add(key(next));
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (targetKeys.has(key(current.position))) {
      return { direction: current.firstStep, distance: current.distance };
    }

    for (const neighbor of neighbors) {
      const next = { x: current.position.x + neighbor.dx, y: current.position.y + neighbor.dy };
      const nextKey = key(next);
      if (visited.has(nextKey) || world.walls.has(nextKey)) {
        continue;
      }
      queue.push({ position: next, firstStep: current.firstStep, distance: current.distance + 1 });
      visited.add(nextKey);
    }
  }

  return null;
}

function isLooping(world: WorldState): boolean {
  const recent = world.positionHistory.slice(-5).map(key);
  if (recent.length < 5) {
    return false;
  }

  const [a, b, c, d, e] = recent;
  return a === c && c === e && b === d;
}

function horizontalDirection(dx: number): DirectionHint {
  if (dx > 0) {
    return 'right';
  }
  if (dx < 0) {
    return 'left';
  }
  return 'same';
}

function verticalDirection(dy: number): DirectionHint {
  if (dy > 0) {
    return 'down';
  }
  if (dy < 0) {
    return 'up';
  }
  return 'same';
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
