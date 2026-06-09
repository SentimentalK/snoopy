import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PetScene } from './scenes/PetScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  backgroundColor: '#000000',
  scene: [BootScene, PetScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
  },
};
