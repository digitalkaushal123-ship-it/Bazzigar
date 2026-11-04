const crypto = require("crypto");
const { redis } = require("../lib/redis");
const { json, safeEqual } = require("../lib/http");
function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

async function sendMetaLead(update, joinRequest, attribution) {
  const version = process.env.META_GRAPH_API_VERSION;
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!version || !pixelId || !accessToken) throw new Error("Meta Conversions API is not configured");

  const user = joinRequest.from || {};
  const userData = {
    external_id: [sha256(user.id)],
    client_ip_address: attribution.client_ip_address || undefined,
    client_user_agent: attribution.client_user_agent || undefined,
    fbp: attribution.fbp || undefined,
    fbc: attribution.fbc || undefined
  };
  Object.keys(userData).forEach(function (key) { if (userData[key] === undefined) delete userData[key]; });

  const event = {
    event_name: "Lead",
    event_time: Number(joinRequest.date) || Math.floor(Date.now() / 1000),
    event_id: "telegram_join_request_" + String(update.update_id),
    action_source: "website",
    event_source_url: attribution.event_source_url || process.env.APP_BASE_URL,
    user_data: userData,
    custom_data: { channel_id: String(joinRequest.chat.id), lead_source: "telegram_channel_join_request" }
  };
  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  const url = "https://graph.facebook.com/" + version + "/" + pixelId + "/events?access_token=" + encodeURIComponent(accessToken);
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || result.error || Number(result.events_received) < 1) {
    console.error("Meta CAPI rejected Lead event:", result.error ? result.error.message : response.status);
    throw new Error("Meta Conversions API rejected the event");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }
  if (!safeEqual(req.headers["x-telegram-bot-api-secret-token"], process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const update = req.body || {};
  const joinRequest = update.chat_join_request;
  if (!joinRequest) return json(res, 200, { ok: true, ignored: true });
  if (String(joinRequest.chat && joinRequest.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) {
    return json(res, 200, { ok: true, ignored: true });
  }

  const inviteName = joinRequest.invite_link && joinRequest.invite_link.name;
  if (!inviteName || !inviteName.startsWith("bz_")) return json(res, 200, { ok: true, untracked: true });

  const eventKey = "bz:event:" + String(update.update_id);
  try {
    const lock = await redis(["SET", eventKey, "processing", "EX", "300", "NX"]);
    if (!lock) return json(res, 200, { ok: true, duplicate: true });
    const stored = await redis(["GET", "bz:invite:" + inviteName]);
    if (!stored) {
      await redis(["DEL", eventKey]);
      return json(res, 200, { ok: true, attribution_missing: true });
    }
    const attribution = typeof stored === "string" ? JSON.parse(stored) : stored;
    await sendMetaLead(update, joinRequest, attribution);
    await redis(["SET", eventKey, "sent", "EX", "2592000"]);
    return json(res, 200, { ok: true, lead_sent: true });
  } catch (error) {
    try { await redis(["DEL", eventKey]); } catch (_) {}
    console.error("Telegram webhook processing error:", error.message);
    return json(res, 500, { error: "Webhook processing failed; Telegram may retry" });
  }
};
