import Phaser from 'phaser';
import { gameConfig } from './game/config';
import './style.css';

// Create the Phaser game instance
const _game = new Phaser.Game(gameConfig);

// Handle visibility change — pause/resume game
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _game.scene.scenes.forEach(scene => {
      if (scene.scene.isActive()) {
        scene.scene.pause();
      }
    });
  } else {
    _game.scene.scenes.forEach(scene => {
      if (scene.scene.isPaused()) {
        scene.scene.resume();
      }
    });
  }
});
