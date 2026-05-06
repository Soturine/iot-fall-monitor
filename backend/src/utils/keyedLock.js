const lockTails = new Map();

async function runWithKeyedLock(key, work) {
  const normalizedKey = String(key || "default");
  const previousTail = lockTails.get(normalizedKey) || Promise.resolve();
  let release;

  const ownTurn = new Promise((resolve) => {
    release = resolve;
  });
  const ownTail = previousTail.catch(() => {}).then(() => ownTurn);
  lockTails.set(normalizedKey, ownTail);

  await previousTail.catch(() => {});

  try {
    return await work();
  } finally {
    release();

    if (lockTails.get(normalizedKey) === ownTail) {
      lockTails.delete(normalizedKey);
    }
  }
}

module.exports = {
  runWithKeyedLock,
};
