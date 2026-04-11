function getPagination(query, defaultLimit = 10, maxLimit = 100) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const requestedLimit = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

module.exports = {
  getPagination,
};
