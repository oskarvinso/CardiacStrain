
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface StrainChartProps {
  data: { time: number; strain: number }[];
}

const StrainChart: React.FC<StrainChartProps> = ({ data }) => {
  return (
    <div className="w-full h-64 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
      <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Strain vs Time (GLS Curve)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="time" 
            hide 
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={12} 
            tickFormatter={(val) => `${val}%`}
            domain={[-30, 10]}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
            itemStyle={{ color: '#38bdf8' }}
          />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="5 5" />
          <Line 
            type="monotone" 
            dataKey="strain" 
            stroke="#38bdf8" 
            strokeWidth={3} 
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StrainChart;
