const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const includeSnapshot = args.has('--include-snapshot');
const forceOverwrite = args.has('--force');
const activeSnapshot = process.env.OASIS_ACTIVE_SNAPSHOT || 'preserved-live-oasis-service-2026-04-10';

const webFiles = [
  'index.html',
  '404.html',
  'recovery.html',
  'app.js',
  'tech-catalog.js',
  'styles.css',
  'sw.js',
  'manifest.json',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'oasis-logo.png',
  'WO_TEMPLATE.xlsm'
];

const optionalRootFiles = [
  'QUOTE_TEMPLATE.xlsx',
  'QUOTE TEMPLATE.xlsx',
  '1. QUOTE TEMPLATE.xlsx'
];

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getFileBuffer(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

function filesMatch(sourcePath, destinationPath) {
  const sourceBuffer = getFileBuffer(sourcePath);
  const destinationBuffer = getFileBuffer(destinationPath);

  if (!sourceBuffer || !destinationBuffer) {
    return false;
  }

  return sourceBuffer.equals(destinationBuffer);
}

function copyFile(relativePath, targetDir) {
  const sourcePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  const destinationPath = path.join(targetDir, relativePath);
  ensureDirectory(path.dirname(destinationPath));

  if (!forceOverwrite && fs.existsSync(destinationPath) && !filesMatch(sourcePath, destinationPath)) {
    throw new Error(`Refusing to overwrite diverged file without --force: ${destinationPath}`);
  }

  fs.copyFileSync(sourcePath, destinationPath);
  return true;
}

function syncTarget(targetDir, files) {
  const copied = [];
  files.forEach(relativePath => {
    if (copyFile(relativePath, targetDir)) {
      copied.push(relativePath);
    }
  });
  return copied;
}

function logTarget(label, targetDir, copiedFiles) {
  console.log(`Synced ${label}: ${targetDir}`);
  copiedFiles.forEach(relativePath => console.log(`  - ${relativePath}`));
}

function findOptionalRootFile() {
  return optionalRootFiles.find(relativePath => fs.existsSync(path.join(repoRoot, relativePath))) || null;
}

const rootWwwDir = path.join(repoRoot, 'www');
ensureDirectory(rootWwwDir);

const rootWebFiles = [...webFiles];
const optionalRootFile = findOptionalRootFile();
if (optionalRootFile) {
  rootWebFiles.push(optionalRootFile);
}

const rootCopied = syncTarget(rootWwwDir, rootWebFiles);
logTarget('root www mirror', rootWwwDir, rootCopied);

if (!includeSnapshot) {
  process.exit(0);
}

const snapshotRootDir = path.join(repoRoot, activeSnapshot);
if (!fs.existsSync(snapshotRootDir)) {
  console.warn(`Snapshot directory not found, skipping snapshot sync: ${snapshotRootDir}`);
  process.exit(0);
}

const snapshotRootCopied = syncTarget(snapshotRootDir, webFiles);
logTarget('snapshot root mirror', snapshotRootDir, snapshotRootCopied);

const snapshotWwwDir = path.join(snapshotRootDir, 'www');
ensureDirectory(snapshotWwwDir);
const snapshotWwwCopied = syncTarget(snapshotWwwDir, webFiles);
logTarget('snapshot www mirror', snapshotWwwDir, snapshotWwwCopied);