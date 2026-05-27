import type Scene from "./scene";
import { toRadians } from "./utils";

export default class Renderer {
  ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  private screenImageData: ImageData; // for software blitting
  private pixelBuffer: Uint32Array; // for software blitting

  public depthBuffer: Float32Array; // for depth sorting and occlusion

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    this.screenImageData = ctx.createImageData(this.width, this.height);

    // Bind a 32-bit unsigned integer view over the byte buffer
    // This allows us to paint an entire RGBA pixel with a single numeric write!
    this.pixelBuffer = new Uint32Array(this.screenImageData.data.buffer);
    this.depthBuffer = new Float32Array(this.width * this.height);
  }

  public render(scene: Scene) {
    const observer = scene.observer;

    this.pixelBuffer.fill(0xff000000); // Clear to opaque black
    this.depthBuffer.fill(Infinity); // Reset depth buffer for this frame

    // --- RAYCASTING LOOP ---
    const centerAngle = toRadians(observer.dirAngle);
    const halfFOV = toRadians(observer.fov / 2);

    const startAngle = centerAngle - halfFOV;
    const angleStep = toRadians(observer.fov) / this.width;

    // Constant distance from the observer to the projection plane (screen)
    const projectionDistance = this.width / 2 / Math.tan(halfFOV);

    // -- WALL ENVIRONMWENT SWEEP PASSTHROUGH ---
    for (let column = 0; column < this.width; column++) {
      const rayAngle = startAngle + column * angleStep;

      const rayHit = scene.castRay(rayAngle);
      if (rayHit === null) continue; // No hit, skip this column

      const beta = rayAngle - centerAngle; // Angle difference for fisheye correction
      const correctedDistance = rayHit.distance * Math.cos(beta); // Fisheye correction

      this.depthBuffer[column] = correctedDistance; // Store depth for this column
      if (!observer.currentSector) continue;

      const currentSector = observer.currentSector;
      const relativeCeiling = currentSector.ceilingHeight - observer.z;
      const relativeFloor = currentSector.floorHeight - observer.z;

      const screenYCenter = this.height / 2;

      const ceilingScreenY = Math.round(
        screenYCenter -
          (relativeCeiling / correctedDistance) * projectionDistance,
      );
      const floorScreenY = Math.round(
        screenYCenter -
          (relativeFloor / correctedDistance) * projectionDistance,
      );

      // Clamp vertical drawing bounds to screen limits
      const wallTop = Math.max(0, Math.min(this.height - 1, ceilingScreenY));
      const wallBottom = Math.max(0, Math.min(this.height - 1, floorScreenY));

      // Extract material properties for this wall
      const material = rayHit.boundary.material;
      let pixelColor = 0xff00ffcc; // Default neon color
      if (material.texture) {
        const tex = material.texture;

        // 1. Calculate the exact column slice to pull from the texture
        // Handle repeating textures if the boundary length is long
        const repeatX = material.repeat ? material.repeat.x : 1;
        const texX = Math.floor((rayHit.u * repeatX * tex.width) % tex.width);

        // Grab the pre-sliced 1D array for this specific column
        const textureColumn = tex.pixelColumns[texX];

        // We calculate the total height the wall *would* be on screen if not clamped,
        // to ensure textures don't warp or stretch incorrectly when looking up/down
        const wallScreenHeight = ceilingScreenY - floorScreenY;

        for (let y = wallTop; y <= wallBottom; y++) {
          // 2. Calculate the 'v' (vertical) coordinate
          const yOffset = y - floorScreenY;
          const v = yOffset / wallScreenHeight;

          // 3. Map the 'v' percentage to the actual texture image height
          let texY = Math.floor(v * tex.height);

          // Clamp to prevent out-of-bounds array reads on the very edge pixels
          texY = Math.max(0, Math.min(tex.height - 1, texY));

          // 4. Extract the color from the pre-sliced column data
          const r = textureColumn[texY][0];
          const g = textureColumn[texY][1];
          const b = textureColumn[texY][2];
          const a = textureColumn[texY][3];

          // Pack it into the 32-bit buffer
          pixelColor = (a << 24) | (b << 16) | (g << 8) | r;

          // Apply distance fog dimming
          const distanceFactor = Math.max(
            0,
            Math.min(1, correctedDistance / observer.viewDistance),
          );
          if (distanceFactor > 0) {
            const dimR = r * (1 - distanceFactor);
            const dimG = g * (1 - distanceFactor);
            const dimB = b * (1 - distanceFactor);
            pixelColor =
              (0xff << 24) |
              (Math.round(dimB) << 16) |
              (Math.round(dimG) << 8) |
              Math.round(dimR);
          }

          const bufferIndex = y * this.width + column;
          this.pixelBuffer[bufferIndex] = pixelColor;
        }
      } else if (material.solidColor) {
        // Convert solid color to 32-bit RGBA format ABGR
        // Note: We pack in ABGR order because the Uint32Array will write in little-endian format,
        pixelColor =
          (material.solidColor.a << 24) |
          (material.solidColor.b << 16) |
          (material.solidColor.g << 8) |
          material.solidColor.r;
      }

      // Handle simple distance shade dimming (fog factor)
      // based on configured view distance in the observer
      const distanceFactor = Math.max(
        0,
        Math.min(1, correctedDistance / observer.viewDistance),
      );
      if (distanceFactor > 0) {
        // Linearly interpolate between the pixel color and black based on distance
        const r = (pixelColor & 0xff) * (1 - distanceFactor);
        const g = ((pixelColor >> 8) & 0xff) * (1 - distanceFactor);
        const b = ((pixelColor >> 16) & 0xff) * (1 - distanceFactor);
        pixelColor =
          (0xff << 24) |
          (Math.round(b) << 16) |
          (Math.round(g) << 8) |
          Math.round(r);
      }

      // Draw vertical column of pixels for this wall slice
      for (let y = wallTop; y <= wallBottom; y++) {
        const bufferIndex = y * this.width + column;
        this.pixelBuffer[bufferIndex] = pixelColor;
      }
    }

    // --- DYNAMIC ENTITY & VOXELS PASS ---
    // TODO - After walls are drawn, we can iterate over dynamic entities and voxels in the scene

    this.ctx.putImageData(this.screenImageData, 0, 0);
  }
}
