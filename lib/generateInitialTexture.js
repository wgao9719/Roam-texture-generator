import axios from 'axios';
import FormData from 'form-data';
import { IMAGE_GENERATION_PROMPT } from './prompt-initial';

/**
 * Generates the initial texture using Stability AI API
 * @param {string} prompt - The text prompt for texture generation
 * @returns {Promise<string>} Base64 encoded image
 */
export default async function generateInitialTexture(prompt) {
  // Create the payload for Stability AI
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('output_format', 'png');
  formData.append('width', '1024');
  formData.append('height', '1024');
  formData.append('cfg_scale', '7');
  formData.append('steps', '40');
  formData.append('sampler', 'K_EULER');
  formData.append('style_preset', 'tile-texture');
  formData.append('negative_prompt', IMAGE_GENERATION_PROMPT.negative);

  // Call Stability AI API
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

  if (response.status !== 200) {
    const errorMessage = Buffer.from(response.data).toString();
    throw new Error(`API Error (${response.status}): ${errorMessage}`);
  }

  // Convert the binary data to base64
  return Buffer.from(response.data).toString('base64');
} 