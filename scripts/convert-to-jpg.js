const sharp = require('sharp');
const path = require('path');

async function convertToJpg(inputPath, outputPath) {
  await sharp(inputPath)
    .jpeg({ quality: 85 })
    .toFile(outputPath);
  console.log(`Converted ${path.basename(inputPath)} to ${path.basename(outputPath)}`);
}

async function main() {
  const websiteDir = path.join(__dirname, '..', 'website');
  
  await convertToJpg(
    path.join(websiteDir, 'screenshot-1.png'),
    path.join(websiteDir, 'screenshot-1.jpg')
  );
  
  await convertToJpg(
    path.join(websiteDir, 'screenshot-2.png'),
    path.join(websiteDir, 'screenshot-2.jpg')
  );
  
  await convertToJpg(
    path.join(websiteDir, 'screenshot-3.png'),
    path.join(websiteDir, 'screenshot-3.jpg')
  );
  
  await convertToJpg(
    path.join(websiteDir, 'screenshot-4.png'),
    path.join(websiteDir, 'screenshot-4.jpg')
  );
  
  console.log('\nDone! Converted all screenshots to JPG.');
}

main().catch(console.error);
