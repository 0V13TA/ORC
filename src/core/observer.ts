import type { DEGREES, Sector, Vector2D } from "./Types";
import { circleLineCollision, Input, toRadians, Vector2 } from "./utils";

export default class Observer {
  fov: DEGREES;
  position: Vector2D;

  dirAngle: DEGREES;
  dirVector: Vector2D;

  currentSector?: Sector;

  // Public and fully configurable via engine scripts or power-ups
  viewDistance: number = 3000;

  pitch: number = 0;
  protected lookUpDownSpeed: number = 400; // Pixels of shift per second
  protected maxPitch: number = 300; // Maximum pixel shearing boundary limit

  // --- 3D Vertical Physics Variables ---
  z: number = 0;
  height: number = 40;
  protected velocityZ: number = 0;
  protected stepHeight: number = 30;
  protected jumpHeight: number = 120;
  protected gravityForce: number = -300;

  protected speed: number = 80;
  protected radius: number = 8;
  protected rotationSpeed: number = 140;

  constructor(position: Vector2D, fov: DEGREES) {
    this.fov = fov;
    this.position = position;

    this.dirAngle = 0;
    this.dirVector = Vector2.fromAngle(toRadians(this.dirAngle));
  }

  lookAt(angle: DEGREES) {
    this.dirAngle = ((angle % 360) + 360) % 360;
    this.dirVector = Vector2.normalized(
      Vector2.fromAngle(toRadians(this.dirAngle)),
    );
  }

  // In src/core/observer.ts

  move(displacement: Vector2D): void {
    if (displacement.x === 0 && displacement.y === 0) return;

    // Project where the observer wants to step on this frame tick
    const intendedPosition: Vector2D = Vector2.add(this.position, displacement);

    // Pass BOTH the original position and the intended position to prevent phasing
    this.position = this.checkCollision(this.position, intendedPosition);
  }

  checkCollision(currentPos: Vector2D, targetPos: Vector2D): Vector2D {
    let outputVector: Vector2D = { ...targetPos };
    if (!this.currentSector) return outputVector;

    // Run multiple iterations to resolve corner sliding nicely
    for (let step = 0; step < 2; step++) {
      for (const wall of this.currentSector.boundaries) {
        const rebound = circleLineCollision(
          currentPos,
          outputVector,
          this.radius,
          wall.start,
          wall.end,
        );

        // If an intersection displacement occurs
        if (rebound.x !== 0 || rebound.y !== 0) {
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

  centerView(): void {
    this.pitch = 0;
  }

  handleInput(dt: number): void {
    // --- 1. HANDLE CAMERA VIEW ROTATION (YAW) ---
    if (Input.isHeld("ArrowLeft")) {
      this.dirAngle -= this.rotationSpeed * dt;
    }
    if (Input.isHeld("ArrowRight")) {
      this.dirAngle += this.rotationSpeed * dt;
    }
    this.lookAt(this.dirAngle);

    // --- 1B. HANDLE CAMERA LOOK UP AND DOWN (Y-SHEAR PITCH) ---
    if (Input.isHeld("ArrowUp")) {
      this.pitch += this.lookUpDownSpeed * dt;
    }
    if (Input.isHeld("ArrowDown")) {
      this.pitch -= this.lookUpDownSpeed * dt;
    }

    // Clamp the pitch offset to prevent the world flipping upside down or wrapping awkwardly
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));

    if (Input.isPressed("KeyC")) {
      this.centerView();
    }

    // --- 2. CALCULATE INTENDED VECTOR VELOCITY (WASD Controls mapped back to W/S) ---
    let moveVector = Vector2.createVector(0, 0);

    // Using W and S exclusively for movement now that ArrowUp/Down handle looking vertically!
    if (Input.isHeld("KeyW")) {
      moveVector = Vector2.add(moveVector, this.dirVector);
    }
    if (Input.isHeld("KeyS")) {
      moveVector = Vector2.subtract(moveVector, this.dirVector);
    }
    if (Input.isHeld("KeyD")) {
      moveVector.x -= this.dirVector.y;
      moveVector.y += this.dirVector.x;
    }
    if (Input.isHeld("KeyA")) {
      moveVector.x += this.dirVector.y;
      moveVector.y -= this.dirVector.x;
    }

    // --- 3. EXECUTE MOVEMENT VECTOR DISPLACEMENT ---
    if (moveVector.x !== 0 || moveVector.y !== 0) {
      const moveNorm = Vector2.normalized(moveVector);
      const displacement = Vector2.scale(moveNorm, this.speed * dt);
      this.move(displacement);
    }

    // --- 4. HANDLE JUMP INPUT ---
    if (
      Input.isPressed("Space") &&
      this.currentSector &&
      this.z === this.currentSector.floorHeight
    ) {
      this.velocityZ = this.jumpHeight;
      this.z += 1;
    }
  }

  update(dt: number) {
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
}
