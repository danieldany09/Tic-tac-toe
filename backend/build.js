const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

const outDir = path.resolve(__dirname, '..', 'nakama-data', 'modules');
const outFile = path.join(outDir, 'index.js');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const buildOptions = {
  entryPoints: [path.join(__dirname, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es5',
  outfile: outFile,
  // Must disable tree-shaking: InitModule is never exported/called in JS terms
  // but Nakama's goja runtime discovers it on the global object at runtime.
  treeShaking: false,
  minify: false,
  sourcemap: false,
  logLevel: 'info',
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => ctx.watch()).catch(() => process.exit(1));
} else {
  esbuild.build(buildOptions)
    .then(() => console.log(`✓ Built → ${outFile}`))
    .catch(() => process.exit(1));
}
