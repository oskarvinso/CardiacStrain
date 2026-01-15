
import React from 'react';

interface BullsEyeChartProps {
  segmentData: number[]; // 17 segments
}

const BullsEyeChart: React.FC<BullsEyeChartProps> = ({ segmentData }) => {
  const size = 200;
  const center = size / 2;
  const rings = [size * 0.45, size * 0.32, size * 0.18]; // Radii for Basal, Mid, Apical
  const apexRadius = size * 0.08;

  // AHA 17-segment model mapping
  // Basal: 0-5 (6 segments)
  // Mid: 6-11 (6 segments)
  // Apical: 12-15 (4 segments)
  // Apex: 16 (1 segment)

  const getColor = (val: number) => {
    // Standard color mapping for health:
    // Strain around -20 is healthy (Green)
    // Strain around 0 is unhealthy (Red)
    if (val <= -18) return '#22c55e'; // Emerald 500
    if (val <= -14) return '#84cc16'; // Lime 500
    if (val <= -10) return '#eab308'; // Yellow 500
    if (val <= -5) return '#f97316';  // Orange 500
    return '#ef4444'; // Red 500
  };

  const describeArc = (x: number, y: number, radius: number, innerRadius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const startInner = polarToCartesian(x, y, innerRadius, endAngle);
    const endInner = polarToCartesian(x, y, innerRadius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "L", endInner.x, endInner.y,
      "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
      "Z"
    ].join(" ");
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  const renderRing = (count: number, outerR: number, innerR: number, startIndex: number) => {
    const step = 360 / count;
    return Array.from({ length: count }).map((_, i) => {
      const startAngle = i * step;
      const endAngle = (i + 1) * step;
      const value = segmentData[startIndex + i] || 0;
      return (
        <path
          key={`seg-${startIndex + i}`}
          d={describeArc(center, center, outerR, innerR, startAngle, endAngle)}
          fill={getColor(value)}
          stroke="#0f172a"
          strokeWidth="1.5"
          className="transition-colors duration-500 hover:brightness-110"
        >
          <title>Segment {startIndex + i + 1}: {value.toFixed(1)}%</title>
        </path>
      );
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Outer Ring - Basal (6 segments) */}
          {renderRing(6, rings[0], rings[1], 0)}
          
          {/* Middle Ring - Mid (6 segments) */}
          {renderRing(6, rings[1], rings[2], 6)}
          
          {/* Inner Ring - Apical (4 segments) */}
          {renderRing(4, rings[2], apexRadius, 12)}

          {/* Center - Apex (1 segment) */}
          <circle 
            cx={center} 
            cy={center} 
            r={apexRadius} 
            fill={getColor(segmentData[16] || 0)} 
            stroke="#0f172a" 
            strokeWidth="1.5"
          >
             <title>Apex: {(segmentData[16] || 0).toFixed(1)}%</title>
          </circle>

          {/* Legend Lines */}
          <g opacity="0.3" stroke="#fff" strokeWidth="0.5" pointerEvents="none">
             <line x1={center} y1={center - rings[0]} x2={center} y2={center + rings[0]} />
             <line x1={center - rings[0]} y1={center} x2={center + rings[0]} y2={center} />
          </g>
        </svg>

        {/* Labels Overlay */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 text-[9px] font-bold text-slate-500">ANT</div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4 text-[9px] font-bold text-slate-500">INF</div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 text-[9px] font-bold text-slate-500">SEP</div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 text-[9px] font-bold text-slate-500">LAT</div>
      </div>

      {/* Color Scale Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex flex-col items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
          <span className="text-[8px] text-slate-500">0%</span>
        </div>
        <div className="w-16 h-1 bg-gradient-to-r from-[#ef4444] via-[#eab308] to-[#22c55e] rounded-full" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
          <span className="text-[8px] text-slate-500">-20%</span>
        </div>
      </div>
    </div>
  );
};

export default BullsEyeChart;
