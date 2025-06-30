export type ImageCategory = 'animal' | 'human' | 'selfie' | 'other';

export interface VisionApiResponse {
  category: ImageCategory;
  confidence: number;
  labels?: string[];
}

export interface GoogleVisionLabel {
  description: string;
  score: number;
  topicality: number;
}

export interface GoogleVisionFace {
  detectionConfidence: number;
  landmarkingConfidence: number;
  joyLikelihood: string;
  sorrowLikelihood: string;
  angerLikelihood: string;
  surpriseLikelihood: string;
  underExposedLikelihood: string;
  blurredLikelihood: string;
  headwearLikelihood: string;
}

export interface GoogleVisionResponse {
  labelAnnotations?: GoogleVisionLabel[];
  faceAnnotations?: GoogleVisionFace[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}