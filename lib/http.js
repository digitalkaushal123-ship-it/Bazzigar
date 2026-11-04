const crypto = require("crypto");
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function cookieValue(header, name) {
  const parts = (header || "").split(";").map(function (part) { return part.trim(); });
  const item = parts.find(function (part) { return part.startsWith(name + "="); });
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
}
function safeEqual(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
module.exports = { json, cookieValue, clientIp, safeEqual };
