
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, Activity, Heart, ShieldAlert, Cpu, Share2, Info, ChevronRight, Upload, Video, FileVideo } from 'lucide-react';
import { TrackingPoint, AnalysisResult, AIInsight } from './types';
import { generateContourPoints, simulateHeartbeat } from './utils/motion';
import { getClinicalInsights } from './services/geminiService';
import TrackingOverlay from './components/TrackingOverlay';
import StrainChart from './components/StrainChart';

const App: React.FC = () => {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState(0);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [history, setHistory] = useState<{ time: number; strain: number }[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [showVectors, setShowVectors] = useState(true);
  
  // Video Source State
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'demo' | 'video'>('demo');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize tracking points
  useEffect(() => {
    setPoints(generateContourPoints(600, 450));
  }, []);

  // Sync video playback with isPlaying state
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(e => console.warn("Playback prevented:", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoUrl]);

  // Animation Loop
  const animate = useCallback(() => {
    if (isPlaying) {
      setPhase(prev => {
        let next;
        // If we have a video, sync phase to video time for realistic tracking overlay
        if (sourceType === 'video' && videoRef.current) {
          next = videoRef.current.currentTime * 5; // Scaling factor for the sin function
        } else {
          next = prev + 0.08;
        }

        const currentStrain = Math.sin(next) * -18; // Simulated GLS
        
        setPoints(pts => simulateHeartbeat(pts, next));
        setHistory(h => {
          const newHistory = [...h, { time: next, strain: currentStrain }];
          return newHistory.slice(-100); // Keep last 100 frames
        });
        
        return next;
      });
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, sourceType]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  // Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'video/mp4') {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setSourceType('video');
      setIsPlaying(false);
      setPhase(0);
      setHistory([]);
      setAiInsight(null);
      setAnalysis(null);
    } else if (file) {
      alert("Please upload an MP4 video file.");
    }
  };

  // Capture current frame for Gemini
  const captureFrame = (): string | undefined => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || sourceType !== 'video') return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  };

  // Handle Analysis Trigger
  const runAnalysis = async () => {
    setIsLoadingInsight(true);
    const mockResult: AnalysisResult = {
      gls: -18.4,
      ef: 55,
      hr: 72,
      timestamp: Date.now(),
      segments: { basal: -15.2, mid: -19.4, apical: -22.1 }
    };
    setAnalysis(mockResult);

    const frameBase64 = captureFrame();
    
    // Call Gemini
    const insight = await getClinicalInsights(mockResult, frameBase64);
    setAiInsight(insight);
    setIsLoadingInsight(false);
  };

  const resetData = () => {
    setHistory([]);
    setPhase(0);
    setPoints(generateContourPoints(600, 450));
    setAiInsight(null);
    setAnalysis(null);
    if (videoRef.current) videoRef.current.currentTime = 0;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="video/mp4" 
        className="hidden" 
      />
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Navbar */}
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img 
              src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" 
              alt="Ameliasoft Logo" 
              className="h-10 w-auto object-contain brightness-110 contrast-125"
            />
            <div className="h-8 w-[1px] bg-slate-800 mx-1 hidden sm:block" />
            <div>
              <h1 className="font-bold text-lg tracking-tight">CardiaStrain<span className="text-blue-500">AI</span></h1>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Speckle Tracking Dashboard</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-400">
            <button className="hover:text-white transition-colors">Patient Records</button>
            <button className="hover:text-white transition-colors">Protocols</button>
            <button className="hover:text-white transition-colors">Archive</button>
          </div>
          <div className="h-8 w-[1px] bg-slate-800" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-900/20"
          >
            <Upload size={16} />
            Import Scan (MP4)
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        
        {/* Left Column: Imaging Center */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Main Viewer */}
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl group flex items-center justify-center">
            {sourceType === 'demo' ? (
              <img 
                src="https://images.unsplash.com/photo-1579154235602-3c306869762a?auto=format&fit=crop&q=80&w=1200" 
                className="w-full h-full object-cover opacity-40 grayscale blur-sm"
                alt="Ultrasound Background"
              />
            ) : (
              <video 
                ref={videoRef}
                src={videoUrl || undefined}
                loop
                muted
                playsInline
                className="w-full h-full object-contain"
              />
            )}
            
            {/* Realtime Canvas Layer */}
            <div className="absolute inset-0 flex items-center justify-center">
               <div ref={containerRef} className="relative w-[600px] h-[450px]">
                  <TrackingOverlay 
                    points={points} 
                    width={600} 
                    height={450} 
                    showVectors={showVectors}
                  />
                  {/* Heart Boundary Mask (Visual Only) */}
                  <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40 rounded-full" />
               </div>
            </div>

            {/* Viewer HUD */}
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-red-500 animate-ping' : 'bg-slate-600'}`} />
                <span className="text-xs font-mono text-slate-300">
                  {sourceType === 'video' ? 'VIDEO SOURCE ACTIVE' : 'SIMULATION MODE'}
                </span>
              </div>
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/50 text-[11px] font-mono text-slate-400">
                FRAME: {Math.floor(phase * 10) % 60} / 60 <br/>
                TYPE: {sourceType.toUpperCase()} <br/>
                ENGINE: STE-v4.2
              </div>
            </div>

            <div className="absolute top-6 right-6 flex items-center gap-2">
               <button 
                  onClick={() => setShowVectors(!showVectors)}
                  className={`p-2 rounded-lg border transition-all ${showVectors ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/60 border-slate-700 text-slate-400'}`}
                  title="Toggle Displacement Vectors"
                >
                  <Share2 size={18} />
               </button>
               {sourceType === 'video' && (
                 <button 
                  onClick={() => { setSourceType('demo'); setVideoUrl(null); }}
                  className="p-2 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-600/30 transition-all"
                  title="Clear Video"
                 >
                   <FileVideo size={18} />
                 </button>
               )}
            </div>

            {/* Controls Bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-6 py-3 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <button 
                onClick={resetData}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCw size={20} />
              </button>
              <div className="h-6 w-[1px] bg-slate-700" />
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-transform active:scale-95"
              >
                {isPlaying ? <Pause fill="white" size={24} /> : <Play fill="white" size={24} className="ml-1" />}
              </button>
              <div className="h-6 w-[1px] bg-slate-700" />
              <button 
                onClick={runAnalysis}
                disabled={isLoadingInsight}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all border border-slate-600/50 disabled:opacity-50"
              >
                <Activity size={18} className="text-emerald-400" />
                Analyze Strain
              </button>
            </div>
          </div>

          {/* Secondary Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrainChart data={history} />
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Real-time Metrics</h3>
                <div className="grid grid-cols-2 gap-6">
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 font-bold">CURRENT GLS</span>
                      <span className="text-3xl font-bold text-blue-400 tabular-nums">
                        {history.length > 0 ? history[history.length-1].strain.toFixed(1) : '0.0'}%
                      </span>
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 font-bold">HEART RATE</span>
                      <span className="text-3xl font-bold text-emerald-400 tabular-nums">72 <span className="text-sm font-normal text-slate-500">BPM</span></span>
                   </div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-slate-400">
                    <Heart size={14} className="text-red-500 fill-red-500" />
                    <span className="text-xs">Stable Trace</span>
                 </div>
                 <span className="text-xs text-slate-600 italic">Processing Lag: 12ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Insights & Diagnostics */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Diagnostic Panel */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <Cpu className="text-indigo-400" size={20} />
                  </div>
                  <h2 className="font-bold">AI Clinical Analysis</h2>
               </div>
               {isLoadingInsight && <RefreshCw size={16} className="animate-spin text-slate-500" />}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {aiInsight ? (
                <>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Severity Status</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        aiInsight.severity === 'Normal' ? 'bg-emerald-500/10 text-emerald-500' :
                        aiInsight.severity === 'Mild' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-red-500/10 text-red-500'
                      }`}>
                        {aiInsight.severity}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed italic">
                      "{aiInsight.observation}"
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <ShieldAlert size={14} className="text-amber-500" />
                      Recommended Actions
                    </h4>
                    <div className="p-4 rounded-xl bg-blue-600/5 border border-blue-500/20">
                      <p className="text-sm text-blue-200">
                        {aiInsight.recommendation}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Segmental Distribution</h4>
                    <div className="flex justify-center py-4">
                      <div className="relative w-32 h-32 rounded-full border-4 border-slate-800 flex items-center justify-center">
                         <div className="absolute inset-2 rounded-full border-2 border-slate-800/50 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/30 flex items-center justify-center border border-emerald-500/50">
                               <span className="text-[10px] font-bold text-emerald-400">-22%</span>
                            </div>
                         </div>
                         <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500">APICAL</div>
                         <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500">BASAL</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                   <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                      <Activity size={32} className="text-slate-600" />
                   </div>
                   <h3 className="text-sm font-semibold text-slate-400">No active analysis</h3>
                   <p className="text-xs text-slate-500 mt-2 px-8">Run the strain analysis to generate AI insights and segmental mapping.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800">
              <button className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all">
                Generate Full Report
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Meta Information */}
          <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl shadow-indigo-900/20 text-white relative overflow-hidden">
            <div className="relative z-10">
               <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                    <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" className="w-6 h-auto brightness-200" alt="Amelia Logo Small" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider opacity-80">Ameliasoft Intelligence</span>
               </div>
               <p className="text-sm font-medium leading-snug">
                 Powered by the Ameliasoft proprietary myocardial deformation engine for automated echocardiographic assessment.
               </p>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          </div>
        </div>
      </main>

      <footer className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
           <img src="https://www.ameliasoft.net/assets/img/abstract/LogoAmeliasoftSinFondo1.png" alt="Ameliasoft Footer" className="h-6 w-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer" onClick={() => window.open('https://www.ameliasoft.net/', '_blank')} />
           <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">
             Research Use Only • Myocardial Deformation Engine v1.0.4
           </span>
        </div>
        <div className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2">
          Powered by <span className="text-slate-400">Gemini 3 Flash</span> & Ameliasoft Cloud
        </div>
      </footer>
    </div>
  );
};

export default App;
