import type { Boundary, DEGREES, Sector, Vector2D } from "./Types";
import { circleLineCollision, InputManager, toRadians, Vector2 } from "./utils";

export default class Observer {
  fov: DEGREES;
  position: Vector2D;

  dirAngle: DEGREES;
  dirVector: Vector2D;

  currentSector?: Sector;

  public viewDistance: number = 3000;

  // Your awesome pitch shearing mechanics!
  pitch: number = 0;
  protected lookUpDownSpeed: number = 400;
  protected maxPitch: number = 300;

  private input: InputManager;

  // --- 3D Vertical Physics Variables ---
  z: number = 0;
  height: number = 40;
  protected velocityZ: number = 0;
  protected stepHeight: number = 10;
  protected jumpHeight: number = 220;
  protected gravityForce: number = -300;

  protected speed: number = 80;
  protected radius: number = 8;
  protected rotationSpeed: number = 140;

  constructor(position: Vector2D, fov: DEGREES, input: InputManager) {
    this.fov = fov;
    this.position = position;
    this.input = input;

    this.dirAngle = 0;
    this.dirVector = Vector2.fromAngle(toRadians(this.dirAngle));
  }

  public lookAt(angle: DEGREES) {
    this.dirAngle = ((angle % 360) + 360) % 360;
    this.dirVector = Vector2.normalized(
      Vector2.fromAngle(toRadians(this.dirAngle)),
    );
  }

  public move(displacement: Vector2D): void {
    if (displacement.x === 0 && displacement.y === 0) return;
    const intendedPosition: Vector2D = Vector2.add(this.position, displacement);
    this.position = this.checkCollision(this.position, intendedPosition);
  }

  public checkCollision(currentPos: Vector2D, targetPos: Vector2D): Vector2D {
    let outputVector: Vector2D = { ...targetPos };
    if (!this.currentSector) return outputVector;

    for (let step = 0; step < 2; step++) {
      const activeBoundaries: Boundary[] = this.currentSector.boundaries;
      for (const wall of activeBoundaries) {
        const rebound = circleLineCollision(
          currentPos,
          outputVector,
          this.radius,
          wall.start,
          wall.end,
        );

        if (rebound.x !== 0 || rebound.y !== 0) {
          if (wall.isPortal && wall.targetSector) {
            const neighbor = wall.targetSector;

            // FIX 1: Evaluate steps relative to where your absolute height (this.z) is!
            const floorDiff = neighbor.floorHeight - this.z;
            const playerTop = this.z + this.height;
            const ceilingObstructed = playerTop > neighbor.ceilingHeight;
            const floorObstructed = floorDiff > this.stepHeight;
            const gapTooSmall =
              neighbor.ceilingHeight - neighbor.floorHeight < this.height;

            if (!floorObstructed && !ceilingObstructed && !gapTooSmall) {
              // FIX 2: Instant line-to-line segment intersection check for room transitions
              const x1 = wall.start.x,
                y1 = wall.start.y;
              const x2 = wall.end.x,
                y2 = wall.end.y;
              const x3 = currentPos.x,
                y3 = currentPos.y;
              const x4 = outputVector.x,
                y4 = outputVector.y;

              const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
              if (den !== 0) {
                const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
                const u =
                  -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

                if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                  this.currentSector = neighbor; // Synchronize focus context instantly!
                }
              }
              continue;
            }
          }
          outputVector = Vector2.add(outputVector, rebound);
        }
      }
    }
    return outputVector;
  }

  public centerView(): void {
    this.pitch = 0;
  }

  public handleInput(dt: number): void {
    // Yaw Rotation
    if (this.input.isHeld("ArrowLeft")) {
      this.dirAngle -= this.rotationSpeed * dt;
    }
    if (this.input.isHeld("ArrowRight")) {
      this.dirAngle += this.rotationSpeed * dt;
    }
    this.lookAt(this.dirAngle);

    // Pitch Y-Shear controls (Arrow Up/Down)
    if (this.input.isHeld("ArrowUp")) {
      this.pitch += this.lookUpDownSpeed * dt;
    }
    if (this.input.isHeld("ArrowDown")) {
      this.pitch -= this.lookUpDownSpeed * dt;
    }
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));

    if (this.input.isPressed("KeyC")) {
      this.centerView();
    }

    // Slide/Strafe WASD translation vectors
    let moveVector = Vector2.createVector(0, 0);
    if (this.input.isHeld("KeyW"))
      moveVector = Vector2.add(moveVector, this.dirVector);
    if (this.input.isHeld("KeyS"))
      moveVector = Vector2.subtract(moveVector, this.dirVector);
    if (this.input.isHeld("KeyD")) {
      moveVector.x -= this.dirVector.y;
      moveVector.y += this.dirVector.x;
    }
    if (this.input.isHeld("KeyA")) {
      moveVector.x += this.dirVector.y;
      moveVector.y -= this.dirVector.x;
    }

    // Phone / Tablet Inputs compatibility triggers
    const touchMove = this.input.touchMoveVector;
    if (touchMove && (touchMove.x !== 0 || touchMove.y !== 0)) {
      const forwardDrive = Vector2.scale(this.dirVector, -touchMove.y);
      const strafeDrive = Vector2.createVector(
        -this.dirVector.y * touchMove.x,
        this.dirVector.x * touchMove.x,
      );
      moveVector = Vector2.add(
        moveVector,
        Vector2.add(forwardDrive, strafeDrive),
      );
    }
    const touchLook = this.input.touchLookDelta;
    if (touchLook && touchLook.x !== 0) {
      this.dirAngle += touchLook.x * 0.22;
    }

    if (moveVector.x !== 0 || moveVector.y !== 0) {
      const moveNorm = Vector2.normalized(moveVector);
      const displacement = Vector2.scale(moveNorm, this.speed * dt);
      this.move(displacement);
    }

    if (
      this.input.isPressed("Space") &&
      this.currentSector &&
      this.z === this.currentSector.floorHeight
    ) {
      this.velocityZ = this.jumpHeight;
      this.z += 1;
    }
  }

  public update(dt: number) {
    this.handleInput(dt);
    if (this.currentSector) {
      const targetFloor = this.currentSector.floorHeight;
      if (this.z < targetFloor && targetFloor - this.z <= this.stepHeight) {
        this.z = targetFloor;
        this.velocityZ = 0;
      }
      if (this.z > targetFloor) {
        this.velocityZ += this.gravityForce * dt;
        this.z += this.velocityZ * dt;
        if (this.z <= targetFloor) {
          this.z = targetFloor;
          this.velocityZ = 0;
        }
      }
      const playerTop = this.z + this.height;
      if (playerTop > this.currentSector.ceilingHeight) {
        this.z = this.currentSector.ceilingHeight - this.height;
        this.velocityZ = 0;
      }
    }
  }
}
