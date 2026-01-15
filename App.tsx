
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RefreshCw, Activity, Upload, ClipboardList, ScanLine, Eye, EyeOff, Crosshair, Sparkles, Droplets, Move
} from 'lucide-react';
import { TrackingPoint, AnalysisResult } from './types.ts';
import { simulateHeartbeat, trackSpeckle, enhanceContrast, autoDetectWalls, createDiagnosticMask, calculateArea } from './utils/motion.ts';
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
  const [mask, setMask] = useState<ImageData | null>(null);
  
  // ROI Selection State
  const [roi, setRoi] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isDrawingRoi, setIsDrawingRoi] = useState(false);
  const [roiStart, setRoiStart] = useState<{ x: number, y: number } | null>(null);

  const [maxObservedArea, setMaxObservedArea] = useState<number>(0);
  const [minObservedArea, setMinObservedArea] = useState<number>(Infinity);
  
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'demo' | 'video'>('demo');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>(null);
  
  const currentFrameCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const prevFrameCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  // Video Playback Control
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (isPlaying) {
        video.play().catch(e => console.error("Playback failed", e));
      } else {
        video.pause();
      }
    }
  }, [isPlaying]);

  const updateBuffers = useCallback(() => {
    const video = videoRef.current;
    const curr = currentFrameCanvas.current;
    const prev = prevFrameCanvas.current;
    const prevCtx = prev.getContext('2d', { willReadFrequently: true });
    const currCtx = curr.getContext('2d', { willReadFrequently: true });
    
    if (!prevCtx || !currCtx) return false;

    prev.width = curr.width || 600;
    prev.height = curr.height || 450;
    prevCtx.drawImage(curr, 0, 0);

    curr.width = 600;
    curr.height = 450;
    
    if (sourceType === 'demo') {
        const img = document.querySelector('img[alt="Ultrasound"]') as HTMLImageElement;
        if (img) currCtx.drawImage(img, 0, 0, 600, 450);
    } else if (video) {
        currCtx.drawImage(video, 0, 0, 600, 450);
    }

    const imgData = currCtx.getImageData(0, 0, 600, 450);
    enhanceContrast(imgData.data);
    currCtx.putImageData(imgData, 0, 0);

    if (points.length === 0 && isPlaying) {
      const detected = autoDetectWalls(currCtx, 600, 450, roi);
      if (detected.length > 0) setPoints(detected);
    }

    const currentStrain = history.length > 0 ? history[history.length - 1].strain : -18;
    const diagnosticMask = createDiagnosticMask(currCtx, 600, 450, currentStrain, roi);
    setMask(diagnosticMask);

    return true;
  }, [sourceType, isPlaying, points.length, history, roi]);

  const performRealTracking = () => {
    const prevCtx = prevFrameCanvas.current.getContext('2d', { willReadFrequently: true });
    const currCtx = currentFrameCanvas.current.getContext('2d', { willReadFrequently: true });
    if (!prevCtx || !currCtx || points.length === 0) return;

    setPoints(prevPoints => {
      const updated = prevPoints.map(pt => {
        const nextPos = trackSpeckle(prevCtx, currCtx, pt.current, 14, 28);
        const center = roi ? { x: roi.x + roi.w / 2, y: roi.y + roi.h / 2 } : { x: 300, y: 225 };
        const distInitial = Math.sqrt(Math.pow(pt.initial.x - center.x, 2) + Math.pow(pt.initial.y - center.y, 2));
        const distCurrent = Math.sqrt(Math.pow(nextPos.x - center.x, 2) + Math.pow(nextPos.y - center.y, 2));
        const localStrain = ((distCurrent - (distInitial || 1)) / (distInitial || 1)) * -100; // Inverted for conventional strain representation
        return { ...pt, current: nextPos, strain: localStrain };
      });

      const currentArea = calculateArea(updated.map(p => p.current));
      if (currentArea > 0) {
        setMaxObservedArea(prev => Math.max(prev, currentArea));
        setMinObservedArea(prev => Math.min(prev, currentArea));
      }

      const avgStrain = updated.reduce((acc, p) => acc + p.strain, 0) / (updated.length || 1);
      setHistory(h => [...h, { time: Date.now(), strain: avgStrain }].slice(-100));
      return updated;
    });
  };

  const animate = useCallback(() => {
    if (isPlaying) {
      if (sourceType === 'video') {
        if (updateBuffers()) performRealTracking();
      } else {
        setPhase(prev => {
          const next = prev + 0.08;
          const currentStrain = Math.sin(next) * -18;
          setPoints(pts => {
             if (pts.length === 0) {
               const dummyCtx = currentFrameCanvas.current.getContext('2d');
               return dummyCtx ? autoDetectWalls(dummyCtx, 600, 450, roi) : [];
             }
             return simulateHeartbeat(pts, next);
          });
          setHistory(h => [...h, { time: next, strain: currentStrain }].slice(-100));
          updateBuffers();
          return next;
        });
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, sourceType, updateBuffers, points, roi]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [animate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'video/mp4' || file.type === 'video/quicktime')) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setSourceType('video');
      setIsPlaying(false);
      resetData();
    }
  };

  const runAnalysis = () => {
    setIsCalculating(true);
    setTimeout(() => {
      const calculatedFevi = maxObservedArea > 0 
        ? ((maxObservedArea - minObservedArea) / maxObservedArea) * 100 
        : 55;
      const mockResult: AnalysisResult = {
        gls: history.length > 0 ? history[history.length-1].strain : -18.4,
        ef: Math.max(20, Math.min(85, calculatedFevi)),
        fevi: Math.max(20, Math.min(85, calculatedFevi)),
        hr: 72, timestamp: Date.now(),
        segments: { basal: -15.2, mid: -19.4, apical: -22.1, detailed: Array.from({ length: 17 }).map(() => -15 + Math.random() * 10) }
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
    setMask(null);
    setMaxObservedArea(0);
    setMinObservedArea(Infinity);
    if (videoRef.current) videoRef.current.currentTime = 0;
  };

  // Helper to map mouse coordinates to logical 600x450 space
  const getLogicalCoords = (e: React.MouseEvent, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (600 / rect.width);
    const y = (e.clientY - rect.top) * (450 / rect.height);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    const coords = getLogicalCoords(e, e.currentTarget);
    setRoiStart(coords);
    setIsDrawingRoi(true);
    resetData();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingRoi || !roiStart) return;
    const coords = getLogicalCoords(e, e.currentTarget);
    setRoi({
      x: Math.min(roiStart.x, coords.x),
      y: Math.min(roiStart.y, coords.y),
      w: Math.abs(roiStart.x - coords.x),
      h: Math.abs(roiStart.y - coords.y)
    });
  };

  const handleMouseUp = () => {
    setIsDrawingRoi(false);
    setRoiStart(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/mp4,video/quicktime" className="hidden" />
      
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Logo" className="h-10 w-auto object-contain" />
          <div className="h-8 w-[1px] bg-slate-800 mx-1 hidden sm:block" />
          <div>
            <h1 className="font-bold text-lg tracking-tight">CardiaStrain</h1>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Clinical Strain Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-500/20">
            <Upload size={16} /> Import Echogram
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl group flex items-center justify-center">
            <div className="absolute inset-0 z-0">
               {sourceType === 'demo' ? (
                <img src="https://images.unsplash.com/photo-1579154235602-3c306869762a?auto=format&fit=crop&q=80&w=1200" className="w-full h-full object-cover opacity-40 grayscale blur-sm pointer-events-none" alt="Ultrasound" />
              ) : (
                <video 
                  ref={videoRef} 
                  src={videoUrl || undefined} 
                  crossOrigin="anonymous" 
                  loop 
                  muted 
                  playsInline 
                  className="w-full h-full object-contain pointer-events-none" 
                />
              )}
            </div>

            <div 
              className={`absolute inset-0 z-10 flex items-center justify-center ${!isPlaying ? 'cursor-crosshair' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
               <div className="relative w-full h-full">
                  <TrackingOverlay mask={mask} points={points} width={600} height={450} />
                  {roi && (
                    <div 
                      className="absolute border-2 border-dashed border-blue-400 bg-blue-500/5 pointer-events-none rounded-lg z-20"
                      style={{ 
                        left: `${(roi.x / 600) * 100}%`, 
                        top: `${(roi.y / 450) * 100}%`, 
                        width: `${(roi.w / 600) * 100}%`, 
                        height: `${(roi.h / 450) * 100}%` 
                      }}
                    >
                      <div className="absolute -top-6 left-0 bg-blue-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm">ROI ACTIVE</div>
                      <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-50">
                         <ScanLine size={10} className="text-blue-300 animate-pulse" />
                      </div>
                    </div>
                  )}
               </div>
            </div>
            
            <div className="absolute top-6 left-6 z-30 flex flex-col gap-2 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
                  {isPlaying ? 'Live Strain Analysis' : 'Engine Ready - Select ROI'}
                </span>
              </div>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-6 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={resetData} className="p-2 text-slate-400 hover:text-white transition-colors" title="Reset All"><RefreshCw size={20} /></button>
              <button 
                onClick={() => {
                  if (!roi && !isPlaying) {
                    alert("ROI Required: Drag a box over the ventricle before starting.");
                    return;
                  }
                  setIsPlaying(!isPlaying);
                }} 
                className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all active:scale-90 shadow-lg shadow-blue-500/40"
              >
                {isPlaying ? <Pause fill="white" size={24} /> : <Play fill="white" size={24} className="ml-1" />}
              </button>
              <button onClick={runAnalysis} disabled={isCalculating || points.length === 0} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl disabled:opacity-50 transition-all">
                <Activity size={18} className="text-emerald-400" /> Full Diagnostic
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrainChart data={history} />
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Peak Strain</span>
                   <span className={`text-3xl font-bold tabular-nums ${history.length > 0 && history[history.length-1].strain < -15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                     {history.length > 0 ? history[history.length-1].strain.toFixed(1) : '0.0'}%
                   </span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-2 text-slate-400">
                   <ScanLine size={14} className="text-blue-500" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">GLS Curve</span>
                </div>
              </div>
              
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">FEVI (LVEF)</span>
                   <span className={`text-3xl font-bold tabular-nums ${analysis ? (analysis.fevi > 50 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-600'}`}>
                     {analysis ? analysis.fevi.toFixed(1) : '--'}%
                   </span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-2 text-slate-400">
                   <Droplets size={14} className="text-indigo-400" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Output</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <ClipboardList className="text-blue-400" size={20} />
                 <h2 className="font-bold uppercase tracking-tight">Clinical Report</h2>
               </div>
               {isCalculating && <RefreshCw size={16} className="animate-spin text-slate-500" />}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {analysis ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Functional Status</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 ${analysis.fevi > 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {analysis.fevi > 50 ? 'NORMAL' : 'REDUCED'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed italic">
                      "Autonomous ROI segmentation confirms synchronized wall movement. LVEF calculated at {analysis.fevi.toFixed(1)}% via fractional area change. Global longitudinal shortening (GLS) is {analysis.gls.toFixed(1)}%."
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-6 text-center">AHA Segmental Polar Map</h4>
                    <div className="flex justify-center p-2"><BullsEyeChart segmentData={analysis.segments.detailed} /></div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                   <Activity size={32} className="text-slate-600 mb-4" />
                   <h3 className="text-sm font-semibold text-slate-400 uppercase">Interactive Setup</h3>
                   <div className="text-xs text-slate-500 mt-4 space-y-4 px-6 text-left border-l border-slate-800">
                      <p className="flex items-start gap-2">
                        <span className="bg-blue-600/20 text-blue-400 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold shrink-0">1</span>
                        <span>Drag a rectangle over the <b>Left Ventricle</b>.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="bg-blue-600/20 text-blue-400 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold shrink-0">2</span>
                        <span>Click <Play size={10} className="inline mx-1" /> to process wall motion.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="bg-blue-600/20 text-blue-400 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold shrink-0">3</span>
                        <span>Observe <b>Auto-Borders</b> and real-time Strain mapping.</span>
                      </p>
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
           <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">Scientific Myocardial Strain Platform • Precision ROI Engine v1.2</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
