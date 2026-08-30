import { GameAudio } from "./audio.ts";
import enemyAnySvg from "../assets/enemy-any.svg?raw";
import enemyLoopSvg from "../assets/enemy-loop.svg?raw";
import enemyBoomerangSvg from "../assets/enemy-boomerang.svg?raw";
import enemyZigzagSvg from "../assets/enemy-zigzag.svg?raw";
import playerBufferSvg from "../assets/player-buffer.svg?raw";
import playerChargeSvg from "../assets/player-charge.svg?raw";
import playerNormalSvg from "../assets/player-normal.svg?raw";
import playerRushSvg from "../assets/player-rush.svg?raw";
import projectileSvg from "../assets/projectile.svg?raw";
import { classifyRoute, distance, movingCirclesHit, squaredDistanceToSegment } from "./geometry.ts";
import type {
  AttackKind,
  Enemy,
  Gestures,
  Particle,
  PlayerState,
  Point,
  Projectile,
  RushType,
  RushTypes,
  ScreenState,
  Star,
  Weakness,
} from "./model.ts";
import { BOOMERANG, BULLET_ATTACK, DASH_ATTACK, LOOP, NO_ATTACK, NORMAL, weaknessMatches, ZIGZAG } from "./model.ts";
import { clamp, colorAt, createImageAssets, drawSvg, loadBestScore, random, saveBestScore } from "./utils.ts";

type MotionPoint = Point & { t: number };
type ScorePopup = Point & { life: number; popupColor: string; popupText: string };

export class RainbowRush {
  static readonly #WIDTH = 960;
  static readonly #HEIGHT = 540;
  static readonly #PLAYER_RADIUS = 22;
  static readonly #DRAW_WIDTH = RainbowRush.#PLAYER_RADIUS * 1.8;
  static readonly #ROUTE_POINT_SPACING = RainbowRush.#DRAW_WIDTH * 1.1;
  static readonly #MAX_ROUTE_LENGTH = 4_096;
  static readonly #BRAKE_DURATION = 0.3;
  static readonly #HIGH_SCORE_KEY = "rnike.js13kgames2026.highScore";
  static readonly #TUTORIAL_SKIP = { x: 24, y: 466, width: 128, height: 50 } as const;
  static readonly #PAUSE_BUTTON = { x: 868, y: 16, width: 68, height: 60 } as const;
  static readonly #MUTE_BUTTON = { x: 892, y: 476, width: 52, height: 48 } as const;
  static readonly #gestureNames = ["NORMAL", "BOOMERANG", "LOOP", "ZIGZAG"];
  static readonly #gestureColors = ["#fff", "#72f1ff", "#ff8bd8", "#ffe66d"];
  static readonly #gestureHues = [0, 188, 320, 52];
  static readonly #menuEnemyFloatSpeeds = [2, 2, 1.4, 3.5];
  static readonly #menuEnemyFloatAmplitudes = [5, 7, 5, 9];
  static readonly #INIT_RUSH_SPEED = 1_050 * 2;

  readonly #ctx: CanvasRenderingContext2D;
  readonly #canvas: HTMLCanvasElement;
  readonly #audio = new GameAudio();
  static readonly #images = createImageAssets<PlayerState>(
    {
      enemies: [
        { source: enemyAnySvg },
        { source: enemyBoomerangSvg, angle: 29 },
        { source: enemyLoopSvg },
        { source: enemyZigzagSvg },
      ],
      player: {
        normal: playerNormalSvg,
        charge: playerChargeSvg,
        rush: playerRushSvg,
        buffer: playerBufferSvg,
      },
      projectile: projectileSvg,
    },
    RainbowRush.#gestureColors,
  );
  readonly #stars: Star[] = [];
  #enemies: Enemy[] = [];
  #particles: Particle[] = [];
  #projectiles: Projectile[] = [];
  #scorePopups: ScorePopup[] = [];
  #screenState: ScreenState = "title";
  #playerState: PlayerState = "normal";
  #facing: -1 | 1 = 1;
  #pointer: Point = { x: 210, y: RainbowRush.#HEIGHT / 2 };
  #player: Point = { x: 210, y: RainbowRush.#HEIGHT / 2 };
  #chargePointer: Point = { x: 210, y: RainbowRush.#HEIGHT / 2 };
  #route: Point[] = [];
  #routeDistance = 0;
  #routeColorOffset = 0;
  #rushSpeed = RainbowRush.#INIT_RUSH_SPEED;
  #rushVelocity: Point = { x: 0, y: 0 };
  #brakeVelocity: Point = { x: 0, y: 0 };
  #brakeTimer = 0;
  #bufferTimer = 0;
  #gestures: Gestures = [NORMAL];
  #rushTypes: RushTypes = [NORMAL];
  #elapsed = 0;
  #menuAnimationTime = 0;
  #menuPlayerBufferTimer = 0;
  #score = 0;
  #bestScore = loadBestScore(RainbowRush.#HIGH_SCORE_KEY);
  #combo = 0;
  #comboTimer = 0;
  #comboPulse = 0;
  #spawnTimer = 0;
  #trailTimer = 0;
  #shake = 0;
  #flash = 0;
  #hitStop = 0;
  #enemySerial = 0;
  #killerWeakness: Weakness = NORMAL;
  #deathTimer = 0;
  #newBest = false;
  #muted = false;
  #onboardingComplete = false;
  #tutorialStep: 0 | 1 | 2 = 0;
  #previousTime = performance.now();
  #previousPointerPosition?: Point;
  #touchControls = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

  #weaknessColor(weakness: Weakness): string {
    return colorAt(RainbowRush.#gestureColors, weakness);
  }

  static launch(element: HTMLCanvasElement | null) {
    const context = element?.getContext("2d");

    return context ? new RainbowRush(context) : null;
  }

  constructor(context: CanvasRenderingContext2D) {
    this.#ctx = context;
    this.#canvas = context.canvas;

    for (let index = 0; index < 75; index += 1) {
      this.#stars.push({
        x: random(0, RainbowRush.#WIDTH),
        y: random(0, RainbowRush.#HEIGHT),
        depth: random(0.3, 1),
        size: random(0.6, 2.2),
      });
    }
    window.addEventListener("pointermove", (event) => this.#movePointer(event));
    this.#canvas.addEventListener("pointerdown", (event) => this.#pressPointer(event));
    window.addEventListener("pointerup", (event) => this.#releasePointer(event));
    window.addEventListener("pointercancel", (event) => this.#cancelPointer(event));
    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.code === "KeyP") this.#togglePause();
      if (event.code === "KeyM") this.#toggleMute();
    });
    document.addEventListener("pointerlockchange", () => {
      if (this.#screenState === "playing" && !this.#touchControls && document.pointerLockElement !== this.#canvas) {
        this.#pause();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.#pause();
    });
    this.#canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    requestAnimationFrame((time) => this.#frame(time));
  }

  #positionFromPointer(event: Pick<PointerEvent, "clientX" | "clientY">): Point {
    const bounds = this.#canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - bounds.left) * RainbowRush.#WIDTH) / bounds.width, 24, RainbowRush.#WIDTH - 24),
      y: clamp(((event.clientY - bounds.top) * RainbowRush.#HEIGHT) / bounds.height, 24, RainbowRush.#HEIGHT - 24),
    };
  }

  #movePointer(event: PointerEvent): void {
    if (!event.isPrimary) return;
    const bounds = this.#canvas.getBoundingClientRect();
    const position = this.#positionFromPointer(event);
    const movement =
      document.pointerLockElement === this.#canvas || !this.#previousPointerPosition
        ? {
            x: (event.movementX * RainbowRush.#WIDTH) / bounds.width,
            y: (event.movementY * RainbowRush.#HEIGHT) / bounds.height,
          }
        : {
            x: position.x - this.#previousPointerPosition.x,
            y: position.y - this.#previousPointerPosition.y,
          };
    if (this.#previousPointerPosition) this.#previousPointerPosition = position;
    if (this.#screenState === "playing" && this.#playerState === "charge") {
      this.#chargePointer = {
        x: clamp(this.#chargePointer.x + movement.x, 24, RainbowRush.#WIDTH - 24),
        y: clamp(this.#chargePointer.y + movement.y, 24, RainbowRush.#HEIGHT - 24),
      };
      this.#pointer = { ...this.#chargePointer };
      this.#recordRoutePoint(this.#chargePointer);
      return;
    }
    if (document.pointerLockElement === this.#canvas) {
      this.#pointer = {
        x: clamp(this.#pointer.x + movement.x, 24, RainbowRush.#WIDTH - 24),
        y: clamp(this.#pointer.y + movement.y, 24, RainbowRush.#HEIGHT - 24),
      };
    } else {
      this.#pointer = position;
    }
    if (this.#screenState !== "playing") {
      this.#canvas.style.cursor =
        this.#pointerOverCta() || this.#pointerInButton(RainbowRush.#MUTE_BUTTON) ? "pointer" : "default";
    }
  }

  #pointerOverCta(): boolean {
    return this.#pointer.x >= 400 && this.#pointer.x <= 560 && this.#pointer.y >= 425 && this.#pointer.y <= 461;
  }

  #pointerInButton(button: { x: number; y: number; width: number; height: number }): boolean {
    return (
      this.#pointer.x >= button.x &&
      this.#pointer.x <= button.x + button.width &&
      this.#pointer.y >= button.y &&
      this.#pointer.y <= button.y + button.height
    );
  }

  #menuEnemyPosition(index: number): Point {
    const floatY =
      Math.sin(this.#menuAnimationTime * RainbowRush.#menuEnemyFloatSpeeds[index] + index * 0.9) *
      RainbowRush.#menuEnemyFloatAmplitudes[index];
    return { x: 255 + index * 150, y: 225 + floatY };
  }

  #menuPlayerPosition(): Point {
    return { x: RainbowRush.#WIDTH / 2, y: 105 + Math.sin(this.#menuAnimationTime * 5) * 2.5 };
  }

  #bufferMenuPlayerAt(point: Point): boolean {
    const player = this.#menuPlayerPosition();
    const dx = point.x - player.x;
    const dy = point.y - player.y;
    if (dx * dx + dy * dy > 55 * 55) return false;
    this.#menuPlayerBufferTimer = 0.3;
    return true;
  }

  #fireMenuEnemyAt(point: Point): boolean {
    for (let index = 0; index < RainbowRush.#images.enemyImages.length; index += 1) {
      const enemy = this.#menuEnemyPosition(index);
      const dx = point.x - enemy.x;
      const dy = point.y - enemy.y;
      if (dx * dx + dy * dy > 55 * 55) continue;

      const angle = random(0, Math.PI * 2);
      const speed = random(230, 290);
      const radius = 7;
      this.#projectiles.push({
        x: enemy.x + Math.cos(angle) * 45,
        y: enemy.y + Math.sin(angle) * 45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        weakness: index as Weakness,
        alive: true,
        age: 0,
        previousX: enemy.x,
        previousY: enemy.y,
        turn: 0,
      });
      this.#audio.tone(100 + index * 35, 0.08, -25, 0.0375);
      return true;
    }
    return false;
  }

  #pressPointer(event: PointerEvent): void {
    event.preventDefault();
    this.#audio.unlock();
    this.#touchControls = event.pointerType !== "mouse";
    if (document.pointerLockElement !== this.#canvas) this.#pointer = this.#positionFromPointer(event);

    if (!event.isPrimary) {
      return;
    }

    if (event.button === 2) {
      if (this.#screenState === "playing" && this.#playerState !== "normal") this.#cancelRoute();
      return;
    }
    if (event.button !== 0) return;

    if (this.#pointerInButton(RainbowRush.#MUTE_BUTTON)) {
      this.#toggleMute();
      return;
    }

    if (this.#screenState === "dying") return;
    if (this.#screenState === "paused") {
      if (!this.#pointerOverCta()) return;
      this.#resume();
      return;
    }
    if (this.#screenState !== "playing") {
      if (this.#screenState === "title") {
        if (this.#bufferMenuPlayerAt(this.#pointer)) return;
        if (this.#fireMenuEnemyAt(this.#pointer)) return;
      }
      if (!this.#pointerOverCta()) return;
      if (this.#screenState === "title") this.#audio.startGame();
      else if (this.#screenState === "dead") this.#audio.rideAgain();
      this.#reset();
      return;
    }
    if (this.#pointerInButton(RainbowRush.#PAUSE_BUTTON)) {
      this.#pause();
      return;
    }
    if (this.#tutorialStep && this.#pointerInButton(RainbowRush.#TUTORIAL_SKIP)) {
      this.#skipOnboarding();
      return;
    }

    this.#previousPointerPosition = this.#positionFromPointer(event);
    if (
      this.#touchControls &&
      this.#playerState !== "charge" &&
      distance(this.#pointer, this.#player) <= RainbowRush.#PLAYER_RADIUS * 3.5
    ) {
      const moveTarget = { ...this.#pointer };
      if (this.#playerState !== "normal") this.#cancelRoute();
      this.#pointer = moveTarget;
      return;
    }
    this.#lockPointer();
    if (this.#playerState === "rush" || this.#playerState === "buffer") {
      this.#startCharge();
      return;
    }
    if (this.#playerState === "charge") return;
    if (this.#playerState !== "normal") return;

    this.#startCharge();
  }

  #startCharge(): void {
    this.#chargePointer = { ...this.#player };
    this.#pointer = { ...this.#player };
    this.#playerState = "charge";
    this.#route = [{ ...this.#player }];
    this.#routeDistance = 0;
    this.#routeColorOffset = 0;
    this.#rushSpeed = RainbowRush.#INIT_RUSH_SPEED;
    this.#rushVelocity = { x: 0, y: 0 };
    this.#brakeVelocity = { x: 0, y: 0 };
    this.#brakeTimer = 0;
    this.#bufferTimer = 0;
    this.#gestures = [NORMAL];
    this.#rushTypes = [NORMAL];
    this.#audio.tone(220, 0.1, 80, 0.045);
  }

  #releasePointer(event: PointerEvent): void {
    if (!event.isPrimary || !this.#previousPointerPosition) return;
    this.#clearActivePointer();
    if (this.#screenState !== "playing" || this.#playerState !== "charge") return;
    this.#recordRoutePoint(this.#chargePointer);

    if (this.#routeDistance < 28) {
      const moveTarget = this.#positionFromPointer(event);
      this.#cancelRoute();
      if (event.pointerType !== "mouse") this.#pointer = moveTarget;
      return;
    }

    this.#gestures = classifyRoute(this.#route);
    this.#rushTypes = [...this.#gestures];
    this.#rushSpeed = Math.max(RainbowRush.#INIT_RUSH_SPEED, this.#routeDistance);
    this.#playerState = "rush";
    this.#audio.launch();
  }

  #cancelPointer(event: PointerEvent): void {
    if (!event.isPrimary || !this.#previousPointerPosition) return;
    this.#clearActivePointer();
    if (this.#screenState === "playing" && this.#playerState === "charge") this.#cancelRoute();
  }

  #clearActivePointer(): void {
    this.#previousPointerPosition = undefined;
  }

  #recordRoutePoint(point: Point): void {
    let previous = this.#route[this.#route.length - 1];
    if (!previous || this.#routeDistance >= RainbowRush.#MAX_ROUTE_LENGTH) return;
    let remainingDistance = distance(previous, point);
    if (remainingDistance < RainbowRush.#ROUTE_POINT_SPACING) return;
    const directionX = (point.x - previous.x) / remainingDistance;
    const directionY = (point.y - previous.y) / remainingDistance;

    while (
      remainingDistance >= RainbowRush.#ROUTE_POINT_SPACING &&
      this.#routeDistance < RainbowRush.#MAX_ROUTE_LENGTH
    ) {
      const acceptedStep = Math.min(
        RainbowRush.#ROUTE_POINT_SPACING,
        RainbowRush.#MAX_ROUTE_LENGTH - this.#routeDistance,
      );
      previous = {
        x: previous.x + directionX * acceptedStep,
        y: previous.y + directionY * acceptedStep,
      };
      this.#route.push(previous);
      this.#routeDistance += acceptedStep;
      remainingDistance -= acceptedStep;
      if (acceptedStep < RainbowRush.#ROUTE_POINT_SPACING) break;
    }
    this.#gestures = classifyRoute(this.#route);
  }

  #cancelRoute(): void {
    const braking = this.#playerState === "rush";
    if (braking) {
      const speed = Math.hypot(this.#rushVelocity.x, this.#rushVelocity.y);
      const scale = speed > 900 ? 900 / speed : 1;
      this.#brakeVelocity = {
        x: this.#rushVelocity.x * scale,
        y: this.#rushVelocity.y * scale,
      };
      this.#brakeTimer = RainbowRush.#BRAKE_DURATION;
    } else {
      this.#brakeVelocity = { x: 0, y: 0 };
      this.#brakeTimer = 0;
    }
    this.#route = [];
    this.#routeDistance = 0;
    this.#chargePointer = { ...this.#player };
    this.#rushSpeed = RainbowRush.#INIT_RUSH_SPEED;
    this.#rushVelocity = { x: 0, y: 0 };
    this.#bufferTimer = braking ? 0.5 : 0;
    this.#gestures = [NORMAL];
    this.#rushTypes = [NORMAL];
    this.#playerState = braking ? "buffer" : "normal";
    this.#pointer = { ...this.#player };
    this.#audio.tone(150, 0.06, -80, 0.03);
  }

  #reset(): void {
    this.#clearActivePointer();
    this.#enemies = [];
    this.#particles = [];
    this.#projectiles = [];
    this.#scorePopups = [];
    this.#screenState = "playing";
    this.#canvas.style.cursor = "none";
    this.#lockPointer();
    this.#playerState = "normal";
    this.#facing = 1;
    this.#player = { x: 210, y: RainbowRush.#HEIGHT / 2 };
    this.#pointer = { ...this.#player };
    this.#route = [];
    this.#routeDistance = 0;
    this.#chargePointer = { ...this.#player };
    this.#rushSpeed = RainbowRush.#INIT_RUSH_SPEED;
    this.#rushVelocity = { x: 0, y: 0 };
    this.#brakeVelocity = { x: 0, y: 0 };
    this.#brakeTimer = 0;
    this.#bufferTimer = 0;
    this.#gestures = [NORMAL];
    this.#rushTypes = [NORMAL];
    this.#elapsed = 0;
    this.#score = 0;
    this.#combo = 0;
    this.#comboTimer = 0;
    this.#comboPulse = 0;
    this.#spawnTimer = 1.2;
    this.#flash = 0;
    this.#hitStop = 0;
    this.#enemySerial = 0;
    this.#killerWeakness = NORMAL;
    this.#newBest = false;
    this.#deathTimer = 0;
    if (this.#onboardingComplete) {
      this.#audio.music();
      this.#tutorialStep = 0;
    } else {
      this.#audio.music(false);
      this.#startTutorialStep(1);
    }
  }

  #startTutorialStep(step: 1 | 2): void {
    this.#tutorialStep = step;
    this.#enemies = [];
    this.#playerState = "normal";
    this.#player = { x: 210, y: RainbowRush.#HEIGHT / 2 };
    this.#pointer = { ...this.#player };
    this.#chargePointer = { ...this.#player };
    this.#route = [];
    this.#routeDistance = 0;
    this.#routeColorOffset = 0;
    this.#rushSpeed = RainbowRush.#INIT_RUSH_SPEED;
    this.#rushVelocity = { x: 0, y: 0 };
    this.#brakeVelocity = { x: 0, y: 0 };
    this.#gestures = [NORMAL];
    this.#rushTypes = [NORMAL];
    this.#brakeTimer = 0;
    this.#bufferTimer = 0;
    this.#enemies =
      step === 1
        ? [this.#tutorialEnemy({ x: 700, y: RainbowRush.#HEIGHT / 2 }, NORMAL, false)]
        : [BOOMERANG, LOOP, ZIGZAG].map((weakness, index) =>
            this.#tutorialEnemy({ x: 700, y: 200 + index * 110 }, weakness, false),
          );
  }

  #updateOnboarding(): void {
    if (this.#playerState !== "normal") return;
    if (this.#enemies.some((enemy) => enemy.alive)) return;
    if (this.#tutorialStep === 1) {
      this.#startTutorialStep(2);
      return;
    }
    this.#onboardingComplete = true;
    this.#tutorialStep = 0;
    this.#reset();
  }

  #playerOverTutorialSkip(): boolean {
    const closestX = clamp(
      this.#player.x,
      RainbowRush.#TUTORIAL_SKIP.x,
      RainbowRush.#TUTORIAL_SKIP.x + RainbowRush.#TUTORIAL_SKIP.width,
    );
    const closestY = clamp(
      this.#player.y,
      RainbowRush.#TUTORIAL_SKIP.y,
      RainbowRush.#TUTORIAL_SKIP.y + RainbowRush.#TUTORIAL_SKIP.height,
    );
    return Math.hypot(this.#player.x - closestX, this.#player.y - closestY) <= RainbowRush.#PLAYER_RADIUS;
  }

  #skipOnboarding(): void {
    this.#audio.skipTutorial();
    this.#onboardingComplete = true;
    this.#tutorialStep = 0;
    this.#reset();
  }

  #lockPointer(): void {
    if (this.#touchControls || document.pointerLockElement === this.#canvas) return;
    void this.#canvas.requestPointerLock().catch(() => {});
  }

  #pause(): void {
    if (this.#screenState !== "playing") return;
    this.#clearActivePointer();
    this.#screenState = "paused";
    this.#audio.pause();
    this.#audio.music(false);
    this.#canvas.style.cursor = "default";
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
  }

  #resume(): void {
    if (this.#screenState !== "paused") return;
    this.#screenState = "playing";
    this.#audio.resume();
    this.#audio.music(!this.#tutorialStep);
    this.#pointer = { ...this.#player };
    this.#canvas.style.cursor = "none";
    this.#lockPointer();
  }

  #togglePause(): void {
    if (this.#screenState === "playing") this.#pause();
    else if (this.#screenState === "paused") this.#resume();
  }

  #toggleMute(): void {
    this.#muted = this.#audio.toggle();
  }

  #frame(time: number): void {
    const delta = Math.min(0.033, (time - this.#previousTime) / 1000);
    this.#previousTime = time;
    this.#update(delta);
    this.#draw();
    requestAnimationFrame((nextTime) => this.#frame(nextTime));
  }

  #update(delta: number): void {
    if (this.#screenState === "paused") return;
    this.#menuAnimationTime += delta;
    this.#menuPlayerBufferTimer = Math.max(0, this.#menuPlayerBufferTimer - delta);
    if (this.#hitStop > 0) {
      this.#hitStop -= delta;
      return;
    }
    this.#updateStars(delta);
    this.#updateParticles(delta);
    this.#shake = Math.max(0, this.#shake - 40 * delta);
    this.#flash = Math.max(0, this.#flash - 2.8 * delta);
    this.#comboPulse = Math.max(0, this.#comboPulse - delta);
    if (this.#screenState === "title") {
      this.#updateProjectiles(delta);
      this.#projectiles = this.#projectiles.filter(
        (shot) => shot.x > -40 && shot.x < RainbowRush.#WIDTH + 40 && shot.y > -40 && shot.y < RainbowRush.#HEIGHT + 40,
      );
    }
    if (this.#screenState === "dying") {
      this.#deathTimer -= delta;
      if (this.#deathTimer <= 0) this.#screenState = "dead";
      return;
    }
    if (this.#screenState !== "playing") return;

    this.#elapsed += delta;
    const playerPath: MotionPoint[] = [{ ...this.#player, t: 0 }];
    if (this.#tutorialStep) {
      this.#updatePlayer(delta, playerPath);
      if (this.#playerOverTutorialSkip()) {
        this.#skipOnboarding();
        return;
      }
      this.#updateOnboarding();
      return;
    }
    this.#score += delta * 12;
    this.#comboTimer -= delta;
    if (this.#comboTimer <= 0) this.#combo = 0;

    const contactState = this.#playerState;
    const contactRushTypes = this.#rushTypes;
    this.#updateEnemies(delta);
    this.#updateProjectiles(delta);
    this.#updatePlayer(delta, playerPath);
    if (this.#screenState === "playing") {
      this.#resolveContacts(playerPath, contactState, contactRushTypes);
    }
    this.#enemies = this.#enemies.filter((enemy) => enemy.alive && enemy.x > -80);
    this.#projectiles = this.#projectiles.filter(
      (shot) =>
        shot.alive &&
        shot.x > -40 &&
        shot.x < RainbowRush.#WIDTH + 40 &&
        shot.y > -40 &&
        shot.y < RainbowRush.#HEIGHT + 40,
    );
  }

  #pathHits(
    path: MotionPoint[],
    playerRadius: number,
    targetStart: Point,
    targetEnd: Point,
    targetRadius: number,
  ): boolean {
    if (path.length === 1) {
      return movingCirclesHit(path[0], path[0], playerRadius, targetStart, targetEnd, targetRadius);
    }
    for (let index = 0; index < path.length - 1; index += 1) {
      const startProgress = path[index].t;
      const endProgress = path[index + 1].t;
      const targetSegmentStart = {
        x: targetStart.x + (targetEnd.x - targetStart.x) * startProgress,
        y: targetStart.y + (targetEnd.y - targetStart.y) * startProgress,
      };
      const targetSegmentEnd = {
        x: targetStart.x + (targetEnd.x - targetStart.x) * endProgress,
        y: targetStart.y + (targetEnd.y - targetStart.y) * endProgress,
      };
      if (
        movingCirclesHit(path[index], path[index + 1], playerRadius, targetSegmentStart, targetSegmentEnd, targetRadius)
      ) {
        return true;
      }
    }
    return false;
  }

  #resolveContacts(path: MotionPoint[], state: PlayerState, rushTypes: readonly RushType[]): void {
    const attacking = state === "rush" || state === "buffer";
    for (const shot of this.#projectiles) {
      if (
        !shot.alive ||
        !this.#pathHits(path, RainbowRush.#PLAYER_RADIUS, { x: shot.previousX, y: shot.previousY }, shot, shot.radius)
      ) {
        continue;
      }
      if (attacking && weaknessMatches(shot.weakness, rushTypes)) this.#destroyProjectile(shot);
      else {
        this.#die(shot.weakness);
        return;
      }
    }
    for (const enemy of this.#enemies) {
      if (
        !enemy.alive ||
        !this.#pathHits(
          path,
          RainbowRush.#PLAYER_RADIUS,
          { x: enemy.previousX, y: enemy.previousY },
          enemy,
          enemy.radius,
        )
      ) {
        continue;
      }
      if (attacking && weaknessMatches(enemy.weakness, rushTypes)) this.#destroyEnemy(enemy);
      else {
        this.#die(enemy.weakness);
        return;
      }
    }
  }

  #updateStars(delta: number): void {
    for (const star of this.#stars) {
      star.x -= (12 + star.depth * 42) * delta;
      if (star.x < -4) {
        star.x = RainbowRush.#WIDTH + 4;
        star.y = random(0, RainbowRush.#HEIGHT);
      }
    }
  }

  #updateParticles(delta: number): void {
    for (const particle of this.#particles) {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
    }
    this.#particles = this.#particles.filter((particle) => particle.life > 0);
    for (const popup of this.#scorePopups) {
      popup.life -= delta;
      popup.y -= 34 * delta;
    }
    this.#scorePopups = this.#scorePopups.filter((popup) => popup.life > 0);
  }

  #updatePlayer(delta: number, path: MotionPoint[]): void {
    const previousX = this.#player.x;
    if (this.#brakeTimer > 0) {
      const brake = this.#brakeTimer / RainbowRush.#BRAKE_DURATION;
      const steering = Math.min(1, delta * 9) * (1 - brake * 0.65);
      const momentumX = this.#brakeVelocity.x * brake * delta;
      const momentumY = this.#brakeVelocity.y * brake * delta;
      this.#pointer.x = clamp(this.#pointer.x + momentumX, 24, RainbowRush.#WIDTH - 24);
      this.#pointer.y = clamp(this.#pointer.y + momentumY, 24, RainbowRush.#HEIGHT - 24);
      this.#player.x = clamp(
        this.#player.x + momentumX + (this.#pointer.x - this.#player.x - momentumX) * steering,
        24,
        RainbowRush.#WIDTH - 24,
      );
      this.#player.y = clamp(
        this.#player.y + momentumY + (this.#pointer.y - this.#player.y - momentumY) * steering,
        24,
        RainbowRush.#HEIGHT - 24,
      );
      path.push({ ...this.#player, t: 1 });
      this.#brakeTimer -= delta;
      if (this.#brakeTimer <= 0) {
        this.#brakeTimer = 0;
        this.#brakeVelocity = { x: 0, y: 0 };
      }
    } else if (this.#playerState === "normal" || this.#playerState === "buffer") {
      const follow = Math.min(1, delta * 9);
      this.#player.x += (this.#pointer.x - this.#player.x) * follow;
      this.#player.y += (this.#pointer.y - this.#player.y) * follow;
      path.push({ ...this.#player, t: 1 });
    } else if (this.#playerState === "rush") {
      let travel = this.#rushSpeed * delta;
      let motionTime = 0;
      while (travel > 0 && this.#route.length > 1 && this.#screenState === "playing") {
        const start = { ...this.#player };
        const target = this.#route[1];
        const segmentLength = distance(this.#player, target);
        this.#rushVelocity = {
          x: ((target.x - this.#player.x) * this.#rushSpeed) / segmentLength,
          y: ((target.y - this.#player.y) * this.#rushSpeed) / segmentLength,
        };
        const moved = Math.min(segmentLength, travel);
        if (segmentLength <= travel) {
          this.#player = { ...target };
          this.#route.shift();
          this.#routeColorOffset += 1;
          travel -= segmentLength;
        } else {
          this.#player.x += ((target.x - this.#player.x) * travel) / segmentLength;
          this.#player.y += ((target.y - this.#player.y) * travel) / segmentLength;
          this.#route[0] = { ...this.#player };
          travel = 0;
        }
        motionTime += moved / this.#rushSpeed;
        path.push({ ...this.#player, t: clamp(motionTime / delta, 0, 1) });
        this.#attackAlongSegment(start, this.#player);
        this.#spawnTrailParticle();
      }
      if (this.#route.length <= 1 && this.#screenState === "playing") {
        const speed = Math.hypot(this.#rushVelocity.x, this.#rushVelocity.y);
        const scale = speed > 900 ? 900 / speed : 1;
        this.#brakeVelocity = {
          x: this.#rushVelocity.x * scale,
          y: this.#rushVelocity.y * scale,
        };
        this.#brakeTimer = RainbowRush.#BRAKE_DURATION;
        this.#route = [];
        this.#playerState = "buffer";
        this.#rushVelocity = { x: 0, y: 0 };
        this.#bufferTimer = 0.5;
      }
      if (path[path.length - 1].t < 1) path.push({ ...this.#player, t: 1 });
    }

    if (this.#playerState === "buffer") {
      this.#bufferTimer -= delta;
      if (this.#bufferTimer <= 0) {
        this.#playerState = "normal";
        this.#gestures = [NORMAL];
        this.#rushTypes = [NORMAL];
        this.#brakeTimer = 0;
        this.#brakeVelocity = { x: 0, y: 0 };
      }
    }

    if (Math.abs(this.#player.x - previousX) > 0.2) {
      this.#facing = this.#player.x < previousX ? -1 : 1;
    }

    this.#trailTimer -= delta;
    if ((this.#playerState === "normal" || this.#playerState === "buffer") && this.#trailTimer <= 0) {
      this.#spawnTrailParticle();
      this.#trailTimer = 0.055;
    }
  }

  #attackAlongSegment(start: Point, end: Point): void {
    for (const shot of this.#projectiles) {
      if (!shot.alive) continue;
      const hitRadius = shot.radius + RainbowRush.#PLAYER_RADIUS;
      if (squaredDistanceToSegment(shot, start, end) >= hitRadius * hitRadius) continue;
      if (weaknessMatches(shot.weakness, this.#rushTypes)) {
        this.#destroyProjectile(shot);
      } else {
        this.#die(shot.weakness);
        return;
      }
    }

    for (const enemy of this.#enemies) {
      if (!enemy.alive) continue;
      const hitRadius = enemy.radius + RainbowRush.#PLAYER_RADIUS;
      if (squaredDistanceToSegment(enemy, start, end) >= hitRadius * hitRadius) continue;
      if (this.#tutorialStep) {
        if (weaknessMatches(enemy.weakness, this.#rushTypes)) this.#destroyEnemy(enemy);
        continue;
      }
      if (weaknessMatches(enemy.weakness, this.#rushTypes)) {
        this.#destroyEnemy(enemy);
      } else {
        this.#die(enemy.weakness);
        return;
      }
    }
  }

  #spawnTrailParticle(): void {
    this.#particles.push({
      x: this.#player.x - 17,
      y: this.#player.y + random(-8, 8),
      vx: random(-85, -25),
      vy: random(-22, 22),
      hue: random(180, 330),
      life: random(0.3, 0.65),
      size: random(2, 6),
    });
  }

  #updateEnemies(delta: number): void {
    this.#spawnTimer -= delta;
    if (this.#spawnTimer <= 0) {
      this.#spawnEnemy();
      this.#spawnTimer = Math.max(0.62, 1.72 - this.#elapsed * 0.012) * random(0.78, 1.15);
    }

    for (const enemy of this.#enemies) {
      if (!enemy.alive) continue;
      enemy.previousX = enemy.x;
      enemy.previousY = enemy.y;
      enemy.age += delta;

      if (enemy.state === "normal") {
        this.#followEnemyPath(enemy, delta);
        enemy.stateTimer -= delta;
        if (enemy.stateTimer <= 0 && enemy.x < RainbowRush.#WIDTH - 50) {
          this.#startEnemyAttackCycle(enemy);
        }
      } else if (enemy.state === "charge") {
        enemy.x -= enemy.speed * 0.16 * delta;
        enemy.stateTimer -= delta;
        if (enemy.stateTimer <= 0) {
          enemy.state = "attack";
          enemy.stateDuration = enemy.attackKind === DASH_ATTACK ? 1.08 : 0.3;
          enemy.stateTimer = enemy.stateDuration;
          if (enemy.attackKind === BULLET_ATTACK) this.#fireEnemy(enemy);
          else this.#audio.tone(95, 0.18, -40, 0.06);
        }
      } else {
        enemy.stateTimer -= delta;
        if (enemy.attackKind === DASH_ATTACK) {
          enemy.x += enemy.dashVx * delta;
          enemy.y += enemy.dashVy * delta;
        } else {
          enemy.x -= enemy.speed * delta;
        }
        if (enemy.stateTimer <= 0) {
          enemy.state = "normal";
          enemy.attackKind = NO_ATTACK;
          enemy.stateDuration = random(2.2, 4);
          enemy.stateTimer = enemy.stateDuration;
          const amplitude = enemy.pathKind === BOOMERANG ? 28 : enemy.pathKind === LOOP ? 12 : 68;
          enemy.phase = enemy.y < RainbowRush.#HEIGHT / 2 ? -Math.PI / 2 : Math.PI / 2;
          enemy.baseY = enemy.y - Math.sin(enemy.phase) * amplitude;
          enemy.age = 0;
        }
      }
      enemy.y = clamp(enemy.y, 55, RainbowRush.#HEIGHT - 55);
      if (Math.abs(enemy.x - enemy.previousX) > 0.2) {
        enemy.facing = enemy.x < enemy.previousX ? -1 : 1;
      }
    }
  }

  #enemyChargeDuration(attackKind: AttackKind): number {
    return attackKind === DASH_ATTACK ? 1.15 : 0.9;
  }

  #startEnemyAttackCycle(enemy: Enemy): void {
    const attackKind = Math.floor(Math.random() * 3) as AttackKind;
    enemy.attackKind = attackKind;
    if (attackKind === NO_ATTACK) {
      enemy.state = "normal";
      enemy.stateDuration = random(2.2, 4) + this.#enemyChargeDuration(NO_ATTACK);
      enemy.stateTimer = enemy.stateDuration;
      return;
    }

    enemy.state = "charge";
    enemy.stateDuration = this.#enemyChargeDuration(attackKind);
    enemy.stateTimer = enemy.stateDuration;
    if (attackKind === DASH_ATTACK) {
      const angle = Math.atan2(this.#player.y - enemy.y, this.#player.x - enemy.x);
      enemy.dashVx = Math.cos(angle) * 650;
      enemy.dashVy = Math.sin(angle) * 650;
    }
    this.#audio.tone(150 + attackKind * 35, 0.12, 100, 0.03);
  }

  #followEnemyPath(enemy: Enemy, delta: number): void {
    enemy.x -= enemy.speed * delta;
    if (enemy.pathKind === BOOMERANG) enemy.y = enemy.baseY + Math.sin(enemy.age * 2 + enemy.phase) * 28;
    if (enemy.pathKind === LOOP) enemy.y = enemy.baseY + Math.sin(enemy.age * 1.4 + enemy.phase) * 12;
    if (enemy.pathKind === ZIGZAG) enemy.y = enemy.baseY + Math.sin(enemy.age * 3.5 + enemy.phase) * 68;
  }

  #spawnEnemy(): void {
    const availableTypes = this.#elapsed < 8 ? 1 : this.#elapsed < 17 ? 2 : 3;
    const pathKind = (Math.floor(Math.random() * availableTypes) + 1) as RushType;
    const serial = this.#enemySerial++;
    const weakness = serial % 4 === 0 ? NORMAL : pathKind;
    const radius = Math.floor(20 + 12 * Math.random());
    const baseY = random(radius + 40, RainbowRush.#HEIGHT - radius - 40);
    const initialInterval = random(1.2, 2.4);
    this.#enemies.push({
      x: RainbowRush.#WIDTH + radius + 20,
      y: baseY,
      baseY,
      radius,
      pathKind,
      weakness,
      attackKind: NO_ATTACK,
      age: 0,
      phase: random(0, Math.PI * 2),
      blinkOffset: random(0, 4.8),
      blinkPeriod: random(2.2, 4.8),
      previousX: RainbowRush.#WIDTH + radius + 20,
      previousY: baseY,
      speed: random(85, 125) + Math.min(55, this.#elapsed * 1.4),
      state: "normal",
      stateDuration: initialInterval,
      stateTimer: initialInterval,
      dashVx: 0,
      dashVy: 0,
      facing: -1,
      alive: true,
    });
  }

  #fireEnemy(enemy: Enemy): void {
    const angle = Math.atan2(this.#player.y - enemy.y, this.#player.x - enemy.x);
    const spread = enemy.pathKind === LOOP ? [-0.22, 0, 0.22] : enemy.pathKind === ZIGZAG ? [-0.12, 0.12] : [0];
    const speed = 205 + Math.min(80, this.#elapsed * 2);
    for (let index = 0; index < spread.length; index += 1) {
      const offset = spread[index];
      this.#projectiles.push({
        x: enemy.x - enemy.radius,
        y: enemy.y,
        vx: Math.cos(angle + offset) * speed,
        vy: Math.sin(angle + offset) * speed,
        radius: enemy.pathKind === LOOP ? 6 : 7,
        weakness: enemy.weakness,
        alive: true,
        age: 0,
        previousX: enemy.x - enemy.radius,
        previousY: enemy.y,
        turn: enemy.pathKind === ZIGZAG ? (index ? 1.15 : -1.15) : 0,
      });
    }
    this.#audio.tone(100 + (enemy.pathKind - 1) * 35, 0.08, -25, 0.0375);
  }

  #updateProjectiles(delta: number): void {
    for (const shot of this.#projectiles) {
      if (!shot.alive) continue;
      shot.previousX = shot.x;
      shot.previousY = shot.y;
      shot.age += delta;
      if (shot.turn) {
        const rotation = shot.turn * delta;
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        const previousVx = shot.vx;
        shot.vx = shot.vx * cosine - shot.vy * sine;
        shot.vy = previousVx * sine + shot.vy * cosine;
      }
      shot.x += shot.vx * delta;
      shot.y += shot.vy * delta;
    }
  }

  #destroyProjectile(shot: Projectile): void {
    if (!shot.alive) return;
    shot.alive = false;
    this.#hitStop = 0.025;
    this.#score += 20;
    this.#scorePopups.push({
      x: shot.x,
      y: shot.y,
      popupColor: this.#weaknessColor(shot.weakness),
      life: 0.75,
      popupText: "+20",
    });
    for (let index = 0; index < 7; index += 1) {
      this.#particles.push({
        x: shot.x,
        y: shot.y,
        vx: random(-100, 100),
        vy: random(-100, 100),
        hue: shot.weakness === NORMAL ? random(0, 360) : RainbowRush.#gestureHues[shot.weakness],
        life: random(0.2, 0.5),
        size: random(2, 5),
      });
    }
    this.#audio.tone(520, 0.08, 180, 0.0375);
  }

  #destroyEnemy(enemy: Enemy): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    const practiceTarget = this.#tutorialStep > 0;
    this.#hitStop = practiceTarget ? 0.04 : 0.065;
    if (!practiceTarget) {
      this.#combo = Math.min(9, this.#combo + 1);
      this.#comboTimer = 3.6;
      this.#comboPulse = 0.22;
      const reward = 110 + this.#combo * 35;
      this.#score += reward;
      this.#scorePopups.push({
        x: enemy.x,
        y: enemy.y,
        popupColor: this.#weaknessColor(enemy.weakness),
        life: 1,
        popupText: `+${reward}${this.#combo > 1 ? `  x${this.#combo}` : ""}`,
      });
    }
    this.#shake = 7;
    this.#flash = 0.16;
    for (let index = 0; index < 16; index += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(45, 220);
      this.#particles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hue: enemy.weakness === NORMAL ? random(0, 360) : RainbowRush.#gestureHues[enemy.weakness],
        life: random(0.35, 0.8),
        size: random(3, 8),
      });
    }
    this.#audio.kill();
  }

  #die(killerWeakness: Weakness): void {
    if (this.#screenState !== "playing") return;
    this.#clearActivePointer();
    this.#screenState = "dying";
    this.#deathTimer = 0.48;
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
    this.#canvas.style.cursor = "default";
    this.#killerWeakness = killerWeakness;
    this.#route = [];
    this.#shake = 18;
    this.#flash = 0.6;
    for (let index = 0; index < 28; index += 1) this.#spawnTrailParticle();
    this.#newBest = Math.floor(this.#score) > this.#bestScore;
    this.#bestScore = Math.max(this.#bestScore, Math.floor(this.#score));
    saveBestScore(RainbowRush.#HIGH_SCORE_KEY, this.#bestScore);
    this.#audio.music(false);
    this.#audio.death();
  }

  #draw(): void {
    this.#ctx.save();
    if (this.#shake > 0) this.#ctx.translate(random(-this.#shake, this.#shake), random(-this.#shake, this.#shake));
    this.#drawBackground();
    if (this.#screenState === "playing" || this.#screenState === "paused" || this.#screenState === "dying") {
      for (const enemy of this.#enemies) if (enemy.alive) this.#drawEnemy(enemy);
      if (this.#tutorialStep) this.#drawOnboardingGuide();
      this.#drawRoute();
      this.#drawProjectiles();
      this.#drawParticles();
      this.#drawUnicorn();
      if (this.#tutorialStep) this.#drawOnboardingHud();
      else this.#drawHud();
      if (this.#screenState === "paused") this.#drawPause();
    } else {
      this.#drawMenu();
    }
    this.#drawMuteIndicator();
    if (this.#flash > 0) {
      this.#ctx.globalAlpha = this.#flash;
      this.#ctx.fillStyle = "#fff";
      this.#ctx.fillRect(0, 0, RainbowRush.#WIDTH, RainbowRush.#HEIGHT);
    }
    this.#ctx.restore();
  }

  #drawBackground(): void {
    const gradient = this.#ctx.createLinearGradient(0, 0, 0, RainbowRush.#HEIGHT);
    gradient.addColorStop(0, "#080821");
    gradient.addColorStop(0.52, "#171040");
    gradient.addColorStop(1, "#44245c");
    this.#ctx.fillStyle = gradient;
    this.#ctx.fillRect(0, 0, RainbowRush.#WIDTH, RainbowRush.#HEIGHT);

    const haze = this.#ctx.createRadialGradient(690, 185, 20, 690, 185, 420);
    haze.addColorStop(0, "#7853a766");
    haze.addColorStop(0.42, "#21677d2b");
    haze.addColorStop(1, "#08082100");
    this.#ctx.fillStyle = haze;
    this.#ctx.fillRect(0, 0, RainbowRush.#WIDTH, RainbowRush.#HEIGHT);

    for (const star of this.#stars) {
      this.#ctx.globalAlpha = 0.32 + star.depth * 0.55 + Math.sin(this.#elapsed * 3 + star.x) * 0.1;
      this.#ctx.fillStyle = star.depth > 0.7 ? "#fff4ca" : "#aeb8ff";
      this.#ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    this.#ctx.globalAlpha = 1;

    const drift = this.#elapsed * 18;
    for (let layer = 0; layer < 3; layer += 1) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(0, RainbowRush.#HEIGHT);
      for (let x = -40; x <= RainbowRush.#WIDTH + 40; x += 40) {
        const y = 430 + layer * 36 + Math.sin((x + drift * (layer + 1)) / (85 + layer * 20)) * 24;
        this.#ctx.lineTo(x, y);
      }
      this.#ctx.lineTo(RainbowRush.#WIDTH, RainbowRush.#HEIGHT);
      this.#ctx.fillStyle = ["#211844", "#302052", "#3e285b"][layer];
      this.#ctx.fill();
    }

    this.#ctx.save();
    this.#ctx.globalAlpha = 0.16;
    this.#ctx.lineWidth = 20;
    this.#ctx.strokeStyle = "#ff78c8";
    this.#ctx.shadowColor = "#ff78c8";
    this.#ctx.shadowBlur = 24;
    this.#ctx.beginPath();
    this.#ctx.moveTo(-40, 390);
    this.#ctx.bezierCurveTo(230, 260, 440, 520, 760, 315);
    this.#ctx.bezierCurveTo(850, 255, 910, 270, 1_020, 210);
    this.#ctx.stroke();
    this.#ctx.shadowColor = "#7df4ff";
    this.#ctx.lineWidth = 6;
    this.#ctx.strokeStyle = "#7df4ff";
    this.#ctx.stroke();
    this.#ctx.restore();

    const vignette = this.#ctx.createRadialGradient(
      RainbowRush.#WIDTH / 2,
      RainbowRush.#HEIGHT / 2,
      180,
      RainbowRush.#WIDTH / 2,
      RainbowRush.#HEIGHT / 2,
      590,
    );
    vignette.addColorStop(0, "#05041400");
    vignette.addColorStop(1, "#050414b8");
    this.#ctx.fillStyle = vignette;
    this.#ctx.fillRect(0, 0, RainbowRush.#WIDTH, RainbowRush.#HEIGHT);
  }

  #drawGestureRings(x: number, y: number, size: number, rushTypes: readonly RushType[]): void {
    this.#ctx.save();
    const ringTypes = rushTypes.includes(NORMAL) ? rushTypes : [NORMAL, ...rushTypes];
    ringTypes.forEach((rushType, index) => {
      this.#ctx.strokeStyle = RainbowRush.#gestureColors[rushType];
      this.#ctx.lineWidth = 3;
      this.#ctx.globalAlpha = 0.7;
      this.#ctx.beginPath();
      this.#ctx.arc(x, y, size + index * 7 + Math.sin(this.#elapsed * 10) * 2, 0, Math.PI * 2);
      this.#ctx.stroke();
    });
    this.#ctx.restore();
  }

  #drawRoute(): void {
    if (this.#route.length < 2) return;

    const gePathColor = (index: number) =>
      `hsl(${((index + this.#routeColorOffset) * 19 + this.#elapsed * 100) % 360} 95% 70%)`;

    this.#ctx.save();
    this.#ctx.lineCap = "butt";
    this.#ctx.lineJoin = "round";
    this.#ctx.lineWidth = RainbowRush.#DRAW_WIDTH / 2;
    this.#ctx.globalAlpha = 0.82;

    for (let index = 1; index < this.#route.length; index += 1) {
      const before = this.#route[Math.max(0, index - 2)];
      const start = this.#route[index - 1];
      const end = this.#route[index];
      const after = this.#route[Math.min(this.#route.length - 1, index + 1)];

      const color = gePathColor(index);
      this.#ctx.strokeStyle = color;
      this.#ctx.shadowColor = color;
      this.#ctx.shadowBlur = 16;
      this.#ctx.beginPath();
      this.#ctx.moveTo(start.x, start.y);
      this.#ctx.bezierCurveTo(
        start.x + (end.x - before.x) / 6,
        start.y + (end.y - before.y) / 6,
        end.x - (after.x - start.x) / 6,
        end.y - (after.y - start.y) / 6,
        end.x,
        end.y,
      );
      this.#ctx.stroke();
      this.#ctx.shadowBlur = 0;
    }

    const lastIndex = this.#route.length - 1;
    const previous = this.#route[lastIndex - 1];
    const last = this.#route[lastIndex];
    const endAngle = Math.atan2(last.y - previous.y, last.x - previous.x);

    this.#ctx.fillStyle = gePathColor(lastIndex);
    this.#ctx.beginPath();
    this.#ctx.arc(last.x, last.y, this.#ctx.lineWidth / 2, endAngle - Math.PI / 2, endAngle + Math.PI / 2);
    this.#ctx.closePath();
    this.#ctx.fill();

    this.#ctx.restore();
    const routeEnd = this.#route[this.#route.length - 1];
    this.#drawGestureRings(
      routeEnd.x,
      routeEnd.y,
      10,
      this.#playerState === "charge" ? this.#gestures : this.#rushTypes,
    );

    if (this.#playerState === "charge") {
      const detectedGestures = this.#gestures.filter((gesture) => gesture !== NORMAL);
      if (!detectedGestures.length) return;
      const labelsFitAbove = this.#player.y - 44 - (detectedGestures.length - 1) * 28 >= 14;
      const direction = labelsFitAbove ? -1 : 1;
      detectedGestures.forEach((gesture, index) => {
        this.#drawLabel(
          RainbowRush.#gestureNames[gesture],
          this.#player.x,
          this.#player.y + direction * (44 + index * 28),
          RainbowRush.#gestureColors[gesture],
        );
      });
    }
  }

  #drawEnemy(enemy: Enemy): void {
    this.#ctx.save();
    this.#ctx.translate(enemy.x, enemy.y);
    const color = this.#weaknessColor(enemy.weakness);
    if (enemy.state === "charge") {
      this.#ctx.globalAlpha = 0.72 + Math.sin(enemy.age * 22) * 0.2;
    }
    this.#ctx.save();
    if (enemy.state === "charge") {
      const chargeProgress = 1 - enemy.stateTimer / enemy.stateDuration;
      const shakeAmount = 0.8 + chargeProgress * 1.6;
      this.#ctx.translate(Math.sin(enemy.age * 84) * shakeAmount, Math.cos(enemy.age * 68) * shakeAmount * 0.55);
    }
    this.#ctx.rotate(Math.sin(enemy.age * 3 + enemy.pathKind) * 0.045);
    this.#ctx.scale(enemy.facing, 1);
    this.#ctx.shadowColor = color;
    this.#ctx.shadowBlur = enemy.state === "charge" ? 22 : 7;
    const blinkPhase = (this.#elapsed + enemy.blinkOffset) % enemy.blinkPeriod;
    const enemyImage =
      enemy.state === "charge"
        ? enemy.attackKind === BULLET_ATTACK
          ? RainbowRush.#images.enemyChargeImages[enemy.weakness]
          : RainbowRush.#images.enemyDashChargeImages[enemy.weakness]
        : blinkPhase < 0.11
          ? RainbowRush.#images.enemyBlinkImages[enemy.weakness]
          : RainbowRush.#images.enemyImages[enemy.weakness];
    drawSvg(this.#ctx, enemyImage, 0, 0, enemy.radius * 3.55);
    this.#ctx.restore();
    this.#ctx.globalAlpha = 1;
    this.#ctx.restore();
  }

  #drawProjectiles(): void {
    for (const shot of this.#projectiles) {
      if (!shot.alive) continue;
      const shotColor = this.#weaknessColor(shot.weakness);
      const shotAngle = Math.atan2(shot.vy, shot.vx);
      this.#ctx.save();
      this.#ctx.translate(shot.x, shot.y);
      this.#ctx.rotate(shotAngle);
      this.#ctx.shadowBlur = 12;
      this.#ctx.shadowColor = shotColor;
      drawSvg(this.#ctx, RainbowRush.#images.projectileImages[shot.weakness], 0, 0, shot.radius * 4.2);
      this.#ctx.restore();
    }
  }

  #drawParticles(): void {
    this.#ctx.save();
    this.#ctx.globalCompositeOperation = "lighter";
    for (const particle of this.#particles) {
      this.#ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
      this.#ctx.fillStyle = `hsl(${particle.hue} 95% 70%)`;
      const speed = Math.hypot(particle.vx, particle.vy);
      if (speed > 90) {
        this.#ctx.strokeStyle = this.#ctx.fillStyle;
        this.#ctx.lineWidth = particle.size;
        this.#ctx.lineCap = "round";
        this.#ctx.beginPath();
        this.#ctx.moveTo(particle.x, particle.y);
        this.#ctx.lineTo(particle.x - particle.vx * 0.045, particle.y - particle.vy * 0.045);
        this.#ctx.stroke();
      } else {
        this.#ctx.beginPath();
        this.#ctx.arc(particle.x, particle.y, particle.size * clamp(particle.life * 2, 0.2, 1), 0, Math.PI * 2);
        this.#ctx.fill();
      }
    }
    this.#ctx.restore();
    this.#ctx.save();
    this.#ctx.textAlign = "center";
    this.#ctx.font = "900 16px system-ui";
    for (const popup of this.#scorePopups) {
      this.#ctx.globalAlpha = clamp(popup.life * 2, 0, 1);
      this.#ctx.fillStyle = popup.popupColor;
      this.#ctx.fillText(popup.popupText, popup.x, popup.y);
    }
    this.#ctx.restore();
  }

  #drawUnicorn(): void {
    this.#ctx.save();
    const bob = this.#playerState === "normal" ? Math.sin(this.#elapsed * 5) * 2.5 : 0;
    this.#ctx.translate(this.#player.x, this.#player.y + bob);
    const tilt = this.#playerState === "rush" ? -0.13 : clamp((this.#pointer.y - this.#player.y) / 280, -0.2, 0.2);
    const activeTypes = this.#playerState === "charge" ? this.#gestures : this.#rushTypes;
    const activeType = this.#playerState === "normal" ? NORMAL : activeTypes[activeTypes.length - 1];
    const color = this.#weaknessColor(activeType);
    const stretch = this.#playerState === "rush" ? 1.14 : this.#playerState === "charge" ? 0.97 : 1;

    this.#ctx.scale(this.#facing * stretch, 2 - stretch);
    this.#ctx.rotate(tilt);

    if (this.#playerState === "charge") {
      this.#drawGestureRings(0, 0, 28, this.#gestures);
    } else if (this.#playerState === "buffer") {
      this.#ctx.strokeStyle = this.#weaknessColor(activeType);
      this.#ctx.lineWidth = 4;
      this.#ctx.beginPath();
      this.#ctx.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 4 * this.#bufferTimer);
      this.#ctx.stroke();
    }

    this.#ctx.shadowColor = color;
    this.#ctx.shadowBlur = this.#playerState === "normal" ? 5 : 18;
    drawSvg(this.#ctx, RainbowRush.#images.playerImages[this.#playerState], 0, 0, 92);
    this.#ctx.restore();
  }

  #drawHud(): void {
    this.#ctx.textAlign = "left";
    this.#ctx.fillStyle = "#fff";
    this.#ctx.font = "700 20px system-ui";
    this.#ctx.fillText(String(Math.floor(this.#score)).padStart(5, "0"), 28, 38);
    this.#ctx.fillStyle = "#aeb8df";
    this.#ctx.font = "700 10px system-ui";
    this.#ctx.fillText("SCORE", 29, 54);
    if (this.#combo > 1) {
      this.#ctx.fillStyle = "#ffe66d";
      this.#ctx.font = `800 ${18 + this.#comboPulse * 28}px system-ui`;
      this.#ctx.fillText(`x${this.#combo} COMBO`, 28, 82);
    }
    this.#drawPauseButton();
  }

  #drawPauseButton(): void {
    const { x, y, width, height } = RainbowRush.#PAUSE_BUTTON;
    this.#ctx.save();
    this.#ctx.fillStyle = "#0c0a22d9";
    this.#ctx.strokeStyle = "#aeb8df";
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.roundRect(x, y, width, height, 10);
    this.#ctx.fill();
    this.#ctx.stroke();
    this.#ctx.fillStyle = "#fff";
    this.#ctx.fillRect(x + 24, y + 13, 6, 19);
    this.#ctx.fillRect(x + 38, y + 13, 6, 19);
    this.#ctx.textAlign = "center";
    this.#ctx.font = "800 8px system-ui";
    this.#ctx.fillText("PAUSE", x + width / 2, y + 48);
    this.#ctx.restore();
  }

  #drawMuteIndicator(): void {
    const { x: buttonX, y: buttonY, width, height } = RainbowRush.#MUTE_BUTTON;
    const x = buttonX + (width - 36) / 2;
    const y = buttonY + (height - 36) / 2;
    const color = this.#muted ? "#ff8bd8" : "#fff";
    this.#ctx.save();
    this.#ctx.fillStyle = color;
    this.#ctx.beginPath();
    this.#ctx.moveTo(x + 8, y + 15);
    this.#ctx.lineTo(x + 14, y + 15);
    this.#ctx.lineTo(x + 21, y + 10);
    this.#ctx.lineTo(x + 21, y + 26);
    this.#ctx.lineTo(x + 14, y + 21);
    this.#ctx.lineTo(x + 8, y + 21);
    this.#ctx.closePath();
    this.#ctx.fill();

    this.#ctx.strokeStyle = color;
    this.#ctx.lineWidth = 2;
    this.#ctx.lineCap = "round";
    if (this.#muted) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(x + 25, y + 14);
      this.#ctx.lineTo(x + 31, y + 22);
      this.#ctx.moveTo(x + 31, y + 14);
      this.#ctx.lineTo(x + 25, y + 22);
      this.#ctx.stroke();
    } else {
      for (const radius of [6, 10]) {
        this.#ctx.beginPath();
        this.#ctx.arc(x + 20, y + 18, radius, -Math.PI / 3, Math.PI / 3);
        this.#ctx.stroke();
      }
    }
    this.#ctx.restore();
  }

  #drawOnboardingGuide(): void {
    const target = this.#enemies.find((enemy) => enemy.alive);
    if (!target || this.#playerState === "rush" || this.#playerState === "buffer") return;
    this.#ctx.save();
    this.#ctx.globalAlpha = 0.32;
    this.#ctx.strokeStyle = this.#weaknessColor(target.weakness);
    this.#ctx.lineWidth = 5;
    this.#ctx.lineCap = "round";
    this.#ctx.setLineDash([12, 12]);
    this.#ctx.lineDashOffset = -this.#elapsed * 35;
    this.#ctx.beginPath();
    this.#ctx.moveTo(this.#player.x, this.#player.y);
    if (this.#tutorialStep === 1) {
      this.#ctx.lineTo(target.x, target.y);
    } else if (target.weakness === BOOMERANG) {
      this.#ctx.lineTo(target.x, target.y);
      this.#ctx.lineTo(this.#player.x + 35, this.#player.y + 28);
    } else if (target.weakness === LOOP) {
      const loopX = (this.#player.x + target.x) / 2;
      const loopY = (this.#player.y + target.y) / 2;
      this.#ctx.lineTo(loopX, loopY);
      this.#ctx.bezierCurveTo(loopX - 75, loopY, loopX - 75, loopY - 110, loopX, loopY - 110);
      this.#ctx.bezierCurveTo(loopX + 75, loopY - 110, loopX + 75, loopY, loopX, loopY);
      this.#ctx.lineTo(target.x, target.y);
    } else {
      const dx = target.x - this.#player.x;
      const dy = target.y - this.#player.y;
      const length = Math.hypot(dx, dy) || 1;
      for (let index = 1; index < 6; index += 1) {
        const progress = index / 6;
        const offset = index % 2 ? -45 : 45;
        this.#ctx.lineTo(
          this.#player.x + dx * progress - (dy * offset) / length,
          this.#player.y + dy * progress + (dx * offset) / length,
        );
      }
      this.#ctx.lineTo(target.x, target.y);
    }
    this.#ctx.stroke();
    this.#ctx.restore();
  }

  #drawOnboardingHud(): void {
    const target = this.#enemies.find((enemy) => enemy.alive);
    const recognized =
      target && this.#gestures.includes(target.weakness)
        ? target.weakness
        : this.#gestures.find((gesture) => gesture !== NORMAL);
    const remaining = this.#enemies.filter((enemy) => enemy.alive).length;
    let title = `MATCH TARGETS LEFT: ${remaining}`;
    if (this.#tutorialStep === 1) {
      const routeReady = this.#playerState === "charge" && this.#routeDistance >= 28;
      title = routeReady ? "RELEASE TO RUSH" : "DRAW THROUGH TARGET";
    } else if (recognized) {
      title = `${RainbowRush.#gestureNames[recognized]} READY — RELEASE`;
    }
    const detail = this.#touchControls
      ? this.#tutorialStep === 1
        ? "DRAG SPACE • RELEASE TO RUSH"
        : "DRAG UNICORN TO MOVE • DRAW B / O / Z"
      : this.#tutorialStep === 1
        ? "HOLD LEFT MOUSE • DRAW • RELEASE"
        : "DRAW B / O / Z • HIT MATCHING TARGET";
    this.#ctx.save();
    this.#ctx.fillStyle = "#0c0a22e8";
    this.#ctx.strokeStyle = recognized ? RainbowRush.#gestureColors[recognized] : "#fff8";
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.roundRect(RainbowRush.#WIDTH / 2 - 250, 20, 500, 67, 12);
    this.#ctx.fill();
    this.#ctx.stroke();
    this.#ctx.textAlign = "center";
    this.#ctx.fillStyle = "#fff";
    this.#ctx.font = "900 19px system-ui";
    this.#ctx.fillText(title, RainbowRush.#WIDTH / 2, 48);
    this.#ctx.fillStyle = "#aeb8df";
    this.#ctx.font = "800 10px system-ui";
    this.#ctx.fillText(detail, RainbowRush.#WIDTH / 2, 69);
    for (let step = 1; step <= 2; step += 1) {
      this.#ctx.globalAlpha = step === this.#tutorialStep ? 1 : 0.3;
      this.#ctx.fillStyle = step === 2 && recognized ? RainbowRush.#gestureColors[recognized] : "#fff";
      this.#ctx.beginPath();
      this.#ctx.arc(RainbowRush.#WIDTH / 2 + (step - 1.5) * 17, 80, 3, 0, Math.PI * 2);
      this.#ctx.fill();
    }
    this.#ctx.restore();
    for (const enemy of this.#enemies) {
      if (enemy.alive) {
        this.#drawLabel(
          this.#tutorialStep === 1 ? "ANY RUSH" : RainbowRush.#gestureNames[enemy.weakness],
          enemy.x,
          enemy.y - (this.#tutorialStep === 1 ? 62 : 74),
          this.#weaknessColor(enemy.weakness),
        );
      }
    }
    this.#drawTutorialSkip();
    this.#drawPauseButton();
  }

  #drawTutorialSkip(): void {
    const { x, y, width, height } = RainbowRush.#TUTORIAL_SKIP;
    this.#ctx.save();
    this.#ctx.fillStyle = "#0c0a22d9";
    this.#ctx.strokeStyle = "#aeb8df";
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.roundRect(x, y, width, height, 9);
    this.#ctx.fill();
    this.#ctx.stroke();
    this.#ctx.textAlign = "center";
    this.#ctx.fillStyle = "#fff";
    this.#ctx.font = "900 13px system-ui";
    this.#ctx.fillText("SKIP TUTORIAL", x + width / 2, y + 21);
    this.#ctx.fillStyle = "#aeb8df";
    this.#ctx.font = "800 8px system-ui";
    this.#ctx.fillText(this.#touchControls ? "TAP TO SKIP" : "MOVE HERE", x + width / 2, y + 38);
    this.#ctx.restore();
  }

  #drawLabel(text: string, x: number, y: number, color: string): void {
    this.#ctx.save();
    this.#ctx.textAlign = "center";
    this.#ctx.font = "800 11px system-ui";
    const width = this.#ctx.measureText(text).width + 18;
    this.#ctx.fillStyle = "#0c0a22cc";
    this.#ctx.fillRect(x - width / 2, y - 13, width, 24);
    this.#ctx.strokeStyle = color;
    this.#ctx.lineWidth = 1.5;
    this.#ctx.strokeRect(x - width / 2, y - 13, width, 24);
    this.#ctx.fillStyle = color;
    this.#ctx.fillText(text, x, y + 4);
    this.#ctx.restore();
  }

  #drawCta(text: string): void {
    this.#ctx.save();
    this.#ctx.fillStyle = "#fff";
    this.#ctx.strokeStyle = "#aeb8df";
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.roundRect(400, 425, 160, 36, 7);
    this.#ctx.fill();
    this.#ctx.stroke();
    this.#ctx.fillStyle = "#0c0a22";
    this.#ctx.textAlign = "center";
    this.#ctx.font = "900 13px system-ui";
    this.#ctx.fillText(text, RainbowRush.#WIDTH / 2, 449);
    this.#ctx.restore();
  }

  #drawPause(): void {
    this.#ctx.fillStyle = "#08071bd9";
    this.#ctx.fillRect(0, 0, RainbowRush.#WIDTH, RainbowRush.#HEIGHT);
    this.#ctx.textAlign = "center";
    this.#ctx.fillStyle = "#fff";
    this.#ctx.font = "900 42px system-ui";
    this.#ctx.fillText("PAUSED", RainbowRush.#WIDTH / 2, 235);
    this.#ctx.fillStyle = "#aeb8df";
    this.#ctx.font = "800 11px system-ui";
    this.#ctx.fillText(this.#touchControls ? "TAP TO RESUME" : "PRESS P TO RESUME", RainbowRush.#WIDTH / 2, 270);
    this.#drawCta("RESUME RIDE");
  }

  #tutorialEnemy(point: Point, weakness: Weakness, attacking: boolean): Enemy {
    return {
      ...point,
      alive: true,
      age: this.#elapsed,
      attackKind: attacking ? BULLET_ATTACK : NO_ATTACK,
      baseY: point.y,
      blinkOffset: random(0, 4.8),
      blinkPeriod: random(2.2, 4.8),
      dashVx: 0,
      dashVy: 0,
      facing: -1,
      pathKind: weakness,
      phase: 0,
      previousX: point.x,
      previousY: point.y,
      radius: 26,
      speed: 0,
      state: attacking ? "attack" : "normal",
      stateDuration: 1,
      stateTimer: 1,
      weakness,
    };
  }

  #drawMenu(): void {
    const gameOver = this.#screenState === "dead";
    this.#ctx.fillStyle = "#08071bce";
    this.#ctx.fillRect(0, 0, RainbowRush.#WIDTH, RainbowRush.#HEIGHT);
    this.#ctx.textAlign = "center";
    this.#ctx.fillStyle = "#fff";
    this.#ctx.font = "900 48px system-ui";
    this.#ctx.fillText(gameOver ? "GAME OVER" : "RAINBOW RUSH", RainbowRush.#WIDTH / 2, gameOver ? 65 : 355);

    if (gameOver) {
      if (this.#newBest) {
        this.#ctx.fillStyle = "#ffe66d";
        this.#ctx.font = "900 13px system-ui";
        this.#ctx.fillText("NEW BEST!", RainbowRush.#WIDTH / 2, 108);
      }
      const laughBounce = Math.abs(Math.sin(this.#menuAnimationTime * 8)) * 6;
      this.#ctx.save();
      this.#ctx.translate(RainbowRush.#WIDTH / 2, 166 - laughBounce);
      this.#ctx.rotate(Math.sin(this.#menuAnimationTime * 16) * 0.035);
      this.#ctx.scale(
        1 + Math.sin(this.#menuAnimationTime * 16) * 0.025,
        1 - Math.sin(this.#menuAnimationTime * 16) * 0.025,
      );
      this.#ctx.shadowColor = this.#weaknessColor(this.#killerWeakness);
      this.#ctx.shadowBlur = 12;
      drawSvg(this.#ctx, RainbowRush.#images.enemyLaughImages[this.#killerWeakness], 0, 0, 88);
      this.#ctx.restore();
      this.#ctx.fillStyle = "#aeb8df";
      this.#ctx.font = "800 11px system-ui";
      this.#ctx.fillText("RUN SCORE", RainbowRush.#WIDTH / 2, 238);
      this.#ctx.fillStyle = "#fff";
      this.#ctx.font = "900 42px system-ui";
      this.#ctx.fillText(String(Math.floor(this.#score)).padStart(5, "0"), RainbowRush.#WIDTH / 2, 282);
      this.#ctx.fillStyle = "#aeb8df";
      this.#ctx.font = "800 11px system-ui";
      this.#ctx.fillText("BEST SCORE", RainbowRush.#WIDTH / 2, 338);
      this.#ctx.fillStyle = "#fff";
      this.#ctx.font = "900 26px system-ui";
      this.#ctx.fillText(String(this.#bestScore).padStart(5, "0"), RainbowRush.#WIDTH / 2, 373);
      this.#drawCta("RIDE AGAIN");
      return;
    }

    this.#ctx.textAlign = "right";
    this.#ctx.fillStyle = "#aeb8df";
    this.#ctx.font = "800 10px system-ui";
    this.#ctx.fillText("BEST", 925, 28);
    this.#ctx.fillStyle = "#fff";
    this.#ctx.font = "900 20px system-ui";
    this.#ctx.fillText(String(this.#bestScore).padStart(5, "0"), 925, 52);
    const menuPlayer = this.#menuPlayerPosition();
    const menuPlayerImage =
      this.#menuPlayerBufferTimer > 0
        ? RainbowRush.#images.playerImages.buffer
        : RainbowRush.#images.playerImages.normal;
    drawSvg(this.#ctx, menuPlayerImage, menuPlayer.x, menuPlayer.y, 110);
    RainbowRush.#images.enemyImages.forEach((image, index) => {
      const enemy = this.#menuEnemyPosition(index);
      const blinkPeriod = 2.7 + index * 0.38;
      const blinking = (this.#menuAnimationTime + 1.1 + index * 0.71) % blinkPeriod < 0.12;
      const pointerX = this.#pointer.x - enemy.x;
      const pointerY = this.#pointer.y - enemy.y;
      const charging = pointerX * pointerX + pointerY * pointerY <= 55 * 55;

      this.#ctx.save();
      this.#ctx.translate(enemy.x, enemy.y);
      if (charging) {
        this.#ctx.translate(
          Math.sin(this.#menuAnimationTime * 84) * 1.6,
          Math.cos(this.#menuAnimationTime * 68) * 0.88,
        );
        this.#ctx.globalAlpha = 0.72 + Math.sin(this.#menuAnimationTime * 22) * 0.2;
      }
      this.#ctx.rotate(Math.sin(this.#menuAnimationTime * 3 + index) * 0.045);
      this.#ctx.shadowColor = RainbowRush.#gestureColors[index];
      this.#ctx.shadowBlur = charging ? 22 : 7;
      const enemyImage = charging
        ? RainbowRush.#images.enemyChargeImages[index]
        : blinking
          ? RainbowRush.#images.enemyBlinkImages[index]
          : image;
      drawSvg(this.#ctx, enemyImage, 0, 0, 90);
      this.#ctx.restore();
    });
    this.#drawProjectiles();
    this.#ctx.textAlign = "center";
    this.#ctx.fillStyle = "#aeb8df";
    this.#ctx.font = "800 10px system-ui";
    this.#ctx.fillText(
      this.#touchControls ? "DRAG UNICORN = MOVE  •  DRAG SPACE = RUSH" : "MOUSE CONTROL  •  P PAUSE  •  M MUTE",
      RainbowRush.#WIDTH / 2,
      387,
    );
    this.#drawCta("START RIDE");
  }
}
