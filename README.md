# CardiaStrain AI - Clinical Myocardial Speckle Tracking

CardiaStrain is a high-precision medical imaging platform designed for echocardiography analysis. It utilizes advanced computer vision techniques to perform non-invasive myocardial strain analysis and volumetric assessment of the left ventricle.

## 🚀 Current Capabilities

### 1. Biplane Simpson's Protocol
The system implements the **Biplane Method of Disks (Simpson's Rule)** by allowing simultaneous analysis of:
- **Apical 4-Chamber (A4C)** view
- **Apical 2-Chamber (A2C)** view
By integrating fractional area changes from both orthogonal planes, the system provides a clinically robust estimation of Left Ventricular Ejection Fraction (LVEF).

### 2. High-Precision Speckle Tracking
- **Synchronous Frame Engine**: Unlike standard video players, the engine manually steps through every video frame (Locked at 30 FPS or native rate), ensuring 1:1 data capture without skipped frames.
- **SAD (Sum of Absolute Differences)**: Implements block-matching algorithms to track acoustic markers (speckles) in the myocardium throughout the cardiac cycle.
- **ROI-Guided Auto-Detection**: Users define a Region of Interest (ROI), and the system automatically identifies myocardial wall boundaries for tracking.

### 3. Clinical Metrics & Visualization
- **Global Longitudinal Strain (GLS)**: Real-time calculation and graphing of longitudinal shortening.
- **AHA 17-Segment Polar Map**: A "BullsEye" chart visualizing segmental strain values according to American Heart Association standards.
- **Diagnostic Overlays**: Real-time edge-detection masks and strain color-coding (Emerald for healthy contraction, Red for hypokinesia).

## 🛠 Technical Architecture
- **Frontend**: React 19 with Tailwind CSS for a high-fidelity clinical UI.
- **Motion Engine**: Pure TypeScript implementation of speckle tracking and image processing (Sobel filters, Contrast enhancement).
- **Data Visualization**: Recharts for strain curves and custom SVG rendering for the BullsEye segment map.
- **Icons**: Lucide-React for intuitive clinical navigation.

## 📖 Usage Instructions
1. **Import**: Upload two separate MP4/MOV clips (one A4C, one A2C).
2. **Define**: Drag a rectangle over the Left Ventricular cavity in both viewports to set the search space.
3. **Analyze**: Click "Run Biplane Analysis". The system will pause video playback and process each frame synchronously.
4. **Report**: Review the integrated LVEF and the segmental strain distribution in the clinical report sidebar.

---
*Disclaimer: This is a scientific research tool. All measurements are derived from digital pixel analysis and should be correlated with clinical findings by a certified cardiologist.*