
import { Vector2, TrackingPoint } from '../types';

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

export const calculateArea = (points: Vector2[]): number => {
  if (points.length < 3) return 0;
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

export const createDiagnosticMask = (
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  strainValue: number,
  roi: { x: number, y: number, w: number, h: number } | null
): ImageData => {
  const input = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  const inputData = input.data;
  const outputData = output.data;

  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const r = strainValue < -15 ? 34 : 239;
  const g = strainValue < -15 ? 197 : 68;
  const b = strainValue < -15 ? 94 : 68;

  const minX = roi ? roi.x : 0;
  const minY = roi ? roi.y : 0;
  const maxX = roi ? roi.x + roi.w : width;
  const maxY = roi ? roi.y + roi.h : height;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const outIdx = (y * width + x) * 4;
      
      // Only process if within ROI
      if (x < minX || x > maxX || y < minY || y > maxY) {
        outputData[outIdx + 3] = 0;
        continue;
      }

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
      if (mag > 75) {
        outputData[outIdx] = r;
        outputData[outIdx + 1] = g;
        outputData[outIdx + 2] = b;
        outputData[outIdx + 3] = Math.min(255, mag * 2.2);
      } else {
        outputData[outIdx + 3] = 0;
      }
    }
  }
  return output;
};

export const autoDetectWalls = (
  edgeCtx: CanvasRenderingContext2D, 
  width: number, 
  height: number,
  roi: { x: number, y: number, w: number, h: number } | null
): TrackingPoint[] => {
  const imgData = edgeCtx.getImageData(0, 0, width, height).data;
  const points: TrackingPoint[] = [];
  const threshold = 130; 
  const step = 18;

  const minX = roi ? Math.max(0, roi.x) : 50;
  const minY = roi ? Math.max(0, roi.y) : 50;
  const maxX = roi ? Math.min(width, roi.x + roi.w) : width - 50;
  const maxY = roi ? Math.min(height, roi.y + roi.h) : height - 50;

  for (let y = minY; y < maxY; y += step) {
    for (let x = minX; x < maxX; x += step) {
      const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
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
  blockSize: number = 14,
  searchWindow: number = 24
): Vector2 => {
  const halfBlock = blockSize / 2;
  const halfSearch = searchWindow / 2;
  const px = Math.floor(point.x);
  const py = Math.floor(point.y);

  if (px - halfBlock < 0 || py - halfBlock < 0 || 
      px + halfBlock >= currCtx.canvas.width || py + halfBlock >= currCtx.canvas.height) {
    return point;
  }

  const template = prevCtx.getImageData(px - halfBlock, py - halfBlock, blockSize, blockSize).data;
  let minSAD = Infinity;
  let bestOffset = { x: 0, y: 0 };

  for (let dy = -halfSearch; dy <= halfSearch; dy += 2) {
    for (let dx = -halfSearch; dx <= halfSearch; dx += 2) {
      const cx = px + dx - halfBlock;
      const cy = py + dy - halfBlock;

      if (cx < 0 || cy < 0 || cx + blockSize > currCtx.canvas.width || cy + blockSize > currCtx.canvas.height) continue;

      const candidate = currCtx.getImageData(cx, cy, blockSize, blockSize).data;
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

  return { x: point.x + bestOffset.x, y: point.y + bestOffset.y };
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
