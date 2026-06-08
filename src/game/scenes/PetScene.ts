import Phaser from 'phaser';
import {
  MODERN_GAME_HEIGHT,
  MODERN_GAME_WIDTH,
  modernAmbientAnimations,
} from '../data/generatedModernAssets';
import { PetCareState, PetCareStore } from '../systems/PetCareStore';

type RuntimeMode = 'ambient' | 'feeding' | 'touching';

const PET_HOME = { x: 550, y: 690 };
const PET_FEED_TARGET = { x: 780, y: 690 };
const FOOD_POSITION = { x: 965, y: 685 };
const FEED_BUTTON_POSITION = { x: 1115, y: 640 };
const PET_SCALE = 0.34;

export class PetScene extends Phaser.Scene {
  private pet!: Phaser.GameObjects.Sprite;
  private food!: Phaser.GameObjects.Image;
  private feedButton!: Phaser.GameObjects.Sprite;
  private mode: RuntimeMode = 'ambient';
  private careStore = new PetCareStore();
  private careState!: PetCareState;
  private ambientTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'PetScene' });
  }

  create(): void {
    this.careState = this.careStore.load();
    this.createBackground();
    this.createFood();
    this.createPet();
    this.createFeedButton();
    this.enterAmbient();
  }

  private createBackground(): void {
    const background = this.add.image(MODERN_GAME_WIDTH / 2, MODERN_GAME_HEIGHT / 2, 'background:sunny');
    background.setDisplaySize(MODERN_GAME_WIDTH, MODERN_GAME_HEIGHT);
    background.setDepth(0);
  }

  private createPet(): void {
    this.pet = this.add.sprite(PET_HOME.x, PET_HOME.y, 'ambient:happy', 0);
    this.pet.setOrigin(0.5, 1);
    this.pet.setScale(PET_SCALE);
    this.pet.setDepth(20);
    this.pet.setInteractive({ useHandCursor: true });
    this.pet.on('pointerup', () => this.handlePetTouch());
  }

  private createFood(): void {
    this.food = this.add.image(FOOD_POSITION.x, FOOD_POSITION.y, 'object:feed:food');
    this.food.setOrigin(0.5, 1);
    this.food.setDisplaySize(230, 128);
    this.food.setDepth(12);
    this.food.setVisible(false);
  }

  private createFeedButton(): void {
    this.feedButton = this.add.sprite(FEED_BUTTON_POSITION.x, FEED_BUTTON_POSITION.y, 'ui:feed-button', 0);
    this.feedButton.setOrigin(0.5, 0.5);
    this.feedButton.setScale(0.36);
    this.feedButton.setDepth(40);
    this.feedButton.setInteractive({ useHandCursor: true });

    this.feedButton.on('pointerdown', () => {
      if (this.mode !== 'ambient') return;
      this.feedButton.setFrame(1);
    });

    this.feedButton.on('pointerout', () => {
      this.feedButton.setFrame(0);
    });

    this.feedButton.on('pointerup', () => {
      const canFeed = this.mode === 'ambient';
      this.feedButton.setFrame(0);
      if (canFeed) {
        this.startFeeding();
      }
    });
  }

  private enterAmbient(preferredKey?: string): void {
    this.mode = 'ambient';
    this.food.setVisible(false);
    this.pet.setPosition(PET_HOME.x, PET_HOME.y);

    const key = preferredKey ?? this.pickAmbientKey();
    this.playPet(`ambient:${key}`);
    this.scheduleNextAmbient();
  }

  private pickAmbientKey(): string {
    this.careState = this.careStore.applyDecay(this.careState);
    if (this.careState.food <= 0 && modernAmbientAnimations.includes('sad')) {
      return 'sad';
    }

    const candidates = modernAmbientAnimations.filter((key) => key !== 'sad');
    return Phaser.Math.RND.pick([...candidates]);
  }

  private scheduleNextAmbient(): void {
    this.ambientTimer?.remove(false);
    this.ambientTimer = this.time.delayedCall(Phaser.Math.Between(7000, 12000), () => {
      if (this.mode === 'ambient') {
        this.enterAmbient();
      }
    });
  }

  private startFeeding(): void {
    if (this.mode !== 'ambient') return;

    this.mode = 'feeding';
    this.ambientTimer?.remove(false);
    this.feedButton.disableInteractive();
    this.food.setVisible(true);
    this.food.setAlpha(0);
    this.tweens.add({
      targets: this.food,
      alpha: 1,
      duration: 250,
      ease: 'Sine.easeOut',
    });

    this.playPet('action:feed:run');
    this.tweens.add({
      targets: this.pet,
      x: PET_FEED_TARGET.x,
      y: PET_FEED_TARGET.y,
      duration: 1200,
      ease: 'Sine.easeInOut',
      onComplete: () => this.startEating(),
    });
  }

  private startEating(): void {
    this.food.setVisible(false);
    this.playPet('action:feed:eat');

    this.time.delayedCall(4200, () => {
      this.careState = this.careStore.feed();
      this.feedButton.setInteractive({ useHandCursor: true });
      this.enterAmbient('happy');
    });
  }

  private handlePetTouch(): void {
    if (this.mode !== 'ambient') return;

    this.mode = 'touching';
    this.ambientTimer?.remove(false);
    this.feedButton.disableInteractive();
    this.playPet('action:touch');

    this.time.delayedCall(3200, () => {
      this.feedButton.setInteractive({ useHandCursor: true });
      this.enterAmbient('happy');
    });
  }

  private playPet(animationKey: string): void {
    if (this.anims.exists(animationKey)) {
      this.pet.play(animationKey);
    }
  }
}
