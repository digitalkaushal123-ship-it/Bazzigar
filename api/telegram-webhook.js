const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      status: "active",
      service: "Bazzigar Telegram Webhook"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];

  if (!secret || receivedSecret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const update = req.body;

    if (!update.chat_join_request) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const request = update.chat_join_request;
    const channelId = process.env.TELEGRAM_CHAT_ID;

    if (
      channelId &&
      String(request.chat.id) !== String(channelId)
    ) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      console.error("Meta Pixel credentials missing");
      return res.status(500).json({ error: "Meta not configured" });
    }

    const eventId = `telegram_join_${update.update_id}`;

    const externalId = crypto
      .createHash("sha256")
      .update(String(request.from.id))
      .digest("hex");

    const event = {
      event_name: "TelegramJoinRequest",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: process.env.LANDING_PAGE_URL,
      user_data: {
        external_id: externalId
      }
    };

    const response = await fetch(
      `https://graph.facebook.com/${process.env.META_API_VERSION || "v23.0"}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          data: [event],
          access_token: accessToken,
          ...(process.env.META_TEST_EVENT_CODE
            ? { test_event_code: process.env.META_TEST_EVENT_CODE }
            : {})
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Meta API error:", result);
      return res.status(502).json({ error: "Meta event failed" });
    }

    console.log("Telegram Join Request tracked:", eventId);

    return res.status(200).json({
      ok: true,
      tracked: true,
      event_id: eventId
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
