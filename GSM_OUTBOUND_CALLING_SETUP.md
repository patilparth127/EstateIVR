# GSM Outbound Calling System - Setup Guide

This guide explains how to set up a full-stack outbound calling system using Indian SIM-based gateway with IVR, call recording, and speech-to-text transcription.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ShadowPBX Outbound System                     │
│                                                                 │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Asterisk  │  │  ShadowPBX App   │  │   Web Dashboard      │ │
│  │  + GSM     │  │  (Node.js)       │  │   (HTML/Socket.IO)   │ │
│  │  Modem     │  │  - IVR Handler   │  │   - Contact Mgmt     │ │
│  │  (chan_    │  │  - Whisper       │  │   - Real-time       │ │
│  │   dongle)  │  │    Transcriber   │  │     Notifications    │ │
│  └─────┬──────┘  └────────┬─────────┘  └────────┬─────────────┘ │
│        │                   │                      │               │
│  ┌─────┴──────┐  ┌───────┴──────────┐  ┌───────┴─────────────┐ │
│  │  GSM Modem │  │  MongoDB         │  │  RTPEngine          │ │
│  │  (USB)     │  │  - Contacts      │  │  - Media Relay      │ │
│  │  Indian SIM│  │  - Call Logs     │  │  - Recording        │ │
│  └────────────┘  │  - Transcripts  │  │  - DTMF Detection   │ │
│                  └──────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Hardware Requirements

### GSM Modem Options

1. **USB GSM Modem (Recommended)**
   - Huawei E173 / E1550 / E303
   - ZTE MF190 / MF626
   - Any modem with voice support
   - Must support Indian networks (Airtel, Jio, Vodafone, BSNL)

2. **Android Phone as Gateway (Alternative)**
   - Install CSipSimple or Zoiper
   - Register as SIP extension to ShadowPBX
   - Use mobile data for outbound calls

### System Requirements

- Windows 11 / Linux server
- Docker Desktop (Windows) or Docker (Linux)
- 4GB RAM minimum
- 20GB disk space
- USB port for GSM modem

## Software Components

### 1. Asterisk with chan_dongle
- Asterisk 18 with chan_dongle module
- Handles GSM modem communication
- Converts GSM calls to SIP
- IVR dialplan execution

### 2. ShadowPBX Extensions
- **Contact Management**: Store and manage contact lists
- **Outbound IVR**: Automated calling with DTMF response capture
- **Call Recording**: Automatic call recording via RTPEngine
- **Whisper Integration**: OpenAI Whisper for speech-to-text
- **Real-time Dashboard**: Web UI with Socket.IO notifications

### 3. Open-Source Tools Used
- **Asterisk**: PBX software (GPL)
- **chan_dongle**: GSM modem driver (GPL)
- **ShadowPBX**: Node.js PBX (MIT)
- **Whisper**: OpenAI speech-to-text (MIT)
- **MongoDB**: Database (SSPL)
- **RTPEngine**: Media engine (GPL)
- **Socket.IO**: Real-time communication (MIT)

## Installation Steps

### Step 1: Prepare Environment

```bash
cd d:\shadowpbx

# Copy environment file
Copy-Item .env.docker.example .env.docker

# Edit .env.docker with your settings
notepad .env.docker
```

Required settings in `.env.docker`:
```env
EXTERNAL_IP=192.168.1.50  # Your local IP
SIP_DOMAIN=192.168.1.50
DRACHTIO_SECRET=change_me_secret
ADMIN_SECRET=shadowpbx_admin_api_key
ADMIN_PASSWORD=admin123
MONGODB_URI=mongodb://root:rootpass@mongo:27017/shadowpbx?authSource=admin
```

### Step 2: Connect GSM Modem

1. Insert Indian SIM card into GSM modem
2. Connect modem via USB
3. Verify device detection:
```bash
# On Windows
device manager -> Ports (COM & LPT) -> Look for USB Serial Port

# On Linux
ls /dev/ttyUSB*
```

Expected output: `/dev/ttyUSB0`, `/dev/ttyUSB1`, `/dev/ttyUSB2`

### Step 3: Configure Asterisk GSM

Edit `docker/asterisk-gsm/dongle.conf`:
```ini
[gsm1]
audio=/dev/dsp
data=/dev/ttyUSB0  # Update with your device
context=outbound-ivr
rxgain=-5
txgain=5
autostart=yes
sms=yes
ussd=yes
voice=yes
```

### Step 4: Create IVR Audio Files

Create the following audio files in `audio/` directory:

1. **outbound-ivr.wav** - Main IVR message
   ```
   "Are you interested in our service? Press 1 for Yes, 2 for No."
   ```
   Format: WAV, 8kHz, mono, 16-bit

2. **ivr-greeting.wav** - Incoming call greeting (optional)
   ```
   "Thank you for calling. How can we help you today?"
   ```

3. **yes-no-prompt.wav** - DTMF prompt
   ```
   "Press 1 for Yes, 2 for No"
   ```

### Step 5: Build and Start Services

```bash
# Start with GSM support
docker compose -f docker-compose.gsm.yml up -d --build

# Check status
docker compose -f docker-compose.gsm.yml ps

# View logs
docker logs shadowpbx-asterisk-gsm
docker logs shadowpbx-app
```

### Step 6: Install Whisper (on host or in container)

```bash
# Install Python dependencies
pip install openai-whisper

# Download Whisper model (automatically on first use)
# Models: tiny, base, small, medium, large
# base is recommended for balance of speed/accuracy
```

### Step 7: Access Dashboard

Open browser: `http://localhost:3000/outbound-dashboard.html`

## Usage

### Adding Contacts

Via API:
```bash
curl -X POST http://localhost:3000/api/outbound/contacts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shadowpbx_admin_api_key" \
  -d '{
    "name": "John Doe",
    "phone": "919876543210",
    "email": "john@example.com",
    "company": "ABC Corp"
  }'
```

Via Dashboard: Click "+ Add Contact" button

### Bulk Import Contacts

```bash
curl -X POST http://localhost:3000/api/outbound/contacts/bulk \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shadowpbx_admin_api_key" \
  -d '{
    "contacts": [
      {"name": "Alice", "phone": "919876543211"},
      {"name": "Bob", "phone": "919876543212"}
    ]
  }'
```

### Initiating Outbound Calls

Via API:
```bash
curl -X POST http://localhost:3000/api/outbound/outbound-ivr/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shadowpbx_admin_api_key" \
  -d '{
    "contactId": "CONTACT_ID",
    "trunkName": "gsm1",
    "callerId": "919876543210"
  }'
```

Via Dashboard: Click "Call" button next to contact

### IVR Flow

1. System dials contact via GSM modem
2. Contact answers
3. IVR message plays: "Are you interested in our service?"
4. Contact presses:
   - **1** = YES (interested)
   - **2** = NO (not interested)
5. Response is saved to database
6. Real-time notification sent to dashboard
7. Call is recorded
8. Recording transcribed via Whisper

### Viewing Call Logs

```bash
curl -H "X-API-Key: shadowpbx_admin_api_key" \
  http://localhost:3000/api/outbound/outbound-ivr/logs
```

### Viewing Transcripts

```bash
curl -H "X-API-Key: shadowpbx_admin_api_key" \
  http://localhost:3000/api/outbound/transcripts
```

## Troubleshooting

### GSM Modem Not Detected

```bash
# Check USB devices
lsusb

# Check serial ports
ls /dev/ttyUSB*  # Linux
device manager    # Windows

# Check Asterisk logs
docker logs shadowpbx-asterisk-gsm
```

### Calls Not Going Through

1. Verify SIM card has active service
2. Check GSM signal strength:
```bash
# In Asterisk CLI
docker exec -it shadowpbx-asterisk-gsm asterisk -rvvv
dongle show device state gsm1
```

3. Check trunk configuration in ShadowPBX

### DTMF Not Detected

1. Verify RTPEngine is running
2. Check DTMF settings in softphone
3. Enable DTMF logging in RTPEngine

### Whisper Not Transcribing

1. Verify Whisper is installed:
```bash
whisper --help
```

2. Check recording files exist:
```bash
ls -la runtime/recordings/wav/
```

3. Check Whisper worker logs:
```bash
docker logs shadowpbx-whisper
```

### Real-time Notifications Not Working

1. Verify Socket.IO is connected (check dashboard status)
2. Check app logs for WebSocket errors
3. Ensure firewall allows port 3000

## API Endpoints

### Contacts
- `GET /api/outbound/contacts` - List all contacts
- `GET /api/outbound/contacts/:id` - Get contact by ID
- `POST /api/outbound/contacts` - Create contact
- `POST /api/outbound/contacts/bulk` - Bulk import contacts
- `PUT /api/outbound/contacts/:id` - Update contact
- `DELETE /api/outbound/contacts/:id` - Delete contact

### Outbound IVR
- `POST /api/outbound/outbound-ivr/call` - Initiate outbound call
- `GET /api/outbound/outbound-ivr/active` - Get active calls
- `GET /api/outbound/outbound-ivr/logs` - Get call logs

### Transcripts
- `GET /api/outbound/transcripts` - List all transcripts
- `GET /api/outbound/transcripts/:callId` - Get transcript by call ID
- `POST /api/outbound/transcripts/:callId/transcribe` - Queue transcription
- `GET /api/outbound/transcripts/cdr/:cdrId` - Get transcript by CDR ID

## Security Considerations

1. **API Key Protection**: Never expose `ADMIN_SECRET` in frontend code
2. **Firewall**: Restrict access to API ports
3. **HTTPS**: Use nginx reverse proxy for production
4. **SIM Security**: Enable SIM PIN if supported
5. **Data Privacy**: Encrypt recordings if storing sensitive data

## Compliance Notes

### Indian Telecom Regulations

- **TRAI Regulations**: Follow TRAI guidelines for commercial calls
- **DNC Registry**: Integrate with TRAI DNC registry
- **Call Timing**: Restrict calls to 9 AM - 9 PM IST
- **Consent**: Ensure contacts have opted in

### Best Practices

1. Get explicit consent before calling
2. Honor DNC requests immediately
3. Provide opt-out mechanism in IVR
4. Maintain call records for 1 year
5. Regularly update contact preferences

## Performance Tuning

### Concurrent Calls

Adjust in `docker-compose.gsm.yml`:
```yaml
asterisk-gsm:
  # Add more dongle sections for multiple modems
```

### Whisper Performance

- Use smaller models (tiny/base) for faster transcription
- Increase CPU allocation for whisper-worker
- Process recordings in batches

### Database Optimization

- Add indexes on frequently queried fields
- Archive old call logs
- Use MongoDB replica set for production

## Cost Analysis

### Hardware Costs
- GSM Modem: ₹1,500 - ₹3,000
- USB Hub (if multiple modems): ₹500 - ₹1,000
- Server/PC: Existing or ₹15,000+

### Software Costs
- All software: **FREE** (open-source)
- No monthly subscriptions
- No per-call charges (uses SIM minutes)

### Operating Costs
- SIM card recharge: As per your plan
- Internet: Existing connection
- Electricity: Minimal

## Next Steps

1. **Test with Single Contact**: Verify end-to-end flow
2. **Scale Up**: Add more GSM modems for concurrent calls
3. **CRM Integration**: Connect to your existing CRM
4. **Analytics**: Add reporting and analytics
5. **AI Enhancement**: Integrate AI for lead scoring

## Support

For issues and questions:
- Check logs: `docker logs <container-name>`
- Review configuration files
- Test GSM modem separately
- Verify network connectivity

## License

This system uses only free and open-source software:
- ShadowPBX: MIT License
- Asterisk: GPL
- chan_dongle: GPL
- Whisper: MIT License
- MongoDB: SSPL

All components are self-hosted with no paid APIs or subscriptions.
