import Phaser from 'phaser';
import { SnoopyActivityDefinition, SnoopyMicroAction } from './snoopyActivities';

const DEFAULT_FRAME_DURATION = 160;

const randomInRange = ([min, max]: readonly [number, number]) => (
  Phaser.Math.Between(Math.round(min), Math.round(max))
);

export class FrameAnimationController {
  private activity?: SnoopyActivityDefinition;
  private currentFrame = 0;
  private holdRemaining = 0;
  private actionFrameIndex = 0;
  private actionFrameElapsed = 0;
  private currentAction?: SnoopyMicroAction;
  private cooldowns = new Map<string, number>();

  constructor(private readonly sprite: Phaser.GameObjects.Sprite) {}

  start(activity: SnoopyActivityDefinition): void {
    this.activity = activity;
    this.currentAction = undefined;
    this.actionFrameIndex = 0;
    this.actionFrameElapsed = 0;
    this.cooldowns.clear();
    this.setFrame(Phaser.Math.RND.pick([...activity.anchorFrames]));
    this.scheduleHold();
  }

  stop(): void {
    this.activity = undefined;
    this.currentAction = undefined;
    this.actionFrameIndex = 0;
    this.actionFrameElapsed = 0;
    this.holdRemaining = 0;
  }

  update(dt: number): void {
    if (!this.activity || this.activity.legacyLoop) return;

    this.updateCooldowns(dt);
    if (this.currentAction) {
      this.updateCurrentAction(dt);
      return;
    }

    this.holdRemaining -= dt;
    if (this.holdRemaining > 0) return;

    const action = this.pickReadyMicroAction();
    if (!action) {
      this.setFrame(Phaser.Math.RND.pick([...this.activity.anchorFrames]));
      this.scheduleHold();
      return;
    }

    this.currentAction = action;
    this.actionFrameIndex = 0;
    this.actionFrameElapsed = 0;
    this.cooldowns.set(action.name, randomInRange(action.cooldown));
    this.setFrame(action.frames[0] ?? this.currentFrame);
  }

  isOnExitFrame(): boolean {
    if (!this.activity || this.currentAction) return false;
    return this.activity.exitFrames.includes(this.currentFrame);
  }

  getFrame(): number {
    return this.currentFrame;
  }

  private updateCurrentAction(dt: number): void {
    if (!this.currentAction || !this.activity) return;

    this.actionFrameElapsed += dt;
    const frameDuration = this.currentAction.frameDuration ?? DEFAULT_FRAME_DURATION;
    while (this.actionFrameElapsed >= frameDuration && this.currentAction) {
      this.actionFrameElapsed -= frameDuration;
      this.actionFrameIndex += 1;
      const nextFrame = this.currentAction.frames[this.actionFrameIndex];
      if (nextFrame === undefined) {
        this.currentAction = undefined;
        this.actionFrameIndex = 0;
        this.actionFrameElapsed = 0;
        if (!this.activity.exitFrames.includes(this.currentFrame)) {
          this.setFrame(Phaser.Math.RND.pick([...this.activity.anchorFrames]));
        }
        this.scheduleHold();
        return;
      }
      this.setFrame(nextFrame);
    }
  }

  private updateCooldowns(dt: number): void {
    for (const [name, remaining] of this.cooldowns.entries()) {
      const nextRemaining = remaining - dt;
      if (nextRemaining <= 0) {
        this.cooldowns.delete(name);
      } else {
        this.cooldowns.set(name, nextRemaining);
      }
    }
  }

  private pickReadyMicroAction(): SnoopyMicroAction | undefined {
    if (!this.activity) return undefined;

    const readyActions = this.activity.microActions.filter((action) => (
      !this.cooldowns.has(action.name) && Math.random() < action.chance
    ));
    return readyActions.length > 0
      ? Phaser.Math.RND.pick([...readyActions])
      : undefined;
  }

  private scheduleHold(): void {
    this.holdRemaining = this.activity ? randomInRange(this.activity.holdTime) : 0;
  }

  private setFrame(frame: number): void {
    if (this.activity && this.sprite.texture.key !== this.activity.textureKey) {
      this.sprite.setTexture(this.activity.textureKey, frame);
    } else {
      this.sprite.setFrame(frame);
    }
    this.currentFrame = frame;
  }
}
