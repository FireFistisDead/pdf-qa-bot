function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return "";
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

function clientIpFromRequest(req) {
  return normalizeIp(req.ip || req.socket?.remoteAddress || "");
}

module.exports = {
  clientIpFromRequest,
  normalizeIp,
};

