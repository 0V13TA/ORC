import Observer from "./observer";
import "./style.css";
import { createCanvas, Input, TimerManager, Vector2 } from "./utils";

const { canvas: minimapCanvas, ctx: minimapCtx } = createCanvas(200, 200);
minimapCanvas.classList.add("minimap");
const { canvas, ctx } = createCanvas(innerWidth * 0.99, innerHeight * 0.99);
canvas.classList.add("mainCanvas");

let lastTime = 0;
let animationID: number;

const player = new Observer(
  Vector2.createVector(minimapCanvas.width / 2, minimapCanvas.height / 2),
  60,
  minimapCanvas,
);

function animate(timestamp: number) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  TimerManager.update(timestamp - (lastTime - dt * 1000));
  minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  player.draw(minimapCtx);
  player.update(dt);

  Input.endFrame();
  animationID = requestAnimationFrame(animate);
}

Input.init();
animationID = requestAnimationFrame(animate);
