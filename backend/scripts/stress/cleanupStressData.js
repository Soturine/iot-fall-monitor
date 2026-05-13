const fs = require("fs");
const path = require("path");

const stressDir = path.resolve(__dirname, "..", "..", "logs", "stress");

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function main() {
  const confirmed = process.argv.includes("--yes") || process.env.STRESS_CLEANUP_CONFIRM === "1";

  if (!confirmed) {
    console.log("[stress:cleanup] Dry-run. Use --yes ou STRESS_CLEANUP_CONFIRM=1 para apagar logs locais.");
  }

  if (!fs.existsSync(stressDir)) {
    console.log("[stress:cleanup] Nenhum diretorio de logs de stress encontrado.");
    return;
  }

  const files = fs
    .readdirSync(stressDir)
    .filter((name) => /^(stress-|summary-stress-).*\.(jsonl|json)$/.test(name))
    .map((name) => path.join(stressDir, name));

  files.forEach((filePath) => {
    if (!isInside(stressDir, filePath)) {
      throw new Error(`Caminho fora do diretorio esperado: ${filePath}`);
    }

    if (confirmed) {
      fs.unlinkSync(filePath);
    }
  });

  console.log(
    confirmed
      ? `[stress:cleanup] ${files.length} arquivo(s) removido(s).`
      : `[stress:cleanup] ${files.length} arquivo(s) seriam removidos.`,
  );
}

main();
