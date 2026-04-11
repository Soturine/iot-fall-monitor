const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

const targets = [
  ...walk(path.resolve(__dirname, "../src")),
  path.resolve(__dirname, "mockPublisher.js"),
];

targets.forEach((target) => {
  execFileSync(process.execPath, ["--check", target], { stdio: "inherit" });
});

console.log(`Validated ${targets.length} JavaScript files.`);
