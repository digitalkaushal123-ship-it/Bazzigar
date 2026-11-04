const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "APP_BASE_URL"];
const missing = required.filter(function (key) { return !process.env[key]; });
if (missing.length) {
  console.error("Missing environment variables: " + missing.join(", "));
  process.exit(1);
}
const baseUrl = process.env.APP_BASE_URL.replace(/\/+$/, "");
const webhookUrl = baseUrl + "/api/telegram-webhook";
(async function () {
  const response = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/setWebhook", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["chat_join_request"], drop_pending_updates: false
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    console.error("Telegram webhook setup failed:", data.description || response.status);
    process.exit(1);
  }
  console.log("Telegram webhook registered:", webhookUrl);
})();
