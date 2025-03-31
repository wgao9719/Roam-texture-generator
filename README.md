# AI Seamless Texture Generator

A web application that generates seamless textures using AI image generation.

## Features

- Generate seamless textures from text descriptions
- Download generated textures
- View full-size images in a dedicated viewer
- Responsive design
- Real-time generation status updates

## Setup for Local Development

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env.local` file with your API keys:
```
STABILITY_API_KEY=your_stability_api_key_here
REPLICATE_API_TOKEN=your_replicate_api_token_here
```
4. Run the development server:
```bash
npm run dev
```

## Deployment on Vercel

This application is optimized for Vercel deployment with serverless functions.

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fyourrepo&env=STABILITY_API_KEY,REPLICATE_API_TOKEN)

### Manual Deployment

1. Push your code to a GitHub repository
2. Visit [Vercel](https://vercel.com) and sign in with GitHub
3. Click "Import Project" and select your repository
4. Add your Environment Variables:
   - `STABILITY_API_KEY`: Your Stability AI API key
   - `REPLICATE_API_TOKEN`: Your Replicate API token
5. Click "Deploy"

## Environment Variables

- `STABILITY_API_KEY`: Your Stability AI API key (required)
- `REPLICATE_API_TOKEN`: Your Replicate API token (required)

## Vercel Compatibility

This project includes optimizations for Vercel serverless functions:

- Uses `/tmp` directory for temporary files in production
- Implements appropriate timeouts and error handling
- Includes `vercel.json` configuration for function resource allocation
- Optimized memory usage for serverless environment

## How It Works

1. **Initial Texture Generation**: Uses Stability AI API to create high-quality texture from the user's description
2. **Seamless Processing**: Applies a mirror-based algorithm to make the texture tileable
3. **SDXL Enhancement**: Optionally enhances the seamless texture while preserving its tileable properties

## Tech Stack

- Next.js
- React
- Tailwind CSS
- Stability AI API
- Replicate API (for SDXL)
- Sharp (for image processing)

## Troubleshooting

If you encounter issues:

1. Check that your API keys are correctly set in environment variables
2. Verify your Vercel function timeout settings (in vercel.json)
3. Check server logs for detailed error messages

## License

MIT 