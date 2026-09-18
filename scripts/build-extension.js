import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

async function build() {
  console.log('Building Polar Workout Importer extension...');

  // Ensure output directory
  const distDir = path.resolve('dist-extension');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Bundle TypeScript entry points
  const entryPoints = [
    { in: 'src/background.ts', out: 'background' },
    { in: 'src/content.ts', out: 'content' },
    { in: 'src/popup.ts', out: 'popup' },
  ];

  await esbuild.build({
    entryPoints: entryPoints.map(e => e.in),
    bundle: true,
    platform: 'browser',
    target: ['chrome100'],
    format: 'iife',
    outdir: distDir,
    sourcemap: true,
    minify: false,
  });

  // Ensure public directory
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Also build directly to root and public so users can load unpacked directly or download ZIP
  for (const entry of entryPoints) {
    const rootOutFile = `${entry.out}.js`;
    fs.copyFileSync(path.join(distDir, `${entry.out}.js`), path.resolve(rootOutFile));
    fs.copyFileSync(path.join(distDir, `${entry.out}.js`), path.join(publicDir, `${entry.out}.js`));
  }

  // Copy static files to dist-extension, root, and public
  const filesToCopy = [
    { src: 'manifest.json', dest: 'manifest.json' },
    { src: 'src/popup.html', dest: 'popup.html' },
    { src: 'src/styles.css', dest: 'styles.css' },
  ];

  for (const f of filesToCopy) {
    fs.copyFileSync(path.resolve(f.src), path.join(distDir, f.dest));
    if (f.src !== f.dest) {
      fs.copyFileSync(path.resolve(f.src), path.resolve(f.dest));
    }
    fs.copyFileSync(path.resolve(f.src), path.join(publicDir, f.dest));
  }

  console.log('Build complete! Output saved to:');
  console.log('  - Root directory (/manifest.json, /background.js, /content.js, /popup.html, etc.)');
  console.log('  - dist-extension/ (self-contained unpacked folder ready for Chrome)');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
