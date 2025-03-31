const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

console.log('Running Sharp cross-platform installer script...');

// Determine if we're in a production environment (Vercel)
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = !!process.env.VERCEL;
const platform = os.platform();

// Just to be sure, we'll check if we even need to reinstall Sharp
let needsReinstall = true;

try {
  // Try to require Sharp to see if it works
  require('sharp');
  console.log('Sharp is already properly installed.');
  
  // We'll still reinstall on Vercel to be safe
  if (isVercel || isProduction) {
    console.log('Running on Vercel/production, will reinstall to be safe.');
  } else {
    needsReinstall = false;
  }
} catch (err) {
  console.log('Sharp is not properly installed. Installing now...');
}

if (needsReinstall) {
  try {
    if (isVercel || isProduction || platform === 'linux') {
      // Vercel runs on Linux, so we need Linux binaries
      console.log('Installing Sharp for Linux platform...');
      
      // First uninstall any existing Sharp installation
      try {
        execSync('npm uninstall sharp', { stdio: 'inherit' });
      } catch (err) {
        console.log('Sharp was not previously installed');
      }
      
      // Install sharp specifically for Linux
      execSync('npm install --platform=linux --arch=x64 sharp@0.32.6', { stdio: 'inherit' });
      
      console.log('Sharp for Linux installed successfully');
    } else {
      console.log(`Installing Sharp for ${platform} platform...`);
      
      // For other platforms, just reinstall without platform specifics
      try {
        execSync('npm uninstall sharp', { stdio: 'inherit' });
      } catch (err) {
        console.log('Sharp was not previously installed');
      }
      
      execSync('npm install sharp@0.32.6', { stdio: 'inherit' });
      
      console.log(`Sharp for ${platform} installed successfully`);
    }
    
    // Verify installation
    try {
      const sharp = require('sharp');
      console.log(`Sharp installed successfully (version: ${sharp.versions.sharp})`);
    } catch (err) {
      console.error('Failed to verify Sharp installation:', err.message);
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to install Sharp:', err.message);
    process.exit(1);
  }
}

// Create the tmp directory for Vercel
if (isVercel || isProduction) {
  try {
    // Ensure /tmp exists (it should in Vercel)
    if (!fs.existsSync('/tmp')) {
      fs.mkdirSync('/tmp', { recursive: true });
      console.log('Created /tmp directory');
    } else {
      console.log('/tmp directory already exists');
    }
  } catch (err) {
    console.error('Failed to ensure /tmp directory exists:', err.message);
    // Don't exit since this might not be fatal
  }
}

console.log('Sharp installation script completed'); 