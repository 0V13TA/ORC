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

    // -- WALL ENVIRONMENT SWEEP PASSTHROUGH ---
    for (let column = 0; column < this.width; column++) {
      const rayAngle = startAngle + column * angleStep;

      const rayHit = scene.castRay(rayAngle);
      if (rayHit === null) continue;

      const beta = rayAngle - centerAngle;
      const correctedDistance = rayHit.distance * Math.cos(beta);

      this.depthBuffer[column] = correctedDistance;
      if (!observer.currentSector) continue;

      const currentSector = observer.currentSector;
      const eyeZ = observer.z + observer.height;
      const relativeCeiling = currentSector.ceilingHeight - eyeZ;
      const relativeFloor = currentSector.floorHeight - eyeZ;

      const screenYCenter = this.height / 2;

      const ceilingScreenY = Math.round(
        screenYCenter -
          (relativeCeiling / correctedDistance) * projectionDistance,
      );
      const floorScreenY = Math.round(
        screenYCenter -
          (relativeFloor / correctedDistance) * projectionDistance,
      );

      const wallTop = Math.max(0, Math.min(this.height - 1, ceilingScreenY));
      const wallBottom = Math.max(0, Math.min(this.height - 1, floorScreenY));

      const material = rayHit.boundary.material;
      const wallScreenHeight = floorScreenY - ceilingScreenY;

      // Calculate distance fog multiplier once per column channel
      const distanceFactor = Math.max(
        0,
        Math.min(1, correctedDistance / observer.viewDistance),
      );

      // Run exactly ONE loop to paint this specific wall vertical strip
      for (let y = wallTop; y <= wallBottom; y++) {
        let r = 0,
          g = 255,
          b = 204,
          a = 255; // Default fallback components (neon)

        if (material.texture) {
          const tex = material.texture;
          const repeatX = material.repeat ? material.repeat.x : 1;
          const texX = Math.floor((rayHit.u * repeatX * tex.width) % tex.width);
          const textureColumn = tex.pixelColumns[texX];

          const yOffset = y - ceilingScreenY;
          let texY = Math.floor((yOffset / wallScreenHeight) * tex.height);
          texY = Math.max(0, Math.min(tex.height - 1, texY));

          r = textureColumn[texY][0];
          g = textureColumn[texY][1];
          b = textureColumn[texY][2];
          a = textureColumn[texY][3];
        } else if (material.solidColor) {
          r = material.solidColor.r;
          g = material.solidColor.g;
          b = material.solidColor.b;
          a = material.solidColor.a;
        }

        // Apply distance fog attenuation uniformly to the extracted channels
        if (distanceFactor > 0) {
          r = r * (1 - distanceFactor);
          g = g * (1 - distanceFactor);
          b = b * (1 - distanceFactor);
        }

        // Pack components cleanly into ABGR format for little-endian Uint32 operations
        const packedColor =
          (a << 24) |
          (Math.round(b) << 16) |
          (Math.round(g) << 8) |
          Math.round(r);

        const bufferIndex = y * this.width + column;
        this.pixelBuffer[bufferIndex] = packedColor;
      }
    }
    // --- DYNAMIC ENTITY & VOXELS PASS ---
    // TODO - After walls are drawn, we can iterate over dynamic entities and voxels in the scene

    this.ctx.putImageData(this.screenImageData, 0, 0);
  }
}
