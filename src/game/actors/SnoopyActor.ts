import Phaser from 'phaser';
import {
  MODERN_FRAME_HEIGHT,
  modernSnoopy,
} from '../data/generatedModernAssets';
import { FrameAnimationController } from './FrameAnimationController';
import {
  SNOOPY_ACTIVITY_DEFINITIONS,
  SNOOPY_ACTIVITY_KEYS,
  SNOOPY_RANDOM_ACTIVITY_KEYS,
  SnoopyActivityDefinition,
} from './snoopyActivities';

const SNOOPY_AMBIENT_ANIMATION_GROUPS = modernSnoopy.ambientAnimationGroups;
const SNOOPY_EMOTION_ANIMATIONS = modernSnoopy.emotionAnimations;

const WORLD_WIDTH = 2752;
const WORLD_HEIGHT = 1536;
const SOURCE_TO_WORLD_SCALE = 2;
const toWorld = ({ x, y }: { x: number; y: number }) => ({
  x: x * SOURCE_TO_WORLD_SCALE,
  y: y * SOURCE_TO_WORLD_SCALE,
});

export const PET_HOME = toWorld({ x: 550, y: 690 });
export const PET_FEED_TARGET = toWorld({ x: 780, y: 690 });
export const PET_SCALE = 0.4;

const DOGHOUSE_ROOF_LINE = { minX: 1230, maxX: 1700, y: 690 };
const DOGHOUSE_ROOF_CENTER = {
  x: (DOGHOUSE_ROOF_LINE.minX + DOGHOUSE_ROOF_LINE.maxX) / 2,
  y: DOGHOUSE_ROOF_LINE.y,
};
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

type AmbientPlacement =
  | { kind: 'home' }
  | { kind: 'motion' }
  | { kind: 'roof-random'; yOffset?: number }
  | { kind: 'roof-center'; randomFlip?: boolean; xOffset: number; yOffset: number }
  | { kind: 'roof-edge'; leftOutwardOffset: number; rightInset: number; yOffset: number };

type SnoopyActorOptions = {
  onTouch: () => void;
  onAmbientChanged?: () => void;
};

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

export class SnoopyActor {
  readonly sprite: Phaser.GameObjects.Sprite;

  private readonly frameAnimation: FrameAnimationController;
  private readonly ambientPlacementByKey = createAmbientPlacementMap();
  private currentActivity?: SnoopyActivityDefinition;
  private activityElapsed = 0;
  private ambientActive = false;
  private recentActivityKeys: string[] = [];
  private motionExitTimer?: Phaser.Time.TimerEvent;
  private motionTween?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: SnoopyActorOptions,
  ) {
    const initialKey = SNOOPY_ACTIVITY_KEYS[0] ?? SNOOPY_EMOTION_ANIMATIONS[0] ?? 'happy';
    const initialTexture = SNOOPY_ACTIVITY_KEYS.includes(initialKey)
      ? `ambient:${initialKey}`
      : `emotion:${initialKey}`;

    this.sprite = scene.add.sprite(PET_HOME.x, PET_HOME.y, initialTexture, 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(PET_SCALE);
    this.sprite.setDepth(20);
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerup', () => this.options.onTouch());
    this.frameAnimation = new FrameAnimationController(this.sprite);
  }

  update(dt: number): void {
    if (!this.ambientActive || !this.currentActivity) return;

    this.activityElapsed += dt;
    this.frameAnimation.update(dt);

    if (this.ambientPlacementByKey.get(this.currentActivity.key)?.kind === 'motion') return;
    if (!this.canLeaveCurrentActivity(dt)) return;

    this.enterAmbient();
  }

  enterAmbient(preferredKey?: string): void {
    this.ambientActive = true;
    this.stopMotionAmbient();

    const key = preferredKey ?? this.pickAmbientKey();
    const activity = SNOOPY_ACTIVITY_DEFINITIONS[key];
    if (!activity) return;

    this.currentActivity = activity;
    this.activityElapsed = 0;
    this.rememberActivity(key);
    this.positionForAmbient(key);
    this.sprite.setVisible(true);
    this.sprite.setDepth(20);
    this.sprite.setScale(PET_SCALE);
    this.sprite.setInteractive({ useHandCursor: true });
    this.options.onAmbientChanged?.();

    if (activity.legacyLoop) {
      this.frameAnimation.stop();
      this.playAnimation(activity.textureKey);
      if (this.ambientPlacementByKey.get(key)?.kind === 'motion') {
        this.startMotionAmbient();
      }
      return;
    }

    this.sprite.stop();
    this.frameAnimation.start(activity);
  }

  pauseAmbient(): void {
    this.ambientActive = false;
    this.frameAnimation.stop();
    this.stopMotionAmbient();
  }

  hasEmotion(key: string): boolean {
    const emotionKeys = SNOOPY_EMOTION_ANIMATIONS as readonly string[];
    return emotionKeys.includes(key);
  }

  playEmotion(key: string): boolean {
    if (!this.hasEmotion(key)) return false;

    this.pauseAmbient();
    this.sprite.setVisible(true);
    this.playAnimation(`emotion:${key}`);
    return true;
  }

  startFeedRun(target: { x: number; y: number }, onComplete: () => void): void {
    this.pauseAmbient();
    this.sprite.setVisible(true);
    this.sprite.setFlipX(false);
    this.playAnimation('action:feed:run');
    this.scene.tweens.add({
      targets: this.sprite,
      x: target.x,
      y: target.y,
      duration: 1200,
      ease: 'Sine.easeInOut',
      onComplete,
    });
  }

  playEating(): void {
    this.playAnimation('action:feed:eat');
  }

  startTouchReaction(): void {
    this.pauseAmbient();
    this.playAnimation('action:touch');
  }

  playLetterDance(position: { x: number; y: number }): void {
    this.pauseAmbient();
    this.sprite.setVisible(true);
    this.sprite.setDepth(55);
    this.sprite.setScale(PET_SCALE);
    this.sprite.setFlipX(false);
    this.sprite.disableInteractive();
    this.positionAt(position);
    this.playAnimation('action:dance:dance');
  }

  positionAt(position: { x: number; y: number }): void {
    this.sprite.setPosition(position.x, position.y);
  }

  setBaseDepth(): void {
    this.sprite.setDepth(20);
  }

  setInteractive(): void {
    this.sprite.setInteractive({ useHandCursor: true });
  }

  disableInteractive(): void {
    this.sprite.disableInteractive();
  }

  getDebugAmbientLabel(): string {
    return this.currentActivity?.key ?? 'none';
  }

  showNextDebugAmbient(): void {
    const currentIndex = this.currentActivity
      ? SNOOPY_ACTIVITY_KEYS.indexOf(this.currentActivity.key)
      : -1;
    const nextKey = SNOOPY_ACTIVITY_KEYS[
      (currentIndex + 1 + SNOOPY_ACTIVITY_KEYS.length) % SNOOPY_ACTIVITY_KEYS.length
    ];
    if (nextKey) {
      this.enterAmbient(nextKey);
    }
  }

  switchAmbient(): void {
    this.enterAmbient(this.pickAmbientKey());
  }

  private canLeaveCurrentActivity(dt: number): boolean {
    if (!this.currentActivity) return false;

    const [minDwell, maxDwell] = this.currentActivity.dwellTime;
    if (this.activityElapsed < minDwell) return false;
    if (!this.currentActivity.legacyLoop && !this.frameAnimation.isOnExitFrame()) return false;
    if (this.activityElapsed >= maxDwell) return true;

    return Math.random() < 0.018 * (dt / 1000);
  }

  private pickAmbientKey(): string {
    const recent = new Set(this.recentActivityKeys);
    const randomKeys = SNOOPY_RANDOM_ACTIVITY_KEYS.length > 0
      ? SNOOPY_RANDOM_ACTIVITY_KEYS
      : SNOOPY_ACTIVITY_KEYS;
    const candidates = randomKeys.filter((key) => !recent.has(key));
    return Phaser.Math.RND.pick([...(candidates.length > 0 ? candidates : randomKeys)]);
  }

  private rememberActivity(key: string): void {
    this.recentActivityKeys = [key, ...this.recentActivityKeys.filter((item) => item !== key)].slice(0, 2);
  }

  private positionForAmbient(key: string): void {
    const placement = this.ambientPlacementByKey.get(key) ?? DEFAULT_AMBIENT_PLACEMENT;

    if (placement.kind === 'motion') {
      this.positionForMotionAmbient();
      return;
    }

    if (placement.kind === 'roof-center') {
      this.sprite.setFlipX(placement.randomFlip ? Phaser.Math.Between(0, 1) === 1 : false);
      this.sprite.setPosition(
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

      this.sprite.setFlipX(useLeftSlot);
      this.sprite.setPosition(x, this.getRoofSpriteY(placement.yOffset));
      return;
    }

    if (placement.kind === 'roof-random') {
      const safeHalfWidth = (ROOF_AMBIENT_VISIBLE_WIDTH * PET_SCALE) / 2;
      const minX = DOGHOUSE_ROOF_LINE.minX + safeHalfWidth;
      const maxX = DOGHOUSE_ROOF_LINE.maxX - safeHalfWidth;
      const x = Phaser.Math.FloatBetween(minX, maxX);

      this.sprite.setFlipX(x < DOGHOUSE_ROOF_CENTER.x);
      this.sprite.setPosition(x, this.getRoofSpriteY(placement.yOffset ?? 0));
      return;
    }

    this.sprite.setFlipX(false);
    this.sprite.setPosition(PET_HOME.x, PET_HOME.y);
  }

  private getVisibleBackgroundWorldBounds(): { left: number; right: number; top: number; bottom: number } {
    const camera = this.scene.cameras.main;
    return {
      left: Phaser.Math.Clamp(camera.scrollX, 0, WORLD_WIDTH),
      right: Phaser.Math.Clamp(camera.scrollX + camera.width / camera.zoom, 0, WORLD_WIDTH),
      top: Phaser.Math.Clamp(camera.scrollY, 0, WORLD_HEIGHT),
      bottom: Phaser.Math.Clamp(camera.scrollY + camera.height / camera.zoom, 0, WORLD_HEIGHT),
    };
  }

  private positionForMotionAmbient(): void {
    const bounds = this.getVisibleBackgroundWorldBounds();
    const safeHalfWidth = (MOTION_VISIBLE_WIDTH * PET_SCALE) / 2;
    const runLeft = Phaser.Math.Between(0, 1) === 1;
    const startX = runLeft
      ? bounds.right - safeHalfWidth
      : bounds.left + safeHalfWidth;

    this.sprite.setVisible(true);
    this.sprite.setFlipX(runLeft);
    this.sprite.setPosition(startX, Phaser.Math.Clamp(MOTION_Y, bounds.top, bounds.bottom));
  }

  private startMotionAmbient(): void {
    const bounds = this.getVisibleBackgroundWorldBounds();
    const safeHalfWidth = (MOTION_VISIBLE_WIDTH * PET_SCALE) / 2;
    const runLeft = this.sprite.flipX;
    const targetX = runLeft
      ? bounds.left - safeHalfWidth
      : bounds.right + safeHalfWidth;
    const hideAtX = runLeft
      ? bounds.left - safeHalfWidth * 0.35
      : bounds.right + safeHalfWidth * 0.35;

    this.motionTween?.stop();
    this.motionExitTimer?.remove(false);
    this.motionTween = this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      duration: MOTION_RUN_DURATION,
      ease: 'Linear',
      onUpdate: () => {
        const hasLeftVisibleBackground = runLeft
          ? this.sprite.x <= hideAtX
          : this.sprite.x >= hideAtX;
        if (hasLeftVisibleBackground) {
          this.sprite.setVisible(false);
        }
      },
      onComplete: () => {
        this.motionTween = undefined;
        this.motionExitTimer = this.scene.time.delayedCall(MOTION_EXIT_PAUSE, () => {
          this.sprite.setVisible(true);
          if (this.ambientActive) {
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
    this.sprite.setVisible(true);
  }

  private getRoofSpriteY(extraOffset = 0): number {
    return DOGHOUSE_ROOF_LINE.y + ROOF_SPRITE_Y_OFFSET + extraOffset;
  }

  private playAnimation(animationKey: string): void {
    if (this.scene.anims.exists(animationKey)) {
      this.sprite.play(animationKey);
    }
  }
}
