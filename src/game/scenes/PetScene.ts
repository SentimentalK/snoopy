import Phaser from 'phaser';
import {
  MODERN_FRAME_HEIGHT,
  MODERN_FRAME_WIDTH,
  modernSnoopy,
} from '../data/generatedModernAssets';
import { PetCareState, PetCareStore } from '../systems/PetCareStore';

type RuntimeMode = 'ambient' | 'feeding' | 'touching' | 'letter';
type LetterState = 'idle' | 'opening' | 'envelope' | 'content' | 'closing';

const SNOOPY_AMBIENT_ANIMATIONS = modernSnoopy.ambientAnimations;
const SNOOPY_AMBIENT_ANIMATION_GROUPS = modernSnoopy.ambientAnimationGroups;
const SNOOPY_EMOTION_ANIMATIONS = modernSnoopy.emotionAnimations;

const WORLD_WIDTH = 2752;
const WORLD_HEIGHT = 1536;
const IMAGE_CENTER = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
const SOURCE_TO_WORLD_SCALE = 2;
const toWorld = ({ x, y }: { x: number; y: number }) => ({
  x: x * SOURCE_TO_WORLD_SCALE,
  y: y * SOURCE_TO_WORLD_SCALE,
});

const PET_HOME = toWorld({ x: 550, y: 690 });
const PET_FEED_TARGET = toWorld({ x: 780, y: 690 });
const FOOD_POSITION = toWorld({ x: 820, y: 685 });
const DOGHOUSE_ROOF_LINE = { minX: 1230, maxX: 1700, y: 690 };
const DOGHOUSE_ROOF_CENTER = {
  x: (DOGHOUSE_ROOF_LINE.minX + DOGHOUSE_ROOF_LINE.maxX) / 2,
  y: DOGHOUSE_ROOF_LINE.y,
};
const PET_SCALE = 0.4;
const ROOF_VISIBLE_BOTTOM_FRAME_Y = 719;
const ROOF_SPRITE_Y_OFFSET = (MODERN_FRAME_HEIGHT - ROOF_VISIBLE_BOTTOM_FRAME_Y) * PET_SCALE;
const ROOF_CENTER_X_OFFSET = -80;
const ROOF_CENTER_Y_OFFSET = -32;
const ROOF_CENTER_LOWER_Y_OFFSET = 36;
const ROOF_AMBIENT_VISIBLE_WIDTH = 549;
const ROOF_EDGE_LEFT_OUTWARD_OFFSET = 44;
const ROOF_EDGE_RIGHT_INSET = 126;
const ROOF_EDGE_Y_OFFSET = -48;
const MOTION_VISIBLE_WIDTH = 640;
const MOTION_Y = toWorld({ x: 0, y: 690 }).y;
const MOTION_RUN_DURATION = 5600;
const MOTION_EXIT_PAUSE = 900;
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

type AmbientPlacement =
  | { kind: 'home' }
  | { kind: 'motion' }
  | { kind: 'roof-random'; yOffset?: number }
  | { kind: 'roof-center'; randomFlip?: boolean; xOffset: number; yOffset: number }
  | { kind: 'roof-edge'; leftOutwardOffset: number; rightInset: number; yOffset: number };

const DEFAULT_AMBIENT_PLACEMENT: AmbientPlacement = { kind: 'home' };

const AMBIENT_GROUP_PLACEMENTS: Record<string, AmbientPlacement> = {
  default: DEFAULT_AMBIENT_PLACEMENT,
  motion: { kind: 'motion' },
  roof: { kind: 'roof-random' },
  'roof-center': {
    kind: 'roof-center',
    randomFlip: true,
    xOffset: ROOF_CENTER_X_OFFSET,
    yOffset: ROOF_CENTER_Y_OFFSET,
  },
  'roof-center-lower': {
    kind: 'roof-center',
    randomFlip: true,
    xOffset: ROOF_CENTER_X_OFFSET,
    yOffset: ROOF_CENTER_LOWER_Y_OFFSET,
  },
  'roof-edge': {
    kind: 'roof-edge',
    leftOutwardOffset: ROOF_EDGE_LEFT_OUTWARD_OFFSET,
    rightInset: ROOF_EDGE_RIGHT_INSET,
    yOffset: ROOF_EDGE_Y_OFFSET,
  },
};

const createAmbientPlacementMap = () => {
  const placementByKey = new Map<string, AmbientPlacement>();

  for (const [group, keys] of Object.entries(SNOOPY_AMBIENT_ANIMATION_GROUPS)) {
    const placement = AMBIENT_GROUP_PLACEMENTS[group] ?? DEFAULT_AMBIENT_PLACEMENT;
    for (const key of keys) {
      placementByKey.set(key, placement);
    }
  }

  return placementByKey;
};

export class PetScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private pet!: Phaser.GameObjects.Sprite;
  private food!: Phaser.GameObjects.Image;
  private feedButton!: Phaser.GameObjects.Sprite;
  private letterPrompt?: Phaser.GameObjects.Sprite;
  private letterBackdrop?: Phaser.GameObjects.Rectangle;
  private letterContent?: Phaser.GameObjects.Image;
  private debugOverlay?: HTMLPreElement;
  private debugControls?: HTMLDivElement;
  private cameraDebugInfo = '';
  private currentAmbientKey?: string;
  private mode: RuntimeMode = 'ambient';
  private letterState: LetterState = 'idle';
  private careStore = new PetCareStore();
  private careState!: PetCareState;
  private ambientTimer?: Phaser.Time.TimerEvent;
  private emotionTimer?: Phaser.Time.TimerEvent;
  private motionExitTimer?: Phaser.Time.TimerEvent;
  private motionTween?: Phaser.Tweens.Tween;
  private letterWobbleTween?: Phaser.Tweens.Tween;
  private letterMoveTween?: Phaser.Tweens.Tween;
  private letterMusic?: Phaser.Sound.BaseSound;
  private ambientPlacementByKey = createAmbientPlacementMap();

  constructor() {
    super({ key: 'PetScene' });
  }

  create(): void {
    this.careState = this.careStore.load();
    this.createBackground();
    this.createFood();
    this.createPet();
    this.createFeedButton();
    this.createLetterFeature();
    this.configureCamera();
    this.createDebugToolsIfEnabled();
    this.enterAmbient();
    this.scale.on('resize', this.handleResize, this);
  }

  private createBackground(): void {
    this.background = this.add.image(0, 0, 'background:sunny');
    this.background.setOrigin(0, 0);
    this.background.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    this.background.setDepth(0);
  }

  private createPet(): void {
    const initialKey = SNOOPY_AMBIENT_ANIMATIONS[0] ?? SNOOPY_EMOTION_ANIMATIONS[0] ?? 'happy';
    const ambientKeys = SNOOPY_AMBIENT_ANIMATIONS as readonly string[];
    const initialTexture = ambientKeys.includes(initialKey)
      ? `ambient:${initialKey}`
      : `emotion:${initialKey}`;
    this.pet = this.add.sprite(PET_HOME.x, PET_HOME.y, initialTexture, 0);
    this.pet.setOrigin(0.5, 1);
    this.pet.setScale(PET_SCALE);
    this.pet.setDepth(20);
    this.pet.setInteractive({ useHandCursor: true });
    this.pet.on('pointerup', () => this.handlePetTouch());
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
    this.stopMotionAmbient();
    this.ambientTimer?.remove(false);
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
    this.pet.setVisible(true);
    this.pet.setDepth(55);
    this.pet.setScale(PET_SCALE);
    this.pet.setFlipX(false);
    this.pet.disableInteractive();
    this.positionPetForLetterDance();
    this.playPet('action:dance:dance');
  }

  private positionPetForLetterDance(): void {
    const camera = this.cameras.main;
    this.pet.setPosition(
      camera.scrollX + camera.width * LETTER_DANCE_X_RATIO,
      camera.scrollY + camera.height * LETTER_DANCE_Y_RATIO,
    );
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
      this.pet.setDepth(20);
      this.pet.setInteractive({ useHandCursor: true });
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
      `ambient: ${this.currentAmbientKey ?? 'none'} mode=${this.mode}`,
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
      ambientLabel.textContent = `Ambient: ${this.currentAmbientKey ?? 'none'}`;
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
    this.stopMotionAmbient();
    this.emotionTimer?.remove(false);
    this.careState = this.careStore.applyDecay(this.careState);

    if (!preferredKey && this.careState.food <= 0 && this.hasEmotion('sad')) {
      this.playEmotion('sad');
      return;
    }

    const key = preferredKey ?? this.pickAmbientKey();
    this.currentAmbientKey = key;
    this.positionPetForAmbient(key);
    this.playPet(`ambient:${key}`);
    if (this.ambientPlacementByKey.get(key)?.kind === 'motion') {
      this.startMotionAmbient();
      return;
    }
    this.scheduleNextAmbient();
  }

  private hasEmotion(key: string): boolean {
    const emotionKeys = SNOOPY_EMOTION_ANIMATIONS as readonly string[];
    return emotionKeys.includes(key);
  }

  private playEmotion(key: string): boolean {
    if (!this.hasEmotion(key)) return false;
    this.mode = 'ambient';
    this.food.setVisible(false);
    this.ambientTimer?.remove(false);
    this.emotionTimer?.remove(false);
    this.stopMotionAmbient();
    this.currentAmbientKey = `emotion:${key}`;
    this.playPet(`emotion:${key}`);
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

    const ambientKeys = SNOOPY_AMBIENT_ANIMATIONS as readonly string[];
    const currentIndex = this.currentAmbientKey
      ? ambientKeys.indexOf(this.currentAmbientKey)
      : -1;
    const nextKey = ambientKeys[(currentIndex + 1 + ambientKeys.length) % ambientKeys.length];
    if (!nextKey) return;

    this.enterAmbient(nextKey);
    this.updateDebugOverlay();
  }

  private positionPetForAmbient(key: string): void {
    const placement = this.ambientPlacementByKey.get(key) ?? DEFAULT_AMBIENT_PLACEMENT;

    if (placement.kind === 'motion') {
      this.positionPetForMotionAmbient();
      return;
    }

    if (placement.kind === 'roof-center') {
      this.pet.setFlipX(placement.randomFlip ? Phaser.Math.Between(0, 1) === 1 : false);
      this.pet.setPosition(
        DOGHOUSE_ROOF_CENTER.x + placement.xOffset,
        this.getRoofSpriteY(placement.yOffset),
      );
      return;
    }

    if (placement.kind === 'roof-edge') {
      const safeHalfWidth = (ROOF_AMBIENT_VISIBLE_WIDTH * PET_SCALE) / 2;
      const useLeftSlot = Phaser.Math.Between(0, 1) === 1;
      const x = useLeftSlot
        ? DOGHOUSE_ROOF_LINE.minX + safeHalfWidth - placement.leftOutwardOffset
        : DOGHOUSE_ROOF_LINE.maxX - safeHalfWidth - placement.rightInset;

      this.pet.setFlipX(useLeftSlot);
      this.pet.setPosition(x, this.getRoofSpriteY(placement.yOffset));
      return;
    }

    if (placement.kind === 'roof-random') {
      const safeHalfWidth = (ROOF_AMBIENT_VISIBLE_WIDTH * PET_SCALE) / 2;
      const minX = DOGHOUSE_ROOF_LINE.minX + safeHalfWidth;
      const maxX = DOGHOUSE_ROOF_LINE.maxX - safeHalfWidth;
      const x = Phaser.Math.FloatBetween(minX, maxX);

      this.pet.setFlipX(x < DOGHOUSE_ROOF_CENTER.x);
      this.pet.setPosition(x, this.getRoofSpriteY(placement.yOffset ?? 0));
      return;
    }

    this.pet.setFlipX(false);
    this.pet.setPosition(PET_HOME.x, PET_HOME.y);
  }

  private getVisibleBackgroundWorldBounds(): { left: number; right: number; top: number; bottom: number } {
    const camera = this.cameras.main;
    return {
      left: Phaser.Math.Clamp(camera.scrollX, 0, WORLD_WIDTH),
      right: Phaser.Math.Clamp(camera.scrollX + camera.width / camera.zoom, 0, WORLD_WIDTH),
      top: Phaser.Math.Clamp(camera.scrollY, 0, WORLD_HEIGHT),
      bottom: Phaser.Math.Clamp(camera.scrollY + camera.height / camera.zoom, 0, WORLD_HEIGHT),
    };
  }

  private positionPetForMotionAmbient(): void {
    const bounds = this.getVisibleBackgroundWorldBounds();
    const safeHalfWidth = (MOTION_VISIBLE_WIDTH * PET_SCALE) / 2;
    const runLeft = Phaser.Math.Between(0, 1) === 1;
    const startX = runLeft
      ? bounds.right - safeHalfWidth
      : bounds.left + safeHalfWidth;

    this.pet.setVisible(true);
    this.pet.setFlipX(runLeft);
    this.pet.setPosition(startX, Phaser.Math.Clamp(MOTION_Y, bounds.top, bounds.bottom));
  }

  private startMotionAmbient(): void {
    const bounds = this.getVisibleBackgroundWorldBounds();
    const safeHalfWidth = (MOTION_VISIBLE_WIDTH * PET_SCALE) / 2;
    const runLeft = this.pet.flipX;
    const targetX = runLeft
      ? bounds.left - safeHalfWidth
      : bounds.right + safeHalfWidth;
    const hideAtX = runLeft
      ? bounds.left - safeHalfWidth * 0.35
      : bounds.right + safeHalfWidth * 0.35;

    this.ambientTimer?.remove(false);
    this.motionTween?.stop();
    this.motionExitTimer?.remove(false);
    this.motionTween = this.tweens.add({
      targets: this.pet,
      x: targetX,
      duration: MOTION_RUN_DURATION,
      ease: 'Linear',
      onUpdate: () => {
        const hasLeftVisibleBackground = runLeft
          ? this.pet.x <= hideAtX
          : this.pet.x >= hideAtX;
        if (hasLeftVisibleBackground) {
          this.pet.setVisible(false);
        }
      },
      onComplete: () => {
        this.motionTween = undefined;
        this.motionExitTimer = this.time.delayedCall(MOTION_EXIT_PAUSE, () => {
          this.pet.setVisible(true);
          if (this.mode === 'ambient') {
            this.enterAmbient();
          }
        });
      },
    });
  }

  private stopMotionAmbient(): void {
    this.motionTween?.stop();
    this.motionTween = undefined;
    this.motionExitTimer?.remove(false);
    this.motionExitTimer = undefined;
    if (this.pet) {
      this.pet.setVisible(true);
    }
  }

  private getRoofSpriteY(extraOffset = 0): number {
    return DOGHOUSE_ROOF_LINE.y + ROOF_SPRITE_Y_OFFSET + extraOffset;
  }

  private pickAmbientKey(): string {
    return Phaser.Math.RND.pick([...SNOOPY_AMBIENT_ANIMATIONS]);
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
    this.stopMotionAmbient();
    this.ambientTimer?.remove(false);
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

    this.playPet('action:feed:run');
    this.pet.setFlipX(false);
    this.tweens.add({
      targets: this.pet,
      x: feedLayout.petTarget.x,
      y: feedLayout.petTarget.y,
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
      this.playEmotionThenAmbient('happy');
    });
  }

  private handlePetTouch(): void {
    if (this.mode !== 'ambient') return;

    this.mode = 'touching';
    this.stopMotionAmbient();
    this.ambientTimer?.remove(false);
    this.feedButton.disableInteractive();
    this.playPet('action:touch');

    this.time.delayedCall(3200, () => {
      this.feedButton.setInteractive({ useHandCursor: true });
      this.playEmotionThenAmbient('happy');
    });
  }

  private playPet(animationKey: string): void {
    if (this.anims.exists(animationKey)) {
      this.pet.play(animationKey);
    }
  }
}
