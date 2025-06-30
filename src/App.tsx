import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, Share, ChevronDown, X, RotateCcw } from 'lucide-react';
import { classifyImage } from './services/visionApi';
import { ImageCategory } from './types/vision';
import html2canvas from 'html2canvas';

type Screen = 'home' | 'analyzing' | 'result';
type Result = 'PET' | 'COOK';

const ANALYSIS_LINES = [
  "Consulting grandma's recipe book...",
  "Calculating moral ambiguity...",
  "Calling local butcher for advice...",
  "Cross-checking with National Pet Registry...",
  "Googling: 'Is it illegal to cook this?'...",
  "Weighing emotional attachment vs. seasoning potential...",
  "Accessing forbidden recipes...",
  "Loading emotional regret projections...",
  "Will Grandma Approve???..."
];

const REDDIT_CAPTIONS = [
  "AITA for agreeing with this verdict?",
  "I don't know how to feel about this.",
  "Medium-rare or well done?",
  "AITA for testing it on my friend?",
  "I'm definitely on a watchlist now.",
  "I've made peace with my choices."
];

// Utility to convert dataURL to Blob
function dataURLtoBlob(dataurl: string) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Utility to resize and compress a canvas to be under 25 megapixels and 10MB
async function resizeCanvasToLimit(canvas, maxPixels = 25000000, maxSizeMB = 10) {
  let width = canvas.width;
  let height = canvas.height;
  let pixels = width * height;

  // Step 1: Resize if over megapixel limit
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);

    // Draw to a new canvas
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const ctx = tmpCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, width, height);
    canvas = tmpCanvas;
  }

  // Step 2: Compress to under 10MB
  let quality = 0.92; // Start with high quality
  let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  while (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.5) {
    quality -= 0.05;
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }
  return blob;
}

// Utility to capture the image with verdict overlay
const captureImageWithVerdict = async (imageElement: HTMLImageElement, verdictText: string, result: Result): Promise<Blob> => {
  // Create a temporary container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = imageElement.naturalWidth + 'px';
  container.style.height = imageElement.naturalHeight + 'px';
  container.style.background = 'black';
  container.style.borderRadius = '16px';
  container.style.overflow = 'hidden';
  
  // Clone the image
  const clonedImage = imageElement.cloneNode() as HTMLImageElement;
  clonedImage.style.width = '100%';
  clonedImage.style.height = '100%';
  clonedImage.style.objectFit = 'cover';
  
  // Create the verdict overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0, 0, 0, 0.4)';
  overlay.style.borderRadius = '16px';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  
  const verdictDiv = document.createElement('div');
  verdictDiv.style.textAlign = 'center';
  verdictDiv.style.transform = result === 'PET' ? 'rotate(3deg)' : 'rotate(-2deg)';
  
  const verdictTextElement = document.createElement('h1');
  verdictTextElement.textContent = verdictText;
  verdictTextElement.style.fontSize = '6rem';
  verdictTextElement.style.fontWeight = '900';
  verdictTextElement.style.color = result === 'PET' ? '#a78bfa' : '#ef4444';
  verdictTextElement.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
  verdictTextElement.style.margin = '0';
  
  const emojiElement = document.createElement('div');
  emojiElement.textContent = result === 'PET' ? '🐾💜' : '🔥🍽️';
  emojiElement.style.fontSize = '4rem';
  emojiElement.style.marginTop = '1rem';
  
  verdictDiv.appendChild(verdictTextElement);
  verdictDiv.appendChild(emojiElement);
  overlay.appendChild(verdictDiv);
  
  container.appendChild(clonedImage);
  container.appendChild(overlay);
  document.body.appendChild(container);
  
  // Wait for image to load
  await new Promise(resolve => {
    if (clonedImage.complete) {
      resolve(null);
    } else {
      clonedImage.onload = resolve;
    }
  });
  
  // Capture the container
  const canvas = await html2canvas(container, {
    width: imageElement.naturalWidth,
    height: imageElement.naturalHeight,
    scale: 1,
    useCORS: true,
    allowTaint: true
  });
  
  // Clean up
  document.body.removeChild(container);
  
  // Resize and compress
  return await resizeCanvasToLimit(canvas);
};

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [imageCategory, setImageCategory] = useState<ImageCategory | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [showCaptionPanel, setShowCaptionPanel] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState<string>('');
  const [customCaption, setCustomCaption] = useState<string>('');
  const [postSuccess, setPostSuccess] = useState(false);
  const [redditPostUrl, setRedditPostUrl] = useState<string>('');
  const [analysisPhase, setAnalysisPhase] = useState<'initial' | 'classifying' | 'cycling'>('initial');
  const [currentAnalysisLine, setCurrentAnalysisLine] = useState<string>('');
  const [usedLines, setUsedLines] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLTextAreaElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
        setCurrentScreen('analyzing');
        setAnalysisPhase('initial');
        setUsedLines([]);
        setImageCategory(null);
        setResult(null);
        
        // Start the analysis sequence
        startAnalysisSequence(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysisSequence = async (imageData: string) => {
    // Phase 1: Show initial message for 1.5 seconds
    setTimeout(async () => {
      setAnalysisPhase('classifying');
      setCurrentAnalysisLine('🤖 Analyzing image with AI vision...');
      
      try {
        // Classify the image
        const classification = await classifyImage(imageData);
        setImageCategory(classification.category);
        
        // Handle different categories
        if (classification.category === 'selfie' || classification.category === 'other') {
          // Show result immediately for selfie/other
          setTimeout(() => {
            setCurrentScreen('result');
          }, 1000);
        } else {
          // Continue with normal flow for animal/human
          setTimeout(() => {
            setAnalysisPhase('cycling');
            startLineCycling();
          }, 1000);
        }
      } catch (error) {
        console.error('Classification error:', error);
        // Fallback to normal flow
        setTimeout(() => {
          setAnalysisPhase('cycling');
          startLineCycling();
        }, 1000);
      }
    }, 1500);
  };

  const startLineCycling = () => {
    let lineCount = 0;
    const maxLines = 4;
    const usedLinesSet = new Set<string>();

    const showNextLine = () => {
      if (lineCount >= maxLines) {
        // After 4 lines, show result
        setTimeout(() => {
          const randomResult: Result = Math.random() > 0.5 ? 'PET' : 'COOK';
          setResult(randomResult);
          setCurrentScreen('result');
        }, 500);
        return;
      }

      // Get a random line that hasn't been used
      const availableLines = ANALYSIS_LINES.filter(line => !usedLinesSet.has(line));
      const randomLine = availableLines[Math.floor(Math.random() * availableLines.length)];
      
      setCurrentAnalysisLine(randomLine);
      usedLinesSet.add(randomLine);
      setUsedLines(Array.from(usedLinesSet));
      lineCount++;

      // Schedule next line after 2 seconds
      setTimeout(showNextLine, 2000);
    };

    showNextLine();
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleShowCaptionPanel = () => {
    setShowCaptionPanel(true);
    setSelectedCaption(REDDIT_CAPTIONS[0]); // Default to first caption
  };

  const postToReddit = async (verdict: Result, caption: string, imageDataUrl: string) => {
    try {
      console.log('Starting Reddit post...');
      
      // Get the image element from the result screen
      const imageElement = document.querySelector('img[src="' + imageDataUrl + '"]') as HTMLImageElement;
      if (!imageElement) {
        throw new Error('Image element not found');
      }
      
      // Capture the image with verdict overlay
      console.log('Capturing image with verdict overlay...');
      const imageBlob = await captureImageWithVerdict(imageElement, `${verdict} IT!`, verdict);
      
      const formData = new FormData();
      formData.append('image', imageBlob, `verdict-${verdict}.png`);
      formData.append('caption', caption);
      console.log('FormData created with:', { verdict, caption });

      const response = await fetch('https://petitorcookit-backend.onrender.com/api/reddit-post', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Success response:', data);
      return data.url; // The Reddit post URL
    } catch (error) {
      console.error('postToReddit error:', error);
      throw error;
    }
  };

  const handlePostToReddit = async () => {
    setIsPosting(true);
    
    try {
      const finalCaption = customCaption.trim() || selectedCaption;
      const postUrl = await postToReddit(result!, finalCaption, uploadedImage!);
      
      setRedditPostUrl(postUrl);
      setPostSuccess(true);
      setShowCaptionPanel(false);
    } catch (error) {
      console.error('Failed to post to Reddit:', error);
      alert('Failed to post to Reddit. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const resetApp = () => {
    setCurrentScreen('home');
    setUploadedImage(null);
    setResult(null);
    setImageCategory(null);
    setIsPosting(false);
    setShowCaptionPanel(false);
    setSelectedCaption('');
    setCustomCaption('');
    setPostSuccess(false);
    setRedditPostUrl('');
    setAnalysisPhase('initial');
    setCurrentAnalysisLine('');
    setUsedLines([]);
  };

  const HomeScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-6xl md:text-8xl font-black text-white mb-4 transform -rotate-2 drop-shadow-2xl">
          PET IT
        </h1>
        <div className="text-4xl md:text-6xl font-black text-white mb-8 transform rotate-1">
          OR
        </div>
        <h1 className="text-6xl md:text-8xl font-black text-white transform rotate-2 drop-shadow-2xl">
          COOK IT
        </h1>
      </div>
      
      <div className="bg-white/20 backdrop-blur-sm rounded-3xl p-8 text-center">
        <p className="text-xl md:text-2xl font-bold text-white mb-8">
          Upload an animal photo and let chaos decide! 🔥
        </p>
        
        <button
          onClick={triggerImageUpload}
          className="bg-black text-white text-2xl md:text-3xl font-black py-6 px-12 rounded-2xl hover:bg-gray-800 transform hover:scale-105 transition-all duration-200 shadow-2xl border-4 border-white"
        >
          <Camera className="inline-block mr-4 w-8 h-8" />
          Take Animal Pic 🐾
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    </div>
  );

  const AnalyzingScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 flex flex-col items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-12 text-center max-w-2xl">
        <Loader2 className="w-24 h-24 text-white animate-spin mx-auto mb-8" />
        
        <h2 className="text-4xl md:text-6xl font-black text-white mb-6 animate-pulse">
          {analysisPhase === 'classifying' ? 'ANALYZING IMAGE...' : 'ANALYZING ANIMAL...'}
        </h2>
        
        <div className="flex justify-center space-x-4 mb-8">
          <div className="w-4 h-4 bg-white rounded-full animate-bounce"></div>
          <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
          <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
        </div>
        
        <div className="min-h-[60px] flex items-center justify-center">
          {analysisPhase === 'initial' ? (
            <p className="text-xl text-white/90 font-bold animate-pulse">
              🤖 AI is deciding your pet's fate...
            </p>
          ) : (
            <p className="text-lg md:text-xl text-white/90 font-bold animate-pulse px-4">
              {currentAnalysisLine}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const CaptionPanel = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-black text-gray-800">Choose Your Caption</h3>
          <button
            onClick={() => setShowCaptionPanel(false)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="space-y-4 mb-6">
          <div className="relative">
            <select
              value={selectedCaption}
              onChange={(e) => setSelectedCaption(e.target.value)}
              className="w-full p-4 border-2 border-gray-300 rounded-xl font-medium text-gray-700 bg-white appearance-none cursor-pointer hover:border-gray-400 focus:border-blue-500 focus:outline-none transition-colors"
            >
              {REDDIT_CAPTIONS.map((caption, index) => (
                <option key={index} value={caption}>
                  {caption}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
          </div>
          
          <div className="text-center text-gray-500 font-medium">OR</div>
          
          <textarea
            ref={captionInputRef}
            value={customCaption}
            onChange={(e) => {
              setCustomCaption(e.target.value);
              // Move cursor to end after update
              if (captionInputRef.current) {
                const len = e.target.value.length;
                // Use setTimeout to ensure React has updated the value before moving the cursor
                setTimeout(() => {
                  captionInputRef.current.setSelectionRange(len, len);
                }, 0);
              }
            }}
            placeholder="Write your own caption..."
            className="w-full p-4 border-2 border-gray-300 rounded-xl font-medium text-gray-700 resize-none h-24 hover:border-gray-400 focus:border-blue-500 focus:outline-none transition-colors"
            maxLength={300}
          />
          
          <div className="text-right text-sm text-gray-500">
            {customCaption.length}/300
          </div>
        </div>
        
        <div className="space-y-3">
          <button
            onClick={handlePostToReddit}
            disabled={isPosting}
            className={`w-full text-xl font-black py-4 px-8 rounded-2xl transition-all duration-200 shadow-xl ${
              result === 'PET'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            } ${isPosting ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
          >
            {isPosting ? (
              <>
                <Loader2 className="inline-block mr-2 w-6 h-6 animate-spin" />
                Posting to Reddit...
              </>
            ) : (
              <>
                <Share className="inline-block mr-2 w-6 h-6" />
                Post to r/PetItOrCookIt
              </>
            )}
          </button>
          
          <button
            onClick={() => setShowCaptionPanel(false)}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-lg font-bold py-3 px-6 rounded-2xl transition-all duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const getSpecialMessage = () => {
    if (imageCategory === 'selfie') {
      return {
        text: 'CANNIBALISM IS NOT ADVISED',
        emoji: '🚫🍽️',
        color: 'text-red-500'
      };
    } else if (imageCategory === 'other') {
      return {
        text: 'THERE IS NOTHING HERE????',
        emoji: '❓🤷‍♂️',
        color: 'text-gray-500'
      };
    }
    return null;
  };

  const ResultScreen = () => {
    const specialMessage = getSpecialMessage();
    const showNormalResult = !specialMessage && (imageCategory === 'animal' || imageCategory === 'human' || !imageCategory);

    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="relative max-w-2xl w-full mb-8">
          <img
            src={uploadedImage!}
            alt="Uploaded image"
            className="w-full h-auto rounded-2xl shadow-2xl"
          />
          
          <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
            <div className={`text-center transform ${showNormalResult ? (result === 'PET' ? 'rotate-3' : '-rotate-2') : 'rotate-1'}`}>
              {specialMessage ? (
                <>
                  <h1 className={`text-4xl md:text-6xl font-black drop-shadow-2xl ${specialMessage.color}`}>
                    {specialMessage.text}
                  </h1>
                  <div className="text-4xl mt-4">
                    {specialMessage.emoji}
                  </div>
                </>
              ) : (
                <>
                  <h1 className={`text-6xl md:text-8xl font-black drop-shadow-2xl ${
                    result === 'PET' 
                      ? 'text-purple-400' 
                      : 'text-red-500'
                  }`}>
                    {result} IT!
                  </h1>
                  <div className="text-4xl mt-4">
                    {result === 'PET' ? '🐾💜' : '🔥🍽️'}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        
        {specialMessage ? (
          // Show retry button for selfie/other
          <div className="space-y-4 w-full max-w-md">
            <button
              onClick={triggerImageUpload}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-2xl font-black py-4 px-8 rounded-2xl transition-all duration-200 shadow-xl hover:scale-105"
            >
              <RotateCcw className="inline-block mr-2 w-6 h-6" />
              Try Another Photo
            </button>
          </div>
        ) : (
          // Show normal result options
          <>
            {postSuccess ? (
              <div className="bg-green-600 text-white p-6 rounded-2xl mb-6 text-center max-w-md w-full">
                <h3 className="text-2xl font-bold mb-3">Posted Successfully! 🎉</h3>
                <a
                  href="https://www.reddit.com/r/PetItOrCookIt/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-white text-green-600 font-bold py-2 px-6 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  View on Reddit →
                </a>
              </div>
            ) : (
              <div className="space-y-4 w-full max-w-md">
                <button
                  onClick={handleShowCaptionPanel}
                  className={`w-full text-2xl font-black py-4 px-8 rounded-2xl transition-all duration-200 shadow-xl hover:scale-105 ${
                    result === 'PET'
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  <Share className="inline-block mr-2 w-6 h-6" />
                  Post to Reddit
                </button>
              </div>
            )}
          </>
        )}
        
        <button
          onClick={resetApp}
          className="mt-4 bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold py-3 px-6 rounded-2xl transition-all duration-200 hover:scale-105"
        >
          Try Another Animal
        </button>
        
        {showCaptionPanel && <CaptionPanel />}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <div className="font-sans">
      {currentScreen === 'home' && <HomeScreen />}
      {currentScreen === 'analyzing' && <AnalyzingScreen />}
      {currentScreen === 'result' && <ResultScreen />}
    </div>
  );
}

export default App;