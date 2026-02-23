import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateIcons() {
  const logoPath = join(__dirname, '../public/logo.png');
  const publicDir = join(__dirname, '../public');

  console.log('Reading logo from:', logoPath);

  // 生成不同尺寸的 PNG 图标
  const sizes = [16, 32, 48, 64, 128, 192, 512];

  for (const size of sizes) {
    const outputPath = join(publicDir, `icon-${size}.png`);
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated: icon-${size}.png`);
  }

  // 生成 favicon.ico (16x16, 32x32, 48x48 多尺寸)
  const faviconBuffer = await sharp(logoPath)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // 写入 favicon.png (浏览器支持更好)
  const faviconPath = join(publicDir, 'favicon.png');
  writeFileSync(faviconPath, faviconBuffer);
  console.log('✓ Generated: favicon.png');

  // 生成 Apple Touch Icon (180x180)
  const appleTouchIcon = join(publicDir, 'apple-touch-icon.png');
  await sharp(logoPath)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile(appleTouchIcon);
  console.log('✓ Generated: apple-touch-icon.png');

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
