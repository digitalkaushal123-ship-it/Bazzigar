const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      status: "active",
      service: "Bazzigar Telegram Join Request Webhook"
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
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Ignore messages, channel posts, and all updates except a real join request.
    if (!update || !update.chat_join_request) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const joinRequest = update.chat_join_request;
    const channelId = process.env.TELEGRAM_CHAT_ID;

    // Optional channel allow-list. Add TELEGRAM_CHAT_ID after we identify it
    // from the first verified request in the Vercel runtime logs.
    if (channelId && String(joinRequest.chat.id) !== String(channelId)) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    console.log("Bazzigar join request received", {
      updateId: update.update_id,
      chatId: joinRequest.chat.id,
      chatTitle: joinRequest.chat.title,
      userId: joinRequest.from && joinRequest.from.id
    });

    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    // Acknowledge Telegram without retrying while Meta credentials are not set.
    if (!pixelId || !accessToken) {
      console.warn("Join request received; Meta CAPI credentials are not configured yet.");
      return res.status(200).json({
        ok: true,
        received: true,
        tracked: false,
        reason: "Meta CAPI is not configured"
      });
    }

    if (!joinRequest.from || !joinRequest.from.id) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const eventId = `telegram_join_request_${update.update_id}`;
    const externalId = crypto
      .createHash("sha256")
      .update(String(joinRequest.from.id))
      .digest("hex");

    const event = {
      event_name: "TelegramJoinRequest",
      event_time: Number(joinRequest.date) || Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "chat",
      user_data: {
        external_id: [externalId]
      },
      custom_data: {
        channel_name: joinRequest.chat.title || "Bazzigar",
        channel_id: String(joinRequest.chat.id)
      }
    };

    const graphVersion = process.env.META_API_VERSION || "v23.0";
    const metaResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [event],
          access_token: accessToken,
          ...(process.env.META_TEST_EVENT_CODE
            ? { test_event_code: process.env.META_TEST_EVENT_CODE }
            : {})
        })
      }
    );

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta Conversions API error", metaResult);
      return res.status(502).json({ error: "Meta event delivery failed" });
    }

    console.log("Meta TelegramJoinRequest accepted", {
      eventId,
      eventsReceived: metaResult.events_received
    });

    return res.status(200).json({
      ok: true,
      received: true,
      tracked: true,
      event_id: eventId
    });
  } catch (error) {
    console.error("Telegram webhook processing error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
