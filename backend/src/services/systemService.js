const os = require("os");

const { env } = require("../config/env");

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "localhost";
}

function isApipa(address) {
  return address.startsWith("169.254.");
}

function isPrivateIpv4(address) {
  if (address.startsWith("10.")) {
    return true;
  }

  if (address.startsWith("192.168.")) {
    return true;
  }

  const match = address.match(/^172\.(\d{1,2})\./);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function interfacePriority(name) {
  const normalized = String(name || "").toLowerCase();

  if (
    normalized.includes("docker") ||
    normalized.includes("vethernet") ||
    normalized.includes("vmware") ||
    normalized.includes("virtualbox") ||
    normalized.includes("loopback") ||
    normalized.includes("hyper-v") ||
    normalized.includes("wsl")
  ) {
    return 50;
  }

  if (
    normalized.includes("wi-fi") ||
    normalized.includes("wifi") ||
    normalized.includes("wlan")
  ) {
    return 0;
  }

  if (normalized.includes("ethernet") || normalized.includes("eth")) {
    return 5;
  }

  return 10;
}

function addressPriority(address) {
  if (address.startsWith("192.168.")) {
    return 0;
  }

  if (address.startsWith("10.")) {
    return 1;
  }

  if (isPrivateIpv4(address)) {
    return 2;
  }

  return 20;
}

function listCandidateBackendApiBaseUrls() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  Object.entries(interfaces).forEach(([interfaceName, entries]) => {
    (entries || []).forEach((entry) => {
      const family =
        typeof entry.family === "string" ? entry.family : entry.family === 4 ? "IPv4" : "";

      if (family !== "IPv4" || entry.internal || !entry.address) {
        return;
      }

      if (isLoopback(entry.address) || isApipa(entry.address)) {
        return;
      }

      candidates.push({
        interfaceName,
        address: entry.address,
      });
    });
  });

  const deduped = [...new Map(
    candidates.map((candidate) => [
      candidate.address,
      `http://${candidate.address}:${env.port}`,
    ]),
  ).values()];

  deduped.sort((left, right) => {
    const leftAddress = left.replace(/^https?:\/\//, "").split(":")[0];
    const rightAddress = right.replace(/^https?:\/\//, "").split(":")[0];

    const leftInterface = candidates.find((candidate) => candidate.address === leftAddress)?.interfaceName;
    const rightInterface = candidates.find((candidate) => candidate.address === rightAddress)?.interfaceName;

    const interfaceDelta =
      interfacePriority(leftInterface) - interfacePriority(rightInterface);

    if (interfaceDelta !== 0) {
      return interfaceDelta;
    }

    return addressPriority(leftAddress) - addressPriority(rightAddress);
  });

  return deduped;
}

function getNetworkInfo() {
  const candidateBackendApiBaseUrls = listCandidateBackendApiBaseUrls();

  return {
    suggestedBackendApiBaseUrl: candidateBackendApiBaseUrls[0] || null,
    candidateBackendApiBaseUrls,
  };
}

module.exports = {
  getNetworkInfo,
};
