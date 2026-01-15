
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getClinicalInsights = async (data: AnalysisResult, frameBase64?: string) => {
  const prompt = `
    As a senior cardiologist specializing in echocardiography, analyze the following speckle tracking results:
    - Global Longitudinal Strain (GLS): ${data.gls}%
    - Estimated Ejection Fraction: ${data.ef}%
    - Heart Rate: ${data.hr} BPM
    - Segmental Strain: Basal(${data.segments.basal}%), Mid(${data.segments.mid}%), Apical(${data.segments.apical}%)

    Provide a concise clinical insight including:
    1. Observation of myocardial function.
    2. Severity assessment (Normal, Mild, Moderate, Severe).
    3. Potential diagnosis or recommendation for further imaging.
    Return the response in JSON format.
  `;

  const contents: any[] = [{ text: prompt }];
  if (frameBase64) {
    contents.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: frameBase64
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: contents },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            observation: { type: Type.STRING },
            severity: { type: Type.STRING, enum: ['Normal', 'Mild', 'Moderate', 'Severe'] },
            recommendation: { type: Type.STRING }
          },
          required: ['observation', 'severity', 'recommendation']
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return {
      observation: "AI analysis currently unavailable. Manual review required.",
      severity: "Moderate",
      recommendation: "Please ensure stable internet connection and valid clinical data."
    };
  }
};
