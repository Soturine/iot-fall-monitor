const { logger } = require("../utils/logger");

function notFoundHandler(req, res) {
  res.status(404).json({
    message: "Rota não encontrada.",
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    logger.error("Erro interno na API.", {
      path: req.originalUrl,
      method: req.method,
      message: error.message,
      stack: error.stack,
    });
  }

  res.status(statusCode).json({
    message: error.message || "Erro interno do servidor.",
    details: error.details || null,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
