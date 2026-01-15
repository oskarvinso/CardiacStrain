
import React, { useRef, useEffect } from 'react';
import { TrackingPoint } from '../types';

interface TrackingOverlayProps {
  mask: ImageData | null;
  points: TrackingPoint[];
  width: number; // Logical width (e.g. 600)
  height: number; // Logical height (e.g. 450)
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
      // Use putImageData to draw the diagnostic mask
      ctx.putImageData(mask, 0, 0);
    }

    // Draw structural lines connecting tracked points for better visualization of wall motion
    if (points.length > 5) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1;
      points.forEach((pt, i) => {
        if (i % 2 === 0) {
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
      className="absolute top-0 left-0 w-full h-full pointer-events-none mix-blend-screen"
    />
  );
};

export default TrackingOverlay;
