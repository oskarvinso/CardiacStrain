
import React, { useRef, useEffect } from 'react';
import { TrackingPoint } from '../types';

interface TrackingOverlayProps {
  points: TrackingPoint[];
  width: number;
  height: number;
  showVectors: boolean;
}

const TrackingOverlay: React.FC<TrackingOverlayProps> = ({ points, width, height, showVectors }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Draw contour line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 2;
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.current.x, pt.current.y);
      else ctx.lineTo(pt.current.x, pt.current.y);
    });
    ctx.stroke();

    // Draw points and vectors
    points.forEach(pt => {
      // Heatmap color based on strain (negative is shortening, good)
      const strainColor = pt.strain < -15 ? '#22c55e' : pt.strain < -5 ? '#eab308' : '#ef4444';
      
      // Point
      ctx.fillStyle = strainColor;
      ctx.beginPath();
      ctx.arc(pt.current.x, pt.current.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Vector
      if (showVectors) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.moveTo(pt.initial.x, pt.initial.y);
        ctx.lineTo(pt.current.x, pt.current.y);
        ctx.stroke();
      }
    });
  }, [points, width, height, showVectors]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="absolute top-0 left-0 pointer-events-none"
    />
  );
};

export default TrackingOverlay;
