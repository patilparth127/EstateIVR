const express = require('express');
const { Contact, CallTranscript, CDR } = require('../models');
const logger = require('../utils/logger');

function createOutboundApiRouter(outboundIvrHandler, whisperTranscriber) {
  const router = express.Router();

  // ============================================================
  // Contact Management (Outbound Calling)
  // ============================================================
  router.get('/contacts', async (req, res) => {
    try {
      const { status, lastResponse, search } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (lastResponse) filter.lastResponse = lastResponse;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      const contacts = await Contact.find(filter).sort({ createdAt: -1 });
      res.json({ success: true, contacts });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.get('/contacts/:id', async (req, res) => {
    try {
      const contact = await Contact.findById(req.params.id);
      if (!contact) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, contact });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/contacts', async (req, res) => {
    try {
      const { name, phone, email, company, notes, tags } = req.body;
      if (!name || !phone) return res.status(400).json({ success: false, error: 'name and phone required' });
      
      const contact = await Contact.create({
        name, phone, email, company, notes, tags,
        status: 'active'
      });
      
      logger.info(`Contact created: ${name} (${phone})`);
      res.status(201).json({ success: true, contact });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/contacts/bulk', async (req, res) => {
    try {
      const { contacts } = req.body;
      if (!Array.isArray(contacts)) return res.status(400).json({ success: false, error: 'contacts array required' });
      
      const results = [];
      for (const c of contacts) {
        try {
          const contact = await Contact.create({
            name: c.name,
            phone: c.phone,
            email: c.email || '',
            company: c.company || '',
            notes: c.notes || '',
            tags: c.tags || [],
            status: 'active'
          });
          results.push({ success: true, contact });
        } catch (err) {
          results.push({ success: false, error: err.message, phone: c.phone });
        }
      }
      
      res.json({ success: true, results });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.put('/contacts/:id', async (req, res) => {
    try {
      const updates = {};
      ['name', 'phone', 'email', 'company', 'notes', 'tags', 'status'].forEach(k => {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      });
      updates.updatedAt = new Date();
      
      const contact = await Contact.findByIdAndUpdate(req.params.id, updates, { new: true });
      if (!contact) return res.status(404).json({ success: false, error: 'Not found' });
      
      res.json({ success: true, contact });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.delete('/contacts/:id', async (req, res) => {
    try {
      const contact = await Contact.findByIdAndDelete(req.params.id);
      if (!contact) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, message: 'Contact deleted' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  // Post-call feedback endpoint
  router.post('/contacts/:id/feedback', async (req, res) => {
    try {
      const { status, remark, rescheduleDate, labels } = req.body;
      
      const updates = {};
      if (status) updates.status = status;
      if (remark !== undefined) updates.remark = remark;
      if (rescheduleDate) updates.rescheduleDate = new Date(rescheduleDate);
      if (labels && Array.isArray(labels)) updates.labels = labels;
      updates.updatedAt = new Date();
      
      const contact = await Contact.findByIdAndUpdate(req.params.id, updates, { new: true });
      if (!contact) return res.status(404).json({ success: false, error: 'Not found' });
      
      logger.info(`Post-call feedback saved for ${contact.name}: status=${status}, labels=${labels?.join(',')}`);
      res.json({ success: true, contact });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  // ============================================================
  // Outbound IVR Calling
  // ============================================================
  router.post('/outbound-ivr/call', async (req, res) => {
    try {
      const { contactId, trunkName, callerId } = req.body;
      if (!contactId || !trunkName || !callerId) {
        return res.status(400).json({ success: false, error: 'contactId, trunkName, and callerId required' });
      }

      if (!outboundIvrHandler) {
        return res.status(503).json({ success: false, error: 'Outbound IVR handler not initialized' });
      }

      const result = await outboundIvrHandler.initiateOutboundCall(contactId, trunkName, callerId);
      res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.get('/outbound-ivr/active', (req, res) => {
    if (!outboundIvrHandler) {
      return res.json({ success: true, activeCalls: [] });
    }
    const activeCalls = outboundIvrHandler.getActiveCalls();
    res.json({ success: true, activeCalls });
  });

  // ============================================================
  // Call Logs with IVR Responses
  // ============================================================
  router.get('/outbound-ivr/logs', async (req, res) => {
    try {
      const { contactId, status, startDate, endDate } = req.query;
      const filter = { direction: 'outbound' };
      
      if (contactId) {
        // Find CDRs related to this contact
        const contact = await Contact.findById(contactId);
        if (contact) {
          filter.to = contact.phone;
        }
      }
      
      if (status) filter.status = status;
      if (startDate || endDate) {
        filter.startTime = {};
        if (startDate) filter.startTime.$gte = new Date(startDate);
        if (endDate) filter.startTime.$lte = new Date(endDate);
      }

      const logs = await CDR.find(filter)
        .sort({ startTime: -1 })
        .limit(100);

      // Enrich with contact info
      const enrichedLogs = await Promise.all(logs.map(async (log) => {
        const contact = await Contact.findOne({ phone: log.to });
        return {
          ...log.toObject(),
          contact: contact ? contact.toObject() : null
        };
      }));

      res.json({ success: true, logs: enrichedLogs });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  // ============================================================
  // Call Transcripts (Whisper)
  // ============================================================
  router.get('/transcripts', async (req, res) => {
    try {
      const { callId, cdrId } = req.query;
      const filter = {};
      if (callId) filter.callId = callId;
      if (cdrId) filter.cdrId = cdrId;
      
      const transcripts = await CallTranscript.find(filter).sort({ createdAt: -1 });
      res.json({ success: true, transcripts });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.get('/transcripts/:callId', async (req, res) => {
    try {
      const transcript = await CallTranscript.findOne({ callId: req.params.callId });
      if (!transcript) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, transcript });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/transcripts/:callId/transcribe', async (req, res) => {
    try {
      const { recordingPath, cdrId } = req.body;
      if (!recordingPath) {
        return res.status(400).json({ success: false, error: 'recordingPath required' });
      }

      if (!whisperTranscriber) {
        return res.status(503).json({ success: false, error: 'Whisper transcriber not initialized' });
      }

      // Queue transcription
      whisperTranscriber.queueTranscription(recordingPath, req.params.callId, cdrId);
      
      res.json({ success: true, message: 'Transcription queued' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.get('/transcripts/cdr/:cdrId', async (req, res) => {
    try {
      const transcript = await CallTranscript.findOne({ cdrId: req.params.cdrId });
      if (!transcript) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, transcript });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  return router;
}

module.exports = createOutboundApiRouter;
