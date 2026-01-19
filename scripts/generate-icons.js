#!/usr/bin/env node
/**
 * Generate app icons for all platforms from the PNG source.
 * 
 * Requirements:
 * - sharp (already in dependencies)
 * - For .icns: run on macOS with iconutil
 * - For .ico: use png-to-ico package
 * 
 * Usage: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SOURCE_PNG = path.join(ASSETS_DIR, 'icon-large.png');

// Sizes needed for various platforms
const SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function generatePNGs() {
  console.log('Generating PNG icons...');
  
  const iconsetDir = path.join(ASSETS_DIR, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  for (const size of SIZES) {
    // Standard resolution
    await sharp(SOURCE_PNG)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetDir, `icon_${size}x${size}.png`));
    
    // @2x for Retina (macOS)
    if (size <= 512) {
      await sharp(SOURCE_PNG)
        .resize(size * 2, size * 2)
        .png()
        .toFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
    }
    
    console.log(`  Generated ${size}x${size}`);
  }

  // Also create a main icon.png at 512x512 for Linux
  await sharp(SOURCE_PNG)
    .resize(512, 512)
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  
  console.log('  Generated icon.png (512x512)');
}

async function generateICNS() {
  if (process.platform !== 'darwin') {
    console.log('Skipping .icns generation (not on macOS)');
    console.log('To generate .icns on macOS, run: iconutil -c icns assets/icon.iconset');
    return;
  }

  console.log('Generating .icns for macOS...');
  try {
    execSync(`iconutil -c icns ${path.join(ASSETS_DIR, 'icon.iconset')} -o ${path.join(ASSETS_DIR, 'icon.icns')}`);
    console.log('  Generated icon.icns');
  } catch (err) {
    console.error('  Failed to generate .icns:', err.message);
  }
}

async function generateICO() {
  console.log('Generating .ico for Windows...');
  try {
    // Generate high-quality PNGs for .ico
    // Note: to-ico has a 256x256 max size limitation
    const icoSizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = [];
    
    console.log('  Creating icon layers...');
    for (const size of icoSizes) {
      const buffer = await sharp(SOURCE_PNG)
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ compressionLevel: 9, quality: 100 })
        .toBuffer();
      pngBuffers.push(buffer);
      console.log(`    ${size}x${size}`);
    }
    
    // Try to use to-ico package
    try {
      const toIco = require('to-ico');
      const icoBuffer = await toIco(pngBuffers);
      fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), icoBuffer);
      console.log('  Generated icon.ico with sizes:', icoSizes.join(', '));
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        console.log('  to-ico not installed, trying alternative method...');
        
        // Fallback: save PNGs and use png-to-ico
        const tempDir = path.join(ASSETS_DIR, 'temp-ico');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const pngPaths = [];
        for (let i = 0; i < icoSizes.length; i++) {
          const pngPath = path.join(tempDir, `${icoSizes[i]}.png`);
          fs.writeFileSync(pngPath, pngBuffers[i]);
          pngPaths.push(pngPath);
        }
        
        try {
          const pngFiles = pngPaths.join(' ');
          const icoPath = path.join(ASSETS_DIR, 'icon.ico');
          execSync(`npx png-to-ico ${pngFiles} > ${icoPath}`, { stdio: 'inherit' });
          console.log('  Generated icon.ico using png-to-ico');
        } catch (err2) {
          console.log('  Failed to generate .ico');
          console.log('  Install to-ico with: npm install to-ico');
          console.log('  Or use the PNGs in:', tempDir);
          return; // Don't clean up so user can manually convert
        }
        
        fs.rmSync(tempDir, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('  Failed to generate .ico:', err.message);
  }
}

async function main() {
  console.log('Brighter Merchant Icon Generator\n');
  
  if (!fs.existsSync(SOURCE_PNG)) {
    console.error('Error: icon-large.png not found in assets/');
    console.error('Please ensure you have a high-resolution (1024x1024+) icon-large.png file');
    process.exit(1);
  }

  await generatePNGs();
  await generateICNS();
  await generateICO();
  
  console.log('\nDone!');
}

main().catch(console.error);
