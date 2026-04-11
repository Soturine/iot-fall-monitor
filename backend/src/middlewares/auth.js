const { HttpError } = require("../utils/httpError");
const { verifyToken } = require("../utils/auth");
const { loadAccessContext } = require("../services/scopeService");

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return next(new HttpError(401, "Token de acesso ausente."));
  }

  const token = authorization.replace("Bearer ", "").trim();

  try {
    const payload = verifyToken(token);
    req.user = {
      id: Number(payload.id || payload.sub),
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch (error) {
    return next(new HttpError(401, "Token de acesso inválido."));
  }
}

async function requireAccessContext(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return next(new HttpError(401, "Token de acesso ausente."));
  }

  const token = authorization.replace("Bearer ", "").trim();

  try {
    const payload = verifyToken(token);
    const accessContext = await loadAccessContext({
      userId: Number(payload.id || payload.sub),
      requestedOrganizationId: req.headers["x-organization-id"],
    });

    req.user = accessContext.user;
    req.access = accessContext;
    return next();
  } catch (error) {
    if (error instanceof HttpError) {
      return next(error);
    }

    return next(new HttpError(401, "Token de acesso inválido."));
  }
}

module.exports = {
  requireAuth,
  requireAccessContext,
};
