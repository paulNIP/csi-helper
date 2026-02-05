# Opel CSI Survey QA Helper

A Node.js automation script for testing Usabilla customer satisfaction surveys on Opel web properties. The script visits target URLs, triggers satisfaction surveys, fills them with randomized plausible values, and submits responses through IP-rotated proxies.

## Features

- Automated survey submission with realistic timing and interactions
- IP rotation via residential proxies (IPRoyal)
- Browser automation with Playwright (headless Chromium)
- Scheduled execution (configurable runs per day)
- Comprehensive daily reporting with email delivery
- Error tracking and monitoring
- Real-time logging

## Technical Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Browser Automation**: Playwright
- **Scheduling**: node-cron
- **Email**: Nodemailer
- **Proxy**: IPRoyal Residential Proxies

## Installation

### 1. Prerequisites

```bash
# Node.js 20+
node --version

# Git
git clone <repository-url>
cd csi-helper
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Playwright Dependencies

```bash
# For Linux (Debian/Ubuntu)
npx playwright install-deps chromium

# Install Chromium browser
npx playwright install chromium
```

## Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
nano .env
```

**Required settings**:

```env
# Proxy Configuration (IPRoyal)
PROXY_HOST=geo.iproyal.com
PROXY_PORT=12321
PROXY_USER=your-username
PROXY_PASS=your-password

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
REPORT_TO=recipient@example.com

# Optional
NODE_ENV=production
LOG_LEVEL=info
RUNS_PER_DAY=3
REPORT_TIME=22:00
```

### 2. Target URLs

Edit `config/urls.json` to add/remove target URLs:

```json
{
  "urls": [
    "https://store.opel.de/vehicles?channel=rockse",
    "https://store.opel.de/vehicles/corsa",
    // ... more URLs
  ]
}
```

### 3. Form Values

Edit `config/form-values.json` to customize survey response distributions:

```json
{
  "mood": {
    "type": "weightedRandom",
    "values": ["3", "4", "5"],
    "weights": [0.2, 0.35, 0.45]
  }
  // ... more fields
}
```

## Build and Run

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

### With systemd (Linux VPS)

```bash
# Create service file
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

# Enable and start
sudo systemctl enable csi-helper
sudo systemctl start csi-helper

# View logs
journalctl -u csi-helper -f
```

## Architecture

### Project Structure

```
csi-helper/
├── src/
│   ├── index.ts              # Entry point, initializes app
│   ├── config.ts             # Configuration management
│   ├── logger.ts             # Winston logging setup
│   ├── utils.ts              # Utility functions
│   ├── proxy-manager.ts      # Proxy rotation logic
│   ├── survey-runner.ts      # Playwright survey automation
│   ├── usabilla-client.ts    # Usabilla API integration
│   ├── report-generator.ts   # Daily report generation
│   ├── email-sender.ts       # SMTP email delivery
│   └── scheduler.ts          # Task scheduling with node-cron
├── config/
│   ├── urls.json             # Target URLs
│   └── form-values.json      # Survey response templates
├── logs/                      # Application logs (auto-created)
├── dist/                      # Compiled JavaScript (auto-created)
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

### Key Components

#### ProxyManager
Handles IP rotation via IPRoyal residential proxies. Supports:
- Randomized IP per request
- Sticky sessions (same IP for 10 minutes)
- Proxy testing and validation

#### SurveyRunner
Uses Playwright to:
- Navigate to target URLs
- Clear Usabilla cookies/storage
- Trigger the survey widget
- Fill form fields with randomized values
- Submit survey pages progressively
- Capture failure screenshots

#### ReportGenerator
Generates daily reports with:
- Success/failure statistics
- Execution timings
- Error details
- HTML and text formats

#### EmailSender
Sends reports and alerts via SMTP:
- Daily report delivery
- Failure alerts (>50% failure rate)
- Rich HTML formatting

#### Scheduler
Uses node-cron to:
- Schedule 3 runs per day per URL
- Randomize execution times within windows
- Trigger daily email reports
- Monitor failure rates

## API Integration

### Usabilla Survey Flow

The script submits survey responses progressively across 4 pages:

1. **Page 1**: Overall satisfaction (mood rating)
2. **Page 2**: Sub-satisfaction matrix (ergonomics, characteristics, price)
3. **Page 3**: Efficiency score
4. **Page 4**: Goal and vehicle type (final submission)

Each page submission includes:
- Randomized response values (weighted distributions)
- Realistic timing (5-45 seconds per page)
- Browser fingerprinting (user-agent, viewport, etc.)
- Proxy-rotated IP address

## Monitoring & Logging

### Log Files

```
logs/
├── combined.log    # All logs
└── error.log       # Errors only
```

### Log Levels

- `error`: Critical failures
- `warn`: Non-critical issues (proxy failures, etc.)
- `info`: Normal operation
- `debug`: Detailed debugging

### Console Output Example

```
[2026-01-28 08:23:45] INFO: Navigating to https://store.opel.de/vehicles?channel=rockse
[2026-01-28 08:24:12] INFO: Survey completed successfully
[2026-01-28 22:00:00] INFO: Daily report sent successfully
```

## Troubleshooting

### Proxy Connection Failed

```bash
# Test proxy connectivity
curl -x http://user:pass@geo.iproyal.com:12321 -L https://ipv4.icanhazip.com
```

**Solutions**:
- Verify credentials in `.env`
- Check IPRoyal account balance
- Ensure port 12321 is not blocked

### Survey Widget Not Appearing

- Increase timeout in `survey-runner.ts` (line ~120)
- Verify target URL is accessible
- Check browser console errors in screenshots

### Email Not Sending

- Verify SMTP credentials (especially Gmail app passwords)
- Check email recipient address
- Ensure SMTP port (usually 587 for TLS)

### High Memory Usage

- Reduce `RUNS_PER_DAY` in `.env`
- Increase timeout between tasks
- Monitor with: `watch -n 1 'ps aux | grep node'`

## Performance Tuning

### For Higher Volume

```env
RUNS_PER_DAY=5          # More runs per URL
PROXY_SESSION_LIFETIME=30  # Longer session stickiness
```

### For Lower Resource Usage

```env
RUNS_PER_DAY=1          # Single run per URL
NODE_ENV=production     # Disable debug logging
LOG_LEVEL=warn          # Only warnings and errors
```

## Security Notes

- Store `.env` securely (never commit)
- Use app-specific passwords (not your main Gmail password)
- Rotate proxy credentials periodically
- Keep Node.js and dependencies updated

## Support

For issues or questions, contact the development team or check logs in `logs/` directory.

## License

MIT
