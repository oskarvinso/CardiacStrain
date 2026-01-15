
import { Vector2, TrackingPoint } from '../types';

/**
 * Enhances contrast of an ImageData object using linear stretching.
 */
export const enhanceContrast = (data: Uint8ClampedArray) => {
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    const v = ((data[i] - min) / range) * 255;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
};

/**
 * Basic Sobel operator for edge detection.
 */
export const applySobel = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const input = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  const inputData = input.data;
  const outputData = output.data;

  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let pixelX = 0;
      let pixelY = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const val = inputData[idx];
          pixelX += val * kernelX[(ky + 1) * 3 + (kx + 1)];
          pixelY += val * kernelY[(ky + 1) * 3 + (kx + 1)];
        }
      }

      const mag = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
      const outIdx = (y * width + x) * 4;
      outputData[outIdx] = outputData[outIdx + 1] = outputData[outIdx + 2] = mag;
      outputData[outIdx + 3] = 255;
    }
  }
  ctx.putImageData(output, 0, 0);
};

/**
 * Scans an edge-detected canvas to find high-gradient points likely belonging to the chamber wall.
 */
export const detectBorders = (edgeCtx: CanvasRenderingContext2D, width: number, height: number): TrackingPoint[] => {
  const imgData = edgeCtx.getImageData(0, 0, width, height).data;
  const points: TrackingPoint[] = [];
  const threshold = 180; // High gradient threshold
  const step = 25; // Sample every 25 pixels to avoid overcrowding

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      if (imgData[idx] > threshold) {
        points.push({
          id: `auto-${x}-${y}-${Date.now()}`,
          initial: { x, y },
          current: { x, y },
          velocity: { x: 0, y: 0 },
          strain: 0
        });
      }
    }
  }
  return points;
};

export const trackSpeckle = (
  prevCtx: CanvasRenderingContext2D,
  currCtx: CanvasRenderingContext2D,
  point: Vector2,
  blockSize: number = 16,
  searchWindow: number = 32
): Vector2 => {
  const halfBlock = blockSize / 2;
  const halfSearch = searchWindow / 2;

  const template = prevCtx.getImageData(
    Math.max(0, Math.floor(point.x - halfBlock)),
    Math.max(0, Math.floor(point.y - halfBlock)),
    blockSize,
    blockSize
  ).data;

  let minSAD = Infinity;
  let bestOffset = { x: 0, y: 0 };

  for (let dy = -halfSearch; dy <= halfSearch; dy += 2) {
    for (let dx = -halfSearch; dx <= halfSearch; dx += 2) {
      const candidateX = Math.floor(point.x + dx - halfBlock);
      const candidateY = Math.floor(point.y + dy - halfBlock);

      if (candidateX < 0 || candidateY < 0 || 
          candidateX + blockSize > currCtx.canvas.width || 
          candidateY + blockSize > currCtx.canvas.height) continue;

      const candidate = currCtx.getImageData(candidateX, candidateY, blockSize, blockSize).data;

      let sad = 0;
      for (let i = 0; i < template.length; i += 4) {
        sad += Math.abs(template[i] - candidate[i]);
      }

      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = { x: dx, y: dy };
      }
    }
  }

  return {
    x: point.x + bestOffset.x,
    y: point.y + bestOffset.y
  };
};

export const generateContourPoints = (width: number, height: number): TrackingPoint[] => {
  const points: TrackingPoint[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  for (let i = 0; i <= 15; i++) {
    const t = (i / 15) * Math.PI - Math.PI/2;
    const x = centerX + Math.cos(t) * (width * 0.12);
    const y = centerY + Math.sin(t) * (height * 0.25) + (Math.abs(t) * 15);
    points.push({
      id: `pt-${i}`,
      initial: { x, y },
      current: { x, y },
      velocity: { x: 0, y: 0 },
      strain: 0
    });
  }
  return points;
};

export const simulateHeartbeat = (points: TrackingPoint[], phase: number): TrackingPoint[] => {
  const contraction = Math.sin(phase) * 0.12; 
  return points.map(pt => {
    const dx = pt.initial.x - 300; 
    const dy = pt.initial.y - 225;
    return {
      ...pt,
      current: {
        x: pt.initial.x - dx * contraction,
        y: pt.initial.y - dy * contraction
      },
      strain: contraction * -100
    };
  });
};
