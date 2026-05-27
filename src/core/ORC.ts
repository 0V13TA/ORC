import Observer from "./observer";
import Scene from "./scene";
import Renderer from "./renderer";
import { Vector2, createCanvas, Input, toRadians } from "./utils";
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
  private localUpdateHook: ((dt: number) => void) | null = null;
  private localCreateHook: ((scene: Scene) => void | Promise<void>) | null =
    null;

  constructor(config: EngineConfig) {
    this.config = config;
    this.initDOM();
    this.initSystems();
  }

  /**
   * Allocates the required canvas viewports directly inside the container layout
   */
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

  /**
   * Initializes and couples instances of your core simulation modules
   */
  private initSystems() {
    // Center the observer tracking focus inside the minimap canvas bounds initially
    const startX = this.mapCanvas.width / 2;
    const startY = this.mapCanvas.height / 2;

    // Instantiate your fully decoupled Observer
    this.observer = new Observer(
      Vector2.createVector(startX, startY),
      60, // Field of view (Degrees)
    );

    // Instantiate your single-ray Scene manager
    this.scene = new Scene(this.observer);

    // Instantiate your 32-bit direct pixel buffer software renderer
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

  /**
   * Stops the engine heartbeat safely
   */
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

  /**
   * Drives mathematical state updates across all linked engine components
   */
  private update(dt: number) {
    // Update the position, angle vector, and vertical gravity physics
    this.observer.update(dt);

    // Execute user-defined gameplay logic rules if hooked into the runtime
    if (this.localUpdateHook) {
      this.localUpdateHook(dt);
    }
  }

  /**
   * Coordinates pure rasterization loops and context clears
   */
  private render() {
    // 1. Wipe the minimap view context clean every frame
    this.mapCtx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    // 2. Perform 3D projection column sweep and blit raw bytes onto the screen
    this.renderer3D.render(this.scene);

    // 3. Render the top-down 2D radar view if configured active
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

    // 1. Translate the viewport context to center on the player's position
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.translate(-obs.position.x, -obs.position.y);

    // 2. Draw Sector Walls/Boundaries
    if (obs.currentSector) {
      for (const wall of obs.currentSector.boundaries) {
        ctx.beginPath();
        if (wall.isPortal) {
          ctx.strokeStyle = "rgba(0, 150, 255, 0.5)"; // Translucent Blue Portal
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = "#ffffff"; // Solid White Walls
          ctx.lineWidth = 2.5;
        }
        ctx.moveTo(wall.start.x, wall.start.y);
        ctx.lineTo(wall.end.x, wall.end.y);
        ctx.stroke();
      }
    }

    // 3. Draw Dynamic Wall-Bounded FOV Visibility Cone
    const fovAngleStart = obs.dirAngle - obs.fov / 2;

    // Choose how dense you want the vision sweep (60-90 rays is clean and fast)
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

    // OPTIONAL: Draw the clean bounding framing wires for that classic vector radar look
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
  public onUpdate(callback: (dt: number) => void) {
    this.localUpdateHook = callback;
  }

  /**
   * An exposed callback engine registry for custom initialization
   */
  public onCreate(callback: (scene: Scene) => void | Promise<void>) {
    this.localCreateHook = callback;
  }
}
