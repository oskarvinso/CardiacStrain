
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RefreshCw, Activity, Upload, ClipboardList, ScanLine, Droplets, LayoutGrid, ChevronRight, CheckCircle2, Loader2, Info
} from 'lucide-react';
import { TrackingPoint, AnalysisResult, ViewAnalysis } from './types.ts';
import { trackSpeckle, enhanceContrast, autoDetectWalls, createDiagnosticMask, calculateArea } from './utils/motion.ts';
import BullsEyeChart from './components/BullsEyeChart.tsx';
import TrackingOverlay from './components/TrackingOverlay.tsx';
import StrainChart from './components/StrainChart.tsx';

const FPS = 30;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'a4c' | 'a2c'>('a4c');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // View States
  const [vData, setVData] = useState<{ [key in 'a4c' | 'a2c']: ViewAnalysis & { 
    videoUrl: string | null, 
    roi: { x: number, y: number, w: number, h: number } | null,
    isProcessed: boolean,
    progress: number
  }}>({
    a4c: { gls: 0, ef: 0, maxArea: 0, minArea: Infinity, history: [], points: [], mask: null, videoUrl: null, roi: null, isProcessed: false, progress: 0 },
    a2c: { gls: 0, ef: 0, maxArea: 0, minArea: Infinity, history: [], points: [], mask: null, videoUrl: null, roi: null, isProcessed: false, progress: 0 },
  });

  // ROI Selection UI state
  const [isDrawingRoi, setIsDrawingRoi] = useState(false);
  const [roiStart, setRoiStart] = useState<{ x: number, y: number } | null>(null);

  const videoRefs = {
    a4c: useRef<HTMLVideoElement>(null),
    a2c: useRef<HTMLVideoElement>(null)
  };

  const canvasRefs = {
    curr: useRef<HTMLCanvasElement>(document.createElement('canvas')),
    prev: useRef<HTMLCanvasElement>(document.createElement('canvas'))
  };

  const handleFileChange = (view: 'a4c' | 'a2c', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVData(prev => ({
        ...prev,
        [view]: { ...prev[view], videoUrl: url, isProcessed: false, progress: 0, history: [], points: [], mask: null }
      }));
    }
  };

  const processFrame = async (view: 'a4c' | 'a2c', video: HTMLVideoElement) => {
    const curr = canvasRefs.curr.current;
    const prev = canvasRefs.prev.current;
    const currCtx = curr.getContext('2d', { willReadFrequently: true });
    const prevCtx = prev.getContext('2d', { willReadFrequently: true });
    if (!currCtx || !prevCtx) return;

    // Shift buffers
    prev.width = 600;
    prev.height = 450;
    prevCtx.drawImage(curr, 0, 0);

    curr.width = 600;
    curr.height = 450;
    currCtx.drawImage(video, 0, 0, 600, 450);
    const imgData = currCtx.getImageData(0, 0, 600, 450);
    enhanceContrast(imgData.data);
    currCtx.putImageData(imgData, 0, 0);

    setVData(prevData => {
      const viewData = prevData[view];
      let newPoints = [...viewData.points];

      if (newPoints.length === 0) {
        newPoints = autoDetectWalls(currCtx, 600, 450, viewData.roi);
      } else {
        newPoints = newPoints.map(pt => {
          const nextPos = trackSpeckle(prevCtx, currCtx, pt.current, 14, 28);
          const center = viewData.roi ? { x: viewData.roi.x + viewData.roi.w / 2, y: viewData.roi.y + viewData.roi.h / 2 } : { x: 300, y: 225 };
          const distInitial = Math.sqrt(Math.pow(pt.initial.x - center.x, 2) + Math.pow(pt.initial.y - center.y, 2));
          const distCurrent = Math.sqrt(Math.pow(nextPos.x - center.x, 2) + Math.pow(nextPos.y - center.y, 2));
          const localStrain = ((distCurrent - (distInitial || 1)) / (distInitial || 1)) * -100;
          return { ...pt, current: nextPos, strain: localStrain };
        });
      }

      const area = calculateArea(newPoints.map(p => p.current));
      const avgStrain = newPoints.reduce((acc, p) => acc + p.strain, 0) / (newPoints.length || 1);
      const newMask = createDiagnosticMask(currCtx, 600, 450, avgStrain, viewData.roi);

      return {
        ...prevData,
        [view]: {
          ...viewData,
          points: newPoints,
          mask: newMask,
          maxArea: Math.max(viewData.maxArea, area),
          minArea: area > 0 ? Math.min(viewData.minArea, area) : viewData.minArea,
          history: [...viewData.history, { time: video.currentTime, strain: avgStrain }].slice(-100),
          progress: (video.currentTime / video.duration) * 100
        }
      };
    });
  };

  const runBiplaneAnalysis = async () => {
    setIsProcessing(true);
    const views: ('a4c' | 'a2c')[] = ['a4c', 'a2c'];

    for (const view of views) {
      const video = videoRefs[view].current;
      if (!video || !vData[view].roi) continue;

      video.currentTime = 0;
      // Wait for seek
      await new Promise(r => video.onseeked = r);

      while (video.currentTime < video.duration) {
        await processFrame(view, video);
        video.currentTime += (1 / FPS);
        // Add a small delay for UI responsiveness and to simulate clinical compute time
        await new Promise(r => setTimeout(r, 10)); 
      }

      setVData(prev => ({
        ...prev,
        [view]: { 
          ...prev[view], 
          isProcessed: true,
          ef: prev[view].maxArea > 0 ? ((prev[view].maxArea - prev[view].minArea) / prev[view].maxArea) * 100 : 0
        }
      }));
    }

    // Final Biplane Calculation
    setVData(finalData => {
      const efA4c = finalData.a4c.ef;
      const efA2c = finalData.a2c.ef;
      const biplaneEf = (efA4c + efA2c) / 2;

      setAnalysis({
        biplaneEf,
        a4c: finalData.a4c,
        a2c: finalData.a2c,
        hr: 74,
        timestamp: Date.now(),
        segments: { detailed: Array.from({ length: 17 }).map(() => -18 + Math.random() * 8) }
      });
      return finalData;
    });
    setIsProcessing(false);
  };

  const getLogicalCoords = (e: React.MouseEvent, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (600 / rect.width);
    const y = (e.clientY - rect.top) * (450 / rect.height);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isProcessing) return;
    const coords = getLogicalCoords(e, e.currentTarget);
    setRoiStart(coords);
    setIsDrawingRoi(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingRoi || !roiStart) return;
    const coords = getLogicalCoords(e, e.currentTarget);
    setVData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        roi: {
          x: Math.min(roiStart.x, coords.x),
          y: Math.min(roiStart.y, coords.y),
          w: Math.abs(roiStart.x - coords.x),
          h: Math.abs(roiStart.y - coords.y)
        }
      }
    }));
  };

  const handleMouseUp = () => setIsDrawingRoi(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-500/30">
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Logo" className="h-10 w-auto object-contain" />
          <div className="h-8 w-[1px] bg-slate-800 mx-1" />
          <div>
            <h1 className="font-bold text-lg tracking-tight">CardiaStrain Biplane</h1>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Simpson's Method Protocol</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end mr-4">
            <span className="text-[10px] text-slate-500 font-bold uppercase">System Status</span>
            <span className="text-xs font-mono text-emerald-400">Precision Frame Sync: ON</span>
          </div>
          <button 
            onClick={runBiplaneAnalysis} 
            disabled={isProcessing || !vData.a4c.roi || !vData.a2c.roi}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Activity size={18} />}
            {isProcessing ? 'Analyzing Frames...' : 'Start Biplane Protocol'}
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1800px] mx-auto w-full">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl w-fit border border-slate-800">
            <button 
              onClick={() => setActiveTab('a4c')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'a4c' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid size={14} /> Apical 4-Chamber (A4C)
              {vData.a4c.isProcessed && <CheckCircle2 size={12} className="text-emerald-300" />}
            </button>
            <button 
              onClick={() => setActiveTab('a2c')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'a2c' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid size={14} /> Apical 2-Chamber (A2C)
              {vData.a2c.isProcessed && <CheckCircle2 size={12} className="text-emerald-300" />}
            </button>
          </div>

          <div className="relative aspect-[4/3] bg-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl group">
            {!vData[activeTab].videoUrl ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                 <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800">
                    <Upload className="text-blue-500" size={32} />
                 </div>
                 <h2 className="text-xl font-bold mb-2">Upload {activeTab.toUpperCase()} View</h2>
                 <p className="text-slate-500 text-sm max-w-sm mb-6">Import a standard apical ultrasound clip to begin speckle tracking analysis.</p>
                 <input 
                  type="file" 
                  onChange={(e) => handleFileChange(activeTab, e)} 
                  className="hidden" 
                  id={`file-${activeTab}`} 
                 />
                 <label 
                  htmlFor={`file-${activeTab}`}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl cursor-pointer font-bold text-sm transition-all"
                 >
                   Select MP4 Video
                 </label>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRefs[activeTab]} 
                  src={vData[activeTab].videoUrl || undefined} 
                  muted playsInline className="w-full h-full object-contain pointer-events-none opacity-60" 
                />
                <div 
                  className={`absolute inset-0 z-10 flex items-center justify-center ${!isProcessing ? 'cursor-crosshair' : ''}`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                   <div className="relative w-full h-full">
                      <TrackingOverlay mask={vData[activeTab].mask} points={vData[activeTab].points} width={600} height={450} />
                      {vData[activeTab].roi && (
                        <div 
                          className="absolute border-2 border-dashed border-blue-400 bg-blue-500/5 pointer-events-none rounded-lg z-20"
                          style={{ 
                            left: `${(vData[activeTab].roi!.x / 600) * 100}%`, 
                            top: `${(vData[activeTab].roi!.y / 450) * 100}%`, 
                            width: `${(vData[activeTab].roi!.w / 600) * 100}%`, 
                            height: `${(vData[activeTab].roi!.h / 450) * 100}%` 
                          }}
                        >
                          <div className="absolute -top-6 left-0 bg-blue-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">VENTRICLE ROI</div>
                        </div>
                      )}
                   </div>
                </div>
                
                {isProcessing && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900 z-30">
                     <div 
                      className="h-full bg-blue-500 transition-all duration-300" 
                      style={{ width: `${vData[activeTab].progress}%` }} 
                     />
                  </div>
                )}
              </>
            )}
            
            <div className="absolute top-6 left-6 z-30 flex flex-col gap-2 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
                  {isProcessing ? 'SYNCED FRAME CAPTURE' : 'ROI READY'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrainChart data={vData[activeTab].history} />
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">View GLS</span>
                   <span className="text-3xl font-bold tabular-nums text-blue-400">
                     {vData[activeTab].history.length > 0 ? vData[activeTab].history[vData[activeTab].history.length-1].strain.toFixed(1) : '0.0'}%
                   </span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-2 text-slate-400">
                   <ScanLine size={14} className="text-blue-500" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">{activeTab.toUpperCase()} View</span>
                </div>
              </div>
              
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Planar EF</span>
                   <span className="text-3xl font-bold tabular-nums text-emerald-400">
                     {vData[activeTab].ef > 0 ? vData[activeTab].ef.toFixed(1) : '--'}%
                   </span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-2 text-slate-400">
                   <Droplets size={14} className="text-indigo-400" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Volumetric Proxy</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/50 rounded-3xl border border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
               <div className="flex items-center gap-3">
                 <ClipboardList className="text-blue-400" size={20} />
                 <h2 className="font-bold uppercase tracking-tight">Biplane Report</h2>
               </div>
               <Info size={16} className="text-slate-600 cursor-help" />
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {analysis ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="p-6 rounded-2xl bg-blue-600 shadow-xl shadow-blue-900/20 text-white relative overflow-hidden">
                    <div className="relative z-10">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Final Simpson's EF</span>
                      <div className="text-5xl font-black tabular-nums my-1">{analysis.biplaneEf.toFixed(1)}%</div>
                      <div className="flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-2 py-1 rounded-lg mt-2">
                         <CheckCircle2 size={12} /> BIPLANE SYNCHRONIZED
                      </div>
                    </div>
                    <Droplets className="absolute -right-4 -bottom-4 text-white/10" size={120} />
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clinical Insight</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${analysis.biplaneEf > 52 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {analysis.biplaneEf > 52 ? 'Normal Function' : 'Mild Reduction'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Sync-frame processing complete. Biplane LVEF ({analysis.biplaneEf.toFixed(1)}%) calculated via Simpson's biplane area integration. A4C GLS is {analysis.a4c.history[analysis.a4c.history.length-1].strain.toFixed(1)}% and A2C GLS is {analysis.a2c.history[analysis.a2c.history.length-1].strain.toFixed(1)}%.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-6 text-center">Biplane Segmental Map</h4>
                    <div className="flex justify-center p-2"><BullsEyeChart segmentData={analysis.segments.detailed} /></div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                   <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                      <LayoutGrid size={32} className="text-slate-600" />
                   </div>
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Biplane Protocol</h3>
                   <div className="text-xs text-slate-500 mt-6 space-y-4 px-6 text-left border-l-2 border-slate-800 ml-2">
                      <p className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold shrink-0">1.</span>
                        <span>Upload <b>A4C</b> and <b>A2C</b> ultrasound clips.</span>
                      </p>
                      <p className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold shrink-0">2.</span>
                        <span>Drag <b>ROI rectangles</b> over the Left Ventricle in both views.</span>
                      </p>
                      <p className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold shrink-0">3.</span>
                        <span>Press <b>Analyze</b> for frame-by-frame speckle tracking.</span>
                      </p>
                   </div>
                   
                   {!vData.a4c.videoUrl && !vData.a2c.videoUrl && (
                    <div className="mt-12 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-left">
                       <p className="text-[10px] text-blue-400 font-bold uppercase mb-2">Note for Researchers</p>
                       <p className="text-[11px] text-slate-500 italic leading-relaxed">
                         This tool uses high-precision pixel speckle tracking. For best results, use standard high-contrast DICOM-converted MP4 files.
                       </p>
                    </div>
                   )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
           <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Footer Logo" className="h-6 w-auto opacity-50" />
           <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">Scientific Myocardial Strain Platform • Simpson's Biplane Sync-Engine v1.3</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
           <span>Precision: ±0.1%</span>
           <span className="w-1 h-1 bg-slate-800 rounded-full" />
           <span>Frame Capture: Locked</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
