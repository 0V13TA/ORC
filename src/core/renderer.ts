import type Scene from "./scene";
import type { RADIANS, Vector2D } from "./Types";
import { toRadians, Vector2 } from "./utils";

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
    this.depthBuffer = new Float32Array(this.width);
  }

  private getBoundaryNormal(start: Vector2D, end: Vector2D) {
    const d = Vector2.subtract(end, start);
    const perpendicularVector = Vector2.createVector(-d.y, d.x);

    const length = Vector2.magnitude(perpendicularVector);
    if (length === 0) return Vector2.createVector();
    return Vector2.normalized(perpendicularVector);
  }

  public render(scene: Scene) {
    const observer = scene.observer;

    this.pixelBuffer.fill(0xff000000); // Clear to opaque black
    this.depthBuffer.fill(Infinity); // Reset depth buffer for this frame

    const centerAngle = toRadians(observer.dirAngle);
    const halfFOV = toRadians(observer.fov / 2);

    const startAngle = centerAngle - halfFOV;
    const angleStep = toRadians(observer.fov) / this.width;
    const projectionDistance = this.width / 2 / Math.tan(halfFOV);

    // -- WALL ENVIRONMENT SWEEP PASSTHROUGH ---
    for (let column = 0; column < this.width; column++) {
      const rayAngle: RADIANS = startAngle + column * angleStep;

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

      // =======================================================================
      // --- PER-COLUMN LIGHTING CALCULATIONS ---
      // =======================================================================

      // 1. Distance Fog (Diminishes light farther away)
      const distanceFactor = Math.max(
        0,
        Math.min(1, correctedDistance / observer.viewDistance),
      );
      const fogFactor = 1 - distanceFactor;

      // 2. Directional Face Shading (Differentiates wall directions)
      const normal = this.getBoundaryNormal(
        rayHit.boundary.start,
        rayHit.boundary.end,
      );
      // Dot alignment against global East/West vector creates contrast between intersecting walls
      const wallAlignment = Math.abs(
        Vector2.dot(Vector2.createVector(1, 0), normal),
      );
      const directionalShade = 0.75 + wallAlignment * 0.25; // Scales between 75% and 100% brightness

      // 3. Horizontal Ambient Occlusion (Darkens room corners where segments meet)
      const edgeDistanceH = Math.min(rayHit.u, 1 - rayHit.u);
      const cornerThresholdH = 0.1; // Darkens the outer 10% of any wall length
      const horizontalCornerShade =
        edgeDistanceH < cornerThresholdH
          ? 0.45 + 0.55 * (edgeDistanceH / cornerThresholdH) // Smooth linear scaling down to 45% brightness
          : 1.0;

      // Combine column-wide scalars into a master intensity factor
      const columnLightMultiplier =
        fogFactor * directionalShade * horizontalCornerShade;

      // Run exactly ONE loop to paint this specific wall vertical strip
      for (let y = wallTop; y <= wallBottom; y++) {
        let r = 0,
          g = 255,
          b = 204,
          a = 255; // Default neon fallback

        const yOffset = y - ceilingScreenY;

        if (material.texture) {
          const tex = material.texture;
          const repeatX = material.repeat ? material.repeat.x : 1;
          const texX = Math.floor((rayHit.u * repeatX * tex.width) % tex.width);
          const textureColumn = tex.pixelColumns[texX];

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

        // =======================================================================
        // --- PER-PIXEL LIGHTING CALCULATIONS ---
        // =======================================================================

        // 4. Vertical Ambient Occlusion (Darkens seams near floors and ceilings)
        const verticalV = yOffset / wallScreenHeight; // Normalized vertical texture position (0.0 to 1.0)
        const edgeDistanceV = Math.min(verticalV, 1 - verticalV);
        const cornerThresholdV = 0.15; // Darkens within 15% of the wall top/bottom limits
        const verticalCornerShade =
          edgeDistanceV < cornerThresholdV
            ? 0.6 + 0.4 * (edgeDistanceV / cornerThresholdV) // Scales down to 60% brightness
            : 1.0;

        // Apply final consolidated scalar combinations cleanly to the RGB color channels
        const finalLight = columnLightMultiplier * verticalCornerShade;

        r = Math.round(r * finalLight);
        g = Math.round(g * finalLight);
        b = Math.round(b * finalLight);

        // Pack components cleanly into ABGR format for little-endian Uint32 operations
        const packedColor = (a << 24) | (b << 16) | (g << 8) | r;

        const bufferIndex = y * this.width + column;
        this.pixelBuffer[bufferIndex] = packedColor;
      }
    }

    this.ctx.putImageData(this.screenImageData, 0, 0);
  }
}
