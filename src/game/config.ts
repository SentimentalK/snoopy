import Phaser from 'phaser';
import { MODERN_GAME_HEIGHT, MODERN_GAME_WIDTH } from './data/generatedModernAssets';
import { BootScene } from './scenes/BootScene';
import { PetScene } from './scenes/PetScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: MODERN_GAME_WIDTH,
  height: MODERN_GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#ffffff',
  scene: [BootScene, PetScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
  },
};
