import Phaser from 'phaser';
import {
  MODERN_FRAME_HEIGHT,
  MODERN_FRAME_WIDTH,
  modernAmbientAnimationGroups,
  modernAmbientAnimations,
} from '../data/generatedModernAssets';
import { PetCareState, PetCareStore } from '../systems/PetCareStore';

type RuntimeMode = 'ambient' | 'feeding' | 'touching';

const WORLD_WIDTH = 2752;
const WORLD_HEIGHT = 1536;
const IMAGE_CENTER = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
const MOBILE_CAMERA_CROP = 1.18;
const DESKTOP_DOGHOUSE_BIAS = 0.25;
const SOURCE_TO_WORLD_SCALE = 2;
const toWorld = ({ x, y }: { x: number; y: number }) => ({
  x: x * SOURCE_TO_WORLD_SCALE,
  y: y * SOURCE_TO_WORLD_SCALE,
});

const PET_HOME = toWorld({ x: 550, y: 690 });
const PET_FEED_TARGET = toWorld({ x: 780, y: 690 });
const FOOD_POSITION = toWorld({ x: 965, y: 685 });
const DOGHOUSE_ROOF_LINE = { minX: 1230, maxX: 1700, y: 690 };
const DOGHOUSE_ROOF_CENTER = {
  x: (DOGHOUSE_ROOF_LINE.minX + DOGHOUSE_ROOF_LINE.maxX) / 2,
  y: DOGHOUSE_ROOF_LINE.y,
};
const DOGHOUSE_CENTER = { x: DOGHOUSE_ROOF_CENTER.x, y: 900 };
const PET_SCALE = 0.4;
const ROOF_VISIBLE_BOTTOM_FRAME_Y = 719;
const ROOF_SPRITE_Y_OFFSET = (MODERN_FRAME_HEIGHT - ROOF_VISIBLE_BOTTOM_FRAME_Y) * PET_SCALE;
const ROOF_CENTER_LOWER_Y_OFFSET = 76;
const FOOD_DISPLAY_SIZE = { width: 230, height: 128 };
const FEED_BUTTON_BASE_SCALE = 0.36;
const FEED_BUTTON_MIN_SCALE = 0.22;
const FEED_BUTTON_MARGIN = 12;
const FEED_BUTTON_VISIBLE_RIGHT_OFFSET = 310;
const FEED_BUTTON_VISIBLE_BOTTOM_OFFSET = 220;

export class PetScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private pet!: Phaser.GameObjects.Sprite;
  private food!: Phaser.GameObjects.Image;
  private feedButton!: Phaser.GameObjects.Sprite;
  private debugOverlay?: HTMLPreElement;
  private cameraDebugInfo = '';
  private mode: RuntimeMode = 'ambient';
  private careStore = new PetCareStore();
  private careState!: PetCareState;
  private ambientTimer?: Phaser.Time.TimerEvent;
  private roofAmbientKeys = new Set<string>(modernAmbientAnimationGroups.roof ?? []);
  private roofCenterAmbientKeys = new Set<string>(modernAmbientAnimationGroups['roof-center'] ?? []);
  private roofCenterLowerAmbientKeys = new Set<string>(modernAmbientAnimationGroups['roof-center-lower'] ?? []);

  constructor() {
    super({ key: 'PetScene' });
  }

  create(): void {
    this.careState = this.careStore.load();
    this.createBackground();
    this.createFood();
    this.createPet();
    this.createFeedButton();
    this.configureCamera();
    this.createDebugOverlayIfEnabled();
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
    const viewportAspect = viewportWidth / viewportHeight;
    const coverZoom = Math.max(viewportWidth / WORLD_WIDTH, viewportHeight / WORLD_HEIGHT);
    const isMobileLike = viewportAspect < 1 || viewportWidth <= 768 || viewportHeight <= 700;

    let cameraZoom: number;
    let focusX: number;
    let focusY: number;
    let cameraMode: string;

    if (isMobileLike) {
      cameraMode = 'mobile-stage';
      cameraZoom = Math.min(1, coverZoom * MOBILE_CAMERA_CROP);
      focusX = DOGHOUSE_CENTER.x;
      focusY = DOGHOUSE_CENTER.y;
    } else {
      cameraMode = 'desktop-cover';
      cameraZoom = Math.min(1, coverZoom);
      focusX = Phaser.Math.Linear(IMAGE_CENTER.x, DOGHOUSE_CENTER.x, DESKTOP_DOGHOUSE_BIAS);
      focusY = Phaser.Math.Linear(IMAGE_CENTER.y, DOGHOUSE_CENTER.y, DESKTOP_DOGHOUSE_BIAS);
    }

    camera.setViewport(0, 0, viewportWidth, viewportHeight);
    camera.setZoom(cameraZoom);
    const visibleWorldWidth = viewportWidth / cameraZoom;
    const visibleWorldHeight = viewportHeight / cameraZoom;
    camera.setScroll(
      this.getCameraScroll(focusX, visibleWorldWidth, WORLD_WIDTH),
      this.getCameraScroll(focusY, visibleWorldHeight, WORLD_HEIGHT),
    );
    this.cameraDebugInfo =
      `${cameraMode} cover=${coverZoom.toFixed(3)} ` +
      `focus=${Math.round(focusX)},${Math.round(focusY)}`;
    this.positionFeedButton();
    this.updateDebugOverlay();
  }

  private getCameraScroll(focus: number, visibleSize: number, worldSize: number): number {
    if (visibleSize >= worldSize) {
      return (worldSize - visibleSize) / 2;
    }

    return Phaser.Math.Clamp(focus - visibleSize / 2, 0, worldSize - visibleSize);
  }

  private positionFeedButton(): void {
    if (!this.feedButton) return;

    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const cameraZoom = this.cameras.main.zoom || 1;
    const screenScale = Phaser.Math.Clamp(
      Math.min(viewportWidth, viewportHeight) / 1500,
      FEED_BUTTON_MIN_SCALE,
      FEED_BUTTON_BASE_SCALE,
    );
    const screenX =
      viewportWidth - (FEED_BUTTON_VISIBLE_RIGHT_OFFSET * screenScale) - FEED_BUTTON_MARGIN;
    const screenY =
      viewportHeight - (FEED_BUTTON_VISIBLE_BOTTOM_OFFSET * screenScale) - FEED_BUTTON_MARGIN;

    this.feedButton.setScale(screenScale / cameraZoom);
    this.feedButton.setPosition(screenX / cameraZoom, screenY / cameraZoom);
  }

  private createDebugOverlayIfEnabled(): void {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
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

    this.debugOverlay = overlay;
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: this.updateDebugOverlay,
      callbackScope: this,
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => overlay.remove());
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
  }

  private getFeedLayout(): {
    food: { x: number; y: number };
    petTarget: { x: number; y: number };
  } {
    const camera = this.cameras.main;
    if (camera.width >= 900) {
      return {
        food: FOOD_POSITION,
        petTarget: PET_FEED_TARGET,
      };
    }

    const visibleWorldWidth = camera.width / camera.zoom;
    const visibleWorldHeight = camera.height / camera.zoom;
    const food = {
      x: camera.scrollX + visibleWorldWidth * 0.62,
      y: camera.scrollY + visibleWorldHeight * 0.8,
    };

    return {
      food,
      petTarget: {
        x: food.x - 170,
        y: food.y,
      },
    };
  }

  private enterAmbient(preferredKey?: string): void {
    this.mode = 'ambient';
    this.food.setVisible(false);

    const key = preferredKey ?? this.pickAmbientKey();
    this.positionPetForAmbient(key);
    this.playPet(`ambient:${key}`);
    this.scheduleNextAmbient();
  }

  private positionPetForAmbient(key: string): void {
    if (this.roofCenterLowerAmbientKeys.has(key)) {
      this.pet.setFlipX(Phaser.Math.Between(0, 1) === 1);
      this.pet.setPosition(DOGHOUSE_ROOF_CENTER.x, this.getRoofSpriteY(ROOF_CENTER_LOWER_Y_OFFSET));
      return;
    }

    if (this.roofCenterAmbientKeys.has(key)) {
      this.pet.setFlipX(Phaser.Math.Between(0, 1) === 1);
      this.pet.setPosition(DOGHOUSE_ROOF_CENTER.x, this.getRoofSpriteY());
      return;
    }

    if (this.roofAmbientKeys.has(key)) {
      const safeHalfWidth = (MODERN_FRAME_WIDTH * PET_SCALE) / 2;
      const useLeftSlot = Phaser.Math.Between(0, 1) === 1;
      const x = useLeftSlot
        ? DOGHOUSE_ROOF_LINE.minX + safeHalfWidth
        : DOGHOUSE_ROOF_LINE.maxX - safeHalfWidth;

      this.pet.setFlipX(useLeftSlot);
      this.pet.setPosition(x, this.getRoofSpriteY());
      return;
    }

    this.pet.setFlipX(false);
    this.pet.setPosition(PET_HOME.x, PET_HOME.y);
  }

  private getRoofSpriteY(extraOffset = 0): number {
    return DOGHOUSE_ROOF_LINE.y + ROOF_SPRITE_Y_OFFSET + extraOffset;
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
