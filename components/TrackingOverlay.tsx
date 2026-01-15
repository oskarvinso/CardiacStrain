
import React, { useRef, useEffect } from 'react';
import { TrackingPoint } from '../types';

interface TrackingOverlayProps {
  mask: ImageData | null;
  points: TrackingPoint[];
  width: number;
  height: number;
}

const TrackingOverlay: React.FC<TrackingOverlayProps> = ({ mask, points, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (mask) {
      ctx.putImageData(mask, 0, 0);
    }

    // Optional: Draw a subtle thin line connecting tracked points to show structure
    if (points.length > 5) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      points.forEach((pt, i) => {
        if (i % 2 === 0) { // Sparse lines for cleaner look
           ctx.moveTo(pt.current.x, pt.current.y);
           const next = points[(i + 1) % points.length];
           ctx.lineTo(next.current.x, next.current.y);
        }
      });
      ctx.stroke();
    }
  }, [mask, points, width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="absolute top-0 left-0 pointer-events-none mix-blend-screen"
    />
  );
};

export default TrackingOverlay;
