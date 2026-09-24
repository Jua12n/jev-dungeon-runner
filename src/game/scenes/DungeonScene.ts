import Phaser from 'phaser';
import { requestJevDecision } from '../../ai/decisionClient';
import type { JevDecision, JevGameState, TileKind } from '../../ai/types';
import { pick } from '../../i18n';
import { updateDecisionPanel } from '../../ui/DecisionPanel';
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_SIZE,
  applyAction,
  buildJevGameState,
  createWorld,
  placeEnemyAt,
  tileAt,
  type WorldState,
} from '../map/world';

const TURN_DELAY_MS = 700;
const RUN_DURATION_MS = 60_000;
const ENEMY_DROPS_PER_RUN = 3;
const ENEMY_DROP_COOLDOWN_MS = 5_000;
const DEVELOPER_STEPS = 8;
const COLORS = {
  floor: 0x070b1d,
  wall: 0x2563eb,
  player: 0x38bdf8,
  enemy: 0xef4444,
  potion: 0x00ff88,
  coin: 0xffb000,
  exit: 0xd946ef,
};

export class DungeonScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private world: WorldState = createWorld();
  private lastDecision: JevDecision | null = null;
  private thinking = false;
  private lastTurnAt = 0;
  private runStartedAt = 0;
  private runStarted = false;
  private overlayTexts: Phaser.GameObjects.GameObject[] = [];
  private tileSprites: Phaser.GameObjects.Image[] = [];
  private enemyDropsLeft = ENEMY_DROPS_PER_RUN;
  private lastEnemyDropAt = Number.NEGATIVE_INFINITY;
  private placementMode = false;
  private developerMode = false;
  private developerStep = 0;
  private pauseStartedAt = 0;
  private totalPausedMs = 0;
  private developerDecisionApplied = false;
  private developerLog: Array<{ time: string; event: string; details: unknown }> = [];

  constructor() {
    super('DungeonScene');
  }

  preload(): void {
    this.load.image('player-front', '/assets/main-front.png');
    this.load.image('player-side', '/assets/main-side.png');
    this.load.image('enemy', '/assets/enemy.png');
    this.load.image('portal', '/assets/portal.png');
    this.load.image('potion', '/assets/potion.png');
    this.load.image('sword', '/assets/sword.png');
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.runStartedAt = 0;
    this.input.keyboard?.on('keydown-R', () => this.resetRun());
    this.input.keyboard?.on('keydown-ENTER', () => this.startRun());
    this.input.keyboard?.on('keydown-SPACE', () => this.startEnemyPlacement());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.tryPlaceEnemyAtPointer(pointer));
    document.querySelector<HTMLButtonElement>('#drop-enemy-btn')?.addEventListener('click', () => this.startEnemyPlacement());
    document.querySelector<HTMLButtonElement>('#start-run-btn')?.addEventListener('click', () => this.startRun());
    document.querySelector<HTMLButtonElement>('#start-run-btn-mobile')?.addEventListener('click', () => this.startRun());
    document.querySelector<HTMLButtonElement>('#developer-mode-btn')?.addEventListener('click', () => this.toggleDeveloperMode());
    document.querySelector<HTMLButtonElement>('#developer-close-btn')?.addEventListener('click', () => this.toggleDeveloperMode(false));
    document.querySelector<HTMLButtonElement>('#developer-next-btn')?.addEventListener('click', () => void this.moveDeveloperStep(1));
    document.querySelector<HTMLButtonElement>('#developer-prev-btn')?.addEventListener('click', () => void this.moveDeveloperStep(-1));
    window.addEventListener('languagechange', () => this.renderWorld());
    document.querySelector<HTMLElement>('#developer-panel-content')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('[data-learning-step]');
      if (!button) {
        return;
      }
      this.developerStep = Number(button.dataset.learningStep ?? 0);
      this.logDeveloperEvent('Learning wizard direct step navigation', { step: this.developerStep + 1 });
      void this.executeDeveloperStep();
    });
    this.logDeveloperEvent('Scene.create()', 'Phaser scene initialized. The dungeon is rendered but the run is paused until Play is pressed.');
    this.renderWorld();
  }

  update(time: number): void {
    this.updateOpponentPanel(time);

    if (this.developerMode) {
      return;
    }

    if (!this.runStarted) {
      return;
    }

    if (this.world.status === 'playing' && this.elapsedRunMs(time) >= RUN_DURATION_MS) {
      this.world = {
        ...this.world,
        status: 'lost',
        message: pick('Time is up. You win. Jev did not reach the portal within 1 minute.', 'Se acabó el tiempo. Ganaste: Jev no llegó al portal.'),
      };
      this.logDeveloperEvent('update() -> timer expired', 'RUN_DURATION_MS reached. The player wins because Jev failed to reach the portal.');
      this.renderWorld();
      return;
    }

    if (this.world.status !== 'playing' || this.thinking || time - this.lastTurnAt < TURN_DELAY_MS) {
      return;
    }

    this.lastTurnAt = time;
    void this.runDecisionTurn();
  }

  private async runDecisionTurn(): Promise<void> {
    this.thinking = true;
    const gameState = buildJevGameState(this.world);
    this.logDeveloperEvent('buildJevGameState(world)', gameState);
    updateDecisionPanel(gameState, this.lastDecision, 'Jev is deciding...');
    this.updateDeveloperPanel(gameState);

    this.logDeveloperEvent('requestJevDecision(gameState)', 'Frontend posts the structured state to /api/decision. Server calls Jev /v1/systemone as a choice question.');
    const decision = await requestJevDecision(gameState);
    this.logDeveloperEvent('Jev decision received', decision);
    this.lastDecision = decision;

    const previousWorld = this.world;
    this.world = applyAction(this.world, decision.action);
    this.logDeveloperEvent('applyAction(world, decision.action)', {
      action: decision.action,
      before: summarizeWorld(previousWorld),
      after: summarizeWorld(this.world),
    });
    this.thinking = false;
    this.renderWorld();
  }

  private resetRun(): void {
    this.world = createWorld();
    this.lastDecision = null;
    this.lastTurnAt = 0;
    this.runStartedAt = 0;
    this.runStarted = false;
    this.enemyDropsLeft = ENEMY_DROPS_PER_RUN;
    this.lastEnemyDropAt = Number.NEGATIVE_INFINITY;
    this.placementMode = false;
    this.pauseStartedAt = 0;
    this.totalPausedMs = 0;
    this.logDeveloperEvent('resetRun()', 'New random world generated. The run is waiting for Play.');
    this.renderWorld();
  }

  private startRun(): void {
    if (this.runStarted || this.world.status !== 'playing') {
      return;
    }

    this.runStarted = true;
    this.runStartedAt = this.time.now;
    this.lastTurnAt = this.time.now;
    this.world = { ...this.world, message: pick('Run started. Stop Jev before it reaches the portal.', '¡Partida en marcha! Cierra el paso antes de que Jev llegue al portal.') };
    this.logDeveloperEvent('startRun()', 'Player pressed Play. Timer and Jev decision loop are now active.');
    this.renderWorld();
  }

  private startEnemyPlacement(): void {
    const now = this.time.now;
    const cooldownLeft = ENEMY_DROP_COOLDOWN_MS - (now - this.lastEnemyDropAt);

    if (this.world.status !== 'playing' || !this.runStarted) {
      if (!this.runStarted) {
        this.world = { ...this.world, message: pick('Press Play before placing enemies.', 'Pulsa Play antes de colocar enemigos.') };
        this.renderWorld();
      }
      return;
    }

    if (this.enemyDropsLeft <= 0) {
      this.placementMode = false;
      this.world = { ...this.world, message: pick('No enemy drops left.', 'No quedan enemigos por colocar.') };
      this.renderWorld();
      return;
    }

    if (cooldownLeft > 0) {
      this.placementMode = false;
      this.world = { ...this.world, message: pick(`Enemy placement cooling down: ${Math.ceil(cooldownLeft / 1000)}s.`, `Espera ${Math.ceil(cooldownLeft / 1000)}s para colocar otro enemigo.`) };
      this.renderWorld();
      return;
    }

    this.placementMode = true;
    this.world = { ...this.world, message: pick('Placement mode: click an empty floor tile to add an enemy.', 'Modo colocación: haz click en una casilla libre para poner un enemigo.') };
    this.logDeveloperEvent('startEnemyPlacement()', 'Player entered manual placement mode. Next valid board click calls placeEnemyAt(world, position).');
    this.renderWorld();
  }

  private tryPlaceEnemyAtPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.placementMode || this.world.status !== 'playing') {
      return;
    }

    const position = {
      x: Math.floor(pointer.x / TILE_SIZE),
      y: Math.floor(pointer.y / TILE_SIZE),
    };
    const result = placeEnemyAt(this.world, position);

    if (!result.placed) {
      this.world = { ...this.world, message: result.reason ?? pick('Invalid enemy placement.', 'Colocación inválida.') };
      this.logDeveloperEvent('placeEnemyAt(world, position) rejected', { position, reason: result.reason });
      this.renderWorld();
      return;
    }

    this.world = result.world;
    this.enemyDropsLeft -= 1;
    this.lastEnemyDropAt = this.time.now;
    this.placementMode = false;
    this.logDeveloperEvent('placeEnemyAt(world, position) accepted', {
      position,
      enemyDropsLeft: this.enemyDropsLeft,
      cooldownMs: ENEMY_DROP_COOLDOWN_MS,
    });
    this.renderWorld();
  }

  private updateOpponentPanel(time = this.time.now): void {
    const drops = document.querySelector<HTMLElement>('#enemy-drops-left');
    const cooldown = document.querySelector<HTMLElement>('#enemy-drop-cooldown');
    const timer = document.querySelector<HTMLElement>('#run-timer');
    const timerBar = document.querySelector<HTMLElement>('#run-timer-bar');
    const modeStatus = document.querySelector<HTMLElement>('#placement-mode-status');
    const button = document.querySelector<HTMLButtonElement>('#drop-enemy-btn');

    const cooldownLeft = Math.max(0, ENEMY_DROP_COOLDOWN_MS - (time - this.lastEnemyDropAt));
    const runTimeLeft = Math.max(0, RUN_DURATION_MS - this.elapsedRunMs(time));
    const ready = this.runStarted && this.world.status === 'playing' && this.enemyDropsLeft > 0 && cooldownLeft === 0;

    if (timer) {
      timer.textContent = formatTime(runTimeLeft);
    }
    if (timerBar) {
      timerBar.style.width = `${Math.max(0, Math.min(100, (runTimeLeft / RUN_DURATION_MS) * 100))}%`;
    }
    if (drops) {
      drops.textContent = `${this.enemyDropsLeft}/${ENEMY_DROPS_PER_RUN}`;
    }
    if (cooldown) {
      cooldown.textContent = cooldownLeft > 0 ? `${Math.ceil(cooldownLeft / 1000)}s` : pick('ready', 'listo');
    }
    if (modeStatus) {
      modeStatus.textContent = this.placementMode ? pick('select a tile', 'elige una casilla') : pick('manual placement', 'colocación manual');
    }
    this.updateStartButtons();
    if (button) {
      button.disabled = !ready;
      button.textContent = !this.runStarted
        ? pick('Press Play first', 'Pulsa Play')
        : this.placementMode
          ? pick('Click a floor tile', 'Click en una casilla')
          : ready
            ? pick('Select enemy tile', 'Elegir casilla')
            : this.enemyDropsLeft <= 0
              ? pick('No drops left', 'Sin usos')
              : pick('Cooling down', 'Espera');
      button.classList.toggle('opacity-50', !ready);
      button.classList.toggle('cursor-not-allowed', !ready);
      button.classList.toggle('border-yellow-300', this.placementMode);
      button.classList.toggle('bg-yellow-400', this.placementMode);
      button.classList.toggle('text-slate-950', this.placementMode);
    }
  }

  private renderWorld(): void {
    this.overlayTexts.forEach((text) => text.destroy());
    this.tileSprites.forEach((sprite) => sprite.destroy());
    this.overlayTexts = [];
    this.tileSprites = [];
    this.graphics.clear();

    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        this.drawTile(x, y, tileAt(this.world, { x, y }));
      }
    }

    if (!this.runStarted && this.world.status === 'playing') {
      this.drawStartOverlay();
    }

    if (this.world.status !== 'playing') {
      this.drawEndOverlay();
    }

    const state = buildJevGameState(this.world);
    const remainingSeconds = Math.max(0, Math.ceil((RUN_DURATION_MS - this.elapsedRunMs()) / 1000));
    const message = this.world.status === 'playing' ? `${this.world.message} Time left: ${remainingSeconds}s.` : this.world.message;
    updateDecisionPanel(state, this.lastDecision, message);
    this.updateOpponentPanel();
    this.updateDeveloperPanel(state);
  }

  private toggleDeveloperMode(force?: boolean): void {
    const nextMode = force ?? !this.developerMode;
    if (nextMode === this.developerMode) {
      return;
    }

    if (nextMode) {
      this.pauseStartedAt = this.time.now;
    } else if (this.pauseStartedAt > 0) {
      this.totalPausedMs += this.time.now - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }

    this.developerMode = nextMode;
    const panel = document.querySelector<HTMLElement>('#developer-panel');
    const button = document.querySelector<HTMLButtonElement>('#developer-mode-btn');
    panel?.classList.toggle('hidden', !this.developerMode);
    if (button) {
      button.textContent = this.developerMode ? 'Close learning' : 'Learning mode';
    }
    this.logDeveloperEvent('toggleDeveloperMode()', {
      developerMode: this.developerMode,
      paused: this.developerMode,
      timerFrozenAt: formatTime(Math.max(0, RUN_DURATION_MS - this.elapsedRunMs())),
    });
    if (this.developerMode) {
      void this.executeDeveloperStep();
    } else {
      this.updateDeveloperPanel();
    }
  }

  private async moveDeveloperStep(delta: number): Promise<void> {
    this.developerStep = Math.max(0, Math.min(DEVELOPER_STEPS - 1, this.developerStep + delta));
    this.logDeveloperEvent('Learning wizard step changed', { step: this.developerStep + 1, total: DEVELOPER_STEPS });
    await this.executeDeveloperStep();
  }

  private async executeDeveloperStep(): Promise<void> {
    const gameState = buildJevGameState(this.world);

    if (this.developerStep === 0) {
      this.logDeveloperEvent('Scene.create() learning replay', 'The scene is loaded, sprites are ready, handlers are registered, and the game waits for Play.');
    }

    if (this.developerStep === 1) {
      this.logDeveloperEvent('WorldState inspected', summarizeWorld(this.world));
    }

    if (this.developerStep === 2) {
      this.logDeveloperEvent('buildJevGameState(world)', gameState);
    }

    if (this.developerStep === 3) {
      this.logDeveloperEvent('requestJevDecision(gameState) preview', buildJevApiPreview(gameState));
    }

    if (this.developerStep === 4) {
      this.thinking = true;
      this.logDeveloperEvent('requestJevDecision(gameState)', 'Learning wizard is making a real paused Jev decision request now.');
      this.updateDeveloperPanel(gameState);
      const decision = await requestJevDecision(gameState);
      this.lastDecision = decision;
      this.developerDecisionApplied = false;
      this.thinking = false;
      this.logDeveloperEvent('Jev decision received', decision);
    }

    if (this.developerStep === 5) {
      if (!this.lastDecision) {
        this.logDeveloperEvent('applyAction skipped', 'No Jev decision exists yet. Go to Step 5: Decision response first.');
      } else if (this.developerDecisionApplied) {
        this.logDeveloperEvent('applyAction skipped', 'The current learning decision was already applied.');
      } else {
        const previousWorld = this.world;
        this.world = applyAction(this.world, this.lastDecision.action);
        this.developerDecisionApplied = true;
        this.logDeveloperEvent('applyAction(world, decision.action)', {
          action: this.lastDecision.action,
          before: summarizeWorld(previousWorld),
          after: summarizeWorld(this.world),
        });
        this.renderWorld();
        return;
      }
    }

    if (this.developerStep === 6) {
      this.logDeveloperEvent('startEnemyPlacement() explained', {
        enemyDropsLeft: this.enemyDropsLeft,
        placementMode: this.placementMode,
        nextMethodOnClick: 'tryPlaceEnemyAtPointer(pointer) -> placeEnemyAt(world, position)',
      });
    }

    if (this.developerStep === 7) {
      this.logDeveloperEvent('Full loop explained', [
        'update()',
        'runDecisionTurn()',
        'buildJevGameState()',
        'requestJevDecision()',
        'applyAction()',
        'renderWorld()',
      ]);
    }

    this.updateDeveloperPanel(buildJevGameState(this.world));
  }

  private elapsedRunMs(time = this.time.now): number {
    if (!this.runStarted) {
      return 0;
    }
    const activePause = this.developerMode && this.pauseStartedAt > 0 ? time - this.pauseStartedAt : 0;
    return Math.max(0, time - this.runStartedAt - this.totalPausedMs - activePause);
  }

  private logDeveloperEvent(event: string, details: unknown): void {
    this.developerLog = [
      ...this.developerLog,
      {
        time: formatTime(Math.max(0, RUN_DURATION_MS - this.elapsedRunMs())),
        event,
        details,
      },
    ].slice(-30);
  }

  private updateDeveloperPanel(gameState = buildJevGameState(this.world)): void {
    if (!this.developerMode) {
      return;
    }

    const content = document.querySelector<HTMLElement>('#developer-panel-content');
    if (!content) {
      return;
    }

    const stepLabel = document.querySelector<HTMLElement>('#developer-step-label');
    if (stepLabel) {
      stepLabel.textContent = pick(`Step ${this.developerStep + 1}/${DEVELOPER_STEPS}`, `Paso ${this.developerStep + 1}/${DEVELOPER_STEPS}`);
    }

    content.innerHTML = renderDeveloperContent({
      world: this.world,
      gameState,
      decision: this.lastDecision,
      log: this.developerLog,
      placementMode: this.placementMode,
      enemyDropsLeft: this.enemyDropsLeft,
      thinking: this.thinking,
      step: this.developerStep,
      timeLeft: formatTime(Math.max(0, RUN_DURATION_MS - this.elapsedRunMs())),
    });
  }

  private updateStartButtons(): void {
    const buttons = [
      document.querySelector<HTMLButtonElement>('#start-run-btn'),
      document.querySelector<HTMLButtonElement>('#start-run-btn-mobile'),
    ].filter((button): button is HTMLButtonElement => Boolean(button));

    for (const button of buttons) {
      button.disabled = this.runStarted || this.world.status !== 'playing';
      button.textContent = this.runStarted ? pick('▶ Running', '▶ Corriendo') : '▶ Play';
      button.classList.toggle('animate-pulse', !this.runStarted && this.world.status === 'playing');
      button.classList.toggle('opacity-60', this.runStarted || this.world.status !== 'playing');
      button.classList.toggle('cursor-not-allowed', this.runStarted || this.world.status !== 'playing');
    }
  }

  private drawTile(x: number, y: number, kind: TileKind): void {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const centerX = px + TILE_SIZE / 2;
    const centerY = py + TILE_SIZE / 2;

    this.graphics.fillStyle(kind === 'wall' ? COLORS.wall : COLORS.floor, 1);
    this.graphics.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    this.graphics.lineStyle(1, kind === 'wall' ? 0x60a5fa : 0x111827, kind === 'wall' ? 0.9 : 0.55);
    this.graphics.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    if (kind === 'player') {
      const movingSideways = this.lastDecision?.action === 'MOVE_LEFT' || this.lastDecision?.action === 'MOVE_RIGHT';
      const player = this.add
        .image(centerX, centerY, movingSideways ? 'player-side' : 'player-front')
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setDepth(1);
      player.setFlipX(this.lastDecision?.action === 'MOVE_LEFT');
      this.tileSprites.push(player);
    }

    if (kind === 'enemy') {
      const enemy = this.add.image(centerX, centerY, 'enemy').setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(1);
      this.tileSprites.push(enemy);
    }

    if (kind === 'potion') {
      const potion = this.add.image(centerX, centerY, 'potion').setDisplaySize(TILE_SIZE - 4, TILE_SIZE - 4).setDepth(1);
      this.tileSprites.push(potion);
    }

    if (kind === 'coin') {
      const sword = this.add.image(centerX, centerY, 'sword').setDisplaySize(TILE_SIZE - 6, TILE_SIZE - 6).setDepth(1);
      this.tileSprites.push(sword);
    }

    if (kind === 'exit') {
      const portal = this.add.image(centerX, centerY, 'portal').setDisplaySize(TILE_SIZE + 16, TILE_SIZE + 16).setDepth(1);
      this.tileSprites.push(portal);
    }
  }

  private drawStartOverlay(): void {
    const centerX = GRID_WIDTH * TILE_SIZE / 2;
    const overlayGraphics = this.add.graphics().setDepth(10);

    overlayGraphics.fillStyle(0x020617, 0.86);
    overlayGraphics.fillRoundedRect(46, 126, GRID_WIDTH * TILE_SIZE - 92, 176, 16);
    overlayGraphics.lineStyle(3, 0xfde047, 1);
    overlayGraphics.strokeRoundedRect(46, 126, GRID_WIDTH * TILE_SIZE - 92, 176, 16);

    const titleText = this.add
      .text(centerX, 156, pick('PRESS PLAY', 'PULSA PLAY'), {
        color: '#fde047',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(11);

    overlayGraphics.fillStyle(0xfde047, 1);
    overlayGraphics.fillRoundedRect(centerX - 78, 182, 156, 42, 8);
    overlayGraphics.lineStyle(4, 0xf97316, 1);
    overlayGraphics.strokeRoundedRect(centerX - 78, 182, 156, 42, 8);

    const playZone = this.add
      .zone(centerX, 203, 156, 42)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startRun())
      .setDepth(13);

    const playText = this.add
      .text(centerX, 203, '▶ PLAY', {
        color: '#020617',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(12);

    const detailText = this.add
      .text(centerX, 246, pick('Start the timer and let Jev begin deciding. Enter also works.', 'Arranca el temporizador y deja que Jev empiece a decidir. Enter también sirve.'), {
        color: '#e2e8f0',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '14px',
      })
      .setOrigin(0.5)
      .setDepth(11);
    const hintText = this.add
      .text(centerX, 270, pick('Your goal: stop Jev with 3 enemy placements.', 'Tu objetivo: detener a Jev con 3 enemigos.'), {
        color: '#67e8f9',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '13px',
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.overlayTexts = [overlayGraphics, titleText, playZone, playText, detailText, hintText];
  }

  private drawEndOverlay(): void {
    const won = this.world.status === 'won';
    const overlayGraphics = this.add.graphics().setDepth(10);

    overlayGraphics.fillStyle(0x020617, 0.86);
    overlayGraphics.fillRoundedRect(52, 150, GRID_WIDTH * TILE_SIZE - 104, 120, 16);
    overlayGraphics.lineStyle(2, won ? 0xef4444 : 0x22c55e, 1);
    overlayGraphics.strokeRoundedRect(52, 150, GRID_WIDTH * TILE_SIZE - 104, 120, 16);
    overlayGraphics.fillStyle(won ? 0xef4444 : 0x22c55e, 1);
    overlayGraphics.fillRect(72, 178, 10, 10);

    const title = won ? pick('JEV ESCAPED', 'JEV ESCAPÓ') : pick('YOU WIN', 'GANASTE');
    const detail = won ? pick('You lose. Jev reached the portal.', 'Has perdido: Jev llegó al portal.') : pick('Jev did not reach the portal.', 'Jev no llegó al portal.');
    const titleText = this.add
      .text(GRID_WIDTH * TILE_SIZE / 2, 190, title, {
        color: won ? '#fca5a5' : '#86efac',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(11);
    const detailText = this.add
      .text(GRID_WIDTH * TILE_SIZE / 2, 228, `${detail} ${pick('Press R to run again.', 'Pulsa R para volver a jugar.')}`, {
        color: '#cbd5e1',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: '15px',
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.overlayTexts = [overlayGraphics, titleText, detailText];
  }
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function summarizeWorld(world: WorldState): Record<string, unknown> {
  return {
    turn: world.turn,
    status: world.status,
    player: world.player,
    walls: world.walls.size,
    enemies: world.entities.filter((entity) => entity.kind === 'enemy').length,
    potions: world.entities.filter((entity) => entity.kind === 'potion').length,
    relics: world.entities.filter((entity) => entity.kind === 'coin').length,
    exit: world.entities.find((entity) => entity.kind === 'exit') ?? null,
    message: world.message,
  };
}

function renderDeveloperContent(input: {
  world: WorldState;
  gameState: JevGameState;
  decision: JevDecision | null;
  log: Array<{ time: string; event: string; details: unknown }>;
  placementMode: boolean;
  enemyDropsLeft: number;
  thinking: boolean;
  step: number;
  timeLeft: string;
}): string {
  const steps = developerSteps(input);
  const step = steps[input.step] ?? steps[0];

  return `
    <div class="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
      <aside class="space-y-3">
        ${devCard(
          pick('Paused dungeon view', 'Vista del dungeon pausado'),
          `<p class="mb-2 text-slate-300">${pick('Game paused. Timer and Jev turns are frozen. Same sprites as the board.', 'Juego pausado. El timer y los turnos de Jev están congelados. Usa los mismos sprites del tablero.')}</p>${renderMiniDungeon(input.world)}`,
        )}
        ${devCard(
          pick('Current snapshot', 'Snapshot actual'),
          `<div class="grid grid-cols-2 gap-2">
            ${devStat(pick('Time left', 'Tiempo'), input.timeLeft)}
            ${devStat(pick('Status', 'Estado'), input.world.status)}
            ${devStat(pick('Turn', 'Turno'), input.world.turn)}
            ${devStat(pick('Thinking', 'Pensando'), input.thinking ? pick('yes', 'sí') : 'no')}
            ${devStat(pick('Placement', 'Colocación'), input.placementMode ? pick('selecting', 'seleccionando') : pick('off', 'apagado'))}
            ${devStat(pick('Enemy drops', 'Enemigos'), input.enemyDropsLeft)}
            ${devStat('HP', input.world.player.hp)}
            ${devStat(pick('Last action', 'Última acción'), input.decision?.action ?? '-')}
          </div>`,
        )}
        ${devCard(pick('Jump to step', 'Ir al paso'), renderStepRail(steps, input.step))}
      </aside>

      <section class="space-y-3">
        ${devCard(`${pick('Step', 'Paso')} ${input.step + 1}/${steps.length}: ${step.title}`, step.body)}
        ${devCard(`${pick('Trace for this step', 'Traza de este paso')}: ${traceStageFor(input.step).title}`, renderTraceStage(input.step, input.log))}
        <div class="grid grid-cols-2 gap-2">
          <button type="button" data-learning-step="${Math.max(0, input.step - 1)}" class="border-4 border-white bg-white px-3 py-2 font-mono text-xs font-black uppercase text-slate-950 ${input.step === 0 ? 'opacity-40' : ''}">← ${pick('Previous step', 'Paso anterior')}</button>
          <button type="button" data-learning-step="${Math.min(steps.length - 1, input.step + 1)}" class="border-4 border-yellow-300 bg-yellow-300 px-3 py-2 font-mono text-xs font-black uppercase text-slate-950 ${input.step === steps.length - 1 ? 'opacity-40' : ''}">${pick('Next step', 'Siguiente paso')} →</button>
        </div>
      </section>
    </div>
  `;
}

function developerSteps(input: {
  world: WorldState;
  gameState: JevGameState;
  decision: JevDecision | null;
  enemyDropsLeft: number;
  placementMode: boolean;
}): Array<{ title: string; body: string }> {
  return [
    {
      title: pick('Big picture: what this project demonstrates', 'Idea general: qué demuestra este proyecto'),
      body: pick(
        `<p>This is not a chatbot. Jev is a <strong>decision layer</strong> inside a deterministic game engine.</p>
        <ol class="mt-2 list-decimal space-y-2 pl-5">
          <li><strong>Phaser</strong> owns graphics, input, collision, combat, timer, and win/loss rules.</li>
          <li><strong>Jev</strong> receives structured state and selects one typed action from a closed list.</li>
          <li><strong>Game code</strong> validates Jev's action before changing state.</li>
          <li><strong>You</strong> are the adversary: 3 manual enemy placements to stop Jev before 00:00.</li>
        </ol>`,
        `<p>Esto no es un chatbot. Jev es una <strong>capa de decisión</strong> dentro de un motor de juego determinístico.</p>
        <ol class="mt-2 list-decimal space-y-2 pl-5">
          <li><strong>Phaser</strong> controla gráficos, input, colisiones, combate, timer y reglas de victoria/derrota.</li>
          <li><strong>Jev</strong> recibe estado estructurado y elige una acción tipada desde una lista cerrada.</li>
          <li><strong>El código del juego</strong> valida la acción antes de cambiar el estado.</li>
          <li><strong>Tú</strong> eres el adversario: 3 enemigos manuales para detener a Jev antes de 00:00.</li>
        </ol>`,
      ),
    },
    {
      title: pick('Current WorldState: the source of truth', 'WorldState actual: la fuente de verdad'),
      body: `${pick(
        '<p>The game does not trust visuals as state. The source of truth is <code>WorldState</code>.</p><p>Rendering, Jev payloads, legal actions, and win/loss checks are derived from this object.</p>',
        '<p>El juego no usa lo visual como estado. La fuente de verdad es <code>WorldState</code>.</p><p>El render, el payload de Jev, las acciones legales y las reglas de victoria/derrota salen de este objeto.</p>',
      )}<pre>${escapeHtml(stableJson(summarizeWorld(input.world)))}</pre>`,
    },
    {
      title: pick('What Jev receives before deciding', 'Qué recibe Jev antes de decidir'),
      body: `${pick(
        `<p><code>buildJevGameState(world)</code> compresses the full dungeon into decision-ready facts.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5"><li><code>player</code>: HP, potions, relics, position.</li><li><code>adjacent</code>: what is directly up/down/left/right.</li><li><code>nearest</code>: path-aware hints toward enemy, potion, relic, and exit.</li><li><code>legalActions</code>: the only actions Jev is allowed to choose.</li><li><code>recentActions</code> + <code>recentPositions</code>: loop detection context.</li></ul>`,
        `<p><code>buildJevGameState(world)</code> comprime todo el dungeon en datos listos para decidir.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5"><li><code>player</code>: vida, pociones, reliquias y posición.</li><li><code>adjacent</code>: qué hay arriba/abajo/izquierda/derecha.</li><li><code>nearest</code>: pistas de ruta hacia enemigo, poción, reliquia y portal.</li><li><code>legalActions</code>: las únicas acciones que Jev puede elegir.</li><li><code>recentActions</code> + <code>recentPositions</code>: contexto para detectar bucles.</li></ul>`,
      )}<pre>${escapeHtml(stableJson(input.gameState))}</pre>`,
    },
    {
      title: pick('The exact Jev request: options, Choice, Noul, Score', 'Request exacto a Jev: opciones, Choice, Noul, Score'),
      body: `${pick(
        `<p>This game uses Jev's <strong>Choice</strong> primitive for movement. The server sends a closed list of action options; Jev returns one choice plus confidence/probabilities.</p>`,
        `<p>Este juego usa la primitiva <strong>Choice</strong> de Jev para el movimiento. El servidor envía una lista cerrada de opciones y Jev devuelve una elección con confianza/probabilidades.</p>`,
      )}
        <pre>${escapeHtml(stableJson(buildJevApiPreview(input.gameState)))}</pre>
        <div class="mt-3 grid gap-2 md:grid-cols-3">
          ${primitiveCard('Choice', pick('Used here', 'Usado aquí'), pick('Select exactly one option from MOVE_UP, ATTACK, USE_POTION, WAIT, etc.', 'Elige exactamente una opción: MOVE_UP, ATTACK, USE_POTION, WAIT, etc.'))}
          ${primitiveCard('Noul', pick('Yes/no probability', 'Probabilidad sí/no'), pick('Not needed for movement, but useful for questions like “is Jev trapped?” or “is this placement dangerous?”', 'No hace falta para moverse, pero sirve para preguntas como “¿Jev está atrapado?” o “¿esta jugada es peligrosa?”'))}
          ${primitiveCard('Score', pick('Rubric rating', 'Puntaje por rúbrica'), pick('Could rate danger from 0-3 or route quality, but this game keeps movement as Choice.', 'Podría puntuar peligro de 0 a 3 o calidad de ruta, pero aquí el movimiento se mantiene como Choice.'))}
        </div>`,
    },
    {
      title: pick('Where Jev decides and what comes back', 'Dónde decide Jev y qué devuelve'),
      body: `${pick(
        '<p>The browser never calls Jev directly. It calls <code>/api/decision</code>. The server keeps <code>JEV_API_KEY</code> private and calls <code>https://api.typesafe.ai/v1/systemone</code>.</p><p>The response is parsed as a typed <code>JevDecision</code>.</p>',
        '<p>El navegador nunca llama a Jev directamente. Llama a <code>/api/decision</code>. El servidor mantiene <code>JEV_API_KEY</code> privada y llama a <code>https://api.typesafe.ai/v1/systemone</code>.</p><p>La respuesta se interpreta como un <code>JevDecision</code> tipado.</p>',
      )}
        <pre>${escapeHtml(stableJson({
          endpoint: '/api/decision',
          serverCalls: 'POST https://api.typesafe.ai/v1/systemone',
          expectedAnswer: {
            type: 'choice',
            choice: 'MOVE_RIGHT',
            confidence: 0.87,
            probabilities: { MOVE_RIGHT: 0.87, MOVE_DOWN: 0.1, WAIT: 0.03 },
          },
          actualLastDecision: input.decision ?? 'No decision yet',
        }))}</pre>`,
    },
    {
      title: pick('How the decision changes game state', 'Cómo la decisión cambia el estado'),
      body: `${pick(
        `<p><code>applyAction(world, decision.action)</code> is where the selected action becomes real gameplay.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5"><li>Movement only happens if the destination is not a wall or enemy.</li><li>Potions/relics are collected only if Jev lands on their tile.</li><li>Enemies damage Jev if adjacent after the move.</li><li>Portal tile changes status to <code>won</code> for Jev, which means <strong>you lose</strong>.</li><li>HP reaching zero or timer reaching zero changes status to <code>lost</code> for Jev, which means <strong>you win</strong>.</li></ul>`,
        `<p><code>applyAction(world, decision.action)</code> convierte la acción elegida en gameplay real.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5"><li>El movimiento solo ocurre si el destino no es pared ni enemigo.</li><li>Las pociones/reliquias se recogen solo si Jev cae en su casilla.</li><li>Los enemigos dañan a Jev si quedan adyacentes después del movimiento.</li><li>El portal cambia el estado a <code>won</code> para Jev, o sea que <strong>tú pierdes</strong>.</li><li>Si la vida o el timer llegan a cero, el estado pasa a <code>lost</code> para Jev, o sea que <strong>tú ganas</strong>.</li></ul>`,
      )}
        <pre>${escapeHtml(stableJson({
          lastDecision: input.decision ?? 'Waiting for first Jev decision',
          currentWorldAfterMutation: summarizeWorld(input.world),
        }))}</pre>`,
    },
    {
      title: pick('Your move: manual enemy placement', 'Tu jugada: colocar enemigos manualmente'),
      body: `${pick(
        '<p>You get <strong>3 enemy placements</strong>. Press Space or the button, then click an empty floor tile.</p><p><code>placeEnemyAt(world, position)</code> validates the click before mutating state.</p>',
        '<p>Tienes <strong>3 colocaciones de enemigos</strong>. Pulsa Espacio o el botón y luego haz click en una casilla libre.</p><p><code>placeEnemyAt(world, position)</code> valida el click antes de mutar el estado.</p>',
      )}<pre>${escapeHtml(stableJson({
          enemyDropsLeft: input.enemyDropsLeft,
          placementMode: input.placementMode,
          cooldownMs: ENEMY_DROP_COOLDOWN_MS,
          invalidTilesRejected: ['wall', 'player', 'portal', 'potion', 'relic', 'enemy', 'outside board'],
        }))}</pre>`,
    },
    {
      title: pick('Full runtime loop', 'Loop completo en runtime'),
      body: pick(
        `<ol class="list-decimal space-y-2 pl-5"><li><code>update(time)</code> runs every frame.</li><li>If this wizard is open, <code>developerMode</code> pauses turns and freezes elapsed timer.</li><li>Every <code>${TURN_DELAY_MS}ms</code>, <code>runDecisionTurn()</code> starts if Jev is not already thinking.</li><li><code>buildJevGameState(world)</code> creates the typed payload.</li><li><code>requestJevDecision(gameState)</code> calls your local API endpoint.</li><li><code>api/decision.ts</code> asks Jev a Choice question and normalizes the result.</li><li><code>applyAction()</code> changes WorldState.</li><li><code>renderWorld()</code> redraws the dungeon, debug panel, timer, and learning wizard.</li></ol>`,
        `<ol class="list-decimal space-y-2 pl-5"><li><code>update(time)</code> corre en cada frame.</li><li>Si este wizard está abierto, <code>developerMode</code> pausa los turnos y congela el timer.</li><li>Cada <code>${TURN_DELAY_MS}ms</code>, <code>runDecisionTurn()</code> arranca si Jev no está pensando.</li><li><code>buildJevGameState(world)</code> crea el payload tipado.</li><li><code>requestJevDecision(gameState)</code> llama al endpoint local.</li><li><code>api/decision.ts</code> le hace a Jev una pregunta Choice y normaliza el resultado.</li><li><code>applyAction()</code> cambia WorldState.</li><li><code>renderWorld()</code> redibuja el dungeon, el debug panel, el timer y el wizard.</li></ol>`,
      ),
    },
  ];
}

function renderMiniDungeon(world: WorldState): string {
  let cells = '';
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const kind = tileAt(world, { x, y });
      cells += `<span class="${miniTileClass(kind)}">${miniTileContent(kind)}</span>`;
    }
  }
  return `<div class="grid gap-[2px] rounded border-2 border-cyan-300 bg-black p-2" style="grid-template-columns: repeat(${GRID_WIDTH}, minmax(0, 1fr));">${cells}</div>`;
}

function miniTileClass(kind: TileKind): string {
  const base = 'grid h-[18px] w-[18px] place-items-center border text-[9px] font-black leading-none';
  const variants: Record<TileKind, string> = {
    floor: 'border-slate-800 bg-slate-950',
    wall: 'border-blue-300 bg-blue-600',
    player: 'border-sky-200 bg-slate-900',
    enemy: 'border-red-200 bg-slate-900',
    potion: 'border-emerald-200 bg-slate-900',
    coin: 'border-orange-200 bg-slate-900',
    exit: 'border-purple-200 bg-slate-900',
  };
  return `${base} ${variants[kind]}`;
}

function miniTileContent(kind: TileKind): string {
  const imageByKind: Partial<Record<TileKind, string>> = {
    player: '/assets/main-front.png',
    enemy: '/assets/enemy.png',
    potion: '/assets/potion.png',
    coin: '/assets/sword.png',
    exit: '/assets/portal.png',
  };
  const src = imageByKind[kind];
  if (src) {
    return `<img src="${src}" alt="" class="h-4 w-4 object-contain [image-rendering:pixelated]" />`;
  }
  return '';
}

function buildJevApiPreview(gameState: JevGameState): Record<string, unknown> {
  return {
    method: 'POST',
    url: 'https://api.typesafe.ai/v1/systemone',
    auth: 'Authorization: Bearer <JEV_API_KEY> (server-side only)',
    body: {
      model: 'jev-latest',
      state: gameState,
      questions: {
        next_action: {
          type: 'choice',
          instructions:
            'Choose exactly one next action. Prefer survival, then useful items, then reaching the exit. Only choose legal actions. Break loops if loopWarning is true.',
          criteria: Object.fromEntries(gameState.legalActions.map((action) => [action, actionCriteria(action)])),
        },
      },
    },
  };
}

function actionCriteria(action: string): string {
  const criteria: Record<string, string> = {
    MOVE_UP: pick('Move one tile up when it improves survival, collection, or route to portal.', 'Mover una casilla arriba si mejora supervivencia, recolección o ruta al portal.'),
    MOVE_DOWN: pick('Move one tile down when it improves survival, collection, or route to portal.', 'Mover una casilla abajo si mejora supervivencia, recolección o ruta al portal.'),
    MOVE_LEFT: pick('Move one tile left when it improves survival, collection, or route to portal.', 'Mover una casilla a la izquierda si mejora supervivencia, recolección o ruta al portal.'),
    MOVE_RIGHT: pick('Move one tile right when it improves survival, collection, or route to portal.', 'Mover una casilla a la derecha si mejora supervivencia, recolección o ruta al portal.'),
    ATTACK: pick('Attack an adjacent enemy only when legal and safer than fleeing.', 'Atacar a un enemigo adyacente solo si es legal y más seguro que huir.'),
    PICKUP: pick('Pick up a relic or potion on the current tile.', 'Recoger una reliquia o poción en la casilla actual.'),
    USE_POTION: pick('Use a potion when HP is low enough to risk death soon.', 'Usar una poción cuando la vida esté lo bastante baja como para arriesgar la partida.'),
    WAIT: pick('Wait only when no better legal action exists.', 'Esperar solo si no existe una mejor acción legal.'),
  };
  return criteria[action] ?? pick('Legal typed action.', 'Acción tipada legal.');
}

function primitiveCard(name: string, label: string, description: string): string {
  return `<article class="border-2 border-slate-700 bg-slate-900 p-2"><strong class="text-yellow-300">${escapeHtml(name)}</strong><p class="text-slate-100">${escapeHtml(label)}</p><p class="mt-1 text-slate-400">${escapeHtml(description)}</p></article>`;
}

function renderTraceStage(step: number, log: Array<{ time: string; event: string; details: unknown }>): string {
  const stage = traceStageFor(step);
  const relevantEntry = findRelevantTraceEntry(log, stage.match);
  const latestEntry = log.at(-1);

  return `
    <div class="grid gap-3">
      <p>${stage.explanation}</p>
      <ol class="list-decimal space-y-1 pl-5 text-slate-300">
        ${stage.sequence.map((item) => `<li>${item}</li>`).join('')}
      </ol>
      <div class="grid gap-2 md:grid-cols-2">
        <article class="border-2 border-emerald-500 bg-slate-900 p-2">
          <h4 class="font-black uppercase text-emerald-300">${pick('Relevant trace event', 'Evento relevante')}</h4>
          ${traceEntryHtml(relevantEntry, pick('Press Next to execute this stage in the paused wizard.', 'Pulsa Siguiente para ejecutar esta etapa en el wizard pausado.'))}
        </article>
        <article class="border-2 border-yellow-400 bg-slate-900 p-2">
          <h4 class="font-black uppercase text-yellow-300">${pick('Latest runtime event', 'Último evento')}</h4>
          ${traceEntryHtml(latestEntry, pick('No runtime event yet.', 'Todavía no hay eventos de runtime.'))}
        </article>
      </div>
    </div>
  `;
}

function traceStageFor(step: number): {
  title: string;
  match: string[];
  explanation: string;
  sequence: string[];
} {
  return [
    {
      title: pick('Scene boot and waiting state', 'Arranque de escena y espera'),
      match: ['Scene.create()', 'toggleDeveloperMode()'],
      explanation: pick('This stage explains how the game is initialized before the player presses Play.', 'Esta etapa explica cómo se inicializa el juego antes de que pulses Play.'),
      sequence: [
        pick('<code>preload()</code> loads sprites.', '<code>preload()</code> carga los sprites.'),
        pick('<code>create()</code> registers keyboard, mouse, UI button, and wizard handlers.', '<code>create()</code> registra teclado, mouse, botones de UI y handlers del wizard.'),
        pick('<code>renderWorld()</code> draws the dungeon but Jev is paused until Play.', '<code>renderWorld()</code> dibuja la mazmorra, pero Jev queda pausado hasta Play.'),
      ],
    },
    {
      title: pick('WorldState inspection', 'Inspección de WorldState'),
      match: ['WorldState inspected', 'resetRun()', 'applyAction(world, decision.action)'],
      explanation: pick('This stage follows the object that all systems read from and write to.', 'Esta etapa sigue el objeto que todos los sistemas leen y modifican.'),
      sequence: [
        pick('<code>WorldState</code> stores player, entities, walls, status, and history.', '<code>WorldState</code> guarda jugador, entidades, paredes, estado e historial.'),
        pick('Rendering uses <code>tileAt(world, position)</code>.', 'El render usa <code>tileAt(world, position)</code>.'),
        pick('Jev payloads use <code>buildJevGameState(world)</code>.', 'El payload que recibe Jev sale de <code>buildJevGameState(world)</code>.'),
      ],
    },
    {
      title: pick('Payload construction', 'Construcción del payload'),
      match: ['buildJevGameState(world)'],
      explanation: pick('This stage shows the exact point where the game becomes a Jev decision problem.', 'Esta etapa muestra el punto exacto donde el juego se convierte en un problema de decisión para Jev.'),
      sequence: [
        pick('Read current player HP, inventory, and position.', 'Leer vida, inventario y posición actual del jugador.'),
        pick('Compute adjacent tiles and path-aware nearest targets.', 'Calcular casillas adyacentes y objetivos cercanos usando ruta real.'),
        pick('Compute <code>legalActions</code> so Jev cannot invent invalid moves.', 'Calcular <code>legalActions</code> para que Jev no invente movimientos inválidos.'),
      ],
    },
    {
      title: pick('Jev API request shape', 'Forma del request a Jev'),
      match: ['requestJevDecision(gameState)'],
      explanation: pick('This stage explains the server-side request: Choice is used for movement, while Noul/Score are documented alternatives.', 'Esta etapa explica el request del servidor: Choice se usa para movimiento; Noul y Score se muestran como alternativas.'),
      sequence: [
        pick('Browser posts to <code>/api/decision</code>.', 'El navegador hace POST a <code>/api/decision</code>.'),
        pick('Server adds <code>JEV_API_KEY</code> privately.', 'El servidor agrega <code>JEV_API_KEY</code> de forma privada.'),
        pick('Server calls <code>/v1/systemone</code> with <code>questions.next_action.type = choice</code>.', 'El servidor llama a <code>/v1/systemone</code> con <code>questions.next_action.type = choice</code>.'),
      ],
    },
    {
      title: pick('Decision response', 'Respuesta de decisión'),
      match: ['Jev decision received'],
      explanation: pick('This stage shows what comes back from Jev and why it is safe for the game engine.', 'Esta etapa muestra qué devuelve Jev y por qué es seguro para el motor del juego.'),
      sequence: [
        pick('Jev returns <code>choice</code>, <code>confidence</code>, and <code>probabilities</code>.', 'Jev devuelve <code>choice</code>, <code>confidence</code> y <code>probabilities</code>.'),
        pick('The client validates the answer with Zod.', 'El cliente valida la respuesta con Zod.'),
        pick('Fallback logic exists if the API fails.', 'Hay lógica de fallback si la API falla.'),
      ],
    },
    {
      title: pick('State mutation', 'Mutación de estado'),
      match: ['applyAction(world, decision.action)'],
      explanation: pick('This stage shows how a Jev choice becomes deterministic gameplay.', 'Esta etapa muestra cómo una elección de Jev se convierte en gameplay determinístico.'),
      sequence: [
        pick('<code>applyAction()</code> checks walls, enemies, items, attacks, portal, HP, and win/loss.', '<code>applyAction()</code> revisa paredes, enemigos, items, ataques, portal, vida y victoria/derrota.'),
        pick('The result is a new <code>WorldState</code>.', 'El resultado es un nuevo <code>WorldState</code>.'),
        pick('<code>renderWorld()</code> displays that new state.', '<code>renderWorld()</code> muestra ese nuevo estado.'),
      ],
    },
    {
      title: pick('Human counter-move', 'Contra-jugada humana'),
      match: ['startEnemyPlacement()', 'placeEnemyAt(world, position)'],
      explanation: pick('This stage explains your interaction: you manually place enemies to alter Jev’s future state.', 'Esta etapa explica tu interacción: colocas enemigos manualmente para alterar el estado futuro de Jev.'),
      sequence: [
        pick('<code>startEnemyPlacement()</code> checks drops and cooldown.', '<code>startEnemyPlacement()</code> revisa usos restantes y cooldown.'),
        pick('Click is converted from pixels to grid coordinates.', 'El click se convierte de píxeles a coordenadas de grilla.'),
        pick('<code>placeEnemyAt()</code> validates the target tile before mutating state.', '<code>placeEnemyAt()</code> valida la casilla antes de mutar el estado.'),
      ],
    },
    {
      title: pick('Full loop', 'Loop completo'),
      match: ['Full loop explained', 'buildJevGameState(world)', 'requestJevDecision(gameState)', 'Jev decision received', 'applyAction(world, decision.action)'],
      explanation: pick('This stage ties every method together into one repeated loop.', 'Esta etapa conecta todos los métodos en un loop repetido.'),
      sequence: [
        pick('<code>update()</code> waits for turn delay.', '<code>update()</code> espera el delay del turno.'),
        pick('<code>runDecisionTurn()</code> builds state, asks Jev, applies result.', '<code>runDecisionTurn()</code> construye estado, consulta a Jev y aplica el resultado.'),
        pick('The loop stops when Jev reaches portal, dies, timer expires, or the wizard pauses it.', 'El loop se detiene si Jev llega al portal, muere, se acaba el timer o el wizard lo pausa.'),
      ],
    },
  ][step];
}

function findRelevantTraceEntry(
  log: Array<{ time: string; event: string; details: unknown }>,
  matches: string[],
): { time: string; event: string; details: unknown } | undefined {
  return log
    .slice()
    .reverse()
    .find((entry) => matches.some((match) => entry.event.includes(match)));
}

function traceEntryHtml(entry: { time: string; event: string; details: unknown } | undefined, fallback: string): string {
  if (!entry) {
    return `<p class="mt-1 text-slate-400">${escapeHtml(fallback)}</p>`;
  }

  return `
    <div class="mt-1 flex items-center justify-between gap-3">
      <strong>${escapeHtml(entry.event)}</strong>
      <span class="text-yellow-300">T-${entry.time}</span>
    </div>
    <pre class="mt-2 max-h-40 overflow-auto text-[11px] text-slate-300 shadcn-scroll-area">${escapeHtml(stableJson(entry.details))}</pre>
  `;
}

function renderStepRail(steps: Array<{ title: string }>, activeStep: number): string {
  return `
    <div data-slot="scroll-area" class="shadcn-scroll-area max-h-56 overflow-y-auto pr-2">
      <div class="grid gap-1">
        ${steps
          .map(
            (step, index) => `
              <button
                type="button"
                data-learning-step="${index}"
                class="border-2 px-2 py-1 text-left font-mono text-[11px] font-black uppercase ${
                  index === activeStep
                    ? 'border-yellow-300 bg-yellow-300 text-slate-950'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-300 hover:text-cyan-200'
                }"
              >
                <span class="mr-2 text-slate-500">${index + 1}.</span>${escapeHtml(step.title)}
              </button>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function devCard(title: string, body: string, extraClass = ''): string {
  return `
    <article class="border-4 border-slate-700 bg-slate-950 p-3 shadow-[4px_4px_0_#334155] ${extraClass}">
      <h3 class="mb-2 font-mono text-sm font-black uppercase text-cyan-300">${escapeHtml(title)}</h3>
      <div class="text-xs leading-5 text-slate-200 [&_code]:bg-slate-800 [&_code]:px-1 [&_pre]:max-h-[42vh] [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded [&_pre]:bg-slate-900 [&_pre]:p-2 [&_pre]:text-[11px] [&_pre]:text-slate-300">${body}</div>
    </article>
  `;
}

function devStat(label: string, value: string | number): string {
  return `<div class="border-2 border-slate-700 bg-slate-900 p-2"><p class="text-[10px] uppercase text-slate-400">${escapeHtml(label)}</p><strong class="text-white">${escapeHtml(String(value))}</strong></div>`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
