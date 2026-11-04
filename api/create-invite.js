const crypto = require("crypto");
const { redis } = require("../lib/redis");
const { json, cookieValue, clientIp } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const missing = required.filter(function (key) { return !process.env[key]; });
  if (missing.length) return json(res, 503, { error: "Join tracking is not configured yet" });

  try {
    const ip = clientIp(req);
    const ipHash = crypto.createHash("sha256").update(ip || "unknown").digest("hex");
    const rateKey = "bz:rate:" + ipHash;
    const count = Number(await redis(["INCR", rateKey]));
    if (count === 1) await redis(["EXPIRE", rateKey, "3600"]);
    if (count > 20) return json(res, 429, { error: "Please try again later" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const fbp = cookieValue(req.headers.cookie, "_fbp") || body.fbp || null;
    let fbc = cookieValue(req.headers.cookie, "_fbc") || body.fbc || null;
    if (!fbc && body.fbclid) fbc = "fb.1." + Date.now() + "." + String(body.fbclid).slice(0, 500);

    const token = crypto.randomBytes(12).toString("hex");
    const inviteName = "bz_" + token;
    const telegramResponse = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/createChatInviteLink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, name: inviteName, creates_join_request: true })
    });
    const telegramData = await telegramResponse.json();
    if (!telegramResponse.ok || !telegramData.ok || !telegramData.result || !telegramData.result.invite_link) {
      console.error("Telegram invite creation failed:", telegramData.description || telegramResponse.status);
      return json(res, 502, { error: "Could not create a Telegram invite link. Please try again." });
    }

    const pageUrl = typeof body.page_url === "string" && body.page_url.startsWith("https://")
      ? body.page_url.slice(0, 2000) : (process.env.APP_BASE_URL || "");
    const attribution = {
      fbp: fbp, fbc: fbc, client_ip_address: ip || null,
      client_user_agent: req.headers["user-agent"] || null,
      event_source_url: pageUrl, created_at: Math.floor(Date.now() / 1000)
    };
    await redis(["SET", "bz:invite:" + inviteName, JSON.stringify(attribution), "EX", "604800"]);
    return json(res, 200, { invite_link: telegramData.result.invite_link });
  } catch (error) {
    console.error("Create invite error:", error.message);
    return json(res, 500, { error: "Unable to prepare Telegram access right now" });
  }
};
