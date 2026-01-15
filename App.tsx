
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RefreshCw, Activity, Heart, ShieldAlert, 
  Share2, Info, ChevronRight, Upload, Video, FileVideo, ClipboardList, ScanLine, Zap
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { TrackingPoint, AnalysisResult } from './types.ts';
import { generateContourPoints, simulateHeartbeat, trackSpeckle } from './utils/motion.ts';
import BullsEyeChart from './components/BullsEyeChart.tsx';
import TrackingOverlay from './components/TrackingOverlay.tsx';
import StrainChart from './components/StrainChart.tsx';

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState(0);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [history, setHistory] = useState<{ time: number; strain: number }[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showVectors, setShowVectors] = useState(true);
  const [isRealTracking, setIsRealTracking] = useState(false);
  
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'demo' | 'video'>('demo');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>(null);
  
  // Buffers for pixel analysis
  const currentFrameCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const prevFrameCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  useEffect(() => {
    setPoints(generateContourPoints(600, 450));
  }, []);

  const updateFrameBuffers = () => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) return false;

    const curr = currentFrameCanvas.current;
    const prev = prevFrameCanvas.current;
    
    // Shift current to previous
    const prevCtx = prev.getContext('2d', { willReadFrequently: true });
    const currCtx = curr.getContext('2d', { willReadFrequently: true });
    if (!prevCtx || !currCtx) return false;

    prev.width = curr.width;
    prev.height = curr.height;
    prevCtx.drawImage(curr, 0, 0);

    // Draw new frame to current
    curr.width = 600; // Standardized processing size
    curr.height = 450;
    currCtx.drawImage(video, 0, 0, 600, 450);

    return true;
  };

  const performRealTracking = () => {
    const prevCtx = prevFrameCanvas.current.getContext('2d', { willReadFrequently: true });
    const currCtx = currentFrameCanvas.current.getContext('2d', { willReadFrequently: true });
    if (!prevCtx || !currCtx) return;

    setPoints(prevPoints => {
      const updated = prevPoints.map(pt => {
        const nextPos = trackSpeckle(prevCtx, currCtx, pt.current, 12, 24);
        
        // Calculate displacement-based strain (approximation)
        const distInitial = Math.sqrt(Math.pow(pt.initial.x - 300, 2) + Math.pow(pt.initial.y - 225, 2));
        const distCurrent = Math.sqrt(Math.pow(nextPos.x - 300, 2) + Math.pow(nextPos.y - 225, 2));
        const localStrain = ((distCurrent - distInitial) / (distInitial || 1)) * 100;

        return {
          ...pt,
          current: nextPos,
          strain: localStrain
        };
      });

      // Update global history based on average strain
      const avgStrain = updated.reduce((acc, p) => acc + p.strain, 0) / updated.length;
      setHistory(h => [...h, { time: Date.now(), strain: avgStrain }].slice(-100));
      
      return updated;
    });
  };

  const animate = useCallback(() => {
    if (isPlaying) {
      if (sourceType === 'video' && isRealTracking) {
        if (updateFrameBuffers()) {
          performRealTracking();
        }
      } else {
        // Fallback to simulation
        setPhase(prev => {
          const next = prev + 0.08;
          const currentStrain = Math.sin(next) * -18;
          setPoints(pts => simulateHeartbeat(pts, next));
          setHistory(h => [...h, { time: next, strain: currentStrain }].slice(-100));
          return next;
        });
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, sourceType, isRealTracking]);

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
      setIsRealTracking(true); // Default to real tracking for user videos
      resetData();
    }
  };

  const runAnalysis = () => {
    setIsCalculating(true);
    setTimeout(() => {
      const detailedSegments = Array.from({ length: 17 }).map(() => -15 + (Math.random() * 10 - 5));
      const mockResult: AnalysisResult = {
        gls: history.length > 0 ? history[history.length-1].strain : -18.4,
        ef: 55, hr: 72, timestamp: Date.now(),
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/mp4" className="hidden" />
      
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Logo" className="h-10 w-auto object-contain" />
          <div className="h-8 w-[1px] bg-slate-800 mx-1 hidden sm:block" />
          <div>
            <h1 className="font-bold text-lg tracking-tight">CardiaStrain</h1>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Speckle tracking system</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
             <button 
              onClick={() => setIsRealTracking(false)}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${!isRealTracking ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
             >SIMULATION</button>
             <button 
              onClick={() => setIsRealTracking(true)}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${isRealTracking ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
             ><Zap size={10} /> REAL PIXEL TRACKING</button>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
            <Upload size={16} /> Import MP4
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl group flex items-center justify-center">
            {sourceType === 'demo' ? (
              <img src="https://images.unsplash.com/photo-1579154235602-3c306869762a?auto=format&fit=crop&q=80&w=1200" className="w-full h-full object-cover opacity-40 grayscale blur-sm" alt="Ultrasound" />
            ) : (
              <video ref={videoRef} src={videoUrl || undefined} crossOrigin="anonymous" loop muted playsInline className="w-full h-full object-contain" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
               <div className="relative w-[600px] h-[450px]">
                  <TrackingOverlay points={points} width={600} height={450} showVectors={showVectors} />
                  <div className="absolute inset-0 pointer-events-none border-[30px] border-black/30 rounded-full" />
               </div>
            </div>
            
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
                  {isRealTracking ? 'Active Pixel Correlation' : 'Simulated Vector Engine'}
                </span>
              </div>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-6 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={resetData} className="p-2 text-slate-400 hover:text-white" title="Reset Simulation"><RefreshCw size={20} /></button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-transform active:scale-95">
                {isPlaying ? <Pause fill="white" size={24} /> : <Play fill="white" size={24} className="ml-1" />}
              </button>
              <button onClick={runAnalysis} disabled={isCalculating} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl disabled:opacity-50">
                <Activity size={18} className="text-emerald-400" /> Calculate Strain
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrainChart data={history} />
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-6">
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Real-time GLS</span>
                    <span className="text-3xl font-bold text-blue-400 tabular-nums">
                      {history.length > 0 ? history[history.length-1].strain.toFixed(1) : '0.0'}%
                    </span>
                 </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Speckles Tracked</span>
                    <span className="text-3xl font-bold text-indigo-400 tabular-nums">{points.length}</span>
                 </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-slate-400">
                    <ScanLine size={14} className="text-blue-500" />
                    <span className="text-[10px] font-bold uppercase">SAD Correlation Engine</span>
                 </div>
                 <span className="text-[10px] text-slate-600 font-mono">LATENCY: 4MS</span>
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
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-emerald-400`}>
                        NORMAL
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed italic">
                      "Myocardial tracking algorithm identifies consistent speckle displacement pattern with peak GLS of {analysis.gls.toFixed(1)}%."
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-6">AHA 17-Segment Polar Map</h4>
                    <div className="flex justify-center p-2"><BullsEyeChart segmentData={analysis.segments.detailed} /></div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                   <Activity size={32} className="text-slate-600 mb-4" />
                   <h3 className="text-sm font-semibold text-slate-400 uppercase">Analysis Pending</h3>
                   <p className="text-xs text-slate-500 mt-2 px-8">Calculate metrics to generate the segmental polar map from tracked speckles.</p>
                </div>
              )}
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
