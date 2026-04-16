const { execFileSync } = require("child_process");
const os = require("os");

const { env } = require("../config/env");

const WINDOWS_HINTS_TTL_MS = 5000;
let windowsInterfaceHintsCache = {
  expiresAt: 0,
  value: new Map(),
};

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

function normalizeInterfaceName(name) {
  return String(name || "").trim().toLowerCase();
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
  const normalized = normalizeInterfaceName(name);

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
    normalized.includes("tap") ||
    normalized.includes("virtual")
  );
}

function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getOrCreateWindowsHint(hints, interfaceName) {
  const normalized = normalizeInterfaceName(interfaceName);
  if (!normalized) {
    return null;
  }

  if (!hints.has(normalized)) {
    hints.set(normalized, {
      interfaceName,
      isUp: null,
      hasDefaultRoute: false,
      defaultRouteRank: Number.POSITIVE_INFINITY,
      routeMetric: Number.POSITIVE_INFINITY,
      interfaceMetric: Number.POSITIVE_INFINITY,
      ipv4Connectivity: "",
    });
  }

  return hints.get(normalized);
}

function readWindowsInterfaceHints() {
  if (process.platform !== "win32") {
    return new Map();
  }

  const now = Date.now();
  if (windowsInterfaceHintsCache.expiresAt > now) {
    return windowsInterfaceHintsCache.value;
  }

  try {
    const script = [
      "$adapters = Get-NetAdapter | Select-Object InterfaceAlias, InterfaceIndex, Status;",
      "$routes = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Select-Object ifIndex, InterfaceAlias, RouteMetric, InterfaceMetric, NextHop;",
      "$profiles = Get-NetConnectionProfile | Select-Object InterfaceIndex, InterfaceAlias, IPv4Connectivity;",
      "[PSCustomObject]@{ adapters = $adapters; routes = $routes; profiles = $profiles } | ConvertTo-Json -Depth 4 -Compress",
    ].join(" ");

    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 4000,
        windowsHide: true,
      },
    );

    const parsed = JSON.parse(String(raw || "").trim() || "{}");
    const hints = new Map();

    toArray(parsed.adapters).forEach((adapter) => {
      const hint = getOrCreateWindowsHint(hints, adapter.InterfaceAlias);
      if (!hint) {
        return;
      }

      hint.isUp = String(adapter.Status || "").toLowerCase() === "up";
    });

    toArray(parsed.profiles).forEach((profile) => {
      const hint = getOrCreateWindowsHint(hints, profile.InterfaceAlias);
      if (!hint) {
        return;
      }

      hint.ipv4Connectivity = String(profile.IPv4Connectivity || "");
    });

    const orderedRoutes = toArray(parsed.routes).sort((left, right) => {
      return (
        Number(left.RouteMetric ?? Number.POSITIVE_INFINITY) -
          Number(right.RouteMetric ?? Number.POSITIVE_INFINITY) ||
        Number(left.InterfaceMetric ?? Number.POSITIVE_INFINITY) -
          Number(right.InterfaceMetric ?? Number.POSITIVE_INFINITY) ||
        Number(left.ifIndex ?? Number.POSITIVE_INFINITY) -
          Number(right.ifIndex ?? Number.POSITIVE_INFINITY)
      );
    });

    orderedRoutes.forEach((route, index) => {
      const hint = getOrCreateWindowsHint(hints, route.InterfaceAlias);
      if (!hint) {
        return;
      }

      hint.hasDefaultRoute = true;
      hint.defaultRouteRank = Math.min(hint.defaultRouteRank, index);
      hint.routeMetric = Math.min(
        hint.routeMetric,
        Number(route.RouteMetric ?? Number.POSITIVE_INFINITY),
      );
      hint.interfaceMetric = Math.min(
        hint.interfaceMetric,
        Number(route.InterfaceMetric ?? Number.POSITIVE_INFINITY),
      );
    });

    windowsInterfaceHintsCache = {
      expiresAt: now + WINDOWS_HINTS_TTL_MS,
      value: hints,
    };
  } catch {
    windowsInterfaceHintsCache = {
      expiresAt: now + WINDOWS_HINTS_TTL_MS,
      value: new Map(),
    };
  }

  return windowsInterfaceHintsCache.value;
}

function connectivityPriority(interfaceHint = null) {
  if (interfaceHint?.isUp && interfaceHint?.hasDefaultRoute) {
    return 0;
  }

  if (interfaceHint?.isUp) {
    return 1;
  }

  if (
    interfaceHint?.ipv4Connectivity === "Internet" ||
    interfaceHint?.ipv4Connectivity === "LocalNetwork" ||
    interfaceHint?.ipv4Connectivity === "Subnet"
  ) {
    return 2;
  }

  return 10;
}

function interfacePriority(name, interfaceHint = null) {
  const normalized = normalizeInterfaceName(name);

  if (isVirtualOrVpnInterface(normalized)) {
    return 100;
  }

  if (interfaceHint?.isUp && interfaceHint?.hasDefaultRoute) {
    return (
      -40 +
      Math.min(interfaceHint.defaultRouteRank, 10) +
      Math.min(interfaceHint.routeMetric, 10) +
      Math.min(interfaceHint.interfaceMetric, 10)
    );
  }

  if (interfaceHint?.isUp) {
    return -10;
  }

  if (normalized.includes("ethernet") || normalized.includes("eth")) {
    return 0;
  }

  if (
    normalized.includes("wi-fi") ||
    normalized.includes("wifi") ||
    normalized.includes("wlan")
  ) {
    return 1;
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
  const connectivityDelta =
    connectivityPriority(left.interfaceHint) - connectivityPriority(right.interfaceHint);

  if (connectivityDelta !== 0) {
    return connectivityDelta;
  }

  const interfaceDelta =
    interfacePriority(left.interfaceName, left.interfaceHint) -
    interfacePriority(right.interfaceName, right.interfaceHint);

  if (interfaceDelta !== 0) {
    return interfaceDelta;
  }

  return addressPriority(left.address) - addressPriority(right.address);
}

function listCandidateBackendApiBaseUrls() {
  const interfaces = os.networkInterfaces();
  const interfaceHints = readWindowsInterfaceHints();
  const preferredCandidates = [];
  const connectedCandidates = [];
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
        interfaceHint: interfaceHints.get(normalizeInterfaceName(interfaceName)) || null,
      };

      if (isPrivateIpv4(entry.address) && !isVirtualOrVpnInterface(interfaceName)) {
        if (candidate.interfaceHint?.isUp && candidate.interfaceHint?.hasDefaultRoute) {
          preferredCandidates.push(candidate);
          return;
        }

        if (
          candidate.interfaceHint?.isUp ||
          candidate.interfaceHint?.ipv4Connectivity === "Internet" ||
          candidate.interfaceHint?.ipv4Connectivity === "LocalNetwork" ||
          candidate.interfaceHint?.ipv4Connectivity === "Subnet"
        ) {
          connectedCandidates.push(candidate);
          return;
        }

        fallbackCandidates.push(candidate);
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
    ...preferredCandidates.sort(sortCandidates),
    ...connectedCandidates.sort(sortCandidates),
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
