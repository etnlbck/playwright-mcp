#!/usr/bin/env node

console.log("🔍 Railway Debug Information");
console.log("=".repeat(50));

console.log("Environment Variables:");
console.log("  NODE_ENV:", process.env.NODE_ENV || "undefined");
console.log("  MODE:", process.env.MODE || "undefined");
console.log("  PORT:", process.env.PORT || "undefined");
console.log("  PWD:", process.cwd());

console.log("\nSystem Information:");
console.log("  Node version:", process.version);
console.log("  Platform:", process.platform);
console.log("  Architecture:", process.arch);
console.log("  Memory:", Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB");

console.log("\nDirectory Contents:");
try {
  const fs = require('fs');
  const files = fs.readdirSync('.');
  files.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`  ${stats.isDirectory() ? 'd' : 'f'} ${file}`);
  });
} catch (error) {
  console.log("  Error reading directory:", error.message);
}

console.log("\nPackage.json check:");
try {
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log("  Name:", pkg.name);
  console.log("  Version:", pkg.version);
  console.log("  Main:", pkg.main);
  console.log("  Scripts:", Object.keys(pkg.scripts || {}));
} catch (error) {
  console.log("  Error reading package.json:", error.message);
}

console.log("\nDist directory check:");
try {
  const fs = require('fs');
  if (fs.existsSync('dist')) {
    const distFiles = fs.readdirSync('dist');
    console.log("  Dist files:", distFiles);
  } else {
    console.log("  Dist directory not found");
  }
} catch (error) {
  console.log("  Error checking dist:", error.message);
}

console.log("\n" + "=".repeat(50));
console.log("Starting server in 3 seconds...");

setTimeout(() => {
  console.log("🚀 Attempting to start server...");
  require('./dist/index.js');
}, 3000);

