const jwt = require("jsonwebtoken");

const { env } = require("../config/env");

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      globalRole: user.globalRole,
    },
    env.jwtSecret,
    { expiresIn: "7d" },
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = {
  signToken,
  verifyToken,
};
