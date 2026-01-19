const sharp = require('sharp');
const path = require('path');

async function combineScreenshots() {
  const websiteDir = path.join(__dirname, '..', 'website');
  
  // Load both images
  const img3 = sharp(path.join(websiteDir, 'screenshot-3.jpg'));
  const img4 = sharp(path.join(websiteDir, 'screenshot-4.jpg'));
  
  // Get metadata
  const meta3 = await img3.metadata();
  const meta4 = await img4.metadata();
  
  console.log(`Screenshot 3: ${meta3.width}x${meta3.height}`);
  console.log(`Screenshot 4: ${meta4.width}x${meta4.height}`);
  
  // Calculate dimensions
  const spacing = 40; // Space between images
  const totalWidth = meta3.width + spacing + meta4.width;
  const maxHeight = Math.max(meta3.height, meta4.height);
  
  console.log(`Combined: ${totalWidth}x${maxHeight}`);
  
  // Create background with #0D1117 color
  const background = await sharp({
    create: {
      width: totalWidth,
      height: maxHeight,
      channels: 3,
      background: { r: 13, g: 17, b: 23 }
    }
  }).png().toBuffer();
  
  // Composite images side by side
  const img3Buffer = await img3.toBuffer();
  const img4Buffer = await img4.toBuffer();
  
  await sharp(background)
    .composite([
      { input: img3Buffer, left: 0, top: 0 },
      { input: img4Buffer, left: meta3.width + spacing, top: 0 }
    ])
    .jpeg({ quality: 85 })
    .toFile(path.join(websiteDir, 'screenshot-3-4-combined.jpg'));
  
  console.log('\nCreated screenshot-3-4-combined.jpg');
}

combineScreenshots().catch(console.error);
