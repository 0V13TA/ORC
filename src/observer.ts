import type { contextType, DEGREES, Material, Sector, Vector2D } from "./Types";
import {
  circleLineCollision,
  Colors,
  createColor,
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

  // Public and fully configurable via engine scripts or power-ups
  public viewDistance: number = 400;

  // --- 3D Vertical Physics Variables ---
  protected z: number = 0;
  protected velocityZ: number = 0;
  protected height: number = 40;
  protected jumpHeight: number = 120;
  protected gravityForce: number = -300;
  protected stepHeight: number = 10;

  protected speed: number = 80;
  protected radius: number = 2;
  protected rotationSpeed: number = 140;

  constructor(position: Vector2D, fov: DEGREES, canvas: HTMLCanvasElement) {
    this.fov = fov;
    this.position = position;

    this.dirAngle = 0;
    this.dirVector = Vector2.fromAngle(toRadians(this.dirAngle));

    this.currentSector = { ceilingHeight: 0, floorHeight: 0, boundaries: [] };
    const material: Material = {
      type: "WALL",
      solidColor: createColor(255, 100, 200),
    };
    populate(
      this.currentSector.boundaries,
      material,
      canvas.width,
      canvas.height,
    );
  }

  /**
   * OVERRIDABLE MOVE HOOK: Receives a raw intended 2D displacement vector delta,
   * validates it against sector boundaries, and updates positioning.
   */
  public move(displacement: Vector2D): void {
    if (displacement.x === 0 && displacement.y === 0) return;

    // Project where the observer wants to step on this frame tick
    const intendedPosition: Vector2D = Vector2.add(this.position, displacement);

    // Resolve boundaries and slide out cleanly
    this.position = this.checkCollision(intendedPosition);
  }

  /**
   * OVERRIDABLE INPUT HOOK: Handles polling keyboard events and translating
   * them into continuous movement displacement vectors.
   */
  public handleInput(dt: number): void {
    // --- 1. HANDLE CAMERA VIEW ROTATION ---
    if (Input.isHeld("ArrowLeft")) {
      this.dirAngle -= this.rotationSpeed * dt; // Turn left (degrees per second)
    }
    if (Input.isHeld("ArrowRight")) {
      this.dirAngle += this.rotationSpeed * dt; // Turn right
    }
    this.lookAt(this.dirAngle);

    // --- 2. CALCULATE INTENDED VECTOR VELOCITY ---
    let moveVector = Vector2.createVector(0, 0);

    if (Input.isHeld("ArrowUp") || Input.isHeld("KeyW")) {
      moveVector = Vector2.add(moveVector, this.dirVector);
    }
    if (Input.isHeld("ArrowDown") || Input.isHeld("KeyS")) {
      moveVector = Vector2.subtract(moveVector, this.dirVector);
    }

    if (Input.isHeld("KeyA")) {
      moveVector.x += this.dirVector.y;
      moveVector.y += this.dirVector.x;
    }
    if (Input.isHeld("KeyD")) {
      moveVector.x -= this.dirVector.y;
      moveVector.y -= this.dirVector.x;
    }

    // --- 3. EXECUTE MOVEMENT VECTOR DISPLACEMENT ---
    if (moveVector.x !== 0 || moveVector.y !== 0) {
      // Normalize combined inputs to prevent diagonal movement speed boosts
      const moveNorm = Vector2.normalized(moveVector);
      const displacement = Vector2.scale(moveNorm, this.speed * dt);

      // Pass the fully computed step vector directly to the move handler
      this.move(displacement);
    }

    // --- 4. HANDLE JUMP INPUT ---
    if (
      Input.isPressed("Space") &&
      this.currentSector &&
      this.z === this.currentSector.floorHeight
    ) {
      this.velocityZ = this.jumpHeight;
      this.z += 1; // Nudge off the floor
    }
  }

  public checkCollision(targetPos: Vector2D) {
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

        // If an intersection displacement occurs
        if (rebound.x !== 0 || rebound.y !== 0) {
          // If the obstacle is an open portal door frame, check vertical space conditions
          if (wall.isPortal && wall.targetSector) {
            const neighbor = wall.targetSector;

            const floorDiff =
              neighbor.floorHeight - this.currentSector.floorHeight;
            const playerTop = this.z + this.height;
            const ceilingObstructed = playerTop > neighbor.ceilingHeight;
            const floorObstructed = floorDiff > this.stepHeight;
            const gapTooSmall =
              neighbor.ceilingHeight - neighbor.floorHeight < this.height;

            if (!floorObstructed && !ceilingObstructed && !gapTooSmall) {
              // The opening is totally clear vertically—let the observer step across without bouncing!
              continue;
            }
          }

          // Apply corrective push direction sliding adjustments
          outputVector = Vector2.add(outputVector, rebound);
        }
      }
    }
    return outputVector;
  }

  public lookAt(angle: DEGREES) {
    this.dirAngle = ((angle % 360) + 360) % 360;
    this.dirVector = Vector2.normalized(
      Vector2.fromAngle(toRadians(this.dirAngle)),
    );
  }

  public update(dt: number) {
    // 1. Process inputs and horizontal movement
    this.handleInput(dt);

    // 2. Process vertical physics (Gravity & Floor Snapping)
    if (this.currentSector) {
      const targetFloor = this.currentSector.floorHeight;

      // Smooth Step Snapping Upwards
      if (this.z < targetFloor && targetFloor - this.z <= this.stepHeight) {
        this.z = targetFloor;
        this.velocityZ = 0;
      }

      // Handle Gravity drop-offs or falling from a jump
      if (this.z > targetFloor) {
        this.velocityZ += this.gravityForce * dt; // Apply gravity over time
        this.z += this.velocityZ * dt;

        // Clamp to floor line upon touchdown
        if (this.z <= targetFloor) {
          this.z = targetFloor;
          this.velocityZ = 0;
        }
      }

      // Prevent the observer's head from clipping through a low ceiling while jumping
      const playerTop = this.z + this.height;
      if (playerTop > this.currentSector.ceilingHeight) {
        this.z = this.currentSector.ceilingHeight - this.height;
        this.velocityZ = 0; // Bonk head, lose vertical momentum
      }
    }
  }

  public draw(ctx: contextType) {
    // Draw arrow pointing in direction
    drawLine(
      this.position,
      Vector2.add(this.position, Vector2.scale(this.dirVector, 16)),
      1,
      Colors.white,
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
        wall.material.solidColor || Colors.white,
        ctx,
      );
    }
  }
}
