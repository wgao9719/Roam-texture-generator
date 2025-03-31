import replicate from 'replicate';
import axios from 'axios';
import fs from 'fs';

/**
 * Inpaints an image using Replicate's API
 * @param {string} imagePath - Path to the image
 * @param {string} maskPath - Path to the mask
 * @param {string} prompt - Inpainting prompt
 * @param {string} negativePrompt - Negative prompt
 * @returns {Promise<Buffer>} Inpainted image as Buffer
 */
export default async function inpaintWithReplicateAPI(imagePath, maskPath, prompt, negativePrompt) {
  try {
    // Initialize Replicate client
    const replicateClient = new replicate({
      auth: process.env.REPLICATE_API_TOKEN
    });
    
    // Read files
    const imageBuffer = fs.readFileSync(imagePath);
    const maskBuffer = fs.readFileSync(maskPath);
    
    // Convert to base64
    const imageBase64 = imageBuffer.toString('base64');
    const maskBase64 = maskBuffer.toString('base64');
    
    // Call Replicate inpainting API with specialized prompts
    const output = await replicateClient.run(
      "runwayml/stable-diffusion-inpainting:c28b92a7ecd66eee4aefcd8a94eb9e7f6c3805d5f06038165407fb5cb355ba67",
      {
        input: {
          prompt: prompt,
          negative_prompt: negativePrompt,
          image: `data:image/png;base64,${imageBase64}`,
          mask: `data:image/png;base64,${maskBase64}`,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 50,  // Increased steps for better quality
          sampler: "K_EULER",
          width: 1024,
          height: 1024
        }
      }
    );
    
    // Download the inpainted image from the URL
    if (Array.isArray(output) && output.length > 0) {
      const imageUrl = output[0];
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } else {
      throw new Error('No output image received from Replicate inpainting');
    }
  } catch (error) {
    console.error('Error inpainting with Replicate API:', error);
    throw error;
  }
} 