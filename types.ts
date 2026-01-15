
export interface Vector2 {
  x: number;
  y: number;
}

export interface TrackingPoint {
  id: string;
  initial: Vector2;
  current: Vector2;
  velocity: Vector2;
  strain: number;
}

export interface ViewAnalysis {
  gls: number;
  ef: number;
  maxArea: number;
  minArea: number;
  history: { time: number; strain: number }[];
  points: TrackingPoint[];
  mask: ImageData | null;
}

export interface AnalysisResult {
  biplaneEf: number;
  a4c: ViewAnalysis;
  a2c: ViewAnalysis;
  hr: number;
  timestamp: number;
  segments: {
    detailed: number[];
  };
}
