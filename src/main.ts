import Phaser from 'phaser';
import './style.css';
import { initializeI18n } from './i18n';
import { DungeonScene } from './game/scenes/DungeonScene';
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from './game/map/world';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GRID_WIDTH * TILE_SIZE,
  height: GRID_HEIGHT * TILE_SIZE,
  backgroundColor: '#0f172a',
  pixelArt: true,
  scene: [DungeonScene],
};

initializeI18n();
new Phaser.Game(config);
