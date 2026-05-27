import type { contextType, DEGREES, Material, Sector, Vector2D } from "./Types";
import {
  circleLineCollision,
  Colors,
  colorToRGBA,
  drawLine,
  Input,
  populate,
  toRadians,
  Vector2,
} from "./utils";

export default class Observer {
  fov: DEGREES;

  position: Vector2D;

  dirAngle: DEGREES;
  dirVector: Vector2D;

  currentSector?: Sector;

  private readonly speed: number = 80;
  private readonly radius: number = 2;

  constructor(position: Vector2D, fov: DEGREES, canvas: HTMLCanvasElement) {
    this.fov = fov;

    this.position = position;

    this.dirAngle = 0;
    this.dirVector = Vector2.fromAngle(toRadians(this.dirAngle));

    this.currentSector = { ceilingHeight: 0, floorHeight: 0, boundaries: [] };
    const material: Material = {
      type: "WALL",
      solidColor: colorToRGBA([255, 100, 200, 1]),
    };
    populate(
      this.currentSector.boundaries,
      material,
      canvas.width,
      canvas.height,
    );
  }

  draw(ctx: contextType) {
    // Draw arrow pointing in direction
    drawLine(
      this.position,
      Vector2.add(this.position, Vector2.scale(this.dirVector, 16)),
      1,
      Colors.white(),
      ctx,
    );

    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!this.currentSector) return;
    for (const wall of this.currentSector.boundaries) {
      drawLine(
        wall.start,
        wall.end,
        2,
        wall.material.solidColor || "#fff",
        ctx,
      );
    }
  }

  lookAt(angle: DEGREES) {
    this.dirAngle = ((angle % 360) + 360) % 360;
    this.dirVector = Vector2.normalized(
      Vector2.fromAngle(toRadians(this.dirAngle)),
    );
  }

  checkCollision(targetPos: Vector2D) {
    let outputVector: Vector2D = { ...targetPos };
    if (!this.currentSector) return outputVector;

    // Run multiple iterations to resolve corner sliding nicely
    for (let step = 0; step < 2; step++) {
      for (const wall of this.currentSector.boundaries) {
        // Pass primitive vectors directly instead of Circle/Line objects
        const rebound = circleLineCollision(
          outputVector,
          this.radius,
          wall.start,
          wall.end,
        );
        // Correct the current projection vector directly
        outputVector = Vector2.add(outputVector, rebound);
      }
    }
    return outputVector;
  }

  update(dt: number) {
    // --- 1. HANDLE CAMERA VIEW ROTATION ---
    if (Input.isHeld("ArrowLeft")) {
      this.dirAngle -= 140 * dt; // Turn left (degrees per second)
    }
    if (Input.isHeld("ArrowRight")) {
      this.dirAngle += 140 * dt; // Turn right
    }
    this.lookAt(this.dirAngle);

    // --- 2. CALCULATE INTENDED VECTOR VELOCITY ---
    let move = Vector2.createVector(0, 0);

    if (Input.isHeld("ArrowUp") || Input.isHeld("KeyW")) {
      move = Vector2.add(move, this.dirVector);
    }
    if (Input.isHeld("ArrowDown") || Input.isHeld("KeyS")) {
      move = Vector2.subtract(move, this.dirVector);
    }

    if (Input.isHeld("KeyA")) {
      move.x += this.dirVector.y;
      move.y += this.dirVector.x;
    }
    if (Input.isHeld("KeyD")) {
      move.x -= this.dirVector.y;
      move.y -= this.dirVector.x;
    }

    // --- 3. APPLY POSITION PROJECTIONS & RESOLVE OBSTACLES ---
    if (move.x !== 0 || move.y !== 0) {
      // Normalize combined inputs to prevent diagonal movement speed boosts
      const moveNorm = Vector2.normalized(move);
      const velocity = Vector2.scale(moveNorm, this.speed * dt);

      // Project where the player wants to step on this animation tick cycle
      const intendedPosition: Vector2D = Vector2.add(this.position, velocity);
      this.position = this.checkCollision(intendedPosition);
    }
  }
}
