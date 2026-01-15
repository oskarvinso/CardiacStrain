
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

export interface AnalysisResult {
  gls: number;
  ef: number;
  hr: number;
  timestamp: number;
  segments: {
    basal: number;
    mid: number;
    apical: number;
    detailed: number[];
  };
}

export interface AIInsight {
  observation: string;
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  recommendation: string;
}
