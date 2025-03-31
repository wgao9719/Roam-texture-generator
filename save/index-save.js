import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      setResult(data.imageUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Head>
        <title>AI Seamless Texture Generator</title>
        <meta name="description" content="Generate seamless textures from text descriptions using AI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">AI Seamless Texture Generator</h1>
        <p className="text-center text-gray-600 mb-8">Generate seamless textures from text descriptions using AI</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Inputs */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter your image description:
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                    rows="4"
                    required
                    placeholder="Example: Wet concrete"
                  />
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
                      Generating...
                    </span>
                  ) : 'Generate Image'}
                </button>
              </form>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">Error: {error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Generated Image</h2>
            {result ? (
              <div className="relative aspect-square w-full bg-gray-50 rounded-lg overflow-hidden">
                <img
                  src={result}
                  alt="Generated image"
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
                        newWindow.document.write(`<img src="${result}" alt="Full size image" style="max-width: 100%; height: auto;">`);
                      }
                    }}
                    className="px-3 py-1 text-xs bg-white/90 hover:bg-white rounded-md text-gray-700 shadow-sm transition-colors duration-200"
                  >
                    Open Full Size
                  </button>
                </div>
              </div>
            ) : (
              <div className="aspect-square w-full bg-gray-50 rounded-lg flex items-center justify-center">
                <p className="text-gray-500 text-center">
                  Your generated image will appear here...
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 