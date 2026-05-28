import Observer from "./observer";
import Scene from "./scene";
import Renderer from "./renderer";
import { Vector2, createCanvas, Input, toRadians, toDegrees } from "./utils";
import type { EngineConfig } from "./Types";

export default class ORCEngine {
  // Viewports & Rendering Contexts
  public mainCanvas!: HTMLCanvasElement;
  public mainCtx!: CanvasRenderingContext2D;

  public mapCanvas!: HTMLCanvasElement;
  public mapCtx!: CanvasRenderingContext2D;

  // Core Subsystems
  public observer!: Observer;
  public scene!: Scene;
  public renderer3D!: Renderer;

  // Loop State
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private config: EngineConfig;

  // Optional Developer Update Hook
  private localUpdateHook: ((dt: number, input: typeof Input) => void) | null =
    null;
  private localCreateHook: ((scene: Scene) => void | Promise<void>) | null =
    null;

  constructor(config: EngineConfig) {
    this.config = config;
    this.initDOM();
    this.initSystems();
  }

  private initDOM() {
    // 1. Core 3D Software Renderer Canvas Viewport
    const mainSetup = createCanvas(
      this.config.width,
      this.config.height,
      this.config.container,
    );
    this.mainCanvas = mainSetup.canvas;
    this.mainCtx = mainSetup.ctx;
    this.mainCanvas.classList.add("mainCanvas");

    // 2. 2D Minimap / Workspace Canvas Layer
    const mapSize = this.config.minimapSize || { width: 200, height: 200 };
    const mapSetup = createCanvas(
      mapSize.width,
      mapSize.height,
      this.config.container,
    );
    this.mapCanvas = mapSetup.canvas;
    this.mapCtx = mapSetup.ctx;
    this.mapCanvas.classList.add("minimap");

    // Initial visibility state based on configuration
    this.mapCanvas.style.display = this.config.enableMinimap ? "block" : "none";
  }

  private initSystems() {
    // Center the observer tracking focus inside the minimap canvas bounds initially
    const startX = this.mapCanvas.width / 2;
    const startY = this.mapCanvas.height / 2;

    // Instantiate your fully decoupled Observer
    this.observer = new Observer(
      Vector2.createVector(startX, startY),
      toDegrees(Math.PI / 2),
    );

    this.scene = new Scene(this.observer);

    this.renderer3D = new Renderer(
      this.mainCtx,
      this.config.width,
      this.config.height,
    );

    // Initialize global raw window input tracking listeners
    Input.init();
  }

  /**
   * Starts execution of the master frame heartbeat
   */
  public async start() {
    if (this.isRunning) return;

    // 1. If the user provided a creation hook, execute it and await its termination
    if (this.localCreateHook) {
      try {
        await this.localCreateHook(this.scene);
      } catch (error) {
        console.error(
          "ORC Engine failed during developer initialization sequence:",
          error,
        );
        return;
      }
    }

    // 2. Automatically map the initial spawning sector enclosure context onto the observer!
    if (!this.observer.currentSector && this.scene.sectors.length > 0) {
      // Look up where the observer dropped or fallback to the first active map sector room entry
      this.observer.currentSector =
        this.scene.getSectorAtPosition(this.observer.position) ||
        this.scene.sectors[0];
    }

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  public stop() {
    this.isRunning = false;
  }

  /**
   * The master loop maintaining precise dt steps and clearing frame traces
   */
  private loop(timestamp: number) {
    if (!this.isRunning) return;

    // Convert millisecond timestamps into seconds
    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Cap maximum allowed delta time step to protect vector sliding routines against extreme frame lag drops
    if (dt > 0.1) dt = 0.1;

    this.update(dt);
    this.render();

    // Release key presses before restarting the tick cycle
    Input.endFrame();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  private update(dt: number) {
    this.observer.update(dt);

    // Move player to new sector
    const trackingSector = this.scene.getSectorAtPosition(
      this.observer.position,
    );
    if (trackingSector && trackingSector !== this.observer.currentSector) {
      this.observer.currentSector = trackingSector;
    }

    if (this.localUpdateHook) {
      this.localUpdateHook(dt, Input);
    }
  }

  private render() {
    this.mapCtx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    this.renderer3D.render(this.scene);

    if (this.config.enableMinimap && this.mapCanvas.style.display !== "none") {
      this.renderMinimap();
    }
  }

  /**
   * Generates a player-centric top-down radar overlay on the map canvas context
   */
  private renderMinimap() {
    const ctx = this.mapCtx;
    const obs = this.observer;
    const canvasW = this.mapCanvas.width;
    const canvasH = this.mapCanvas.height;

    ctx.save();

    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.translate(-obs.position.x, -obs.position.y);

    if (obs.currentSector) {
      for (const wall of obs.currentSector.boundaries) {
        ctx.beginPath();
        if (wall.isPortal) {
          ctx.strokeStyle = "rgba(0, 150, 255, 0.5)"; // Translucent Blue Portal
          ctx.lineWidth = 1.5;

          // Draw Target Sector
          const targetSector = wall.targetSector;
          if (targetSector) {
            for (const targetSectorWall of targetSector.boundaries) {
              ctx.beginPath();
              if (targetSectorWall.isPortal) {
                ctx.strokeStyle = "rgba(0, 150, 255, 0.5)";
                ctx.lineWidth = 1.5;
              } else {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2.5;
              }
              ctx.moveTo(targetSectorWall.start.x, targetSectorWall.start.y);
              ctx.lineTo(targetSectorWall.end.x, targetSectorWall.end.y);
              ctx.stroke();
            }
          }
        } else {
          ctx.strokeStyle = "#ffffff"; // Solid White Walls
          ctx.lineWidth = 2.5;
        }
        ctx.moveTo(wall.start.x, wall.start.y);
        ctx.lineTo(wall.end.x, wall.end.y);
        ctx.stroke();
      }
    }

    const fovAngleStart = obs.dirAngle - obs.fov / 2;

    // how dense the vision sweep
    const rayCount = 60;
    const angleStep = obs.fov / rayCount;

    ctx.beginPath();
    ctx.moveTo(obs.position.x, obs.position.y); // Anchor origin point at player position

    // Sweep across the FOV arc, casting rays and appending endpoints to the polygon
    for (let i = 0; i <= rayCount; i++) {
      const currentAngleDeg = fovAngleStart + i * angleStep;
      const currentAngleRad = toRadians(currentAngleDeg);

      // Leverage your scene's DDA/Cramer ray intercept finder
      const rayHit = this.scene.castRay(currentAngleRad);

      if (rayHit) {
        // Stop line exactly at the collision point coordinate
        ctx.lineTo(rayHit.point.x, rayHit.point.y);
      } else {
        // If a ray escapes map boundaries, clip it to maximum viewing distance
        ctx.lineTo(
          obs.position.x + Math.cos(currentAngleRad) * obs.viewDistance,
          obs.position.y + Math.sin(currentAngleRad) * obs.viewDistance,
        );
      }
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(0, 255, 204, 0.08)"; // Ultra-smooth faint green neon shadow cone
    ctx.fill();

    // Draw the clean bounding framing wires for that classic vector radar look
    ctx.strokeStyle = "rgba(0, 255, 204, 0.25)";
    ctx.lineWidth = 1;

    // Left edge line trace
    const leftRad = (fovAngleStart * Math.PI) / 180;
    const leftHit = this.scene.castRay(leftRad);
    ctx.beginPath();
    ctx.moveTo(obs.position.x, obs.position.y);
    ctx.lineTo(
      leftHit
        ? leftHit.point.x
        : obs.position.x + Math.cos(leftRad) * obs.viewDistance,
      leftHit
        ? leftHit.point.y
        : obs.position.y + Math.sin(leftRad) * obs.viewDistance,
    );
    ctx.stroke();

    // Right edge line trace
    const rightRad = ((fovAngleStart + obs.fov) * Math.PI) / 180;
    const rightHit = this.scene.castRay(rightRad);
    ctx.beginPath();
    ctx.moveTo(obs.position.x, obs.position.y);
    ctx.lineTo(
      rightHit
        ? rightHit.point.x
        : obs.position.x + Math.cos(rightRad) * obs.viewDistance,
      rightHit
        ? rightHit.point.y
        : obs.position.y + Math.sin(rightRad) * obs.viewDistance,
    );
    ctx.stroke();

    // 4. Draw Player Position Node
    ctx.beginPath();
    ctx.arc(obs.position.x, obs.position.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#00ffcc";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#00ffcc";
    ctx.fill();

    ctx.restore();
  }

  /**
   * Exposes an easy runtime switch to toggle the layout visibility of the map
   */
  public setMinimapVisible(visible: boolean) {
    this.config.enableMinimap = visible;
    this.mapCanvas.style.display = visible ? "block" : "none";
  }

  /**
   * An exposed callback engine registry for custom gameplay loop interactions
   */
  public onUpdate(callback: (dt: number, input: typeof Input) => void) {
    this.localUpdateHook = callback;
  }

  /**
   * An exposed callback engine registry for custom initialization
   */
  public onCreate(callback: (scene: Scene) => void | Promise<void>) {
    this.localCreateHook = callback;
  }
}
