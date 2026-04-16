const os = require("os");

const { env } = require("../config/env");

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "localhost";
}

function isApipa(address) {
  return address.startsWith("169.254.");
}

function isCarrierGradeNat(address) {
  const match = address.match(/^100\.(\d{1,3})\./);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 64 && secondOctet <= 127;
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

function isVirtualOrVpnInterface(name) {
  const normalized = String(name || "").toLowerCase();

  return (
    normalized.includes("docker") ||
    normalized.includes("vethernet") ||
    normalized.includes("vmware") ||
    normalized.includes("virtualbox") ||
    normalized.includes("loopback") ||
    normalized.includes("hyper-v") ||
    normalized.includes("wsl") ||
    normalized.includes("vpn") ||
    normalized.includes("tailscale") ||
    normalized.includes("zerotier") ||
    normalized.includes("wireguard") ||
    normalized.includes("hamachi") ||
    normalized.includes("host-only") ||
    normalized.includes("host only") ||
    normalized.includes("tunnel") ||
    normalized.includes("tun") ||
    normalized.includes("tap")
  );
}

function interfacePriority(name) {
  const normalized = String(name || "").toLowerCase();

  if (isVirtualOrVpnInterface(normalized)) {
    return 40;
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

  if (isCarrierGradeNat(address)) {
    return 3;
  }

  return 20;
}

function sortCandidates(left, right) {
  const interfaceDelta =
    interfacePriority(left.interfaceName) - interfacePriority(right.interfaceName);

  if (interfaceDelta !== 0) {
    return interfaceDelta;
  }

  return addressPriority(left.address) - addressPriority(right.address);
}

function listCandidateBackendApiBaseUrls() {
  const interfaces = os.networkInterfaces();
  const primaryCandidates = [];
  const fallbackCandidates = [];
  const lastResortCandidates = [];

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

      const candidate = {
        interfaceName,
        address: entry.address,
      };

      if (isPrivateIpv4(entry.address) && !isVirtualOrVpnInterface(interfaceName)) {
        primaryCandidates.push(candidate);
        return;
      }

      if (isPrivateIpv4(entry.address) || isCarrierGradeNat(entry.address)) {
        fallbackCandidates.push(candidate);
        return;
      }

      lastResortCandidates.push(candidate);
    });
  });

  const orderedCandidates = [
    ...primaryCandidates.sort(sortCandidates),
    ...fallbackCandidates.sort(sortCandidates),
    ...lastResortCandidates.sort(sortCandidates),
  ];

  return [...new Map(
    orderedCandidates.map((candidate) => [
      candidate.address,
      `http://${candidate.address}:${env.port}`,
    ]),
  ).values()];
}

function getNetworkInfo() {
  const candidateBackendApiBaseUrls = listCandidateBackendApiBaseUrls();
  const primaryBackendApiBaseUrl = candidateBackendApiBaseUrls[0] || null;
  const fallbackBackendApiBaseUrls = candidateBackendApiBaseUrls.slice(1);

  return {
    suggestedBackendApiBaseUrl: primaryBackendApiBaseUrl,
    primaryBackendApiBaseUrl,
    fallbackBackendApiBaseUrls,
    candidateBackendApiBaseUrls,
  };
}

module.exports = {
  getNetworkInfo,
};
