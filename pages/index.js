import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generationStage, setGenerationStage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setGenerationStage('starting');
    
    // Clear previous result to show loading state
    setResult(null);

    try {
      const controller = new AbortController();
      // Set timeout for request (60 seconds)
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      setGenerationStage('generating');
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      setGenerationStage('complete');
      setResult(data.imageUrl);
    } catch (err) {
      console.error('Generation error:', err);
      if (err.name === 'AbortError') {
        setError('Request timed out. The server might be busy. Please try again.');
      } else {
        setError(err.message || 'Failed to generate texture');
      }
      setGenerationStage('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    
    try {
      let blob;
      
      if (result.startsWith('data:')) {
        // Handle base64 data URL
        const base64Data = result.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: 'image/png' });
      } else {
        // Handle regular URL
        const response = await fetch(result);
        blob = await response.blob();
      }
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `seamless-texture-${Date.now()}.png`; // Dynamic filename
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading image:', err);
      setError('Failed to download image');
    }
  };

  const renderLoadingMessage = () => {
    switch (generationStage) {
      case 'starting':
        return 'Preparing generation...';
      case 'generating':
        return 'Generating texture (this might take up to 1 minute)...';
      default:
        return 'Generating Texture...';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Head>
        <title>AI Seamless Texture Generator</title>
        <meta name="description" content="Generate seamless textures from text descriptions using AI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">AI Seamless Texture Generator</h1>
        <p className="text-center text-gray-600 mb-8">Generate perfectly seamless textures from text descriptions</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Inputs */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter your texture description:
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    rows="4"
                    required
                    placeholder="Example: Wet concrete, stone wall, wooden planks..."
                    disabled={loading}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Your prompt will be used in a two-step process:
                    <br />1. First, to generate a high-quality initial texture
                    <br />2. Then, to make that texture perfectly seamless for tiling
                  </p>
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors duration-200"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {renderLoadingMessage()}
                    </span>
                  ) : 'Generate Texture'}
                </button>
              </form>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                  <button 
                    onClick={() => setError(null)} 
                    className="mt-2 text-xs text-red-600 underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Generated Texture</h2>
            {result ? (
              <div className="relative aspect-square w-full bg-gray-50 rounded-lg overflow-hidden">
                <img
                  src={result}
                  alt="Generated seamless texture"
                  className="w-full h-full object-contain rounded-lg"
                  onError={(e) => {
                    console.error('Error loading image');
                    setError('Failed to load image');
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="px-3 py-1 text-xs bg-white/90 hover:bg-white rounded-md text-gray-700 shadow-sm transition-colors duration-200 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    Download
                  </button>
                  <button
                    onClick={() => {
                      const newWindow = window.open();
                      if (newWindow) {
                        newWindow.document.write(`
                          <html>
                            <head>
                              <title>Seamless Texture - Full Size</title>
                              <style>
                                body { 
                                  margin: 0;
                                  padding: 20px;
                                  background: repeating-conic-gradient(#f5f5f5 0% 25%, #e0e0e0 0% 50%) 50% / 20px 20px;
                                  display: flex;
                                  flex-direction: column;
                                  align-items: center;
                                }
                                div.container {
                                  background: repeating-conic-gradient(#f5f5f5 0% 25%, #e0e0e0 0% 50%) 50% / 20px 20px;
                                  padding: 20px;
                                  border-radius: 8px;
                                  margin-bottom: 20px;
                                  text-align: center;
                                }
                                h3 { 
                                  font-family: sans-serif;
                                  margin-top: 0;
                                }
                                img {
                                  max-width: 100%;
                                  height: auto;
                                  display: block;
                                  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                                }
                              </style>
                            </head>
                            <body>
                              <div class="container">
                                <h3>Full-size Seamless Texture</h3>
                                <p style="font-family: sans-serif; font-size: 14px; margin-bottom: 20px;">
                                  This texture is tileable - the edges match perfectly for seamless repetition
                                </p>
                              </div>
                              <img src="${result}" alt="Full-size seamless texture">
                            </body>
                          </html>
                        `);
                      }
                    }}
                    className="px-3 py-1 text-xs bg-white/90 hover:bg-white rounded-md text-gray-700 shadow-sm transition-colors duration-200"
                  >
                    Open Full Size
                  </button>
                </div>
              </div>
            ) : loading ? (
              <div className="aspect-square w-full bg-gray-50 rounded-lg flex flex-col items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                    <svg className="animate-spin h-12 w-12 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <p className="text-indigo-600 text-sm font-medium text-center">
                    {renderLoadingMessage()}
                  </p>
                  <p className="text-gray-500 text-xs mt-2 text-center max-w-xs">
                    The first generation might take longer depending on server load.
                  </p>
                </div>
              </div>
            ) : (
              <div className="aspect-square w-full bg-gray-50 rounded-lg flex items-center justify-center">
                <p className="text-gray-500 text-center">
                  Your generated texture will appear here...
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      
      <footer className="py-4 border-t border-gray-200 mt-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <p className="text-center text-xs text-gray-500">
            Powered by Next.js, Replicate, and Stability AI
          </p>
        </div>
      </footer>
    </div>
  );
} 