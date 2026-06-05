const logger = require('../utils/logger');
const { Contact, CDR, CallTranscript } = require('../models');

class OutboundIvrHandler {
  constructor(srf, rtpengine, ivrHandler, dtmfListener, io) {
    this.srf = srf;
    this.rtpengine = rtpengine;
    this.ivrHandler = ivrHandler;
    this.dtmfListener = dtmfListener;
    this.io = io;
    this.rtpengineConfig = {
      host: process.env.RTPENGINE_HOST || '127.0.0.1',
      port: parseInt(process.env.RTPENGINE_PORT) || 22222
    };
    this.activeOutboundCalls = new Map();
  }

  // ============================================================
  // Initiate outbound call to contact with IVR
  // ============================================================
  async initiateOutboundCall(contactId, trunkName, callerId) {
    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    const { Trunk } = require('../models');
    const trunk = await Trunk.findOne({ name: trunkName, enabled: true });
    if (!trunk) {
      throw new Error('Trunk not found');
    }

    const callId = require('uuid').v4();
    const dialNumber = contact.phone;
    const targetUri = `sip:${dialNumber}@${trunk.host}:${trunk.port || 5060}`;

    logger.info(`OUTBOUND IVR: Calling ${contact.name} at ${dialNumber} via ${trunkName} [${callId}]`);

    // Create CDR
    const cdr = new CDR({
      callId,
      sipCallId: callId,
      from: callerId,
      to: dialNumber,
      direction: 'outbound',
      status: 'ringing',
      startTime: new Date(),
      trunkUsed: trunkName
    });
    await cdr.save();

    try {
      // Place the call
      const uac = await this.srf.createUAC(targetUri, {
        headers: {
          'From': `<sip:${trunk.username}@${trunk.host}>`,
          'To': `<sip:${dialNumber}@${trunk.host}>`,
          'P-Asserted-Identity': `<sip:${callerId}@${trunk.host}>`
        },
        auth: { username: trunk.username, password: trunk.password },
        timeout: 30000
      });

      logger.info(`OUTBOUND IVR: Call answered by ${contact.name} [${callId}]`);

      cdr.status = 'answered';
      cdr.answerTime = new Date();
      await cdr.save();

      // Track the call
      this.activeOutboundCalls.set(callId, {
        contactId: contact._id.toString(),
        contact: contact.toObject(),
        uac,
        cdrId: cdr._id.toString(),
        status: 'ivr_active'
      });

      // Start IVR menu
      await this._runOutboundIvr(uac, callId, contact, cdr);

      return { success: true, callId, contact };

    } catch (err) {
      logger.error(`OUTBOUND IVR: Call failed to ${dialNumber}: ${err.message}`);
      cdr.status = 'failed';
      cdr.endTime = new Date();
      await cdr.save();
      
      contact.status = 'called';
      contact.lastCalled = new Date();
      contact.callCount += 1;
      await contact.save();

      throw err;
    }
  }

  // ============================================================
  // Run outbound IVR menu with YES/NO options
  // ============================================================
  async _runOutboundIvr(uac, callId, contact, cdr) {
    const sipCallId = callId;
    const fromTag = uac.sip ? uac.sip.localTag : '';
    let callerHungUp = false;
    let dtmfDigit = null;
    let dtmfResolve = null;

    // Listen for hangup
    uac.on('destroy', () => {
      callerHungUp = true;
      if (dtmfResolve) dtmfResolve(null);
      if (this.dtmfListener) this.dtmfListener.unregister(sipCallId);
      this._cleanupCall(callId, cdr, 'caller');
    });

    // Listen for DTMF via SIP INFO
    uac.on('info', (infoReq, infoRes) => {
      const contentType = infoReq.get('Content-Type') || '';
      const body = infoReq.body || '';

      if (contentType.includes('dtmf-relay') || contentType.includes('dtmf')) {
        const signalMatch = body.match(/Signal\s*=\s*(\S+)/i);
        if (signalMatch) {
          dtmfDigit = signalMatch[1].trim();
          logger.info(`OUTBOUND IVR: DTMF via SIP INFO: ${dtmfDigit}`);
          if (dtmfResolve) dtmfResolve(dtmfDigit);
        }
      }
      infoRes.send(200);
    });

    // Register with DTMF listener for RFC 2833 events
    if (this.dtmfListener) {
      this.dtmfListener.register(sipCallId, (digit, tag, cid) => {
        logger.info(`OUTBOUND IVR: DTMF via RTPEngine: digit=${digit}`);
        dtmfDigit = digit;
        if (dtmfResolve) dtmfResolve(digit);
      }, fromTag);
    }

    // Play IVR message and wait for DTMF
    try {
      const greetingFile = '/audio/outbound-ivr.wav';
      
      // Set up DTMF capture
      dtmfDigit = null;
      const digit = await new Promise(async (resolve) => {
        let timer = null;
        let resolved = false;

        const done = (d) => {
          if (resolved) return;
          resolved = true;
          dtmfResolve = null;
          if (timer) clearTimeout(timer);
          resolve(d);
        };

        dtmfResolve = done;

        // Play greeting
        logger.info(`OUTBOUND IVR: Playing greeting message`);
        try {
          const playResp = await this.rtpengine.playMedia(this.rtpengineConfig, {
            'call-id': sipCallId,
            'from-tag': fromTag,
            file: greetingFile
          });

          const greetingDuration = playResp.duration || 5000;
          const waitStep = 500;
          let waited = 0;
          
          while (waited < greetingDuration && !resolved && !callerHungUp) {
            await this._sleep(Math.min(waitStep, greetingDuration - waited));
            waited += waitStep;
          }

          if (resolved) {
            try {
              await this.rtpengine.stopMedia(this.rtpengineConfig, {
                'call-id': sipCallId,
                'from-tag': fromTag
              });
            } catch (e) {}
            return;
          }
        } catch (err) {
          logger.warn(`OUTBOUND IVR: Greeting play failed: ${err.message}`);
        }

        if (callerHungUp) { done(null); return; }

        // Wait for DTMF input (15 seconds)
        timer = setTimeout(() => done(null), 15000);
      });

      if (callerHungUp) return;

      // Process the response
      await this._processDtmfResponse(digit, callId, contact, cdr);

    } catch (err) {
      logger.error(`OUTBOUND IVR: Error running IVR: ${err.message}`);
    }
  }

  // ============================================================
  // Process DTMF response (1=YES, 2=NO)
  // ============================================================
  async _processDtmfResponse(digit, callId, contact, cdr) {
    const activeCall = this.activeOutboundCalls.get(callId);
    if (!activeCall) return;

    let response = '';
    if (digit === '1') {
      response = 'yes';
      contact.status = 'interested';
      logger.info(`OUTBOUND IVR: Contact ${contact.name} pressed 1 (YES) - sending notification`);
      
      // Emit real-time notification
      if (this.io) {
        this.io.emit('outbound-ivr-response', {
          callId,
          contact: activeCall.contact,
          response: 'yes',
          timestamp: new Date()
        });
      }
    } else if (digit === '2') {
      response = 'no';
      contact.status = 'not-interested';
      logger.info(`OUTBOUND IVR: Contact ${contact.name} pressed 2 (NO)`);
    } else {
      response = 'no-response';
      contact.status = 'called';
      logger.info(`OUTBOUND IVR: Contact ${contact.name} did not respond`);
    }

    contact.lastCalled = new Date();
    contact.lastResponse = response;
    contact.callCount += 1;
    await contact.save();

    // Update CDR
    cdr.disposition = response === 'yes' ? 'interested' : (response === 'no' ? 'not-interested' : 'no-response');
    await cdr.save();

    // Hang up the call
    const uac = activeCall.uac;
    if (uac) {
      try {
        uac.destroy();
      } catch (e) {}
    }

    this.activeOutboundCalls.delete(callId);
  }

  // ============================================================
  // Cleanup call resources
  // ============================================================
  async _cleanupCall(callId, cdr, hangupBy) {
    if (this.dtmfListener) {
      this.dtmfListener.unregister(callId);
    }

    const activeCall = this.activeOutboundCalls.get(callId);
    if (activeCall) {
      this.activeOutboundCalls.delete(callId);
    }

    cdr.status = 'completed';
    cdr.endTime = new Date();
    cdr.duration = Math.round((cdr.endTime - cdr.startTime) / 1000);
    cdr.talkTime = cdr.answerTime ? Math.round((cdr.endTime - cdr.answerTime) / 1000) : 0;
    cdr.hangupBy = hangupBy;
    await cdr.save();

    logger.info(`OUTBOUND IVR: Call ${callId} cleaned up`);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // Get active outbound calls
  // ============================================================
  getActiveCalls() {
    const calls = [];
    for (const [callId, data] of this.activeOutboundCalls) {
      calls.push({
        callId,
        contact: data.contact,
        status: data.status,
        cdrId: data.cdrId
      });
    }
    return calls;
  }
}

module.exports = OutboundIvrHandler;
