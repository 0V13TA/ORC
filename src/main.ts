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
    texture = await loadTexture("/assets/colorstone.png");
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
    solidColor: createColor(50, 120, 240),
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

  // --- ADD MULTIPLE LIGHT SOURCES ---

  // 1. A soft glowing amber torch hanging low near the player spawning point
  // scene.addLight({
  //   id: "spawn_torch",
  //   position: Vector2.createVector(35, 35),
  //   z: 10, // Close to floor height
  //   radius: 90,
  //   intensity: 2.2,
  //   color: { r: 255, g: 160, b: 60 }, // Warm Amber Glow
  // });

  // 2. A vibrant neon-green light source sitting high near the top right ceiling corner
  // scene.addLight({
  //   id: "corner_beacon",
  //   position: Vector2.createVector(170, 30),
  //   z: 20, // High up near the ceiling line
  //   radius: 1600,
  //   intensity: 2.5,
  //   color: { r: 0, g: 255, b: 120 }, // Radioactive Cyberpunk Green
  // });

  // 3. A localized deep blue light sitting inside the central structural pillar area
  scene.addLight({
    id: "monolith_glow",
    position: Vector2.createVector(110, 110),
    z: 30, // Mid-height eye level position
    radius: 1200,
    intensity: 1.0,
    color: { r: 250, g: 220, b: 225 }, // Electric Sapphire Blue
  });
});

// Kick off the master processing loop safely!
orc.start();
