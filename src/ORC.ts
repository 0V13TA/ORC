// src/engine.ts
import Observer from "./observer";
import Scene from "./scene";
import Renderer from "./renderer";
import { Vector2, createCanvas, Input } from "./utils";
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
      this.mapCanvas, // Frame constraint asset reference
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
  public start() {
    if (this.isRunning) return;
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
    // 1. Wipe the minimap view context clean
    this.mapCtx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    // 2. Perform 3D projection column sweep and blit raw bytes onto the screen
    this.renderer3D.render(this.scene);

    // 3. Render 2D debug lines onto the minimap if configured open
    if (this.config.enableMinimap && this.mapCanvas.style.display !== "none") {
      this.observer.draw(this.mapCtx);
    }
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
}
