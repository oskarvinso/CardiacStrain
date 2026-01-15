
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RefreshCw, Activity, Heart, ShieldAlert, 
  Share2, Info, ChevronRight, Upload, Video, FileVideo, ClipboardList, ScanLine, Zap, Move, Eye, EyeOff, Trash2, Crosshair
} from 'lucide-react';
import { TrackingPoint, AnalysisResult } from './types.ts';
import { generateContourPoints, simulateHeartbeat, trackSpeckle, applySobel, enhanceContrast, detectBorders } from './utils/motion.ts';
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
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null);
  const [showEdgeMap, setShowEdgeMap] = useState(false);
  
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'demo' | 'video'>('demo');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>(null);
  
  const currentFrameCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const prevFrameCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const edgeCanvas = useRef<HTMLCanvasElement>(null);

  // Buffer synchronization helper
  const updateBuffers = useCallback(() => {
    const video = videoRef.current;
    const curr = currentFrameCanvas.current;
    const prev = prevFrameCanvas.current;
    const prevCtx = prev.getContext('2d', { willReadFrequently: true });
    const currCtx = curr.getContext('2d', { willReadFrequently: true });
    
    if (!video || !prevCtx || !currCtx) return false;

    prev.width = curr.width || 600;
    prev.height = curr.height || 450;
    prevCtx.drawImage(curr, 0, 0);

    curr.width = 600;
    curr.height = 450;
    
    if (sourceType === 'demo') {
        // For demo image, we just keep the image drawn
        const img = document.querySelector('img[alt="Ultrasound"]') as HTMLImageElement;
        if (img) currCtx.drawImage(img, 0, 0, 600, 450);
    } else {
        currCtx.drawImage(video, 0, 0, 600, 450);
    }

    const imgData = currCtx.getImageData(0, 0, 600, 450);
    enhanceContrast(imgData.data);
    currCtx.putImageData(imgData, 0, 0);

    if (edgeCanvas.current) {
      const eCtx = edgeCanvas.current.getContext('2d');
      if (eCtx) {
        edgeCanvas.current.width = 600;
        edgeCanvas.current.height = 450;
        eCtx.drawImage(curr, 0, 0);
        applySobel(eCtx, 600, 450);
      }
    }
    return true;
  }, [sourceType]);

  const performRealTracking = () => {
    const prevCtx = prevFrameCanvas.current.getContext('2d', { willReadFrequently: true });
    const currCtx = currentFrameCanvas.current.getContext('2d', { willReadFrequently: true });
    if (!prevCtx || !currCtx || points.length === 0) return;

    setPoints(prevPoints => {
      const updated = prevPoints.map(pt => {
        const nextPos = trackSpeckle(prevCtx, currCtx, pt.current, 14, 28);
        const distInitial = Math.sqrt(Math.pow(pt.initial.x - 300, 2) + Math.pow(pt.initial.y - 225, 2));
        const distCurrent = Math.sqrt(Math.pow(nextPos.x - 300, 2) + Math.pow(nextPos.y - 225, 2));
        const localStrain = ((distCurrent - distInitial) / (distInitial || 1)) * 100;
        return { ...pt, current: nextPos, strain: localStrain };
      });
      const avgStrain = updated.reduce((acc, p) => acc + p.strain, 0) / updated.length;
      setHistory(h => [...h, { time: Date.now(), strain: avgStrain }].slice(-100));
      return updated;
    });
  };

  const animate = useCallback(() => {
    if (isPlaying && !draggedPointId) {
      if (sourceType === 'video' && isRealTracking) {
        if (updateBuffers()) performRealTracking();
      } else {
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
  }, [isPlaying, sourceType, isRealTracking, draggedPointId, showEdgeMap, points.length, updateBuffers]);

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
      setIsRealTracking(true);
      resetData();
    }
  };

  const handleAutoDetect = () => {
    updateBuffers();
    const eCtx = edgeCanvas.current?.getContext('2d');
    if (eCtx) {
      const detected = detectBorders(eCtx, 600, 450);
      setPoints(detected);
    }
  };

  const runAnalysis = () => {
    if (points.length === 0) return;
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
    setPoints([]);
    setAnalysis(null);
    if (videoRef.current) videoRef.current.currentTime = 0;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPlaying) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Hit detection for dragging
    const foundIdx = points.findIndex(pt => {
      const dx = pt.current.x - x;
      const dy = pt.current.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 15;
    });

    if (foundIdx !== -1) {
      setDraggedPointId(points[foundIdx].id);
    } else {
      // Manual Placement: Add new point
      const newPoint: TrackingPoint = {
        id: `manual-${Date.now()}`,
        initial: { x, y },
        current: { x, y },
        velocity: { x: 0, y: 0 },
        strain: 0
      };
      setPoints(prev => [...prev, newPoint]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedPointId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints(prev => prev.map(pt => {
      if (pt.id === draggedPointId) return { ...pt, initial: { x, y }, current: { x, y }, strain: 0 };
      return pt;
    }));
  };

  const handleMouseUp = () => setDraggedPointId(null);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-blue-500/30">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/mp4" className="hidden" />
      
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Logo" className="h-10 w-auto object-contain" />
          <div className="h-8 w-[1px] bg-slate-800 mx-1 hidden sm:block" />
          <div>
            <h1 className="font-bold text-lg tracking-tight">CardiaStrain</h1>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Speckle Tracking</p>
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
             ><Zap size={10} /> PIXEL TRACKING</button>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all">
            <Upload size={16} /> Import Scan
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl group flex items-center justify-center">
            {sourceType === 'demo' ? (
              <img src="https://images.unsplash.com/photo-1579154235602-3c306869762a?auto=format&fit=crop&q=80&w=1200" className="w-full h-full object-cover opacity-40 grayscale blur-sm pointer-events-none" alt="Ultrasound" />
            ) : (
              <video ref={videoRef} src={videoUrl || undefined} crossOrigin="anonymous" loop muted playsInline className={`w-full h-full object-contain pointer-events-none ${showEdgeMap ? 'hidden' : 'block'}`} />
            )}
            
            {showEdgeMap && (
              <canvas ref={edgeCanvas} className="w-full h-full object-contain pointer-events-none" />
            )}
            
            <div 
              className={`absolute inset-0 flex items-center justify-center ${!isPlaying ? 'cursor-crosshair' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
               <div className="relative w-[600px] h-[450px]">
                  <TrackingOverlay points={points} width={600} height={450} showVectors={showVectors} />
                  <div className="absolute inset-0 pointer-events-none border-[30px] border-black/30 rounded-full" />
               </div>
            </div>
            
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
                  {isRealTracking ? 'Active Correlation' : 'Simulated Motion'}
                </span>
              </div>
              {!isPlaying && (
                <div className="flex items-center gap-2 bg-amber-500/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-amber-500/30">
                  <Move size={12} className="text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-tight">
                    Manual Placement Mode
                  </span>
                </div>
              )}
            </div>

            <div className="absolute top-6 right-6 flex items-center gap-2">
              <button 
                onClick={() => setPoints([])}
                className="p-2 rounded-lg bg-black/60 border border-slate-700 text-slate-400 hover:text-red-400 transition-all"
                title="Clear All Markers"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={() => setShowEdgeMap(!showEdgeMap)}
                className={`p-2 rounded-lg border transition-all ${showEdgeMap ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black/60 border-slate-700 text-slate-400 hover:text-indigo-400'}`}
                title="Toggle Edge Detection"
              >
                {showEdgeMap ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              {!isPlaying && (
                <button 
                  onClick={handleAutoDetect}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 border border-emerald-500 text-white font-bold text-[10px] uppercase transition-all hover:bg-emerald-500"
                  title="Auto-Detect Borders"
                >
                  <Crosshair size={14} /> Detect Borders
                </button>
              )}
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-6 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={resetData} className="p-2 text-slate-400 hover:text-white" title="Reset Simulation"><RefreshCw size={20} /></button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-transform active:scale-95">
                {isPlaying ? <Pause fill="white" size={24} /> : <Play fill="white" size={24} className="ml-1" />}
              </button>
              <button onClick={runAnalysis} disabled={isCalculating || points.length === 0} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl disabled:opacity-50">
                <Activity size={18} className="text-emerald-400" /> Calculate Strain
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrainChart data={history} />
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-6">
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Current GLS</span>
                    <span className="text-3xl font-bold text-blue-400 tabular-nums">
                      {history.length > 0 ? history[history.length-1].strain.toFixed(1) : '0.0'}%
                    </span>
                 </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Active Points</span>
                    <span className="text-3xl font-bold text-indigo-400 tabular-nums">{points.length}</span>
                 </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-slate-400">
                    <ScanLine size={14} className="text-blue-500" />
                    <span className="text-[10px] font-bold uppercase">Dynamic Speckle Engine</span>
                 </div>
                 <span className="text-[10px] text-slate-600 font-mono uppercase">Mode: {isPlaying ? 'Tracking' : 'Setup'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-3"><ClipboardList className="text-blue-400" size={20} /><h2 className="font-bold uppercase tracking-tight">Clinical Report</h2></div>
               {isCalculating && <RefreshCw size={16} className="animate-spin text-slate-500" />}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {analysis ? (
                <>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cardiac Function</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-emerald-400`}>
                        {analysis.gls < -15 ? 'NORMAL' : 'REDUCED'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed italic">
                      "Myocardial analysis identifies peak global longitudinal shortening of {analysis.gls.toFixed(1)}%. Regional strain distribution follows a healthy pattern."
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-6 text-center">AHA Segmental Polar Map</h4>
                    <div className="flex justify-center p-2"><BullsEyeChart segmentData={analysis.segments.detailed} /></div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                   <Activity size={32} className="text-slate-600 mb-4" />
                   <h3 className="text-sm font-semibold text-slate-400 uppercase">Analysis Pending</h3>
                   <div className="text-xs text-slate-500 mt-4 space-y-4 px-6 text-left border-l border-slate-800">
                      <p>1. <span className="text-slate-300">Detect Borders</span> or click to place tracking markers manually.</p>
                      <p>2. Toggle the <span className="text-indigo-400 font-bold">Eye</span> icon to help see wall boundaries.</p>
                      <p>3. Press <span className="text-blue-400 font-bold">Play</span> to start tracking pixel displacement.</p>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
           <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Footer Logo" className="h-6 w-auto opacity-50" />
           <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">Scientific Myocardial Strain Platform</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
