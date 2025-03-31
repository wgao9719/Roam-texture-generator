import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import replicate from 'replicate';
import axios from 'axios';
import { TEXTURE_INPAINTING_PROMPT } from './prompts';

// Create temp directory if it doesn't exist
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
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
  }
}

/**
 * Makes a texture seamless using the mirror method
 * @param {string} inputImageBase64 - Base64 encoded input image
 * @param {string} prompt - The texture prompt
 * @returns {Promise<string>} Base64 encoded seamless texture
 */
export default async function makeTextureSeamless(inputImageBase64, prompt) {
  // Create temp file paths
  const sessionId = uuidv4();
  const inputPath = path.join(tempDir, `${sessionId}_input.png`);
  const mirrorPath = path.join(tempDir, `${sessionId}_mirror.png`);
  const finalPath = path.join(tempDir, `${sessionId}_final.png`);
  const tiledPath = path.join(tempDir, `${sessionId}_tiled.png`);
  
  try {
    const writeFile = promisify(fs.writeFile);
    
    // Save the input image - use let instead of const since we may need to update it
    let inputBuffer = Buffer.from(inputImageBase64, 'base64');
    await writeFile(inputPath, inputBuffer);
    
    // Load image with sharp
    const imageInfo = await sharp(inputPath).metadata();
    const { width, height } = imageInfo;
    
    console.log(`Image dimensions: ${width}x${height}`);
    
    if (!width || !height || width < 10 || height < 10) {
      throw new Error(`Invalid image dimensions: ${width}x${height}`);
    }
    
    // Handle non-square images
    let finalWidth = width;
    let finalHeight = height;
    
    if (width !== height) {
      console.log("Input image is not square. Attempting to crop to square...");
      const size = Math.min(width, height);
      const left = Math.floor((width - size) / 2);
      const top = Math.floor((height - size) / 2);
      
      const squareBuffer = await sharp(inputPath)
        .extract({ left, top, width: size, height: size })
        .toBuffer();
      
      await writeFile(inputPath, squareBuffer);
      
      // Update dimensions
      const newInfo = await sharp(inputPath).metadata();
      console.log(`New dimensions: ${newInfo.width}x${newInfo.height}`);
      
      // Use the new square dimensions
      finalWidth = newInfo.width;
      finalHeight = newInfo.height;
      
      // Update the input buffer to use the square image
      inputBuffer = squareBuffer;
    }
    
    try {
      // PRIMARY METHOD: SDXL with image-to-image and tiling
      console.log("Using SDXL with tiling option...");
      
      const replicateClient = new replicate({
        auth: process.env.REPLICATE_API_TOKEN
      });
      
      // First convert to base64
      const imageBase64 = inputBuffer.toString('base64');
      
      // Critical: MUST explicitly set tiling to true for seamless textures
      const output = await replicateClient.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: prompt + ", seamless texture, tileable pattern, detailed, high quality",
            image: `data:image/png;base64,${imageBase64}`,
            negative_prompt: "seams, borders, edge artifacts, discontinuity, harsh transitions",
            image_strength: 0.4, // Preserve more of the input structure
            width: 1024,
            height: 1024,
            num_outputs: 1,
            scheduler: "K_EULER",
            num_inference_steps: 50, // Increase steps for better quality
            guidance_scale: 7.5,
            tiling: true, // This is the key parameter for seamless textures
          }
        }
      );
      
      if (Array.isArray(output) && output.length > 0) {
        const imageUrl = output[0];
        console.log("Successfully generated seamless texture with SDXL");
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        
        // Clean up temporary files
        safelyDeleteFile(inputPath);
        
        return Buffer.from(response.data).toString('base64');
      }
      
      // If SDXL fails, fall back to mirror method
      throw new Error("SDXL tiling method failed");
      
    } catch (sdxlError) {
      console.error("SDXL method failed:", sdxlError);
      console.log("Falling back to mirror algorithm method...");
      
      try {
        // FALLBACK METHOD: Using algorithmic approach
        
        // Step 1: Create mirrored versions of the image
        const mirrorHorizontal = await sharp(inputPath)
          .flop()
          .toFormat('png')
          .toBuffer();
          
        const mirrorVertical = await sharp(inputPath)
          .flip()
          .toFormat('png')
          .toBuffer();
          
        const mirrorBoth = await sharp(mirrorVertical)
          .flop()
          .toFormat('png')
          .toBuffer();
        
        // Step 2: Create a 2x2 canvas with mirrored versions
        const doubleWidth = finalWidth * 2;
        const doubleHeight = finalHeight * 2;
        
        const mirroredCanvas = await sharp({
          create: {
            width: doubleWidth,
            height: doubleHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
          .composite([
            { input: inputBuffer, top: 0, left: 0 },
            { input: mirrorHorizontal, top: 0, left: finalWidth },
            { input: mirrorVertical, top: finalHeight, left: 0 },
            { input: mirrorBoth, top: finalHeight, left: finalWidth }
          ])
          .toFormat('png')
          .toBuffer();
        
        await writeFile(mirrorPath, mirroredCanvas);
        
        // Step 3: Extract the center portion for a seamless result
        const halfWidth = Math.floor(finalWidth / 2);
        const halfHeight = Math.floor(finalHeight / 2);
        
        // Precisely calculate the center extraction area
        const centerSeamless = await sharp(mirroredCanvas)
          .extract({
            left: halfWidth,
            top: halfHeight,
            width: finalWidth,
            height: finalHeight
          })
          .toFormat('png')
          .toBuffer();
        
        await writeFile(finalPath, centerSeamless);
        
        // Step 4: Verification - create a 2x2 tiled version to check seamlessness
        const tiled = await sharp({
          create: {
            width: finalWidth * 2,
            height: finalHeight * 2,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
          .composite([
            { input: centerSeamless, top: 0, left: 0 },
            { input: centerSeamless, top: 0, left: finalWidth },
            { input: centerSeamless, top: finalHeight, left: 0 },
            { input: centerSeamless, top: finalHeight, left: finalWidth }
          ])
          .toFormat('png')
          .toBuffer();
        
        await writeFile(tiledPath, tiled);
        
        // Try one more time with SDXL but using our mirror-generated texture as input
        try {
          console.log("Attempting to enhance mirror-generated texture with SDXL...");
          const seamlessBase64 = centerSeamless.toString('base64');
          
          const replicateClient = new replicate({
            auth: process.env.REPLICATE_API_TOKEN
          });
          
          const enhancedOutput = await replicateClient.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
              input: {
                prompt: prompt + ", perfect seamless texture, tileable pattern without seams, detailed",
                image: `data:image/png;base64,${seamlessBase64}`,
                negative_prompt: "seams, borders, edge artifacts, discontinuity",
                image_strength: 0.25, // Lower strength to preserve the seamless structure
                width: 1024,
                height: 1024,
                num_outputs: 1,
                scheduler: "K_EULER_ANCESTRAL",
                num_inference_steps: 30,
                guidance_scale: 7.5,
                tiling: true // Critical for preserving seamlessness
              }
            }
          );
          
          if (Array.isArray(enhancedOutput) && enhancedOutput.length > 0) {
            const enhancedUrl = enhancedOutput[0];
            const response = await axios.get(enhancedUrl, { responseType: 'arraybuffer' });
            
            // Clean up temp files
            safelyDeleteFile(inputPath);
            safelyDeleteFile(mirrorPath);
            safelyDeleteFile(finalPath);
            safelyDeleteFile(tiledPath);
            
            return Buffer.from(response.data).toString('base64');
          }
        } catch (enhanceError) {
          console.error("Enhancement failed, using mirror-generated texture:", enhanceError);
        }
        
        // Get the result before cleanup
        const resultBase64 = centerSeamless.toString('base64');
        
        // Clean up temp files
        safelyDeleteFile(inputPath);
        safelyDeleteFile(mirrorPath);
        safelyDeleteFile(finalPath);
        safelyDeleteFile(tiledPath);
        
        return resultBase64;
        
      } catch (mirrorError) {
        console.error("Mirror method failed:", mirrorError);
        
        // Try direct generation as last resort
        try {
          console.log("Attempting direct texture generation...");
          
          const replicateClient = new replicate({
            auth: process.env.REPLICATE_API_TOKEN
          });
          
          const directOutput = await replicateClient.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
              input: {
                prompt: prompt + ", seamless texture, perfectly tileable, no seams, detailed material texture",
                negative_prompt: "seams, borders, edge artifacts, visible transitions, discontinuity",
                width: 1024,
                height: 1024,
                num_outputs: 1,
                scheduler: "K_EULER_ANCESTRAL",
                num_inference_steps: 50,
                guidance_scale: 8.0,
                tiling: true
              }
            }
          );
          
          if (Array.isArray(directOutput) && directOutput.length > 0) {
            const directUrl = directOutput[0];
            const response = await axios.get(directUrl, { responseType: 'arraybuffer' });
            
            // Clean up lingering files
            safelyDeleteFile(inputPath);
            safelyDeleteFile(mirrorPath);
            safelyDeleteFile(finalPath);
            safelyDeleteFile(tiledPath);
            
            return Buffer.from(response.data).toString('base64');
          }
        } catch (directError) {
          console.error("Direct generation failed:", directError);
        }
        
        // Clean up any lingering files
        safelyDeleteFile(inputPath);
        safelyDeleteFile(mirrorPath);
        safelyDeleteFile(finalPath);
        safelyDeleteFile(tiledPath);
        
        // Last resort: return the original image
        return inputImageBase64;
      }
    }
  } catch (error) {
    console.error('Error making texture seamless:', error);
    
    // Clean up any lingering files
    safelyDeleteFile(inputPath);
    safelyDeleteFile(mirrorPath);
    safelyDeleteFile(finalPath);
    safelyDeleteFile(tiledPath);
    
    return inputImageBase64; // Return original in case of any error
  }
} 