#!/usr/bin/env node

const path = require('path');
const { gzipSync } = require('zlib');
const fs = require('fs');
const { build } = require('esbuild');

const ROOT_DIR = process.cwd();
const ENTRY_PATH = path.join(ROOT_DIR, 'public/js/holographic/dashboard-main.js');

function parseArgs(argv) {
  const result = {
    minify: false,
    json: null,
    limit: 10
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--minify') {
      result.minify = true;
    } else if (token === '--json') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --json flag');
      }
      result.json = path.resolve(ROOT_DIR, value);
      index += 1;
    } else if (token === '--limit') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --limit flag');
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive number');
      }
      result.limit = Math.floor(parsed);
      index += 1;
    } else if (token === '--help' || token === '-h') {
      result.help = true;
    } else {
      throw new Error(`Unknown flag: ${token}`);
    }
  }

  return result;
}

function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1) {
    return `${bytes.toFixed(0)} B`;
  }
  const mb = kb / 1024;
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  return `${kb.toFixed(2)} kB`;
}

function printHelp() {
  console.log(`Usage: node tools/holographic-bundle-report.js [options]\n\n` +
    `Options:\n` +
    `  --minify           Enable minification to approximate production sizes.\n` +
    `  --json <path>      Write the bundle metrics to the provided JSON file.\n` +
    `  --limit <count>    Number of largest modules to display (default: 10).\n` +
    `  -h, --help         Print this message.\n`);
}

async function run() {
  let flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }

  if (flags.help) {
    printHelp();
    return;
  }

  const buildStart = Date.now();
  const result = await build({
    entryPoints: [ENTRY_PATH],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    metafile: true,
    write: false,
    minify: flags.minify,
    sourcemap: false,
    target: 'es2019',
    absWorkingDir: ROOT_DIR,
    outdir: path.join(ROOT_DIR, '.bundle-analysis')
  });
  const buildDurationMs = Date.now() - buildStart;

  const files = result.outputFiles || [];
  if (!files.length) {
    throw new Error('esbuild did not produce any output files');
  }

  const totalBytes = files.reduce((sum, file) => sum + file.contents.byteLength, 0);
  const totalGzipBytes = files.reduce((sum, file) => sum + gzipSync(file.contents).byteLength, 0);

  const inputEntries = Object.entries(result.metafile.inputs || {});
  const sortedInputs = inputEntries
    .map(([modulePath, info]) => ({
      path: path.relative(ROOT_DIR, modulePath),
      bytes: info.bytes
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, flags.limit);

  const summary = {
    entry: path.relative(ROOT_DIR, ENTRY_PATH),
    minify: flags.minify,
    buildDurationMs,
    outputFiles: files.map(file => ({
      path: path.relative(ROOT_DIR, file.path || ''),
      bytes: file.contents.byteLength,
      gzipBytes: gzipSync(file.contents).byteLength
    })),
    totalBytes,
    totalGzipBytes,
    largestInputs: sortedInputs
  };

  console.log(`\nHolographic dashboard bundle metrics${flags.minify ? ' (minified)' : ''}`);
  console.log('──────────────────────────────────────────────');
  console.log(`Build time: ${buildDurationMs} ms`);
  console.log(`Total output size: ${formatBytes(totalBytes)} (${formatBytes(totalGzipBytes)} gzip)`);
  console.log('\nLargest modules:');
  sortedInputs.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item.path} — ${formatBytes(item.bytes)}`);
  });
  console.log('\nOutput files:');
  summary.outputFiles.forEach(file => {
    console.log(`  ${file.path || '[inline]'} — ${formatBytes(file.bytes)} (${formatBytes(file.gzipBytes)} gzip)`);
  });
  console.log('');

  if (flags.json) {
    fs.mkdirSync(path.dirname(flags.json), { recursive: true });
    fs.writeFileSync(flags.json, JSON.stringify(summary, null, 2));
    console.log(`Wrote metrics to ${path.relative(ROOT_DIR, flags.json)}`);
  }
}

run().catch(error => {
  console.error('Failed to analyze holographic bundle');
  console.error(error);
  process.exit(1);
});
