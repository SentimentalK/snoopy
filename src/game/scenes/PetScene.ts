import Phaser from 'phaser';
import {
  MODERN_FRAME_HEIGHT,
  MODERN_FRAME_WIDTH,
} from '../data/generatedModernAssets';
import { PET_FEED_TARGET, SnoopyActor } from '../actors/SnoopyActor';
import { PetCareState, PetCareStore } from '../systems/PetCareStore';

type RuntimeMode = 'ambient' | 'feeding' | 'touching' | 'letter';
type LetterState = 'idle' | 'opening' | 'envelope' | 'content' | 'closing';

const WORLD_WIDTH = 2752;
const WORLD_HEIGHT = 1536;
const IMAGE_CENTER = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
const SOURCE_TO_WORLD_SCALE = 2;
const toWorld = ({ x, y }: { x: number; y: number }) => ({
  x: x * SOURCE_TO_WORLD_SCALE,
  y: y * SOURCE_TO_WORLD_SCALE,
});

const FOOD_POSITION = toWorld({ x: 820, y: 685 });
const FOOD_DISPLAY_SIZE = { width: 230, height: 128 };
const FEED_BUTTON_BASE_SCALE = 0.36;
const FEED_BUTTON_MIN_SCALE = 0.22;
const FEED_BUTTON_MARGIN = 12;
const LETTER_PROMPT_MARGIN = 14;
const LETTER_PROMPT_GAP = 2;
const LETTER_PROMPT_MAX_SIZE = { width: 170, height: 132 };
const LETTER_PROMPT_MIN_SIZE = { width: 116, height: 92 };
const LETTER_OPEN_SIZE_RATIO = { width: 0.64, height: 0.7 };
const LETTER_OPEN_TRAVEL_MS = 2200;
const LETTER_CONTENT_SIZE_RATIO = { width: 0.97, height: 0.84 };
const LETTER_CONTENT_Y_RATIO = 0.47;
const LETTER_DANCE_X_RATIO = 0.72;
const LETTER_DANCE_Y_RATIO = 0.86;
const LETTER_DANCE_OUTRO_MS = 1200;
const PET_DOUBLE_CLICK_MS = 260;

export class PetScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private snoopy!: SnoopyActor;
  private food!: Phaser.GameObjects.Image;
  private feedButton!: Phaser.GameObjects.Sprite;
  private letterPrompt?: Phaser.GameObjects.Sprite;
  private letterBackdrop?: Phaser.GameObjects.Rectangle;
  private letterContent?: Phaser.GameObjects.Image;
  private debugOverlay?: HTMLPreElement;
  private debugControls?: HTMLDivElement;
  private cameraDebugInfo = '';
  private mode: RuntimeMode = 'ambient';
  private letterState: LetterState = 'idle';
  private careStore = new PetCareStore();
  private careState!: PetCareState;
  private emotionTimer?: Phaser.Time.TimerEvent;
  private petClickTimer?: Phaser.Time.TimerEvent;
  private letterWobbleTween?: Phaser.Tweens.Tween;
  private letterMoveTween?: Phaser.Tweens.Tween;
  private letterMusic?: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: 'PetScene' });
  }

  create(): void {
    this.careState = this.careStore.load();
    this.createBackground();
    this.createFood();
    this.createSnoopy();
    this.createFeedButton();
    this.createLetterFeature();
    this.configureCamera();
    this.createDebugToolsIfEnabled();
    this.enterAmbient();
    this.scale.on('resize', this.handleResize, this);
  }

  update(_time: number, delta: number): void {
    if (this.mode === 'ambient') {
      this.snoopy.update(delta);
    }
  }

  private createBackground(): void {
    this.background = this.add.image(0, 0, 'background:sunny');
    this.background.setOrigin(0, 0);
    this.background.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    this.background.setDepth(0);
  }

  private createSnoopy(): void {
    this.snoopy = new SnoopyActor(this, {
      onTouch: () => this.handlePetPointerUp(),
      onAmbientChanged: () => this.updateDebugOverlay(),
    });
  }

  private createFood(): void {
    this.food = this.add.image(FOOD_POSITION.x, FOOD_POSITION.y, 'object:feed:food');
    this.food.setOrigin(0.5, 1);
    this.food.setDisplaySize(FOOD_DISPLAY_SIZE.width, FOOD_DISPLAY_SIZE.height);
    this.food.setDepth(12);
    this.food.setVisible(false);
  }

  private createFeedButton(): void {
    this.feedButton = this.add.sprite(0, 0, 'ui:feed-button', 0);
    this.feedButton.setOrigin(0.5, 0.5);
    this.feedButton.setScrollFactor(0);
    this.feedButton.setScale(FEED_BUTTON_BASE_SCALE);
    this.feedButton.setDepth(40);
    this.feedButton.setInteractive({ useHandCursor: true });
    this.positionFeedButton();

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

  private createLetterFeature(): void {
    const promptTexture = this.textures.exists('feature:letter:letter')
      ? 'feature:letter:letter'
      : this.textures.exists('feature:letter:motion')
        ? 'feature:letter:motion'
        : undefined;
    if (!promptTexture) return;

    this.letterPrompt = this.add.sprite(0, 0, promptTexture, 0);
    this.letterPrompt.setOrigin(0.5, 0.5);
    this.letterPrompt.setScrollFactor(0);
    this.letterPrompt.setDepth(45);
    this.letterPrompt.setInteractive({ useHandCursor: true });
    this.layoutLetterFeature();
    this.startLetterPromptWobble();

    this.letterPrompt.on('pointerup', () => this.handleLetterPromptClick());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopLetterMusic();
    });
  }

  private handleLetterPromptClick(): void {
    if (this.letterState === 'idle') {
      this.openLetterEnvelope();
      return;
    }

    if (this.letterState === 'envelope') {
      this.showLetterContent();
    }
  }

  private layoutLetterFeature(): void {
    if (this.letterState === 'content') {
      this.layoutLetterContent();
      return;
    }

    if (this.letterState !== 'idle') return;
    this.positionLetterPrompt();
  }

  private positionLetterPrompt(): void {
    if (!this.letterPrompt || !this.feedButton) return;

    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const sizeScale = Phaser.Math.Clamp(Math.min(viewportWidth, viewportHeight) / 900, 0, 1);
    const targetWidth = Phaser.Math.Linear(
      LETTER_PROMPT_MIN_SIZE.width,
      LETTER_PROMPT_MAX_SIZE.width,
      sizeScale,
    );
    const targetHeight = Phaser.Math.Linear(
      LETTER_PROMPT_MIN_SIZE.height,
      LETTER_PROMPT_MAX_SIZE.height,
      sizeScale,
    );
    this.fitSpriteToBox(this.letterPrompt, targetWidth, targetHeight);

    const x = this.feedButton.x;
    const y = this.feedButton.y
      - this.feedButton.displayHeight / 2
      - this.letterPrompt.displayHeight / 2
      - LETTER_PROMPT_GAP;

    this.letterPrompt.setPosition(
      x,
      Phaser.Math.Clamp(y, this.letterPrompt.displayHeight / 2 + LETTER_PROMPT_MARGIN, viewportHeight),
    );
  }

  private fitSpriteToBox(
    sprite: Phaser.GameObjects.Sprite,
    maxWidth: number,
    maxHeight: number,
  ): number {
    const frameWidth = sprite.frame.width || MODERN_FRAME_WIDTH;
    const frameHeight = sprite.frame.height || MODERN_FRAME_HEIGHT;
    const scale = Math.min(maxWidth / frameWidth, maxHeight / frameHeight);
    sprite.setScale(scale);
    return scale;
  }

  private fitImageToBox(
    image: Phaser.GameObjects.Image,
    maxWidth: number,
    maxHeight: number,
  ): number {
    const frameWidth = image.frame.width || WORLD_WIDTH;
    const frameHeight = image.frame.height || WORLD_HEIGHT;
    const scale = Math.min(maxWidth / frameWidth, maxHeight / frameHeight);
    image.setScale(scale);
    return scale;
  }

  private setLetterPromptTexturePreservingSize(texture: string): void {
    if (!this.letterPrompt) return;

    const displayWidth = this.letterPrompt.displayWidth;
    const displayHeight = this.letterPrompt.displayHeight;
    this.letterPrompt.setTexture(texture, 0);
    this.fitSpriteToBox(this.letterPrompt, displayWidth, displayHeight);
  }

  private startLetterPromptWobble(angle = 15, duration = 620): void {
    if (!this.letterPrompt) return;

    this.letterWobbleTween?.stop();
    this.letterPrompt.setAngle(-angle);
    this.letterWobbleTween = this.tweens.add({
      targets: this.letterPrompt,
      angle,
      duration,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private openLetterEnvelope(): void {
    if (!this.letterPrompt || this.mode !== 'ambient') return;

    this.mode = 'letter';
    this.letterState = 'opening';
    this.food.setVisible(false);
    this.petClickTimer?.remove(false);
    this.petClickTimer = undefined;
    this.snoopy.pauseAmbient();
    this.emotionTimer?.remove(false);
    this.feedButton.setFrame(0);
    this.feedButton.disableInteractive();
    this.letterWobbleTween?.stop();
    this.letterMoveTween?.stop();

    if (this.textures.exists('feature:letter:motion')) {
      this.letterPrompt.setTexture('feature:letter:motion', 0);
      this.letterPrompt.play('feature:letter:motion');
    }

    this.letterPrompt.setVisible(true);
    this.letterPrompt.setDepth(50);
    this.letterPrompt.setAngle(0);
    this.letterPrompt.disableInteractive();

    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const targetScale = Math.min(
      (viewportWidth * LETTER_OPEN_SIZE_RATIO.width) / (this.letterPrompt.frame.width || MODERN_FRAME_WIDTH),
      (viewportHeight * LETTER_OPEN_SIZE_RATIO.height) / (this.letterPrompt.frame.height || MODERN_FRAME_HEIGHT),
    );

    this.letterMoveTween = this.tweens.add({
      targets: this.letterPrompt,
      x: viewportWidth / 2,
      y: viewportHeight / 2,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: LETTER_OPEN_TRAVEL_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.letterState = 'envelope';
        this.letterPrompt?.stop();
        if (this.textures.exists('feature:letter:letter')) {
          this.setLetterPromptTexturePreservingSize('feature:letter:letter');
        }
        this.startLetterPromptWobble(9, 760);
        this.letterPrompt?.setInteractive({ useHandCursor: true });
      },
    });
  }

  private showLetterContent(): void {
    if (!this.letterPrompt || this.letterState !== 'envelope') return;

    this.letterState = 'content';
    this.letterPrompt.disableInteractive();
    this.letterWobbleTween?.stop();
    this.letterPrompt.setVisible(false);
    this.letterPrompt.stop();

    this.letterBackdrop?.destroy();
    this.letterBackdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.08);
    this.letterBackdrop.setOrigin(0, 0);
    this.letterBackdrop.setScrollFactor(0);
    this.letterBackdrop.setDepth(49);
    this.letterBackdrop.setInteractive({ useHandCursor: false });
    this.letterBackdrop.on('pointerup', () => this.closeLetterContent());

    if (this.textures.exists('feature:letter:content')) {
      this.letterContent?.destroy();
      this.letterContent = this.add.image(0, 0, 'feature:letter:content');
      this.letterContent.setOrigin(0.5, 0.5);
      this.letterContent.setScrollFactor(0);
      this.letterContent.setDepth(52);
      this.letterContent.setInteractive({ useHandCursor: true });
      this.letterContent.on(
        'pointerup',
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => event.stopPropagation(),
      );
    }

    this.layoutLetterContent();
    this.playLetterDance();
    this.playLetterMusic();
  }

  private layoutLetterContent(): void {
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;

    this.letterBackdrop?.setSize(viewportWidth, viewportHeight);
    this.letterContent?.setPosition(viewportWidth / 2, viewportHeight * LETTER_CONTENT_Y_RATIO);
    if (this.letterContent) {
      this.fitImageToBox(
        this.letterContent,
        viewportWidth * LETTER_CONTENT_SIZE_RATIO.width,
        viewportHeight * LETTER_CONTENT_SIZE_RATIO.height,
      );
    }

    if (this.letterState === 'content') {
      this.positionPetForLetterDance();
    }
  }

  private playLetterDance(): void {
    this.snoopy.playLetterDance(this.getLetterDancePosition());
  }

  private positionPetForLetterDance(): void {
    this.snoopy.positionAt(this.getLetterDancePosition());
  }

  private getLetterDancePosition(): { x: number; y: number } {
    const camera = this.cameras.main;
    return {
      x: camera.scrollX + camera.width * LETTER_DANCE_X_RATIO,
      y: camera.scrollY + camera.height * LETTER_DANCE_Y_RATIO,
    };
  }

  private playLetterMusic(): void {
    if (!this.cache.audio.exists('feature:letter:music')) return;

    this.stopLetterMusic();
    this.letterMusic = this.sound.add('feature:letter:music', {
      loop: true,
      volume: 0.55,
    });
    this.letterMusic.play();
  }

  private stopLetterMusic(): void {
    if (!this.letterMusic) return;

    this.letterMusic.stop();
    this.letterMusic.destroy();
    this.letterMusic = undefined;
  }

  private closeLetterContent(): void {
    if (this.letterState !== 'content') return;

    this.letterState = 'closing';
    this.stopLetterMusic();
    this.letterBackdrop?.destroy();
    this.letterBackdrop = undefined;
    this.letterContent?.destroy();
    this.letterContent = undefined;
    this.letterPrompt?.setVisible(false);

    this.time.delayedCall(LETTER_DANCE_OUTRO_MS, () => {
      this.snoopy.setBaseDepth();
      this.snoopy.setInteractive();
      this.letterState = 'idle';
      this.mode = 'ambient';
      this.feedButton.setInteractive({ useHandCursor: true });
      this.resetLetterPrompt();
      this.enterAmbient();
    });
  }

  private resetLetterPrompt(): void {
    if (!this.letterPrompt) return;

    this.letterMoveTween?.stop();
    this.letterMoveTween = undefined;
    this.letterPrompt.stop();
    if (this.textures.exists('feature:letter:letter')) {
      this.letterPrompt.setTexture('feature:letter:letter', 0);
    } else if (this.textures.exists('feature:letter:motion')) {
      this.letterPrompt.setTexture('feature:letter:motion', 0);
    }
    this.letterPrompt.setAngle(0);
    this.letterPrompt.setDepth(45);
    this.letterPrompt.setVisible(true);
    this.letterPrompt.setInteractive({ useHandCursor: true });
    this.positionLetterPrompt();
    this.startLetterPromptWobble();
  }

  private configureCamera(): void {
    this.layoutViewport();
  }

  private handleResize(): void {
    this.layoutViewport();
  }

  private layoutViewport(): void {
    const camera = this.cameras.main;
    const viewportWidth = this.scale.gameSize.width;
    const viewportHeight = this.scale.gameSize.height;
    const cameraZoom = 1;
    const visibleWorldWidth = viewportWidth / cameraZoom;
    const visibleWorldHeight = viewportHeight / cameraZoom;

    camera.setViewport(0, 0, viewportWidth, viewportHeight);
    camera.setZoom(cameraZoom);
    camera.setScroll(
      IMAGE_CENTER.x - visibleWorldWidth / 2,
      IMAGE_CENTER.y - visibleWorldHeight / 2,
    );
    this.cameraDebugInfo =
      `fixed-center focus=${Math.round(IMAGE_CENTER.x)},${Math.round(IMAGE_CENTER.y)}`;
    this.positionFeedButton();
    this.layoutLetterFeature();
    this.updateDebugOverlay();
  }

  private positionFeedButton(): void {
    if (!this.feedButton) return;

    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const screenScale = Phaser.Math.Clamp(
      Math.min(viewportWidth, viewportHeight) / 1500,
      FEED_BUTTON_MIN_SCALE,
      FEED_BUTTON_BASE_SCALE,
    );
    const buttonScreenWidth = MODERN_FRAME_WIDTH * screenScale;
    const buttonScreenHeight = MODERN_FRAME_HEIGHT * screenScale;
    const screenX = viewportWidth - buttonScreenWidth / 2 - FEED_BUTTON_MARGIN;
    const screenY = viewportHeight - buttonScreenHeight / 2 - FEED_BUTTON_MARGIN;

    this.feedButton.setScale(screenScale);
    this.feedButton.setPosition(screenX, screenY);
  }

  private isDebugEnabled(): boolean {
    return new URLSearchParams(window.location.search).has('debug');
  }

  private createDebugToolsIfEnabled(): void {
    if (!this.isDebugEnabled()) return;
    if (this.debugOverlay) return;

    const overlay = document.createElement('pre');
    overlay.style.position = 'fixed';
    overlay.style.left = '8px';
    overlay.style.top = '8px';
    overlay.style.zIndex = '9999';
    overlay.style.maxWidth = '560px';
    overlay.style.margin = '0';
    overlay.style.padding = '8px 10px';
    overlay.style.borderRadius = '6px';
    overlay.style.background = 'rgba(0, 0, 0, 0.72)';
    overlay.style.color = '#fff';
    overlay.style.font = '12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    overlay.style.pointerEvents = 'none';
    overlay.style.whiteSpace = 'pre-wrap';
    document.body.appendChild(overlay);

    const controls = document.createElement('div');
    controls.style.position = 'fixed';
    controls.style.right = '8px';
    controls.style.top = '8px';
    controls.style.zIndex = '10000';
    controls.style.display = 'grid';
    controls.style.gap = '6px';
    controls.style.padding = '8px';
    controls.style.borderRadius = '8px';
    controls.style.background = 'rgba(255, 255, 255, 0.88)';
    controls.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.22)';
    controls.style.font = '12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

    const label = document.createElement('div');
    label.dataset.debugAmbientLabel = 'true';
    label.style.minWidth = '150px';
    label.style.color = '#111';

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.textContent = 'Next animation';
    nextButton.style.cursor = 'pointer';
    nextButton.style.border = '1px solid rgba(0, 0, 0, 0.24)';
    nextButton.style.borderRadius = '6px';
    nextButton.style.padding = '6px 10px';
    nextButton.style.background = '#fff';
    nextButton.style.color = '#111';
    nextButton.addEventListener('click', () => this.showNextDebugAmbient());

    controls.append(label, nextButton);
    document.body.appendChild(controls);

    this.debugOverlay = overlay;
    this.debugControls = controls;
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: this.updateDebugOverlay,
      callbackScope: this,
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      overlay.remove();
      controls.remove();
    });
    this.updateDebugOverlay();
  }

  private updateDebugOverlay(): void {
    if (!this.debugOverlay || !this.cameras?.main) return;

    const canvas = this.sys.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement?.getBoundingClientRect();
    const camera = this.cameras.main;
    const bgGameRect = {
      left: camera.x + (0 - camera.scrollX) * camera.zoom,
      top: camera.y + (0 - camera.scrollY) * camera.zoom,
      width: WORLD_WIDTH * camera.zoom,
      height: WORLD_HEIGHT * camera.zoom,
    };
    const cssScaleX = canvasRect.width / Math.max(1, this.scale.width);
    const cssScaleY = canvasRect.height / Math.max(1, this.scale.height);
    const bgCssRect = {
      left: canvasRect.left + bgGameRect.left * cssScaleX,
      top: canvasRect.top + bgGameRect.top * cssScaleY,
      width: bgGameRect.width * cssScaleX,
      height: bgGameRect.height * cssScaleY,
    };
    const fmt = (value: number) => Math.round(value * 10) / 10;

    this.debugOverlay.textContent = [
      'Snoopy debug',
      `ambient: ${this.snoopy.getDebugAmbientLabel()} mode=${this.mode}`,
      `window: ${window.innerWidth} x ${window.innerHeight} dpr=${window.devicePixelRatio}`,
      `parent css: ${fmt(parentRect?.width ?? 0)} x ${fmt(parentRect?.height ?? 0)} @ ${fmt(parentRect?.left ?? 0)},${fmt(parentRect?.top ?? 0)}`,
      `canvas css: ${fmt(canvasRect.width)} x ${fmt(canvasRect.height)} @ ${fmt(canvasRect.left)},${fmt(canvasRect.top)}`,
      `canvas attr: ${canvas.width} x ${canvas.height}`,
      `scale: ${fmt(this.scale.width)} x ${fmt(this.scale.height)} display=${fmt(this.scale.displaySize.width)} x ${fmt(this.scale.displaySize.height)}`,
      `layout: ${this.cameraDebugInfo}`,
      `camera: size=${fmt(camera.width)} x ${fmt(camera.height)} zoom=${fmt(camera.zoom)} scroll=${fmt(camera.scrollX)},${fmt(camera.scrollY)} viewport=${fmt(camera.x)},${fmt(camera.y)}`,
      `bg game rect: ${fmt(bgGameRect.left)},${fmt(bgGameRect.top)} ${fmt(bgGameRect.width)} x ${fmt(bgGameRect.height)}`,
      `bg css rect: ${fmt(bgCssRect.left)},${fmt(bgCssRect.top)} ${fmt(bgCssRect.width)} x ${fmt(bgCssRect.height)}`,
    ].join('\n');

    const ambientLabel = this.debugControls?.querySelector<HTMLElement>('[data-debug-ambient-label]');
    if (ambientLabel) {
      ambientLabel.textContent = `Ambient: ${this.snoopy.getDebugAmbientLabel()}`;
    }
  }

  private getFeedLayout(): {
    food: { x: number; y: number };
    petTarget: { x: number; y: number };
  } {
    return {
      food: FOOD_POSITION,
      petTarget: PET_FEED_TARGET,
    };
  }

  private enterAmbient(preferredKey?: string): void {
    this.mode = 'ambient';
    this.food.setVisible(false);
    this.emotionTimer?.remove(false);
    this.careState = this.careStore.applyDecay(this.careState);

    if (!preferredKey && this.careState.food <= 0 && this.snoopy.hasEmotion('sad')) {
      this.playEmotion('sad');
      return;
    }

    this.snoopy.enterAmbient(preferredKey);
    this.updateDebugOverlay();
  }

  private playEmotion(key: string): boolean {
    if (!this.snoopy.hasEmotion(key)) return false;
    this.mode = 'ambient';
    this.food.setVisible(false);
    this.emotionTimer?.remove(false);
    this.snoopy.playEmotion(key);
    this.updateDebugOverlay();
    return true;
  }

  private playEmotionThenAmbient(key: string, duration = 2200): void {
    if (!this.playEmotion(key)) {
      this.enterAmbient();
      return;
    }

    this.emotionTimer = this.time.delayedCall(duration, () => this.enterAmbient());
  }

  private showNextDebugAmbient(): void {
    if (this.mode !== 'ambient') return;

    this.snoopy.showNextDebugAmbient();
    this.updateDebugOverlay();
  }

  private handlePetPointerUp(): void {
    if (this.mode !== 'ambient') return;

    if (this.petClickTimer) {
      this.petClickTimer.remove(false);
      this.petClickTimer = undefined;
      this.handlePetDoubleClick();
      return;
    }

    this.petClickTimer = this.time.delayedCall(PET_DOUBLE_CLICK_MS, () => {
      this.petClickTimer = undefined;
      this.handlePetTouch();
    });
  }

  private handlePetDoubleClick(): void {
    if (this.mode !== 'ambient') return;

    this.snoopy.switchAmbient();
    this.updateDebugOverlay();
  }

  private startFeeding(): void {
    if (this.mode !== 'ambient') return;

    this.mode = 'feeding';
    this.petClickTimer?.remove(false);
    this.petClickTimer = undefined;
    this.snoopy.pauseAmbient();
    this.feedButton.disableInteractive();
    const feedLayout = this.getFeedLayout();
    this.food.setPosition(feedLayout.food.x, feedLayout.food.y);
    this.food.setVisible(true);
    this.food.setAlpha(0);
    this.tweens.add({
      targets: this.food,
      alpha: 1,
      duration: 250,
      ease: 'Sine.easeOut',
    });

    this.snoopy.startFeedRun(feedLayout.petTarget, () => this.startEating());
  }

  private startEating(): void {
    this.food.setVisible(false);
    this.snoopy.playEating();

    this.time.delayedCall(4200, () => {
      this.careState = this.careStore.feed();
      this.feedButton.setInteractive({ useHandCursor: true });
      this.playEmotionThenAmbient('happy');
    });
  }

  private handlePetTouch(): void {
    if (this.mode !== 'ambient') return;

    this.mode = 'touching';
    this.petClickTimer?.remove(false);
    this.petClickTimer = undefined;
    this.snoopy.pauseAmbient();
    this.feedButton.disableInteractive();
    this.snoopy.startTouchReaction();

    this.time.delayedCall(3200, () => {
      this.feedButton.setInteractive({ useHandCursor: true });
      this.playEmotionThenAmbient('happy');
    });
  }
}
