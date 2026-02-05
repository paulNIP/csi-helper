# Opel CSI (Customer Satisfaction Index) – Automated Survey QA Script

## Objective

Build a Node.js script that runs on a Linux VPS and performs automated QA testing of Usabilla customer satisfaction surveys on ~10 Opel web properties. The script must:

1. Visit each URL at **randomized intervals** (~3 times per day per URL)
2. Trigger the Usabilla satisfaction survey
3. Fill in the form with **randomized but plausible values**
4. Submit the form
5. Rotate outgoing IP addresses so the web server cannot determine that all requests originate from the same machine
6. Send a **daily email report** summarizing all submissions

---

## Target URLs

The script should support a configurable list of URLs. The initial set includes pages like:

```
https://store.opel.de/vehicles?channel=rockse
```

(The full list of ~10 URLs will be provided separately as a config file.)

---

## Technical Architecture

### Stack
- **Runtime:** Node.js 20+
- **Browser Automation:** Playwright (Chromium, headless)
- **Scheduling:** node-cron
- **Proxy Rotation:** Rotating residential or datacenter proxies (e.g., Bright Data Residential, IPRoyal, SmartProxy, or similar)
- **Email Reporting:** Nodemailer (SMTP)
- **Config:** `.env` file + JSON config for URLs and form values

### Project Structure

```
csi-helper/
├── src/
│   ├── index.ts              # Entry point, scheduler
│   ├── config.ts             # Load env + URL config
│   ├── survey-runner.ts      # Main logic: visit page, trigger survey, fill & submit
│   ├── usabilla-client.ts    # Direct HTTP submission approach (alternative)
│   ├── proxy-manager.ts      # Proxy rotation logic
│   ├── report-generator.ts   # Collect results, generate daily report
│   └── email-sender.ts       # Send daily report via SMTP
├── config/
│   ├── urls.json             # Target URLs
│   └── form-values.json      # Possible random values for each field
├── .env                      # Secrets (proxy credentials, SMTP, etc.)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Survey Details (Usabilla)

### How the survey works

The satisfaction survey is powered by **Usabilla** (now SurveyMonkey). It is configured as a **slideout campaign** that appears as an overlay on the page.

- The Usabilla widget is loaded via `lightningjs` and initialised as `usabilla_live`
- The survey frontend is served from `https://d6tizftlrpuof.cloudfront.net` (AngularJS 1.6.5 app)
- Survey data is submitted incrementally (multiple POST requests as the user progresses through form pages)
- The final submission sets `"done": true`

### Campaign Details

- **Campaign ID:** `a5f669c28be1979ab5e2785121a6e10b`
- **Widget script:** `https://w.usabilla.com/d7b2453a0bce.js`
- **Slideout script:** `https://d6tizftlrpuof.cloudfront.net/live/scripts/campaign-include/a5f669c28be1979ab5e2785121a6e10b/v2/slideout.coffee`

### Triggering the survey

The survey can be triggered programmatically via:

```javascript
usabilla_live('trigger', 'a5f669c28be1979ab5e2785121a6e10b');
```

**Important:** Usabilla stores completion state in cookies and localStorage. Before triggering, you must clear:
- All cookies containing `usabilla` or `ub_`
- All localStorage keys containing `usabilla` or `ub_`
- All sessionStorage keys containing `usabilla` or `ub_`

### Survey form fields

The survey has 4 pages submitted incrementally. Each page sends a POST to `https://w.usabilla.com/incoming`.

#### Page 1 (v=1) – Overall Satisfaction
| Field | Key | Type | Values |
|-------|-----|------|--------|
| Overall mood/satisfaction | `data.mood` | String | `"1"` to `"5"` |
| Time spent on this page | `timing.Satisfaction` | Number (ms) | e.g. `28391` |

#### Page 2 (v=2) – Sub-Satisfaction Matrix
| Field | Key | Type | Values |
|-------|-----|------|--------|
| Ergonomics rating | `data.SAT_MatrixRating.SAT_Ergonomics` | String | `"1"` to `"5"` |
| Vehicle characteristics | `data.SAT_MatrixRating.SAT_Vehicle_Characteristics` | String | `"1"` to `"5"` |
| Vehicle price | `data.SAT_MatrixRating.SAT_Vehicle_Price` | String | `"1"` to `"5"` |
| Time spent | `timing.Sub-Satisfaction` | Number (ms) | e.g. `12240` |

#### Page 3 (v=3) – Efficiency
| Field | Key | Type | Values |
|-------|-----|------|--------|
| Difficulty finding info | `data.DIFF_FindInfo` | Array | `[]` (empty) or array of string values |
| Net Easy Score | `data.Net_Easy_Score` | String | `"1"` to `"5"` |
| Time spent | `timing.Efficiency` | Number (ms) | e.g. `15922` |

#### Page 4 (v=4) – Goal & Vehicle Type (final, done=true)
| Field | Key | Type | Values |
|-------|-----|------|--------|
| User vehicle type | `data.USER_VEHICLE` | String | `"B2B_PASSENGER"`, `"B2C_PASSENGER"`, etc. |
| Visit goal | `data.GOAL_Visit` | String | `"GOAL_Buy"`, `"GOAL_Info"`, `"GOAL_Compare"`, etc. |
| Time spent | `timing.Goal_Suggestions` | Number (ms) | e.g. `32270` |

### Submission Payload Structure

Each submission is a `POST` to `https://w.usabilla.com/incoming` with `Content-Type: application/json;charset=UTF-8`.

```json
{
  "id": "69722e5f566afe04b0289808",
  "sig": "679797af2e142cbde44daff972fa6a1a96661b810ed568469e0ca1edd011e0eb",
  "type": "campaign",
  "subtype": "form",
  "v": 4,
  "data": {
    "data": {
      "mood": "5",
      "SAT_MatrixRating": {
        "SAT_Ergonomics": "5",
        "SAT_Vehicle_Characteristics": "4",
        "SAT_Vehicle_Price": "5"
      },
      "DIFF_FindInfo": [],
      "Net_Easy_Score": "5",
      "USER_VEHICLE": "B2B_PASSENGER",
      "GOAL_Visit": "GOAL_Buy"
    },
    "timing": {
      "Satisfaction": 28391,
      "Sub-Satisfaction": 12240,
      "Efficiency": 15922,
      "Goal_Suggestions": 32270
    },
    "url": "https://store.opel.de/vehicles?channel=rockse",
    "customData": {},
    "browser": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "id": "6b9ea0ddb992",
    "version": 9
  },
  "done": true
}
```

### Key fields explained

| Field | Description |
|-------|-------------|
| `id` | Campaign/session ID. First request has `null`, subsequent requests use the ID returned by the server |
| `sig` | HMAC signature. First request has `null`, subsequent requests use the sig returned by the server |
| `v` | Page number (1-4), incremented with each submission |
| `done` | `false` for pages 1-3, `true` for the final page 4 |
| `data.id` | A random hex session identifier (e.g. `"6b9ea0ddb992"`) |
| `data.version` | Widget version, always `9` |
| `data.url` | The page URL where the survey was triggered |
| `data.browser` | User-Agent string |
| `data.customData` | Empty object `{}` |
| `timing.*` | Milliseconds spent on each page (randomize between 5000-45000 for realism) |

### Server Response

The server returns a JSON response with `id` and `sig` that must be included in subsequent requests:

```json
{
  "id": "69722e5f566afe04b0289808",
  "sig": "679797af2e142cbde44daff972fa6a1a96661b810ed568469e0ca1edd011e0eb"
}
```

---

## Two Implementation Approaches

### Approach A: Browser Automation (Playwright) – Recommended

Use Playwright to:
1. Navigate to the URL with a proxy
2. Clear Usabilla cookies/storage
3. Wait for page load and Usabilla widget initialization
4. Trigger the survey via `usabilla_live('trigger', ...)`
5. Interact with the survey form UI (click stars, select options)
6. Submit each page
7. Capture screenshots for the report

**Pros:** Most realistic, tests the full UI rendering (validates A/B testing display), handles any anti-bot measures
**Cons:** Heavier resource usage, slower

### Approach B: Direct HTTP API Calls

Skip the browser entirely and directly POST to `https://w.usabilla.com/incoming`:
1. Send v=1 with `id: null, sig: null` → receive `id` and `sig`
2. Send v=2 with received `id` and `sig`
3. Send v=3
4. Send v=4 with `done: true`

**Pros:** Very lightweight, fast, minimal server resources
**Cons:** Does NOT validate that the survey UI is actually displayed (defeats the A/B testing QA purpose)

### Recommendation

Use **Approach A** (Playwright) because the primary goal is to verify the survey is **displayed and functional** during A/B testing. Direct HTTP calls would only test that the API endpoint accepts data, not that the form renders correctly.

---

## Proxy / IP Rotation

### Requirements
- Each submission should appear to come from a different IP
- IPs should be European (ideally German) residential or datacenter IPs
- No two consecutive submissions from the same URL should share an IP

### IPRoyal Residential Proxy (Pre-configured)

We have purchased IPRoyal Residential Proxies. The account is already configured with:
- **Rotation:** Randomize IP (new IP per request)
- **Region:** Europe
- **Traffic:** 2 GB prepaid ($11.90)

### IPRoyal Credentials

| Setting | Value |
|---------|-------|
| **Host** | `geo.iproyal.com` |
| **Port** | `12321` |
| **Username** | `aSZ7NHVy4CCx6XzB` |
| **Password** | `P9Svfxhfex7bmiaR_region-europe` |

### Proxy URL Format

```
http://aSZ7NHVy4CCx6XzB:P9Svfxhfex7bmiaR_region-europe@geo.iproyal.com:12321
```

### Test the Proxy

```bash
curl -v -x http://aSZ7NHVy4CCx6XzB:P9Svfxhfex7bmiaR_region-europe@geo.iproyal.com:12321 -L https://ipv4.icanhazip.com
```

### Playwright Configuration

```typescript
const browser = await chromium.launch({
  proxy: {
    server: 'http://geo.iproyal.com:12321',
    username: 'aSZ7NHVy4CCx6XzB',
    password: 'P9Svfxhfex7bmiaR_region-europe'
  }
});
```

### Optional: Germany-only IPs

To restrict to German IPs only, change the password to:

```
P9Svfxhfex7bmiaR_country-de
```

### Optional: Sticky Sessions

To keep the same IP for multiple requests (e.g., for a complete survey flow), use:

```
P9Svfxhfex7bmiaR_region-europe_session-{random}_lifetime-10
```

This keeps the same IP for 10 minutes. Replace `{random}` with a unique session ID per survey run.

---

## Scheduling

Use `node-cron` to schedule runs at randomized times.

### Logic
- For each URL, schedule 3 runs per day
- Randomize the exact execution time within defined windows (e.g., 08:00-11:00, 12:00-15:00, 17:00-21:00)
- Add jitter (random delay of 0-30 minutes) to avoid patterns

```typescript
// Example: Generate 3 random times per day for each URL
function generateDailySchedule(urls: string[]): ScheduleEntry[] {
  const windows = [
    { start: 8, end: 11 },   // Morning
    { start: 12, end: 15 },  // Afternoon
    { start: 17, end: 21 },  // Evening
  ];

  return urls.flatMap(url =>
    windows.map(window => ({
      url,
      hour: randomInt(window.start, window.end),
      minute: randomInt(0, 59),
    }))
  );
}
```

---

## Randomization of Form Values

Generate plausible random values for each field:

```json
{
  "mood": { "type": "weightedRandom", "values": ["3", "4", "5"], "weights": [0.2, 0.35, 0.45] },
  "SAT_Ergonomics": { "type": "weightedRandom", "values": ["2", "3", "4", "5"], "weights": [0.1, 0.2, 0.35, 0.35] },
  "SAT_Vehicle_Characteristics": { "type": "weightedRandom", "values": ["2", "3", "4", "5"], "weights": [0.1, 0.2, 0.35, 0.35] },
  "SAT_Vehicle_Price": { "type": "weightedRandom", "values": ["1", "2", "3", "4", "5"], "weights": [0.1, 0.15, 0.25, 0.3, 0.2] },
  "Net_Easy_Score": { "type": "weightedRandom", "values": ["3", "4", "5"], "weights": [0.2, 0.35, 0.45] },
  "USER_VEHICLE": { "type": "uniformRandom", "values": ["B2B_PASSENGER", "B2C_PASSENGER"] },
  "GOAL_Visit": { "type": "uniformRandom", "values": ["GOAL_Buy", "GOAL_Info", "GOAL_Compare"] },
  "timing": { "type": "randomRange", "min": 5000, "max": 45000 }
}
```

Use weighted random so the data distribution looks natural (skewed toward positive ratings, as is typical for real users who bother to fill out surveys).

---

## Daily Email Report

Send a summary email at 22:00 each day.

### Report Content

```
Subject: Opel CSI QA Report – 2026-01-28

Summary:
- Total submissions attempted: 30
- Successful: 28
- Failed: 2

Details:
┌─────────────────────────────────────────────────┬────────┬───────┬────────────┐
│ URL                                             │ Status │ Time  │ IP Used    │
├─────────────────────────────────────────────────┼────────┼───────┼────────────┤
│ store.opel.de/vehicles?channel=rockse           │ OK     │ 08:23 │ 91.x.x.x  │
│ store.opel.de/vehicles?channel=rockse           │ OK     │ 13:47 │ 85.x.x.x  │
│ store.opel.de/vehicles?channel=rockse           │ FAIL   │ 19:12 │ 77.x.x.x  │
│ ...                                             │        │       │            │
└─────────────────────────────────────────────────┴────────┴───────┴────────────┘

Failures:
- 19:12 store.opel.de/vehicles?channel=rockse: Survey widget did not appear within 30s timeout
- 20:45 store.opel.de/...: Proxy connection refused

Screenshots of failures are attached.
```

### SMTP Configuration (.env)

```env
# Proxy (IPRoyal Residential)
PROXY_HOST=geo.iproyal.com
PROXY_PORT=12321
PROXY_USER=aSZ7NHVy4CCx6XzB
PROXY_PASS=P9Svfxhfex7bmiaR_region-europe

# Email Reporting
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
REPORT_TO=team@agency.com
```

---

## VPS Setup

### Hetzner Cloud Server (Pre-configured)

A Hetzner Cloud server has already been provisioned:

| Setting | Value |
|---------|-------|
| **IP Address** | `46.225.57.110` |
| **Username** | `root` |
| **Password** | `f0vcrUh4vTqrqFj` |
| **Location** | Germany |

### SSH Access

```bash
ssh root@46.225.57.110
# Password: f0vcrUh4vTqrqFj
```

Or with sshpass (for scripts):

```bash
sshpass -p 'f0vcrUh4vTqrqFj' ssh root@46.225.57.110
```

### Server Setup Steps

```bash
# 1. Connect to the server
ssh root@46.225.57.110

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install Playwright system dependencies
npx playwright install-deps chromium
npx playwright install chromium

# 4. Clone the project
git clone <repo-url> /opt/csi-helper
cd /opt/csi-helper
npm install

# 5. Configure environment
cp .env.example .env
nano .env  # Fill in proxy credentials, SMTP, etc.

# 6. Set up as systemd service
sudo cat > /etc/systemd/system/csi-helper.service << 'EOF'
[Unit]
Description=Opel CSI Survey QA Helper
After=network.target

[Service]
Type=simple
User=csi
WorkingDirectory=/opt/csi-helper
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable csi-helper
sudo systemctl start csi-helper

# 7. Check logs
journalctl -u csi-helper -f
```

---

## Additional Considerations

### Browser Fingerprinting
- Rotate User-Agent strings (Chrome versions 120-143, Windows/Mac/Linux)
- Randomize viewport sizes (1280x720, 1366x768, 1920x1080)
- Randomize timezone and language headers
- Add realistic mouse movements and delays between interactions

### Error Handling
- If the survey widget doesn't appear within 30s, mark as failed and take a screenshot
- If proxy fails, retry with a different proxy (max 3 retries)
- If Usabilla API returns an error, log the full response

### Rate Limiting
- Never submit more than once per URL within a 2-hour window
- Maximum 30 submissions total per day across all URLs
- If the script detects any CAPTCHA or block, stop all submissions for that URL for 24 hours

### Monitoring
- The script should log to both console and a rotating log file
- If more than 50% of daily submissions fail, send an alert email immediately (don't wait for the daily report)
