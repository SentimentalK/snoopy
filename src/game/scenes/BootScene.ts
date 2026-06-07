import Phaser from 'phaser';
import {
  MODERN_FRAME_HEIGHT,
  MODERN_FRAME_WIDTH,
  MODERN_GRID_FRAMES,
  modernAmbientAnimations,
  modernBackgrounds,
  modernFeedAssets,
  modernTouchAssets,
  modernUiAssets,
} from '../data/generatedModernAssets';

const ambientPath = (key: string) => `/assets/ambient/${key}.png`;
const feedPath = (key: string) => `/assets/actions/feed/${key}.png`;
const touchPath = (key: string) => `/assets/actions/touch/${key}.png`;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.image('background:sunny', modernBackgrounds.sunny);

    for (const key of modernAmbientAnimations) {
      this.load.spritesheet(`ambient:${key}`, ambientPath(key), {
        frameWidth: MODERN_FRAME_WIDTH,
        frameHeight: MODERN_FRAME_HEIGHT,
      });
    }

    if (modernFeedAssets.run) {
      this.load.spritesheet('action:feed:run', feedPath(modernFeedAssets.run), {
        frameWidth: MODERN_FRAME_WIDTH,
        frameHeight: MODERN_FRAME_HEIGHT,
      });
    }

    if (modernFeedAssets.eat) {
      this.load.spritesheet('action:feed:eat', feedPath(modernFeedAssets.eat), {
        frameWidth: MODERN_FRAME_WIDTH,
        frameHeight: MODERN_FRAME_HEIGHT,
      });
    }

    if (modernFeedAssets.food) {
      this.load.image('object:feed:food', feedPath(modernFeedAssets.food));
    }

    if (modernTouchAssets.touch) {
      this.load.spritesheet('action:touch', touchPath(modernTouchAssets.touch), {
        frameWidth: MODERN_FRAME_WIDTH,
        frameHeight: MODERN_FRAME_HEIGHT,
      });
    }

    this.load.spritesheet('ui:feed-button', `/assets/ui/${modernUiAssets.feedButton}.png`, {
      frameWidth: MODERN_FRAME_WIDTH,
      frameHeight: MODERN_FRAME_HEIGHT,
    });
  }

  create(): void {
    for (const key of modernAmbientAnimations) {
      this.createLoop(`ambient:${key}`);
    }

    this.createLoop('action:feed:run', 12);
    this.createLoop('action:feed:eat', 6);
    this.createLoop('action:touch', 8);

    this.scene.start('PetScene');
  }

  private createLoop(key: string, frameRate = 6): void {
    if (!this.textures.exists(key) || this.anims.exists(key)) return;

    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(key, {
        start: 0,
        end: MODERN_GRID_FRAMES - 1,
      }),
      frameRate,
      repeat: -1,
    });
  }
}
