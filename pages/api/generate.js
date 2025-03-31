import { IMAGE_GENERATION_PROMPT } from '../../lib/prompt-initial';
import { TEXTURE_INPAINTING_PROMPT } from '../../lib/prompt-seamless';
import generateInitialTexture from '../../lib/generateInitialTexture';
import makeTextureSeamless from '../../lib/makeTextureSeamless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the single user prompt
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Step 1: Enhance the prompt with the initial texture generation template
    const initialPrompt = IMAGE_GENERATION_PROMPT.positive.replace('${prompt}', prompt);
    
    // Step 2: Enhance the prompt with the seamless texture template
    const seamlessPrompt = TEXTURE_INPAINTING_PROMPT.positive.replace('${prompt}', prompt);
    
    console.log("Starting two-step seamless texture generation process...");
    
    // Generate the initial texture using the first template
    console.log("Step 1: Generating initial texture with Stability AI...");
    console.log(`Using initial template with prompt: "${prompt}"`);
    const initialTextureBase64 = await generateInitialTexture(initialPrompt);
    
    // Make the texture seamless using the second template
    console.log("Step 2: Making texture seamless...");
    console.log(`Using seamless template with prompt: "${prompt}"`);
    
    // Pass the base64 texture and the prompt with the seamless template
    const seamlessTextureBase64 = await makeTextureSeamless(
      initialTextureBase64,
      seamlessPrompt
    );
    
    // Return the seamless texture as a data URL
    console.log("Seamless texture generation complete!");
    return res.status(200).json({
      imageUrl: `data:image/png;base64,${seamlessTextureBase64}`
    });
  } catch (error) {
    console.error('Error generating seamless texture:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate seamless texture' 
    });
  }
}
