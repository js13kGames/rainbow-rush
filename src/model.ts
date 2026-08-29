export type Gesture = 0 | 1 | 2 | 3;
export type RushType = Gesture;
export type Weakness = RushType;
export type Gestures = Gesture[];
export type RushTypes = RushType[];
export type AttackKind = 0 | 1 | 2;
export type EnemyState = "normal" | "charge" | "attack";
export type PlayerState = "normal" | "charge" | "rush" | "buffer";
export type ScreenState = "title" | "playing" | "paused" | "dying" | "dead";

export interface Point {
  x: number;
  y: number;
}

export interface Enemy extends Point {
  alive: boolean;
  age: number;
  attackKind: AttackKind;
  baseY: number;
  blinkOffset: number;
  blinkPeriod: number;
  dashVx: number;
  dashVy: number;
  facing: -1 | 1;
  pathKind: RushType;
  phase: number;
  previousX: number;
  previousY: number;
  radius: number;
  speed: number;
  state: EnemyState;
  stateDuration: number;
  stateTimer: number;
  weakness: Weakness;
}

export interface Projectile extends Point {
  age: number;
  alive: boolean;
  previousX: number;
  previousY: number;
  radius: number;
  turn: number;
  vx: number;
  vy: number;
  weakness: Weakness;
}

export interface Particle extends Point {
  hue: number;
  life: number;
  size: number;
  vx: number;
  vy: number;
}

export interface Star extends Point {
  depth: number;
  size: number;
}

export const NORMAL: RushType = 0;
export const BOOMERANG: RushType = 1;
export const LOOP: RushType = 2;
export const ZIGZAG: RushType = 3;
export const NO_ATTACK: AttackKind = 0;
export const BULLET_ATTACK: AttackKind = 1;
export const DASH_ATTACK: AttackKind = 2;

export function weaknessMatches(weakness: Weakness, rushTypes: readonly RushType[]): boolean {
  return rushTypes.some((rushType) => weakness === NORMAL || weakness === rushType);
}
