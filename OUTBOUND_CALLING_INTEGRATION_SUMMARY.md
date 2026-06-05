# Outbound Calling System - Integration Summary

## Overview

A full-stack outbound calling system has been integrated into ShadowPBX for Indian SIM-based gateway operations with IVR, call recording, and speech-to-text transcription.

## Components Added

### 1. Database Schema Extensions

**Contact Model** (`src/models/index.js`)
- Stores contact information for outbound calling
- Fields: name, phone, email, company, notes, tags, status, lastCalled, lastResponse, callCount
- Status values: active, called, interested, not-interested, dnc
- Tracks IVR responses (yes/no)

**CallTranscript Model** (`src/models/index.js`)
- Stores Whisper speech-to-text output
- Fields: callId, cdrId, recordingPath, transcript, language, model, duration, confidence, processingTime
- Links to CDR for call context

### 2. Outbound IVR Service

**File**: `src/services/outbound-ivr.js`

**Features**:
- Initiates outbound calls via SIP trunks
- Plays IVR greeting message
- Captures DTMF input (1=YES, 2=NO)
- Updates contact status based on response
- Emits real-time WebSocket notifications for YES responses
- Integrates with existing ShadowPBX infrastructure

**Key Methods**:
- `initiateOutboundCall(contactId, trunkName, callerId)` - Start outbound call
- `_runOutboundIvr()` - Execute IVR menu with DTMF capture
- `_processDtmfResponse()` - Handle YES/NO responses
- `getActiveCalls()` - Get currently active outbound calls

### 3. Whisper Transcriber Service

**File**: `src/services/whisper-transcriber.js`

**Features**:
- Transcribes call recordings using OpenAI Whisper
- Queue-based processing for multiple recordings
- Supports multiple Whisper models (tiny, base, small, medium, large)
- Stores transcripts in MongoDB
- Configurable language and model size

**Key Methods**:
- `transcribe(recordingPath, callId, cdrId)` - Transcribe single recording
- `queueTranscription()` - Add to processing queue
- `processTranscriptFile()` - Process completed Whisper output
- `checkInstallation()` - Verify Whisper is installed

### 4. API Endpoints

**File**: `src/routes/outbound-api.js`

**Contact Management**:
- `GET /api/outbound/contacts` - List all contacts
- `GET /api/outbound/contacts/:id` - Get contact by ID
- `POST /api/outbound/contacts` - Create new contact
- `POST /api/outbound/contacts/bulk` - Bulk import contacts
- `PUT /api/outbound/contacts/:id` - Update contact
- `DELETE /api/outbound/contacts/:id` - Delete contact

**Outbound IVR**:
- `POST /api/outbound/outbound-ivr/call` - Initiate outbound call
- `GET /api/outbound/outbound-ivr/active` - Get active calls
- `GET /api/outbound/outbound-ivr/logs` - Get call logs with IVR responses

**Transcripts**:
- `GET /api/outbound/transcripts` - List all transcripts
- `GET /api/outbound/transcripts/:callId` - Get transcript by call ID
- `POST /api/outbound/transcripts/:callId/transcribe` - Queue transcription
- `GET /api/outbound/transcripts/cdr/:cdrId` - Get transcript by CDR ID

### 5. Web Dashboard

**File**: `src/public/outbound-dashboard.html`

**Features**:
- Real-time contact management
- Call initiation with one click
- Live call logs with IVR responses
- Real-time notifications for YES responses (via Socket.IO)
- Statistics dashboard (total contacts, interested count, etc.)
- Search and filter functionality
- Responsive dark-themed UI

**Real-time Events**:
- `outbound-ivr-response` - Emitted when contact presses YES
- Includes contact details and timestamp

### 6. Asterisk GSM Integration

**Docker Setup**: `docker-compose.gsm.yml`

**Components**:
- Asterisk 18 with chan_dongle module
- GSM modem support via USB
- SIP trunk integration with ShadowPBX
- IVR dialplan for outbound calls
- Call recording integration

**Configuration Files**:
- `docker/asterisk-gsm/Dockerfile` - Asterisk build with chan_dongle
- `docker/asterisk-gsm/asterisk.conf` - Asterisk configuration
- `docker/asterisk-gsm/extensions.conf` - IVR dialplan
- `docker/asterisk-gsm/sip.conf` - SIP trunk configuration
- `docker/asterisk-gsm/dongle.conf` - GSM modem configuration

### 7. App.js Integration

**File**: `src/app.js`

**Changes**:
- Added imports for `OutboundIvrHandler` and `WhisperTranscriber`
- Initialized outbound IVR handler with Socket.IO support
- Initialized Whisper transcriber with installation check
- Added outbound API router to Express app
- Services are available to all existing ShadowPBX components

## Integration Points

### With Existing ShadowPBX

1. **SIP Layer**: Uses existing Drachtio SIP server
2. **Media Layer**: Uses existing RTPEngine for media handling
3. **Database**: Extends existing MongoDB with new collections
4. **WebSocket**: Uses existing Socket.IO for real-time updates
5. **Recording**: Integrates with existing RTPEngine recording
6. **CDR**: Links transcripts to existing CDR records

### Data Flow

```
Contact Created → API → MongoDB
     ↓
Initiate Call → OutboundIvrHandler → Drachtio → SIP Trunk → GSM Modem
     ↓
Call Answered → RTPEngine → IVR Message Played
     ↓
DTMF Input → RTPEngine DTMF Detection → OutboundIvrHandler
     ↓
Response Saved → MongoDB (Contact + CDR)
     ↓
Real-time Notification → Socket.IO → Dashboard
     ↓
Call Recording → RTPEngine → WAV File
     ↓
Transcription → Whisper → MongoDB (CallTranscript)
```

## File Structure

```
d:\shadowpbx\
├── src\
│   ├── models\
│   │   └── index.js (Contact, CallTranscript schemas added)
│   ├── services\
│   │   ├── outbound-ivr.js (NEW)
│   │   └── whisper-transcriber.js (NEW)
│   ├── routes\
│   │   └── outbound-api.js (NEW)
│   ├── public\
│   │   └── outbound-dashboard.html (NEW)
│   └── app.js (Integration added)
├── docker\
│   └── asterisk-gsm\
│       ├── Dockerfile (NEW)
│       ├── asterisk.conf (NEW)
│       ├── extensions.conf (NEW)
│       ├── sip.conf (NEW)
│       └── dongle.conf (NEW)
├── audio\
│   ├── outbound-ivr.wav (NEW placeholder)
│   └── yes-no-prompt.wav (NEW placeholder)
├── docker-compose.gsm.yml (NEW)
├── GSM_OUTBOUND_CALLING_SETUP.md (NEW)
└── OUTBOUND_CALLING_INTEGRATION_SUMMARY.md (THIS FILE)
```

## Dependencies

### New Dependencies (via npm)
- None (uses existing dependencies)

### System Dependencies
- **Whisper**: `pip install openai-whisper`
- **ffmpeg**: For audio processing (usually pre-installed)
- **GSM Modem**: USB GSM modem with voice support

### Docker Services
- **asterisk-gsm**: Asterisk with chan_dongle
- **whisper-worker**: Background transcription worker

## Configuration

### Environment Variables

Add to `.env.docker`:
```env
# Whisper Configuration
WHISPER_MODEL_PATH=/opt/whisper/models
WHISPER_MODEL=base
WHISPER_LANGUAGE=en
TRANSCRIPT_OUTPUT_DIR=/var/lib/shadowpbx/transcripts

# GSM Configuration (optional - for Asterisk integration)
GSM_MODEM_DEVICE=/dev/ttyUSB0
```

### Audio Files

Place in `audio/` directory:
- `outbound-ivr.wav` - Main IVR message (8kHz, mono, WAV)
- `yes-no-prompt.wav` - DTMF prompt (8kHz, mono, WAV)

**Recording Audio**:
```bash
# Using ffmpeg
ffmpeg -f lavfi -i anullsrc=r=8000:cl=mono -t 5 -q:a 9 -acodec pcm_s16le output.wav

# Then record your voice message
# Convert to 8kHz mono if needed
ffmpeg -i input.wav -ar 8000 -ac 1 output.wav
```

## Usage Examples

### 1. Add Contact via API

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

### 2. Initiate Outbound Call

```bash
curl -X POST http://localhost:3000/api/outbound/outbound-ivr/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shadowpbx_admin_api_key" \
  -d '{
    "contactId": "CONTACT_ID_HERE",
    "trunkName": "your_trunk_name",
    "callerId": "919876543210"
  }'
```

### 3. View Call Logs

```bash
curl -H "X-API-Key: shadowpbx_admin_api_key" \
  http://localhost:3000/api/outbound/outbound-ivr/logs
```

### 4. Get Transcript

```bash
curl -H "X-API-Key: shadowpbx_admin_api_key" \
  http://localhost:3000/api/outbound/transcripts/CALL_ID
```

## Deployment

### Start with GSM Support

```bash
# Copy environment file
Copy-Item .env.docker.example .env.docker

# Edit configuration
notepad .env.docker

# Start services
docker compose -f docker-compose.gsm.yml up -d --build

# Check status
docker compose -f docker-compose.gsm.yml ps
```

### Access Dashboard

Open browser: `http://localhost:3000/outbound-dashboard.html`

## Testing

### 1. Test Contact Creation
```bash
# Add test contact
curl -X POST http://localhost:3000/api/outbound/contacts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shadowpbx_admin_api_key" \
  -d '{"name":"Test User","phone":"919999999999"}'
```

### 2. Test Dashboard
- Open dashboard in browser
- Verify contact appears
- Check statistics display

### 3. Test IVR Flow
- Configure SIP trunk in ShadowPBX
- Initiate call via dashboard
- Verify IVR message plays
- Test DTMF input (1=YES, 2=NO)
- Check contact status updates
- Verify real-time notification appears

### 4. Test Transcription
- Make a test call
- Wait for recording to complete
- Queue transcription via API
- Verify transcript appears in database

## Troubleshooting

### Outbound IVR Not Working
1. Check trunk configuration in ShadowPBX
2. Verify trunk is registered: `curl http://localhost:3000/api/trunks`
3. Check app logs: `docker logs shadowpbx-app`
4. Verify contact exists and has valid phone number

### Real-time Notifications Not Appearing
1. Check Socket.IO connection in browser console
2. Verify io is passed to OutboundIvrHandler
3. Check for WebSocket errors in logs
4. Ensure dashboard is connected to correct server

### Whisper Not Transcribing
1. Verify Whisper is installed: `whisper --help`
2. Check recording file exists in `runtime/recordings/wav/`
3. Check whisper-worker logs: `docker logs shadowpbx-whisper`
4. Verify output directory exists: `runtime/transcripts/`

### GSM Modem Not Detected
1. Check USB device: `ls /dev/ttyUSB*` (Linux) or Device Manager (Windows)
2. Verify device is passed to Docker container
3. Check Asterisk logs: `docker logs shadowpbx-asterisk-gsm`
4. Test modem with AT commands via serial terminal

## Security Considerations

1. **API Key Protection**: Never expose ADMIN_SECRET in frontend
2. **Contact Data**: Consider encryption for sensitive contact information
3. **Call Recordings**: Secure access to recording files
4. **Transcripts**: May contain sensitive information, restrict access
5. **GSM Modem**: Enable SIM PIN if supported
6. **Rate Limiting**: Add rate limiting to outbound call API

## Compliance Notes

### Indian Telecom Regulations
- Follow TRAI guidelines for commercial calls
- Integrate with TRAI DNC registry
- Restrict calls to 9 AM - 9 PM IST
- Obtain explicit consent before calling
- Provide opt-out mechanism in IVR
- Maintain call records for 1 year

### Data Privacy
- Secure storage of contact information
- Implement data retention policies
- Provide contact deletion capability
- Comply with DPDP Act when applicable

## Performance Optimization

### Concurrent Calls
- Add multiple GSM modems for parallel calling
- Configure Asterisk with multiple dongle sections
- Scale RTPEngine for more concurrent media sessions

### Transcription Speed
- Use smaller Whisper models (tiny/base) for faster processing
- Increase CPU allocation for whisper-worker
- Process recordings in batches during off-peak hours

### Database Performance
- Add indexes on frequently queried fields
- Archive old call logs and transcripts
- Use MongoDB replica set for production

## Future Enhancements

1. **CRM Integration**: Connect to Salesforce, HubSpot, Zoho
2. **Advanced IVR**: Multi-level menus, voice input
3. **Analytics**: Call analytics and reporting
4. **AI Lead Scoring**: Machine learning for lead qualification
5. **SMS Integration**: Send SMS follow-ups based on IVR response
6. **Email Integration**: Send email notifications for interested leads
7. **Calendar Integration**: Schedule callbacks
8. **Multi-language Support**: IVR in multiple languages

## Support

For issues:
1. Check logs: `docker logs <container-name>`
2. Review configuration files
3. Test GSM modem separately
4. Verify network connectivity
5. Check API authentication

## License

All components use free and open-source licenses:
- ShadowPBX: MIT
- Asterisk: GPL
- chan_dongle: GPL
- Whisper: MIT
- MongoDB: SSPL

No paid APIs or subscriptions required.
