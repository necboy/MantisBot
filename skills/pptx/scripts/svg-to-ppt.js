#!/usr/bin/env node

/**
 * SVG to PPTX CLI Tool
 *
 * Command-line interface for SVG validation and conversion
 *
 * Usage:
 *   node svg-to-ppt.js validate <file.svg>
 *   node svg-to-ppt.js convert <input.svg> <output.png> [options]
 *   node svg-to-ppt.js batch <input-dir/> <output-dir/> [options]
 *
 * Options:
 *   --width, -w     Output width in pixels (default: 800)
 *   --height, -h    Output height in pixels (default: 600)
 *   --bg, -b        Background color (default: white)
 */

const fs = require('fs');
const path = require('path');
const {
  validateSvg,
  convertSvgFile,
  batchConvert,
  readSvgFile
} = require('./svg-utils');

const args = process.argv.slice(2);
const command = args[0];

// Parse options from args
function parseOptions(args) {
  const options = {};
  const remaining = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--width' || arg === '-w') {
      options.width = parseInt(args[++i], 10);
    } else if (arg === '--height' || arg === '-h') {
      options.height = parseInt(args[++i], 10);
    } else if (arg === '--bg' || arg === '-b') {
      options.background = args[++i];
    } else if (!arg.startsWith('-')) {
      remaining.push(arg);
    }
  }

  return { options, remaining };
}

async function main() {
  const { options, remaining } = parseOptions(args.slice(1));

  switch (command) {
    case 'validate': {
      const filePath = remaining[0];
      if (!filePath) {
        console.error('Usage: node svg-to-ppt.js validate <file.svg>');
        process.exit(1);
      }

      const result = readSvgFile(filePath);
      console.log(`\n=== SVG Validation Result ===`);
      console.log(`File: ${filePath}`);
      console.log(`Valid: ${result.valid ? 'YES' : 'NO'}`);

      if (result.errors.length > 0) {
        console.log(`\nIssues found:`);
        result.errors.forEach(err => console.log(`  - ${err}`));
      } else {
        console.log(`\nNo issues found.`);
      }

      // Show SVG preview
      const svg = result.svg.substring(0, 200);
      console.log(`\nSVG Preview (first 200 chars):\n${svg}...`);
      break;
    }

    case 'convert': {
      const inputPath = remaining[0];
      const outputPath = remaining[1];

      if (!inputPath || !outputPath) {
        console.error('Usage: node svg-to-ppt.js convert <input.svg> <output.png> [options]');
        console.error('Options: --width, --height, --bg');
        process.exit(1);
      }

      console.log(`\n=== Converting SVG to PNG ===`);
      console.log(`Input:  ${inputPath}`);
      console.log(`Output: ${outputPath}`);
      console.log(`Options:`, options);

      try {
        await convertSvgFile(inputPath, outputPath, options);
        console.log(`\n✓ Success! PNG saved to: ${outputPath}`);

        // Show file size
        const stats = fs.statSync(outputPath);
        console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.error(`\n✗ Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'batch': {
      const inputDir = remaining[0];
      const outputDir = remaining[1];

      if (!inputDir || !outputDir) {
        console.error('Usage: node svg-to-ppt.js batch <input-dir/> <output-dir/> [options]');
        process.exit(1);
      }

      console.log(`\n=== Batch Converting SVG Files ===`);
      console.log(`Input:  ${inputDir}`);
      console.log(`Output: ${outputDir}`);
      console.log(`Options:`, options);

      try {
        const results = await batchConvert(inputDir, outputDir, options);

        console.log(`\n=== Results ===`);
        console.log(`Successful: ${results.success.length}`);
        console.log(`Failed: ${results.failed.length}`);

        if (results.success.length > 0) {
          console.log(`\nConverted files:`);
          results.success.forEach(r => console.log(`  ✓ ${path.basename(r.input)} → ${path.basename(r.output)}`));
        }

        if (results.failed.length > 0) {
          console.log(`\nFailed files:`);
          results.failed.forEach(r => console.log(`  ✗ ${path.basename(r.input)}: ${r.error}`));
        }
      } catch (error) {
        console.error(`\n✗ Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default:
      console.log(`
=== SVG to PPTX CLI Tool ===

Usage:
  node svg-to-ppt.js validate <file.svg>
    Validate an SVG file and show any issues

  node svg-to-ppt.js convert <input.svg> <output.png> [options]
    Convert a single SVG file to PNG

  node svg-to-ppt.js batch <input-dir/> <output-dir/> [options]
    Convert all SVG files in a directory

Options:
  --width, -w <px>    Output width (default: 800)
  --height, -h <px>   Output height (default: 600)
  --bg, -b <color>    Background color (default: white)

Examples:
  node svg-to-ppt.js validate chart.svg
  node svg-to-ppt.js convert input.svg output.png --width 1200 --height 800
  node svg-to-ppt.js batch ./svgs ./pngs -w 1024 -h 768
`);
      break;
  }
}

main().catch(console.error);
