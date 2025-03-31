import axios from 'axios';
import FormData from 'form-data';

import { IMAGE_GENERATION_PROMPT } from '../../lib/prompts';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Enhance prompt with seamless texture keywords
    let enhancedPrompt = IMAGE_GENERATION_PROMPT.positive.replace('${prompt}', prompt);
    
    // Create the payload for Stability AI
    const formData = new FormData();
    formData.append('prompt', enhancedPrompt);
    formData.append('output_format', 'png'); // PNG for better quality
    formData.append('width', '1024'); // Higher resolution for better tiling
    formData.append('height', '1024');
    formData.append('cfg_scale', '7'); // Higher cfg_scale for better prompt adherence
    formData.append('steps', '40'); // More steps for better quality
    formData.append('sampler', 'K_DPMPP_2M');
    formData.append('style_preset', 'tile-texture');
    
    // Enhanced negative prompt for seamless textures
    formData.append('negative_prompt', IMAGE_GENERATION_PROMPT.negative);

    // Call Stability AI API using axios with FormData
    const response = await axios.post(
      `https://api.stability.ai/v2beta/stable-image/generate/core`,
      formData,
      {
        validateStatus: undefined,
        responseType: "arraybuffer",
        headers: { 
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`, 
          Accept: "image/*",
          ...formData.getHeaders()
        },
      }
    );

    console.log('API Response status:', response.status);
    
    if (response.status !== 200) {
      const errorMessage = Buffer.from(response.data).toString();
      console.error('API error details:', errorMessage);
      throw new Error(`API Error (${response.status}): ${errorMessage}`);
    }

    // Convert the binary data to base64
    const imageBase64 = Buffer.from(response.data).toString('base64');
    const imageUrl = `data:image/png;base64,${imageBase64}`; // Changed to PNG

    return res.status(200).json({
      imageUrl
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate image' 
    });
  }
} 