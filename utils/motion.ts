
import { Vector2, TrackingPoint } from '../types';

/**
 * Performs block matching using Sum of Absolute Differences (SAD).
 * Searches for the template from the previous frame within a search window in the current frame.
 */
export const trackSpeckle = (
  prevCtx: CanvasRenderingContext2D,
  currCtx: CanvasRenderingContext2D,
  point: Vector2,
  blockSize: number = 16,
  searchWindow: number = 32
): Vector2 => {
  const halfBlock = blockSize / 2;
  const halfSearch = searchWindow / 2;

  // Get template from previous frame
  const template = prevCtx.getImageData(
    point.x - halfBlock,
    point.y - halfBlock,
    blockSize,
    blockSize
  ).data;

  let minSAD = Infinity;
  let bestOffset = { x: 0, y: 0 };

  // Search in the neighborhood
  for (let dy = -halfSearch; dy <= halfSearch; dy += 2) {
    for (let dx = -halfSearch; dx <= halfSearch; dx += 2) {
      const candidateX = point.x + dx - halfBlock;
      const candidateY = point.y + dy - halfBlock;

      // Boundary check
      if (candidateX < 0 || candidateY < 0 || 
          candidateX + blockSize > currCtx.canvas.width || 
          candidateY + blockSize > currCtx.canvas.height) continue;

      const candidate = currCtx.getImageData(
        candidateX,
        candidateY,
        blockSize,
        blockSize
      ).data;

      let sad = 0;
      for (let i = 0; i < template.length; i += 4) {
        // Luminance comparison
        const lum1 = template[i] * 0.299 + template[i + 1] * 0.587 + template[i + 2] * 0.114;
        const lum2 = candidate[i] * 0.299 + candidate[i + 1] * 0.587 + candidate[i + 2] * 0.114;
        sad += Math.abs(lum1 - lum2);
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

/**
 * Generates a realistic set of initial tracking points along a typical 4-chamber view contour.
 */
export const generateContourPoints = (width: number, height: number): TrackingPoint[] => {
  const points: TrackingPoint[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Parabolic shape for the left ventricle
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

/**
 * Fallback simulation if no real video processing is active
 */
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
