/**
 * SVG Utilities for PPTX Generation
 *
 * Provides functions to:
 * - Validate and clean SVG code
 * - Convert SVG to PNG for compatibility
 * - Insert SVG directly into PPT slides
 *
 * Usage:
 *   const { validateSvg, svgToPng, addSvgToSlide } = require('./svg-utils');
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Validate and clean SVG string
 * Removes potentially dangerous attributes and fixes common issues
 * @param {string} svgString - Raw SVG code
 * @returns {object} - { valid: boolean, svg: string, errors: string[] }
 */
function validateSvg(svgString) {
  const errors = [];
  let svg = svgString.trim();

  // Check if it's a valid XML document
  if (!svg.includes('<svg') || !svg.includes('</svg>')) {
    return { valid: false, svg: svg, errors: ['Missing <svg> element'] };
  }

  // Add xmlns if missing (required for sharp to process)
  if (!svg.includes('xmlns') && !svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // Remove potentially dangerous attributes
  const dangerousPatterns = [
    /on\w+\s*=\s*["'][^"']*["']/gi,  // Event handlers: onclick, onload, etc.
    /javascript:\s*/gi,                // JavaScript URLs
    /data:\s*image\/svg\+xml/gi,       // Embedded SVG data URLs
  ];

  dangerousPatterns.forEach(pattern => {
    const matches = svg.match(pattern);
    if (matches) {
      errors.push(`Removed dangerous pattern: ${matches[0]}`);
      svg = svg.replace(pattern, '');
    }
  );

  // Fix missing width/height by adding viewBox-based defaults
  const widthMatch = svg.match(/\swidth=["'](\d+)/);
  const heightMatch = svg.match(/\sheight=["'](\d+)/);
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)/);

  if ((!widthMatch || !heightMatch) && viewBoxMatch) {
    const viewBox = viewBoxMatch[1].split(/\s+/).map(Number);
    if (viewBox.length === 4 && !widthMatch) {
      svg = svg.replace('<svg', `<svg width="${viewBox[2]}"`);
      errors.push('Added missing width attribute from viewBox');
    }
    if (viewBox.length === 4 && !heightMatch) {
      svg = svg.replace('<svg', `<svg height="${viewBox[3]}"`);
      errors.push('Added missing height attribute from viewBox');
    }
  }

  // Ensure proper self-closing tags for void elements
  const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  voidElements.forEach(elem => {
    const regex = new RegExp(`<${elem}([^>]*)(?<!/)>`, 'gi');
    svg = svg.replace(regex, `<${elem}$1 />`);
  });

  return { valid: true, svg, errors };
}

/**
 * Convert SVG string to PNG buffer
 * @param {string} svgString - Valid SVG code
 * @param {object} options - Conversion options
 * @param {number} options.width - Output width in pixels
 * @param {number} options.height - Output height in pixels
 * @param {string} options.background - Background color (hex, rgba, etc.)
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function svgToPng(svgString, options = {}) {
  const { width = 800, height = 600, background = 'white' } = options;

  const validated = validateSvg(svgString);
  if (!validated.valid) {
    throw new Error(`Invalid SVG: ${validated.errors.join(', ')}`);
  }

  return sharp(Buffer.from(validated.svg))
    .resize(width, height, { fit: 'contain', background })
    .png()
    .toBuffer();
}

/**
 * Convert SVG string to base64 PNG data URI
 * @param {string} svgString - Valid SVG code
 * @param {object} options - Conversion options (same as svgToPng)
 * @returns {Promise<string>} - Base64 PNG data URI
 */
async function svgToBase64Png(svgString, options = {}) {
  const pngBuffer = await svgToPng(svgString, options);
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

/**
 * Add SVG directly to a PPT slide
 * Automatically validates, converts to PNG, and inserts
 * @param {object} slide - PptxGenJS slide object
 * @param {string} svgString - SVG code
 * @param {object} options - Positioning and sizing options
 * @param {number} options.x - X position in inches
 * @param {number} options.y - Y position in inches
 * @param {number} options.w - Width in inches
 * @param {number} options.h - Height in inches
 * @param {number} options.pngWidth - PNG render width in pixels (default 800)
 * @param {number} options.pngHeight - PNG render height in pixels (default 600)
 * @returns {Promise<void>}
 */
async function addSvgToSlide(slide, svgString, options = {}) {
  const {
    x = 1,
    y = 1,
    w = 4,
    h = 3,
    pngWidth = 800,
    pngHeight = 600,
    background = 'white'
  } = options;

  const pngData = await svgToBase64Png(svgString, {
    width: pngWidth,
    height: pngHeight,
    background
  });

  slide.addImage({
    data: pngData,
    x,
    y,
    w,
    h
  });
}

/**
 * Read SVG file from disk and validate
 * @param {string} filePath - Path to SVG file
 * @returns {object} - { valid: boolean, svg: string, errors: string[], filePath: string }
 */
function readSvgFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, svg: '', errors: ['File not found'], filePath };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const validation = validateSvg(content);

  return {
    ...validation,
    filePath
  };
}

/**
 * Convert SVG file to PNG file
 * @param {string} inputPath - Input SVG file path
 * @param {string} outputPath - Output PNG file path
 * @param {object} options - Conversion options
 * @returns {Promise<void>}
 */
async function convertSvgFile(inputPath, outputPath, options = {}) {
  const validated = readSvgFile(inputPath);
  if (!validated.valid) {
    throw new Error(`Invalid SVG file: ${validated.errors.join(', ')}`);
  }

  const pngBuffer = await svgToPng(validated.svg, options);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, pngBuffer);
}

/**
 * Batch convert directory of SVG files to PNG
 * @param {string} inputDir - Input directory path
 * @param {string} outputDir - Output directory path
 * @param {object} options - Conversion options
 * @returns {Promise<object>} - Results summary
 */
async function batchConvert(inputDir, outputDir, options = {}) {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const files = fs.readdirSync(inputDir);
  const svgFiles = files.filter(f => f.toLowerCase().endsWith('.svg'));

  const results = {
    success: [],
    failed: []
  };

  for (const file of svgFiles) {
    const inputPath = path.join(inputDir, file);
    const outputName = file.replace(/\.svg$/i, '.png');
    const outputPath = path.join(outputDir, outputName);

    try {
      await convertSvgFile(inputPath, outputPath, options);
      results.success.push({ input: inputPath, output: outputPath });
    } catch (error) {
      results.failed.push({ input: inputPath, error: error.message });
    }
  }

  return results;
}

module.exports = {
  validateSvg,
  svgToPng,
  svgToBase64Png,
  addSvgToSlide,
  readSvgFile,
  convertSvgFile,
  batchConvert
};
