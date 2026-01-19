const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function resizeScreenshot(inputPath, outputPath, maxWidth = 1920) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  
  console.log(`Processing ${path.basename(inputPath)}: ${metadata.width}x${metadata.height}`);
  
  if (metadata.width > maxWidth) {
    await image
      .resize(maxWidth, null, { withoutEnlargement: true })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(outputPath);
    
    const stats = fs.statSync(outputPath);
    console.log(`  Resized to ${maxWidth}px width, size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`  Already smaller than ${maxWidth}px, skipping`);
  }
}

async function main() {
  const websiteDir = path.join(__dirname, '..', 'website');
  
  await resizeScreenshot(
    path.join(websiteDir, '1-optimal-bounties.png'),
    path.join(websiteDir, '1-optimal-bounties-resized.png')
  );
  
  await resizeScreenshot(
    path.join(websiteDir, '3-edit-mode.png'),
    path.join(websiteDir, '2-edit-mode-resized.png')
  );
  
  console.log('\nDone! Replace the original files with the resized versions.');
}

main().catch(console.error);
