const path = require("path");

const backendRoot = path.resolve(__dirname, "..", "..");

function resolveBackendPath(relativePath) {
  return path.resolve(backendRoot, relativePath);
}

function loadWithMocks(targetRelativePath, mocks = {}) {
  const targetPath = resolveBackendPath(targetRelativePath);
  const mockEntries = Object.entries(mocks).map(([relativePath, exports]) => [
    resolveBackendPath(relativePath),
    exports,
  ]);
  const touchedPaths = [targetPath, ...mockEntries.map(([mockPath]) => mockPath)];
  const previousCache = new Map();

  touchedPaths.forEach((modulePath) => {
    previousCache.set(modulePath, require.cache[modulePath]);
    delete require.cache[modulePath];
  });

  mockEntries.forEach(([modulePath, exports]) => {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  });

  const loaded = require(targetPath);

  function restore() {
    delete require.cache[targetPath];

    mockEntries.forEach(([modulePath]) => {
      delete require.cache[modulePath];
    });

    previousCache.forEach((cacheEntry, modulePath) => {
      if (cacheEntry) {
        require.cache[modulePath] = cacheEntry;
      } else {
        delete require.cache[modulePath];
      }
    });
  }

  return {
    module: loaded,
    restore,
  };
}

module.exports = {
  loadWithMocks,
  resolveBackendPath,
};
