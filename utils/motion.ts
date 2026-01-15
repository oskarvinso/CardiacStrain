
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
 * Calculates the area of a polygon defined by tracking points.
 * Uses the Shoelace formula (Surveyor's formula).
 */
export const calculateArea = (points: Vector2[]): number => {
  if (points.length < 3) return 0;
  
  // Sort points by angle to center to ensure a valid polygon for the area formula
  const centerX = points.reduce((a, b) => a + b.x, 0) / points.length;
  const centerY = points.reduce((a, b) => a + b.y, 0) / points.length;
  
  const sorted = [...points].sort((a, b) => {
    return Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX);
  });

  let area = 0;
  for (let i = 0; i < sorted.length; i++) {
    const j = (i + 1) % sorted.length;
    area += sorted[i].x * sorted[j].y;
    area -= sorted[j].x * sorted[i].y;
  }
  return Math.abs(area) / 2;
};

/**
 * Performs Sobel edge detection and returns a diagnostic mask.
 */
export const createDiagnosticMask = (ctx: CanvasRenderingContext2D, width: number, height: number, strainValue: number): ImageData => {
  const input = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  const inputData = input.data;
  const outputData = output.data;

  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  // Base diagnostic color based on strain (Green for healthy, Red for reduced)
  const r = strainValue < -15 ? 34 : 239;
  const g = strainValue < -15 ? 197 : 68;
  const b = strainValue < -15 ? 94 : 68;

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
      
      if (mag > 60) {
        outputData[outIdx] = r;
        outputData[outIdx + 1] = g;
        outputData[outIdx + 2] = b;
        outputData[outIdx + 3] = Math.min(255, mag * 2); // Alpha based on edge strength
      } else {
        outputData[outIdx + 3] = 0;
      }
    }
  }
  return output;
};

/**
 * Automated wall detection: Scans the center area for the most likely chamber boundaries.
 */
export const autoDetectWalls = (edgeCtx: CanvasRenderingContext2D, width: number, height: number): TrackingPoint[] => {
  const imgData = edgeCtx.getImageData(0, 0, width, height).data;
  const points: TrackingPoint[] = [];
  const threshold = 140; 
  const step = 20;

  // Scan in a focused central ring where myocardial walls usually appear
  for (let y = 50; y < height - 50; y += step) {
    for (let x = 50; x < width - 50; x += step) {
      const idx = (y * width + x) * 4;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (imgData[idx] > threshold && dist > 80 && dist < 220) {
        points.push({
          id: `auto-${x}-${y}`,
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
  blockSize: number = 14,
  searchWindow: number = 24
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
