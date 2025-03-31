import replicate from 'replicate';
import { IMAGE_GENERATION_PROMPT } from '../../lib/prompts';
import { Readable } from 'stream';

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
    let negativePrompt = IMAGE_GENERATION_PROMPT.negative;

    // Define a simple ComfyUI workflow for seamless texture generation
    const workflowJson = {
      "1": {
        "inputs": {
          "ckpt_name": "sd_xl_base_1.0.safetensors"
        },
        "class_type": "CheckpointLoaderSimple",
        "_meta": { "title": "Load Checkpoint" }
      },
      "2": {
        "inputs": {
          "width": 1024,
          "height": 1024,
          "batch_size": 1
        },
        "class_type": "EmptyLatentImage",
        "_meta": { "title": "Empty Latent Image" }
      },
      "3": {
        "inputs": {
          "text": enhancedPrompt,
          "clip": ["1", 1]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "CLIP Text Encode (Prompt)" }
      },
      "4": {
        "inputs": {
          "text": negativePrompt,
          "clip": ["1", 1]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "CLIP Text Encode (Negative)" }
      },
      "5": {
        "inputs": {
          "seed": Math.floor(Math.random() * 999999999),
          "steps": 40,
          "cfg": 8,
          "sampler_name": "euler",
          "scheduler": "karras",
          "denoise": 1,
          "tiling": true,
          "model": ["1", 0],
          "positive": ["3", 0],
          "negative": ["4", 0],
          "latent_image": ["2", 0]
        },
        "class_type": "KSampler",
        "_meta": { "title": "KSampler (Seamless Tiling)" }
      },
      "6": {
        "inputs": {
          "samples": ["5", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode",
        "_meta": { "title": "VAE Decode" }
      },
      "7": {
        "inputs": {
          "filename_prefix": "seamless_texture",
          "images": ["6", 0]
        },
        "class_type": "SaveImage",
        "_meta": { "title": "Save Image" }
      }
    };

    // Initialize Replicate client
    const replicateClient = new replicate({
      auth: process.env.REPLICATE_API_TOKEN
    });

    // Run the prediction
    const output = await replicateClient.run(
      "fofr/any-comfyui-workflow:ba115dfd130aeb6873124af76e0f0b6273d796883d9f184f8ad7de7ae5dad24b",
      {
        input: {
          output_format: "png",
          workflow_json: JSON.stringify(workflowJson),
          output_quality: 100,
          randomise_seeds: true
        }
      }
    );

    // Handle the output stream
    if (output && output[0]) {
      if (output[0] instanceof ReadableStream) {
        // Convert ReadableStream to Buffer
        const reader = output[0].getReader();
        const chunks = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        const buffer = Buffer.concat(chunks);
        const base64Image = buffer.toString('base64');
        
        return res.status(200).json({
          imageUrl: `data:image/png;base64,${base64Image}`
        });
      } else {
        // If it's a regular URL, return it as is
        return res.status(200).json({
          imageUrl: output[0]
        });
      }
    } else {
      throw new Error('No output image received from Replicate');
    }
  } catch (error) {
    console.error('Error generating image:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate image' 
    });
  }
}