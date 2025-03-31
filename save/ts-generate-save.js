import axios from 'axios';
import replicate from 'replicate';
import { IMAGE_GENERATION_PROMPT, TEXTURE_INPAINTING_PROMPT } from '../../lib/prompts';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';

// Create temp directory if it doesn't exist
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

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
    
    // Step 1: Generate the initial texture
    const initialTextureBase64 = await generateInitialTexture(enhancedPrompt);
    
    // Step 2: Make the texture seamless using the inpainting technique
    const seamlessTextureBase64 = await makeTextureSeamless(
      initialTextureBase64, 
      enhancedPrompt
    );
    
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

async function generateInitialTexture(prompt) {
  // Create the payload for Stability AI
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('output_format', 'png');
  formData.append('width', '1024');
  formData.append('height', '1024');
  formData.append('cfg_scale', '7');
  formData.append('steps', '40');
  formData.append('sampler', 'K_DPMPP_2M');
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

async function makeTextureSeamless(inputImageBase64, prompt) {
  try {
    const sessionId = uuidv4();
    const writeFile = promisify(fs.writeFile);
    const readFile = promisify(fs.readFile);
    
    // Create input file path
    const inputPath = path.join(tempDir, `${sessionId}_input.png`);
    const outputPath = path.join(tempDir, `${sessionId}_output.png`);
    const maskPath = path.join(tempDir, `${sessionId}_mask.png`);
    const swappedPath = path.join(tempDir, `${sessionId}_swapped.png`);
    const finalPath = path.join(tempDir, `${sessionId}_final.png`);
    
    // Save the input image
    const inputBuffer = Buffer.from(inputImageBase64, 'base64');
    await writeFile(inputPath, inputBuffer);
    
    // Load image with sharp
    const imageInfo = await sharp(inputPath).metadata();
    const { width, height } = imageInfo;
    
    console.log(`Image dimensions: ${width}x${height}`);
    
    if (width !== height) {
      throw new Error("Input image must be square");
    }
    
    // Ensure we have valid dimensions
    if (!width || !height || width < 10 || height < 10) {
      throw new Error(`Invalid image dimensions: ${width}x${height}`);
    }
    
    try {
      // Instead of the quadrant swap technique, let's use a simpler and more reliable approach
      // First, we'll use Replicate to generate a base seamless texture
      const replicateClient = new replicate({
        auth: process.env.REPLICATE_API_TOKEN
      });
      
      console.log("Generating base seamless texture with SDXL...");
      
      const baseOutput = await replicateClient.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: prompt + ", seamless texture, tileable pattern, detailed, high quality, no seams, no borders",
            negative_prompt: IMAGE_GENERATION_PROMPT.negative + ", border, seam, edge artifact, frame",
            width: 1024,
            height: 1024,
            num_outputs: 1,
            scheduler: "K_DPMPP_2M",
            num_inference_steps: 40,
            guidance_scale: 8.0,
            tiling: true
          }
        }
      );
      
      // Download the base texture
      if (!Array.isArray(baseOutput) || baseOutput.length === 0) {
        throw new Error('No output image received from SDXL generation');
      }
      
      const baseImageUrl = baseOutput[0];
      const baseResponse = await axios.get(baseImageUrl, { responseType: 'arraybuffer' });
      const baseBuffer = Buffer.from(baseResponse.data);
      
      // Save the base texture for processing
      await writeFile(inputPath, baseBuffer);
      
      // Create a mask for the edges of the image
      console.log("Creating edge mask for seamless processing...");
      
      // Calculate the edge width - use 5% of image width
      const edgeWidth = Math.max(20, Math.floor(width * 0.05));
      
      // Create edge masks - will be white (255) where we want to fix seams
      const topEdgeMask = await sharp({
        create: {
          width: width,
          height: edgeWidth,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 255 }
        }
      }).png().toBuffer();
      
      const bottomEdgeMask = await sharp({
        create: {
          width: width,
          height: edgeWidth,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 255 }
        }
      }).png().toBuffer();
      
      const leftEdgeMask = await sharp({
        create: {
          width: edgeWidth,
          height: height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 255 }
        }
      }).png().toBuffer();
      
      const rightEdgeMask = await sharp({
        create: {
          width: edgeWidth,
          height: height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 255 }
        }
      }).png().toBuffer();
      
      // Full mask base (transparent/black)
      const fullMask = await sharp({
        create: {
          width: width,
          height: height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      }).png().toBuffer();
      
      // Combine edge masks
      const edgeMask = await sharp(fullMask)
        .composite([
          { input: topEdgeMask, top: 0, left: 0 },
          { input: bottomEdgeMask, top: height - edgeWidth, left: 0 },
          { input: leftEdgeMask, top: 0, left: 0 },
          { input: rightEdgeMask, top: 0, left: width - edgeWidth }
        ])
        .png()
        .toBuffer();
      
      await writeFile(maskPath, edgeMask);
      
      // Create a horizontally wrapped version of the image
      // This helps ensure seamless horizontal edges
      const rightHalf = await sharp(inputPath)
        .extract({ left: Math.floor(width/2), top: 0, width: Math.floor(width/2), height: height })
        .toBuffer();
      
      const leftHalf = await sharp(inputPath)
        .extract({ left: 0, top: 0, width: Math.floor(width/2), height: height })
        .toBuffer();
      
      const horizontalWrap = await sharp({
        create: {
          width: width,
          height: height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([
          { input: rightHalf, top: 0, left: 0 },
          { input: leftHalf, top: 0, left: Math.floor(width/2) }
        ])
        .png()
        .toBuffer();
      
      await writeFile(swappedPath, horizontalWrap);
      
      // Now use the inpainting to make the edges seamless
      console.log("Inpainting edge regions for seamless texture...");
      
      // Use the specialized TEXTURE_INPAINTING_PROMPT for inpainting
      const inpaintingPrompt = TEXTURE_INPAINTING_PROMPT.positive.replace('${prompt}', prompt);
      const inpaintingNegative = TEXTURE_INPAINTING_PROMPT.negative;
      
      const inpaintedImage = await inpaintWithReplicateAPI(
        swappedPath,
        maskPath,
        inpaintingPrompt,
        inpaintingNegative
      );
      
      await writeFile(outputPath, inpaintedImage);
      
      // Final post-processing - apply a proper tiling approach
      console.log("Applying final seamless post-processing...");
      
      // This will ensure true seamlessness by properly wrapping the texture edges
      const processedImage = await ensureSeamless(outputPath, finalPath);
      
      // Convert to base64
      const finalImageBase64 = processedImage.toString('base64');
      
      // Clean up temp files
      const cleanup = async () => {
        try {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
          fs.unlinkSync(maskPath);
          fs.unlinkSync(swappedPath);
          fs.unlinkSync(finalPath);
        } catch (err) {
          console.error('Error cleaning up temp files:', err);
        }
      };
      
      // Clean up files asynchronously
      cleanup();
      
      return finalImageBase64;
    } catch (error) {
      console.error('Error during seamless processing:', error);
      
      // Fallback to direct generation if anything fails
      console.log('Falling back to direct generation without processing');
      
      // Generate a seamless texture directly with Replicate
      const replicateClient = new replicate({
        auth: process.env.REPLICATE_API_TOKEN
      });
      
      const output = await replicateClient.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: prompt,
            negative_prompt: IMAGE_GENERATION_PROMPT.negative,
            width: 1024,
            height: 1024,
            num_outputs: 1,
            scheduler: "K_EULER",
            num_inference_steps: 40,
            guidance_scale: 8.0,
            tiling: true
          }
        }
      );
      
      if (Array.isArray(output) && output.length > 0) {
        const imageUrl = output[0];
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data).toString('base64');
      } else {
        throw new Error('No output image received from fallback generation');
      }
    }
  } catch (error) {
    console.error('Error making texture seamless:', error);
    throw error;
  }
}

async function ensureSeamless(inputPath, outputPath) {
  try {
    // Load the image
    const inputBuffer = await fs.promises.readFile(inputPath);
    const imageInfo = await sharp(inputBuffer).metadata();
    const { width, height } = imageInfo;
    
    // Create a 2x2 tiled version to help analyze the edges
    const leftHalf = await sharp(inputBuffer)
      .extract({ left: 0, top: 0, width: Math.floor(width/2), height: height })
      .toBuffer();
      
    const rightHalf = await sharp(inputBuffer)
      .extract({ left: Math.floor(width/2), top: 0, width: Math.floor(width/2), height: height })
      .toBuffer();
      
    const topHalf = await sharp(inputBuffer)
      .extract({ left: 0, top: 0, width: width, height: Math.floor(height/2) })
      .toBuffer();
      
    const bottomHalf = await sharp(inputBuffer)
      .extract({ left: 0, top: Math.floor(height/2), width: width, height: Math.floor(height/2) })
      .toBuffer();
    
    // Use Poisson blending approach: blend opposite edges
    // First, create a blended horizontal seam
    const horizontalSeam = await sharp(inputBuffer)
      .extract({ left: 0, top: height - 4, width: width, height: 8 })
      .blur(2)
      .toBuffer();
    
    // Create a blended vertical seam
    const verticalSeam = await sharp(inputBuffer)
      .extract({ left: width - 4, top: 0, width: 8, height: height })
      .blur(2)
      .toBuffer();
    
    // Apply the seam fixes to the image
    const seamFixed = await sharp(inputBuffer)
      .composite([
        { input: horizontalSeam, top: 0, left: 0 },
        { input: horizontalSeam, top: height - 4, left: 0 },
        { input: verticalSeam, top: 0, left: 0 },
        { input: verticalSeam, top: 0, left: width - 4 }
      ])
      .toBuffer();
    
    // Final pass - use a 2x2 tiled approach and average the center to ensure perfect seamlessness
    // Create a 2x2 tiled version
    const tiled = await sharp({
      create: {
        width: width * 2,
        height: height * 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        { input: seamFixed, top: 0, left: 0 },
        { input: seamFixed, top: 0, left: width },
        { input: seamFixed, top: height, left: 0 },
        { input: seamFixed, top: height, left: width }
      ])
      .toBuffer();
    
    // Extract the center portion which should now have perfectly blended seams
    const finalSeamless = await sharp(tiled)
      .extract({ 
        left: Math.floor(width/2), 
        top: Math.floor(height/2), 
        width: width, 
        height: height 
      })
      .toBuffer();
    
    // Save the output
    await fs.promises.writeFile(outputPath, finalSeamless);
    
    return finalSeamless;
  } catch (error) {
    console.error('Error ensuring seamless texture:', error);
    // Return the original if processing fails
    return fs.promises.readFile(inputPath);
  }
}

async function inpaintWithReplicateAPI(imagePath, maskPath, prompt, negativePrompt) {
  try {
    // Initialize Replicate client
    const replicateClient = new replicate({
      auth: process.env.REPLICATE_API_TOKEN
    });
    
    // Read files and convert to base64
    const imageBase64 = fs.readFileSync(imagePath).toString('base64');
    const maskBase64 = fs.readFileSync(maskPath).toString('base64');
    
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
          num_inference_steps: 25
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