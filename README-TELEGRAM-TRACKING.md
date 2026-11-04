# BAZZIGAR Telegram Join Request → Meta Lead tracking

This implementation sends a Meta Lead event only after Telegram delivers a verified chat_join_request update for a per-visitor invite link created by this site.

## Flow

1. Landing page loads: browser Pixel sends PageView.
2. Visitor clicks JOIN TELEGRAM: no Meta conversion event is sent. Vercel creates a unique Telegram invite link with creates_join_request=true.
3. The invite link name is stored with the visitor's _fbp, _fbc, IP address, user agent, and page URL in Upstash Redis.
4. Telegram sends chat_join_request to the Vercel webhook.
5. The webhook verifies Telegram's secret header and channel ID, looks up the invite attribution, and sends one Meta CAPI Lead event. Duplicate Telegram updates are ignored.

## Required setup

### 1. Create Upstash Redis
Create a Redis database in Upstash and copy its REST URL and REST token. Add both as Vercel environment variables. Redis is required to securely associate a unique invite link with the visitor's Meta click identifiers.

### 2. Add Vercel environment variables
In Vercel → bazzigar → Settings → Environment Variables, add these to Production (and Preview if testing there):

- TELEGRAM_BOT_TOKEN: BotFather token.
- TELEGRAM_CHAT_ID: private channel numeric ID (commonly -100...).
- TELEGRAM_WEBHOOK_SECRET: random secret string (32+ characters).
- META_PIXEL_ID: 2335609750605521.
- META_CAPI_ACCESS_TOKEN: access token generated for this Pixel's Conversions API.
- META_GRAPH_API_VERSION: currently supported Graph API version selected for your Meta app.
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN: Upstash credentials.
- APP_BASE_URL: https://bazzigar.vercel.app (or actual production custom domain).

Optional:
- META_TEST_EVENT_CODE: Events Manager test code. Remove it after testing.

Never commit tokens to GitHub or put them in frontend JavaScript.

### 3. Check Telegram admin permissions
The bot must be an administrator in the private channel and must have Invite Users / Add Subscribers permission (can_invite_users). The backend creates a distinct request-to-join invite link for every visitor.

### 4. Deploy the code
Merge the telegram-join-request-tracking branch into main after environment variables have been added. Vercel will deploy from the connected GitHub repository. Environment variable changes require a new deployment.

### 5. Register the Telegram webhook
After the production deployment is READY, run locally from the repository root:

    export TELEGRAM_BOT_TOKEN='your-bot-token'
    export TELEGRAM_WEBHOOK_SECRET='the-same-secret-as-vercel'
    export APP_BASE_URL='https://bazzigar.vercel.app'
    npm run register:webhook

This calls Telegram setWebhook with only chat_join_request updates and the secret token. Do not paste the bot token into chat.

## Verification
1. Open the production landing page with a real Meta test click or a URL containing a test fbclid.
2. Click JOIN TELEGRAM. It should open a newly generated request-to-join link. No TelegramJoin or Lead event should fire at click time.
3. Send the Join Request in Telegram.
4. Check Vercel Function Logs for /api/telegram-webhook and Meta Events Manager → Test Events (if META_TEST_EVENT_CODE is set). A Lead should appear only after the request update arrives.

## Important limitations
- The existing shared invite link cannot provide reliable per-visitor attribution. This version replaces it with unique bot-created invite links.
- Join requests made through old/shared links are deliberately not counted because they cannot be matched to a landing-page visitor.
- The bot must have Telegram can_invite_users permission.
- Redis records are kept for 7 days; duplicate update IDs are remembered for 30 days.
- This tracks the join request being sent, not whether an administrator later approves it.
