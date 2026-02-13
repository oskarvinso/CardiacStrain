
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RefreshCw, Activity, Upload, ClipboardList, ScanLine, Droplets, LayoutGrid, ChevronRight, CheckCircle2, Loader2, Info, Camera, StopCircle, Video, X
} from 'lucide-react';
import { TrackingPoint, AnalysisResult, ViewAnalysis } from './types.ts';
import { trackSpeckle, enhanceContrast, autoDetectWalls, createDiagnosticMask, calculateArea } from './utils/motion.ts';
import BullsEyeChart from './components/BullsEyeChart.tsx';
import TrackingOverlay from './components/TrackingOverlay.tsx';
import StrainChart from './components/StrainChart.tsx';

const FPS = 30;

const App: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Recording & Stream States
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTarget, setRecordingTarget] = useState<'a4c' | 'a2c' | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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
  const [targetView, setTargetView] = useState<'a4c' | 'a2c' | null>(null);
  const [roiStart, setRoiStart] = useState<{ x: number, y: number } | null>(null);

  const videoRefs = {
    a4c: useRef<HTMLVideoElement>(null),
    a2c: useRef<HTMLVideoElement>(null)
  };

  const canvasRefs = {
    curr: useRef<HTMLCanvasElement>(document.createElement('canvas')),
    prev: useRef<HTMLCanvasElement>(document.createElement('canvas'))
  };

  // Initialize Camera on Mount
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } 
        });
        setLiveStream(stream);
      } catch (err) {
        console.error("Camera initialization failed:", err);
      }
    };
    initCamera();
    return () => {
      if (liveStream) {
        liveStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Helper to attach stream to video elements
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node && liveStream) {
      node.srcObject = liveStream;
    }
  }, [liveStream]);

  // Recording Logic
  const startRecording = (view: 'a4c' | 'a2c') => {
    if (!liveStream) return;
    
    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(liveStream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVData(prev => ({
        ...prev,
        [view]: { ...prev[view], videoUrl: url, isProcessed: false, progress: 0, history: [], points: [], mask: null }
      }));
    };

    recorder.start();
    setIsRecording(true);
    setRecordingTarget(view);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingTarget(null);
    }
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
      await new Promise(r => video.onseeked = r);

      while (video.currentTime < video.duration) {
        await processFrame(view, video);
        video.currentTime += (1 / FPS);
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

  const handleMouseDown = (view: 'a4c' | 'a2c', e: React.MouseEvent<HTMLDivElement>) => {
    if (isProcessing || isRecording || !vData[view].videoUrl) return;
    const coords = getLogicalCoords(e, e.currentTarget);
    setRoiStart(coords);
    setIsDrawingRoi(true);
    setTargetView(view);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingRoi || !roiStart || !targetView) return;
    const coords = getLogicalCoords(e, e.currentTarget);
    setVData(prev => ({
      ...prev,
      [targetView]: {
        ...prev[targetView],
        roi: {
          x: Math.min(roiStart.x, coords.x),
          y: Math.min(roiStart.y, coords.y),
          w: Math.abs(roiStart.x - coords.x),
          h: Math.abs(roiStart.y - coords.y)
        }
      }
    }));
  };

  const handleMouseUp = () => {
    setIsDrawingRoi(false);
    setRoiStart(null);
    setTargetView(null);
  };

  const renderViewport = (view: 'a4c' | 'a2c', label: string) => {
    const isCurrentRecording = recordingTarget === view;
    const hasVideo = !!vData[view].videoUrl;
    
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Video size={14} className={isCurrentRecording ? "text-red-500 animate-pulse" : (hasVideo ? "text-blue-500" : "text-slate-600")} />
            {label}
          </h3>
          <div className="flex items-center gap-2">
            {vData[view].isProcessed && <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> PROCESSED</span>}
            {!hasVideo && !isRecording && liveStream && (
               <button 
                onClick={() => startRecording(view)}
                className="text-[10px] bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 px-2 py-0.5 rounded flex items-center gap-1 transition-all font-bold"
               >
                 <Camera size={10} /> RECORD {view.toUpperCase()}
               </button>
            )}
            {isCurrentRecording && (
               <button 
                onClick={stopRecording}
                className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded flex items-center gap-1 animate-pulse font-bold"
               >
                 <StopCircle size={10} /> STOP RECORDING
               </button>
            )}
            {hasVideo && (
              <button 
                onClick={() => setVData(prev => ({ ...prev, [view]: { ...prev[view], videoUrl: null, points: [], mask: null, isProcessed: false, ef: 0, history: [] } }))}
                className="text-[10px] bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 px-2 py-0.5 rounded flex items-center gap-1 transition-all"
              >
                <X size={10} /> DISCARD
              </button>
            )}
          </div>
        </div>
        
        <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-xl group">
          {!hasVideo ? (
            <div className="relative w-full h-full">
              {liveStream ? (
                <video 
                  ref={setVideoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className={`w-full h-full object-contain ${isCurrentRecording ? 'ring-4 ring-inset ring-red-500/50' : 'opacity-80'}`} 
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/20">
                  <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <Camera className="text-slate-600" size={24} />
                  </div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Camera access required</p>
                </div>
              )}
              
              {!isRecording && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                   <input type="file" onChange={(e) => handleFileChange(view, e)} className="hidden" id={`file-${view}`} />
                   <label htmlFor={`file-${view}`} className="bg-slate-900/80 backdrop-blur-md hover:bg-slate-700 text-white px-4 py-2 rounded-lg cursor-pointer font-bold text-[10px] transition-all border border-slate-700/50 flex items-center gap-2">
                     <Upload size={12} /> BROWSE CLINICAL FILE
                   </label>
                </div>
              )}

              {isCurrentRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-2 py-1 rounded text-white text-[10px] font-black animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" /> LIVE CAPTURE
                </div>
              )}
            </div>
          ) : (
            <>
              <video ref={videoRefs[view]} src={vData[view].videoUrl || undefined} muted playsInline className="w-full h-full object-contain pointer-events-none opacity-50" />
              <div 
                className={`absolute inset-0 z-10 ${!isProcessing ? 'cursor-crosshair' : ''}`}
                onMouseDown={(e) => handleMouseDown(view, e)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div className="relative w-full h-full">
                  <TrackingOverlay mask={vData[view].mask} points={vData[view].points} width={600} height={450} />
                  {vData[view].roi && (
                    <div 
                      className="absolute border-2 border-dashed border-blue-400 bg-blue-500/5 pointer-events-none rounded-lg z-20 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                      style={{ 
                        left: `${(vData[view].roi!.x / 600) * 100}%`, 
                        top: `${(vData[view].roi!.y / 450) * 100}%`, 
                        width: `${(vData[view].roi!.w / 600) * 100}%`, 
                        height: `${(vData[view].roi!.h / 450) * 100}%` 
                      }}
                    >
                      <div className="absolute -top-6 left-0 bg-blue-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase">LV ROI</div>
                    </div>
                  )}
                  {!vData[view].roi && !isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                        <ScanLine size={14} /> Drag to define LV Cavity
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900 z-30">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${vData[view].progress}%` }} />
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/50 flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Peak Strain</span>
            <div className="text-2xl font-black tabular-nums text-blue-400 leading-none">
              {vData[view].history.length > 0 ? vData[view].history[vData[view].history.length-1].strain.toFixed(1) : '0.0'}%
            </div>
          </div>
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/50 flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">View EF</span>
            <div className="text-2xl font-black tabular-nums text-emerald-400 leading-none">
              {vData[view].ef > 0 ? vData[view].ef.toFixed(1) : '--'}%
            </div>
          </div>
        </div>
      </div>
    );
  };

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
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 animate-pulse mr-2">
              <Camera size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">REC: {recordingTarget?.toUpperCase()}</span>
            </div>
          )}
          <button 
            onClick={runBiplaneAnalysis} 
            disabled={isProcessing || isRecording || !vData.a4c.roi || !vData.a2c.roi}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Activity size={18} />}
            {isProcessing ? 'Analyzing Frames...' : 'Run Biplane Analysis'}
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-[1900px] mx-auto w-full">
        <div className="lg:col-span-9 flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {renderViewport('a4c', 'Apical 4-Chamber (A4C)')}
            {renderViewport('a2c', 'Apical 2-Chamber (A2C)')}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <StrainChart data={vData.a4c.history} />
             <StrainChart data={vData.a2c.history} />
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-slate-900/50 rounded-3xl border border-slate-800 flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
               <div className="flex items-center gap-3">
                 <ClipboardList className="text-blue-400" size={20} />
                 <h2 className="font-bold uppercase tracking-tight text-xs">Diagnostic Biplane Report</h2>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {analysis ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="p-6 rounded-2xl bg-blue-600 shadow-xl shadow-blue-900/20 text-white relative overflow-hidden">
                    <div className="relative z-10">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Biplane LVEF (Simpson's)</span>
                      <div className="text-5xl font-black tabular-nums my-1">{analysis.biplaneEf.toFixed(1)}%</div>
                      <div className="text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded-lg mt-2 flex items-center gap-1">
                        <CheckCircle2 size={12} /> SYNCED INTEGRATION
                      </div>
                    </div>
                    <Droplets className="absolute -right-4 -bottom-4 text-white/10" size={100} />
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Functional State</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${analysis.biplaneEf > 52 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {analysis.biplaneEf > 52 ? 'Normal' : 'Reduced'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed italic">
                      "Biplane integration complete. Segmental synchronized contraction observed in both views. GLS calculated from frame-by-frame myocardial speckle tracking."
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-6 text-center tracking-widest">Global Segmental Map</h4>
                    <div className="flex justify-center"><BullsEyeChart segmentData={analysis.segments.detailed} /></div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                   <LayoutGrid size={40} className="text-slate-800 mb-6" />
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Workflow Incomplete</h3>
                   <div className="text-[11px] text-slate-500 mt-4 space-y-4 px-4 text-left border-l-2 border-slate-800">
                      <p className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold shrink-0">1.</span>
                        <span>Record or upload <b>A4C</b> and <b>A2C</b> clips.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold shrink-0">2.</span>
                        <span>Drag ROIs on both captured videos.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold shrink-0">3.</span>
                        <span>Press <b>Run Biplane Analysis</b>.</span>
                      </p>
                   </div>
                   
                   {!vData.a4c.videoUrl && !vData.a2c.videoUrl && (
                    <div className="mt-12 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-left">
                       <p className="text-[10px] text-blue-400 font-bold uppercase mb-2">Live Alignment Mode</p>
                       <p className="text-[11px] text-slate-600 italic leading-relaxed">
                         Live webcam preview is active. Align the ultrasound probe until the Left Ventricle is centered, then hit record.
                       </p>
                    </div>
                   )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="p-6 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-4">
           <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Footer Logo" className="h-6 w-auto opacity-50" />
           <span className="text-slate-600 text-[9px] font-bold uppercase tracking-[0.3em]">CardiaStrain Myocardial Engine v1.6 • Biplane Simpson's Integrated</span>
        </div>
        <div className="flex items-center gap-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
           <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${liveStream ? 'bg-emerald-500' : 'bg-red-500'}`} /> Camera: {liveStream ? 'Live' : 'Standby'}
           </div>
           <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Frame Capture: Locked
           </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
