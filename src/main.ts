import ORCEngine from "./core/ORC";
import type { Boundary, Material } from "./core/Types";
import { loadTexture, Vector2, createColor } from "./core/utils";
import "./style.css";

const orc = new ORCEngine({
  width: Math.round(window.innerWidth * 0.99),
  height: Math.round(window.innerHeight * 0.99),
  container: document.body,
  enableMinimap: true,
  minimapSize: { width: 220, height: 220 },
});

orc.onCreate(async (scene) => {
  // 1. Safely pull down your resource asset texture column allocations!
  let texture;
  try {
    texture = await loadTexture("../public/assets/greystone.png");
  } catch (e) {
    console.warn(
      "Could not find texture map asset, falling back onto solid colors.",
    );
  }

  // 2. Allocate an expansive map sector with clean floor and high ceilings
  const sector = scene.createSector(-20, 100);

  // 3. Define fallback color styles and map texture variables
  const texturedMaterial: Material = texture
    ? { type: "WALL", texture }
    : { type: "WALL", solidColor: createColor(200, 100, 50) };

  const solidBlueMaterial: Material = {
    type: "WALL",
    // solidColor: createColor(150, 220, 240),
  };

  // Helper macro to draw walls rapidly
  const buildWall = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mat: Material,
  ) => {
    const bound: Boundary = {
      start: Vector2.createVector(x1, y1),
      end: Vector2.createVector(x2, y2),
      material: mat,
      isPortal: false,
    };
    scene.addBoundary(sector, bound);
  };

  // --- MAP ENVIRONMENT BLUEPRINT STRUCTURE ---
  // A. Large Outer Citadel Box Enclosure
  buildWall(10, 10, 190, 10, texturedMaterial); // Top Wall
  buildWall(190, 10, 190, 190, texturedMaterial); // Right Wall
  buildWall(190, 190, 10, 190, texturedMaterial); // Bottom Wall
  buildWall(10, 190, 10, 10, texturedMaterial); // Left Wall

  // B. Central Blue Accent Pillars
  buildWall(70, 70, 90, 70, solidBlueMaterial);
  buildWall(90, 70, 90, 90, solidBlueMaterial);
  buildWall(90, 90, 70, 90, solidBlueMaterial);
  buildWall(70, 90, 70, 70, solidBlueMaterial);

  // Move the observer focus position directly into the heart of our new sector layout!
  scene.observer.position = Vector2.createVector(40, 40);
  scene.observer.lookAt(45); // Point looking towards the center pillar
});

// Kick off the master processing loop safely!
orc.start();
