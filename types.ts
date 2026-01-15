
export interface Vector2 {
  x: number;
  y: number;
}

export interface TrackingPoint {
  id: string;
  initial: Vector2;
  current: Vector2;
  velocity: Vector2;
  strain: number; // local deformation
}

export interface AnalysisResult {
  gls: number; // Global Longitudinal Strain
  ef: number; // Ejection Fraction (estimated)
  hr: number; // Heart Rate
  timestamp: number;
  segments: {
    basal: number;
    mid: number;
    apical: number;
    detailed: number[]; // 17 segments for Bull's Eye
  };
}

export interface AIInsight {
  observation: string;
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  recommendation: string;
}
