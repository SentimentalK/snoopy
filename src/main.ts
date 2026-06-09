import Phaser from 'phaser';
import { gameConfig } from './game/config';
import './style.css';

let game = new Phaser.Game(gameConfig);

const handleVisibilityChange = () => {
  if (document.hidden) {
    game.scene.scenes.forEach((scene) => {
      if (scene.scene.isActive()) {
        scene.scene.pause();
      }
    });
    return;
  }

  game.scene.scenes.forEach((scene) => {
    if (scene.scene.isPaused()) {
      scene.scene.resume();
    }
  });
};

document.addEventListener('visibilitychange', handleVisibilityChange);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    game.destroy(true);
  });
}
