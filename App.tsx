
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RefreshCw, Activity, Heart, ShieldAlert, 
  Share2, Info, ChevronRight, Upload, Video, FileVideo, ClipboardList
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { TrackingPoint, AnalysisResult } from './types.ts';
import { generateContourPoints, simulateHeartbeat } from './utils/motion.ts';

// --- BullsEyeChart Component ---
const BullsEyeChart: React.FC<{ segmentData: number[] }> = ({ segmentData }) => {
  const size = 200;
  const center = size / 2;
  const rings = [size * 0.45, size * 0.32, size * 0.18];
  const apexRadius = size * 0.08;

  const getColor = (val: number) => {
    if (val <= -18) return '#22c55e';
    if (val <= -14) return '#84cc16';
    if (val <= -10) return '#eab308';
    if (val <= -5) return '#f97316';
    return '#ef4444';
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
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
        />
      );
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {renderRing(6, rings[0], rings[1], 0)}
          {renderRing(6, rings[1], rings[2], 6)}
          {renderRing(4, rings[2], apexRadius, 12)}
          <circle 
            cx={center} cy={center} r={apexRadius} 
            fill={getColor(segmentData[16] || 0)} stroke="#0f172a" strokeWidth="1.5"
          />
          <g opacity="0.3" stroke="#fff" strokeWidth="0.5" pointerEvents="none">
             <line x1={center} y1={center - rings[0]} x2={center} y2={center + rings[0]} />
             <line x1={center - rings[0]} y1={center} x2={center + rings[0]} y2={center} />
          </g>
        </svg>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 text-[9px] font-bold text-slate-500">ANT</div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4 text-[9px] font-bold text-slate-500">INF</div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 text-[9px] font-bold text-slate-500">SEP</div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 text-[9px] font-bold text-slate-500">LAT</div>
      </div>
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

// --- TrackingOverlay Component ---
const TrackingOverlay: React.FC<{ points: TrackingPoint[]; width: number; height: number; showVectors: boolean }> = ({ points, width, height, showVectors }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 2;
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.current.x, pt.current.y);
      else ctx.lineTo(pt.current.x, pt.current.y);
    });
    ctx.stroke();

    points.forEach(pt => {
      const strainColor = pt.strain < -15 ? '#22c55e' : pt.strain < -5 ? '#eab308' : '#ef4444';
      ctx.fillStyle = strainColor;
      ctx.beginPath();
      ctx.arc(pt.current.x, pt.current.y, 4, 0, Math.PI * 2);
      ctx.fill();

      if (showVectors) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.moveTo(pt.initial.x, pt.initial.y);
        ctx.lineTo(pt.current.x, pt.current.y);
        ctx.stroke();
      }
    });
  }, [points, width, height, showVectors]);

  return <canvas ref={canvasRef} width={width} height={height} className="absolute top-0 left-0 pointer-events-none" />;
};

// --- StrainChart Component ---
const StrainChart: React.FC<{ data: { time: number; strain: number }[] }> = ({ data }) => {
  return (
    <div className="w-full h-64 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
      <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Strain vs Time (GLS Curve)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" hide />
          <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val}%`} domain={[-30, 10]} />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} itemStyle={{ color: '#38bdf8' }} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="5 5" />
          <Line type="monotone" dataKey="strain" stroke="#38bdf8" strokeWidth={3} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- App Component ---
const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState(0);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [history, setHistory] = useState<{ time: number; strain: number }[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showVectors, setShowVectors] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'demo' | 'video'>('demo');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPoints(generateContourPoints(600, 450));
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(e => console.warn("Playback prevented:", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoUrl]);

  const animate = useCallback(() => {
    if (isPlaying) {
      setPhase(prev => {
        let next;
        if (sourceType === 'video' && videoRef.current) {
          next = videoRef.current.currentTime * 5;
        } else {
          next = prev + 0.08;
        }
        const currentStrain = Math.sin(next) * -18;
        setPoints(pts => simulateHeartbeat(pts, next));
        setHistory(h => {
          const newHistory = [...h, { time: next, strain: currentStrain }];
          return newHistory.slice(-100);
        });
        return next;
      });
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, sourceType]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [animate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'video/mp4') {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setSourceType('video');
      setIsPlaying(false);
      setPhase(0);
      setHistory([]);
      setAnalysis(null);
    } else if (file) {
      alert("Please upload an MP4 video file.");
    }
  };

  const runAnalysis = () => {
    setIsCalculating(true);
    // Simulate complex calculation lag
    setTimeout(() => {
      const detailedSegments = Array.from({ length: 17 }).map(() => -15 + (Math.random() * 10 - 5));
      const mockResult: AnalysisResult = {
        gls: -18.4, ef: 55, hr: 72, timestamp: Date.now(),
        segments: { basal: -15.2, mid: -19.4, apical: -22.1, detailed: detailedSegments }
      };
      setAnalysis(mockResult);
      setIsCalculating(false);
    }, 1200);
  };

  const resetData = () => {
    setHistory([]);
    setPhase(0);
    setPoints(generateContourPoints(600, 450));
    setAnalysis(null);
    if (videoRef.current) videoRef.current.currentTime = 0;
  };

  const getClinicalStatus = (gls: number) => {
    if (gls <= -18) return { text: 'Healthy Function', color: 'text-emerald-500', severity: 'Normal' };
    if (gls <= -12) return { text: 'Borderline/Mild Impairment', color: 'text-amber-500', severity: 'Mild' };
    return { text: 'Significant Impairment', color: 'text-red-500', severity: 'Moderate/Severe' };
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/mp4" className="hidden" />
      
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Logo" className="h-10 w-auto object-contain" />
          <div className="h-8 w-[1px] bg-slate-800 mx-1 hidden sm:block" />
          <div>
            <h1 className="font-bold text-lg tracking-tight">CardiaStrain</h1>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Medical Speckle Tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
            <Upload size={16} /> Import Scan (MP4)
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl group flex items-center justify-center">
            {sourceType === 'demo' ? (
              <img src="https://images.unsplash.com/photo-1579154235602-3c306869762a?auto=format&fit=crop&q=80&w=1200" className="w-full h-full object-cover opacity-40 grayscale blur-sm" alt="Ultrasound" />
            ) : (
              <video ref={videoRef} src={videoUrl || undefined} loop muted playsInline className="w-full h-full object-contain" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
               <div ref={containerRef} className="relative w-[600px] h-[450px]">
                  <TrackingOverlay points={points} width={600} height={450} showVectors={showVectors} />
                  <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40 rounded-full" />
               </div>
            </div>
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-blue-500 animate-ping' : 'bg-slate-600'}`} />
                <span className="text-xs font-mono text-slate-300 uppercase">{sourceType} active</span>
              </div>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-6 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={resetData} className="p-2 text-slate-400 hover:text-white" title="Reset Simulation"><RefreshCw size={20} /></button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-transform active:scale-95">
                {isPlaying ? <Pause fill="white" size={24} /> : <Play fill="white" size={24} className="ml-1" />}
              </button>
              <button onClick={runAnalysis} disabled={isCalculating} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl disabled:opacity-50">
                <Activity size={18} className="text-emerald-400" /> Calculate Metrics
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrainChart data={history} />
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-6">
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Average GLS</span>
                    <span className="text-3xl font-bold text-blue-400 tabular-nums">{history.length > 0 ? history[history.length-1].strain.toFixed(1) : '0.0'}%</span>
                 </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Heart Rate</span>
                    <span className="text-3xl font-bold text-emerald-400 tabular-nums">72 <span className="text-sm font-normal text-slate-500">BPM</span></span>
                 </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-slate-400">
                    <Heart size={14} className="text-red-500 fill-red-500" />
                    <span className="text-xs">Deformation Engine Ready</span>
                 </div>
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-3"><ClipboardList className="text-blue-400" size={20} /><h2 className="font-bold uppercase tracking-tight">Clinical Summary</h2></div>
               {isCalculating && <RefreshCw size={16} className="animate-spin text-slate-500" />}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {analysis ? (
                <>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Functional Status</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 ${getClinicalStatus(analysis.gls).color}`}>
                        {getClinicalStatus(analysis.gls).severity}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed italic">
                      "Myocardial deformation analysis indicates {getClinicalStatus(analysis.gls).text.toLowerCase()} with a calculated Global Longitudinal Strain of {analysis.gls}%."
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-6">AHA 17-Segment Polar Map</h4>
                    <div className="flex justify-center p-2"><BullsEyeChart segmentData={analysis.segments.detailed} /></div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <ShieldAlert size={14} className="text-amber-500" /> Clinical Notes
                    </h4>
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
                      <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                        <li>Basal segments show moderate correlation.</li>
                        <li>Apical shortening preserved.</li>
                        <li>Compare with baseline measurements for trend analysis.</li>
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                   <Activity size={32} className="text-slate-600 mb-4" />
                   <h3 className="text-sm font-semibold text-slate-400 uppercase">Awaiting Calculation</h3>
                   <p className="text-xs text-slate-500 mt-2 px-8">Calculate metrics to generate the segmental polar map and functional summary.</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-slate-950 border-t border-slate-800">
              <button className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all">
                Export Technical Report
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
           <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Footer Logo" className="h-6 w-auto opacity-50" />
           <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">Scientific Measurement System • Ameliasoft engine</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
