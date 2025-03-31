import os
import io
import requests
import numpy as np
from PIL import Image, ImageDraw
import base64
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get API key from environment variables
STABILITY_API_KEY = os.getenv("STABILITY_API_KEY")
if not STABILITY_API_KEY:
    raise ValueError("Please set the STABILITY_API_KEY environment variable")

def split_image_into_quadrants(image):
    """Split a square image into four equal quadrants."""
    width, height = image.size
    half_width, half_height = width // 2, height // 2
    
    top_left = image.crop((0, 0, half_width, half_height))
    top_right = image.crop((half_width, 0, width, half_height))
    bottom_left = image.crop((0, half_height, half_width, height))
    bottom_right = image.crop((half_width, half_height, width, height))
    
    return top_left, top_right, bottom_left, bottom_right

def swap_quadrants_diagonally(quadrants):
    """Swap quadrants diagonally."""
    top_left, top_right, bottom_left, bottom_right = quadrants
    return bottom_right, bottom_left, top_right, top_left

def combine_quadrants(quadrants, output_size):
    """Combine four quadrants into a single image."""
    top_left, top_right, bottom_left, bottom_right = quadrants
    
    combined = Image.new('RGB', output_size)
    half_width, half_height = output_size[0] // 2, output_size[1] // 2
    
    combined.paste(top_left, (0, 0))
    combined.paste(top_right, (half_width, 0))
    combined.paste(bottom_left, (0, half_height))
    combined.paste(bottom_right, (half_width, half_height))
    
    return combined

def create_center_mask(size, width=64):
    """Create a mask that covers the center cross of the image."""
    mask = Image.new('L', size, 0)  # 0 = black (unmasked)
    draw = ImageDraw.Draw(mask)
    
    half_width, half_height = size[0] // 2, size[1] // 2
    half_mask_width = width // 2
    
    # Draw horizontal line
    draw.rectangle(
        (0, half_height - half_mask_width, size[0], half_height + half_mask_width), 
        fill=255  # 255 = white (masked)
    )
    
    # Draw vertical line
    draw.rectangle(
        (half_width - half_mask_width, 0, half_width + half_mask_width, size[1]),
        fill=255  # 255 = white (masked)
    )
    
    return mask

def image_to_base64(image):
    """Convert a PIL image to base64 string."""
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def inpaint_with_stability_api(image, mask, prompt, api_key, denoising_strength=0.4):
    """Use Stability AI API to inpaint the masked area."""
    url = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image/masking"
    
    # Convert images to base64
    image_b64 = image_to_base64(image)
    mask_b64 = image_to_base64(mask)
    
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    payload = {
        "text_prompts": [{"text": prompt}],
        "init_image": image_b64,
        "mask_image": mask_b64,
        "mask_source": "MASK_IMAGE_WHITE",
        "cfg_scale": 7,
        "clip_guidance_preset": "FAST_BLUE",
        "samples": 1,
        "steps": 30,
        "style_preset": "photographic",
        "seed": 42,
        "strength": denoising_strength  # Equivalent to denoising strength
    }
    
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code != 200:
        raise Exception(f"API request failed: {response.text}")
    
    # Decode and return the first image
    result = response.json()
    image_b64 = result["artifacts"][0]["base64"]
    image_data = base64.b64decode(image_b64)
    return Image.open(io.BytesIO(image_data))

def make_texture_seamless(input_image_path, output_image_path, prompt, api_key, denoising_strength=0.4):
    """Make a texture seamless using the quadrant swap technique."""
    
    # Load input image
    original_image = Image.open(input_image_path)
    width, height = original_image.size
    
    if width != height:
        raise ValueError("Input image must be square")
    
    # Split the image into quadrants
    quadrants = split_image_into_quadrants(original_image)
    
    # Swap quadrants diagonally
    swapped_quadrants = swap_quadrants_diagonally(quadrants)
    
    # Combine the swapped quadrants
    swapped_image = combine_quadrants(swapped_quadrants, (width, height))
    
    # Create mask for the center cross
    mask = create_center_mask((width, height), width=64)
    
    # Use Stability API to inpaint the center cross
    inpainted_image = inpaint_with_stability_api(
        swapped_image, 
        mask, 
        prompt, 
        api_key,
        denoising_strength
    )
    
    # Split the inpainted image into quadrants
    inpainted_quadrants = split_image_into_quadrants(inpainted_image)
    
    # Swap quadrants back to their original positions
    final_quadrants = swap_quadrants_diagonally(inpainted_quadrants)
    
    # Combine the final quadrants
    final_image = combine_quadrants(final_quadrants, (width, height))
    
    # Save the final image
    final_image.save(output_image_path)
    return final_image

def main():
    # Example usage
    input_image_path = "input_texture.png"
    output_image_path = "seamless_texture.png"
    
    # This should be similar to the prompt used to generate the original texture
    prompt = "detailed seamless texture pattern"
    
    make_texture_seamless(
        input_image_path,
        output_image_path,
        prompt,
        STABILITY_API_KEY,
        denoising_strength=0.4
    )
    print(f"Seamless texture saved to {output_image_path}")

if __name__ == "__main__":
    main()