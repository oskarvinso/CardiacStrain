
import { Vector2, TrackingPoint } from '../types';

/**
 * Calculates the Sum of Absolute Differences (SAD) between two image blocks.
 * In a real medical app, we'd use normalized cross-correlation (NCC) or optical flow.
 */
export const calculateSAD = (
  data1: Uint8ClampedArray,
  data2: Uint8ClampedArray,
  width: number
): number => {
  let diff = 0;
  for (let i = 0; i < data1.length; i += 4) {
    // Greyscale comparison (Simplified)
    const gray1 = (data1[i] + data1[i+1] + data1[i+2]) / 3;
    const gray2 = (data2[i] + data2[i+1] + data2[i+2]) / 3;
    diff += Math.abs(gray1 - gray2);
  }
  return diff;
};

/**
 * Generates a realistic set of initial tracking points along a typical 4-chamber view contour.
 */
export const generateContourPoints = (width: number, height: number): TrackingPoint[] => {
  const points: TrackingPoint[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Parabolic shape for the left ventricle
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI - Math.PI/2;
    const x = centerX + Math.cos(t) * (width * 0.15);
    const y = centerY + Math.sin(t) * (height * 0.3) + (Math.abs(t) * 10);
    
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
 * Simulates heartbeat motion to keep the UI interactive even without complex video processing.
 */
export const simulateHeartbeat = (points: TrackingPoint[], phase: number): TrackingPoint[] => {
  const contraction = Math.sin(phase) * 0.15; // 15% contraction
  return points.map(pt => {
    const dx = pt.initial.x - 250; // assuming 500px width
    const dy = pt.initial.y - 250;
    
    return {
      ...pt,
      current: {
        x: pt.initial.x - dx * contraction,
        y: pt.initial.y - dy * contraction
      },
      strain: contraction * -100 // Percent strain
    };
  });
};
