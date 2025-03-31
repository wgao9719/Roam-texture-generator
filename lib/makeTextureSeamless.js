import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import replicate from 'replicate';
import axios from 'axios';
import { TEXTURE_INPAINTING_PROMPT } from './prompt-seamless';

// Create temp directory that works in both local development and Vercel serverless
// Vercel only allows writing to /tmp
const tempDir = process.env.NODE_ENV === 'production' 
  ? '/tmp' 
  : path.join(process.cwd(), 'temp');

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Created temp directory: ${tempDir}`);
  } catch (err) {
    console.error(`Failed to create temp directory: ${err.message}`);
    // Continue without failing - we'll handle file operations more carefully
  }
}

/**
 * Safely delete a file if it exists
 * @param {string} filePath - Path to the file to delete
 */
function safelyDeleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err);
    // No need to throw - just log the error
  }
}

/**
 * Makes a texture seamless using mirror-based algorithm
 * @param {string} inputImageBase64 - Base64 encoded input image
 * @param {string} prompt - The texture prompt
 * @returns {Promise<string>} Base64 encoded seamless texture
 */
export default async function makeTextureSeamless(inputImageBase64, prompt) {
  // Create a unique session ID for this operation
  const sessionId = uuidv4();
  
  // Define all the file paths we'll need
  const inputPath = path.join(tempDir, `${sessionId}_input.png`);
  const mirrorHPath = path.join(tempDir, `${sessionId}_mirrorH.png`);
  const mirrorVPath = path.join(tempDir, `${sessionId}_mirrorV.png`);
  const mirrorBothPath = path.join(tempDir, `${sessionId}_mirrorBoth.png`);
  const mirroredCanvasPath = path.join(tempDir, `${sessionId}_mirroredCanvas.png`);
  const finalSeamlessPath = path.join(tempDir, `${sessionId}_finalSeamless.png`);
  const enhancedPath = path.join(tempDir, `${sessionId}_enhanced.png`);
  
  // List of files to clean up at the end
  const filesToCleanup = [
    inputPath, mirrorHPath, mirrorVPath, mirrorBothPath, 
    mirroredCanvasPath, finalSeamlessPath, enhancedPath
  ];
  
  try {
    const writeFile = promisify(fs.writeFile);
    
    // Save the input image, ensuring it's a valid PNG
    let inputBuffer;
    try {
      // Convert from base64 to buffer
      inputBuffer = Buffer.from(inputImageBase64, 'base64');
      
      // Process with sharp to ensure valid format
      inputBuffer = await sharp(inputBuffer)
        .ensureAlpha() // Ensure the image has an alpha channel
        .toFormat('png') // Convert to PNG format
        .toBuffer();
        
      await writeFile(inputPath, inputBuffer);
      console.log("✓ Saved input image");
    } catch (imageError) {
      console.error("Error processing input image:", imageError);
      throw new Error("Invalid input image format");
    }
    
    // Get the image dimensions
    const imageInfo = await sharp(inputPath).metadata();
    const { width, height } = imageInfo;
    
    console.log(`Processing image: ${width}x${height}`);
    
    if (width !== height) {
      console.log("Image is not square, cropping to square...");
      const size = Math.min(width, height);
      const left = Math.floor((width - size) / 2);
      const top = Math.floor((height - size) / 2);
      
      inputBuffer = await sharp(inputPath)
        .extract({ left, top, width: size, height: size })
        .toFormat('png')
        .toBuffer();
        
      await writeFile(inputPath, inputBuffer);
      
      // Update dimensions
      const newInfo = await sharp(inputPath).metadata();
      console.log(`New dimensions after cropping: ${newInfo.width}x${newInfo.height}`);
    }
    
    // DIRECT SDXL APPROACH FIRST - more compatible with serverless
    try {
      console.log("Using SDXL with tiling for seamless texture...");
      
      // Try SDXL directly first - better for Vercel as it reduces file operations
      const enhancedBase64 = await enhanceWithSDXL(inputImageBase64, prompt, true);
      
      // Clean up temp files
      cleanupFiles(filesToCleanup);
      
      return enhancedBase64;
    } catch (sdxlError) {
      console.error("Direct SDXL tiling failed:", sdxlError);
      console.log("Falling back to mirror-based algorithm...");
      
      // MIRROR-BASED ALGORITHM AS FALLBACK
      try {
        console.log("Step 1: Creating mirrored versions of the image");
        
        // Get current dimensions after possible cropping
        const currentInfo = await sharp(inputPath).metadata();
        const currentWidth = currentInfo.width;
        const currentHeight = currentInfo.height;
        
        // 1. Create horizontal mirror (flop)
        const mirrorHorizontal = await sharp(inputPath)
          .flop()
          .toFormat('png')
          .toBuffer();
        
        // 2. Create vertical mirror (flip)
        const mirrorVertical = await sharp(inputPath)
          .flip()
          .toFormat('png')
          .toBuffer();
        
        // 3. Create both mirrors (flip+flop)
        const mirrorBoth = await sharp(mirrorVertical)
          .flop()
          .toFormat('png')
          .toBuffer();
        
        console.log("Step 2: Creating 2x2 canvas with mirrored versions");
        
        // 4. Create a 2x2 canvas with mirrored versions
        const mirroredCanvas = await sharp({
          create: {
            width: currentWidth * 2,
            height: currentHeight * 2,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 255 }
          }
        })
          .composite([
            { input: inputBuffer, top: 0, left: 0 },
            { input: mirrorHorizontal, top: 0, left: currentWidth },
            { input: mirrorVertical, top: currentHeight, left: 0 },
            { input: mirrorBoth, top: currentHeight, left: currentWidth }
          ])
          .toFormat('png')
          .toBuffer();
        
        console.log("Step 3: Extracting center portion for seamless result");
        
        // 5. Extract the center portion which should now be seamless
        const seamless = await sharp(mirroredCanvas)
          .extract({
            left: Math.floor(currentWidth / 2),
            top: Math.floor(currentHeight / 2),
            width: currentWidth,
            height: currentHeight
          })
          .toFormat('png')
          .toBuffer();
        
        console.log("✓ Created mirror-based seamless texture");
        
        // Convert mirror-processed image to base64
        const mirrorProcessedBase64 = seamless.toString('base64');
        
        // Try to enhance with SDXL
        try {
          console.log("Step 4: Enhancing with SDXL while maintaining seamlessness");
          
          // Enhance the seamless texture with SDXL
          const enhancedBase64 = await enhanceWithSDXL(mirrorProcessedBase64, prompt, false);
          
          // Clean up temp files
          cleanupFiles(filesToCleanup);
          
          return enhancedBase64;
        } catch (enhanceError) {
          console.error("SDXL enhancement failed:", enhanceError);
          console.log("Returning mirror-based result without SDXL enhancement");
          
          // Clean up temp files
          cleanupFiles(filesToCleanup);
          
          return mirrorProcessedBase64;
        }
      } catch (mirrorError) {
        console.error("Mirror algorithm failed:", mirrorError);
        
        // Clean up any lingering files
        cleanupFiles(filesToCleanup);
        
        // Return original as last resort
        console.log("❌ All methods failed, returning original image");
        return inputImageBase64;
      }
    }
  } catch (error) {
    console.error('Error making texture seamless:', error);
    
    // Clean up any lingering files
    cleanupFiles(filesToCleanup);
    
    // Return original in case of any error
    return inputImageBase64;
  }
}

/**
 * Helper function to clean up all temporary files
 * @param {string[]} files - Array of file paths to clean up
 */
function cleanupFiles(files) {
  if (!files || !Array.isArray(files)) return;
  
  files.forEach(file => {
    try {
      safelyDeleteFile(file);
    } catch (err) {
      console.error(`Error cleaning up file ${file}:`, err);
    }
  });
}

/**
 * Enhance a texture with SDXL, ensuring it's seamless
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} prompt - The texture prompt (already enhanced with template)
 * @param {boolean} isDirect - Whether this is a direct enhancement or post-mirror
 * @returns {Promise<string>} Enhanced base64 encoded seamless texture
 */
async function enhanceWithSDXL(imageBase64, prompt, isDirect = false) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN environment variable is not set');
    }
    
    console.log(`Enhancing with SDXL (${isDirect ? 'direct' : 'post-mirror'})...`);
    
    const replicateClient = new replicate({
      auth: process.env.REPLICATE_API_TOKEN
    });
    
    // Add critical seamless texture keywords
    const enhancedPrompt = `${prompt}, seamless tileable texture, perfect tiling pattern`;
    
    // Different parameters depending on whether this is direct or post-mirror
    const params = isDirect ? {
      prompt: enhancedPrompt,
      negative_prompt: TEXTURE_INPAINTING_PROMPT.negative + ", seams, edges, borders, discontinuity",
      image: `data:image/png;base64,${imageBase64}`,
      width: 1024,
      height: 1024,
      num_outputs: 1,
      scheduler: "DDIM",
      num_inference_steps: 50,
      guidance_scale: 8,
      prompt_strength: 0.05, // Lower for direct - preserve more of the original
      refine: "expert_ensemble_refiner",
      high_noise_frac: 0.8,
      tiling: true
    } : {
      prompt: enhancedPrompt,
      negative_prompt: TEXTURE_INPAINTING_PROMPT.negative + ", seams, edges, borders, discontinuity",
      image: `data:image/png;base64,${imageBase64}`,
      width: 1024,
      height: 1024,
      num_outputs: 1,
      scheduler: "DDIM",
      num_inference_steps: 50,
      guidance_scale: 8,
      prompt_strength: 0.05, // Already mirror-processed, just enhance
      refine: "expert_ensemble_refiner",
      high_noise_frac: 0.8,
      tiling: true
    };
    
    const output = await replicateClient.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      { input: params }
    );
    
    if (Array.isArray(output) && output.length > 0) {
      const imageUrl = output[0];
      console.log("Successfully generated SDXL image with tiling");
      
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data).toString('base64');
      } catch (axiosError) {
        console.error('Error downloading image from Replicate:', axiosError);
        throw new Error('Failed to download image from Replicate');
      }
    } else {
      throw new Error('No output image received from SDXL generation');
    }
  } catch (error) {
    console.error('Error enhancing with SDXL:', error);
    throw error;
  }
}
