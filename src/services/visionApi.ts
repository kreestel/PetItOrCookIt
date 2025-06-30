import { ImageCategory, VisionApiResponse, GoogleVisionResponse } from '../types/vision';
import { ANIMAL_KEYWORDS, HUMAN_KEYWORDS, SELFIE_INDICATORS } from '../constants';

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

export async function classifyImage(imageBase64: string): Promise<VisionApiResponse> {
  const apiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY;
  
  if (!apiKey) {
    console.warn('Google Vision API key not found, using mock classification');
    return mockClassifyImage(imageBase64);
  }

  try {
    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const requestBody = {
      requests: [
        {
          image: {
            content: base64Data
          },
          features: [
            {
              type: 'LABEL_DETECTION',
              maxResults: 20
            },
            {
              type: 'FACE_DETECTION',
              maxResults: 10
            }
          ]
        }
      ]
    };

    const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Vision API request failed: ${response.status}`);
    }

    const data = await response.json();
    const result = data.responses[0] as GoogleVisionResponse;

    if (result.error) {
      throw new Error(`Vision API error: ${result.error.message}`);
    }

    return analyzeVisionResults(result);
  } catch (error) {
    console.error('Vision API error:', error);
    // Fallback to mock classification
    return mockClassifyImage(imageBase64);
  }
}

function analyzeVisionResults(result: GoogleVisionResponse): VisionApiResponse {
  const labels = result.labelAnnotations || [];
  const faces = result.faceAnnotations || [];
  
  // Extract label descriptions and scores
  const labelDescriptions = labels.map(label => label.description.toLowerCase());
  const labelScores = labels.reduce((acc, label) => {
    acc[label.description.toLowerCase()] = label.score;
    return acc;
  }, {} as Record<string, number>);

  // Check for faces
  const hasFaces = faces.length > 0;
  const faceCount = faces.length;
  
  // Calculate category scores
  let animalScore = 0;
  let humanScore = 0;
  let selfieScore = 0;

  // Score based on labels
  labelDescriptions.forEach(label => {
    if (ANIMAL_KEYWORDS.some(keyword => label.includes(keyword))) {
      animalScore += labelScores[label] || 0;
    }
    if (HUMAN_KEYWORDS.some(keyword => label.includes(keyword))) {
      humanScore += labelScores[label] || 0;
    }
    if (SELFIE_INDICATORS.some(keyword => label.includes(keyword))) {
      selfieScore += labelScores[label] || 0;
    }
  });

  // Boost human score if faces are detected, as this is a strong indicator.
  if (hasFaces) {
    humanScore += 0.3;
    // If a single, clear face is detected, it's highly likely to be a selfie.
    if (faceCount === 1 && faces[0].detectionConfidence > 0.8) {
      selfieScore += 0.4;
    }
  }

  // Find the top two scores and their categories
  const scores = [
    { category: 'animal', score: animalScore },
    { category: 'human', score: humanScore },
    { category: 'selfie', score: selfieScore }
  ];
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];

  // 1. If all scores are below 0.3, it's 'other'
  if (animalScore < 0.3 && humanScore < 0.3 && selfieScore < 0.3) {
    return {
      category: 'other',
      confidence: 1.0 - Math.max(animalScore, humanScore, selfieScore),
      labels: labelDescriptions
    };
  }

  // 2. Only classify as animal/human/selfie if top score is at least 0.15 higher than the next highest
  if (top.score - second.score < 0.15) {
    return {
      category: 'other',
      confidence: 1.0 - Math.max(animalScore, humanScore, selfieScore),
      labels: labelDescriptions
    };
  }

  // 3. If animal is top and > 0.3, it's animal
  if (top.category === 'animal' && top.score > 0.3) {
    return {
      category: 'animal',
      confidence: animalScore,
      labels: labelDescriptions
    };
  }

  // 4. If human is top and > 0.3, check for selfie
  if (top.category === 'human' && top.score > 0.3) {
    if (selfieScore > 0.3) {
      return {
        category: 'selfie',
        confidence: Math.min(selfieScore + humanScore, 1.0),
        labels: labelDescriptions
      };
    }
    return {
      category: 'human',
      confidence: humanScore,
      labels: labelDescriptions
    };
  }

  // 5. If selfie is top and > 0.3, it's selfie
  if (top.category === 'selfie' && top.score > 0.3) {
    return {
      category: 'selfie',
      confidence: selfieScore,
      labels: labelDescriptions
    };
  }

  // 6. Fallback to other
  return {
    category: 'other',
    confidence: 1.0 - Math.max(animalScore, humanScore, selfieScore),
    labels: labelDescriptions
  };
}

// Mock classification for development/fallback
function mockClassifyImage(imageBase64: string): Promise<VisionApiResponse> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simple mock logic based on image size or random for demo
      const categories: ImageCategory[] = ['animal', 'human', 'selfie', 'other'];
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      
      resolve({
        category: randomCategory,
        confidence: 0.7 + Math.random() * 0.3,
        labels: ['mock', 'classification']
      });
    }, 1000);
  });
}