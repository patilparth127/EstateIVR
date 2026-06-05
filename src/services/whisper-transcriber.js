const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { CallTranscript, CDR } = require('../models');

const execAsync = promisify(exec);

class WhisperTranscriber {
  constructor() {
    this.modelPath = process.env.WHISPER_MODEL_PATH || '/opt/whisper/models';
    this.modelSize = process.env.WHISPER_MODEL || 'base';
    this.language = process.env.WHISPER_LANGUAGE || 'en';
    this.outputDir = process.env.TRANSCRIPT_OUTPUT_DIR || '/var/lib/shadowpbx/transcripts';
    this.processingQueue = [];
    this.isProcessing = false;
  }

  // ============================================================
  // Transcribe audio file using Whisper
  // ============================================================
  async transcribe(recordingPath, callId, cdrId = null) {
    try {
      logger.info(`WHISPER: Starting transcription for ${recordingPath} [${callId}]`);

      if (!fs.existsSync(recordingPath)) {
        throw new Error(`Recording file not found: ${recordingPath}`);
      }

      const startTime = Date.now();

      // Build Whisper command
      const cmd = this._buildWhisperCommand(recordingPath, callId);
      
      logger.debug(`WHISPER: Executing: ${cmd}`);
      const { stdout, stderr } = await execAsync(cmd, {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const processingTime = Date.now() - startTime;

      // Parse output to get transcript
      const transcript = this._parseWhisperOutput(stdout);
      
      // Get audio duration
      const duration = await this._getAudioDuration(recordingPath);

      // Save to database
      const callTranscript = await CallTranscript.create({
        callId,
        cdrId,
        recordingPath,
        transcript,
        language: this.language,
        model: this.modelSize,
        duration,
        confidence: 0.95, // Whisper doesn't provide confidence, using default
        processingTime
      });

      logger.info(`WHISPER: Transcription completed for ${callId} - ${transcript.length} chars in ${processingTime}ms`);

      return callTranscript;

    } catch (err) {
      logger.error(`WHISPER: Transcription failed for ${callId}: ${err.message}`);
      
      // Create failed transcript record
      try {
        await CallTranscript.create({
          callId,
          cdrId,
          recordingPath,
          transcript: `[TRANSCRIPTION FAILED: ${err.message}]`,
          language: this.language,
          model: this.modelSize,
          duration: 0,
          confidence: 0,
          processingTime: 0
        });
      } catch (dbErr) {
        logger.error(`WHISPER: Failed to save error transcript: ${dbErr.message}`);
      }

      throw err;
    }
  }

  // ============================================================
  // Build Whisper command
  // ============================================================
  _buildWhisperCommand(recordingPath, callId) {
    const outputBase = path.join(this.outputDir, callId);
    
    // Whisper command with options
    let cmd = `whisper "${recordingPath}"`;
    cmd += ` --model ${this.modelSize}`;
    cmd += ` --language ${this.language}`;
    cmd += ` --output_format txt`;
    cmd += ` --output_dir "${this.outputDir}"`;
    cmd += ` --output_base "${callId}"`;
    cmd += ` --fp16`; // Use FP16 for faster inference
    cmd += ` --threads 4`; // Use 4 threads

    return cmd;
  }

  // ============================================================
  // Parse Whisper output
  // ============================================================
  _parseWhisperOutput(stdout) {
    // Whisper outputs to stderr, transcript is in .txt file
    // We'll read the generated txt file instead
    return '';
  }

  // ============================================================
  // Get audio duration using ffprobe
  // ============================================================
  async _getAudioDuration(audioPath) {
    try {
      const cmd = `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`;
      const { stdout } = await execAsync(cmd);
      return parseFloat(stdout.trim()) || 0;
    } catch (err) {
      logger.warn(`WHISPER: Could not get audio duration: ${err.message}`);
      return 0;
    }
  }

  // ============================================================
  // Process transcription from file (called after Whisper completes)
  // ============================================================
  async processTranscriptFile(callId, cdrId = null) {
    try {
      const txtPath = path.join(this.outputDir, `${callId}.txt`);
      
      if (!fs.existsSync(txtPath)) {
        throw new Error(`Transcript file not found: ${txtPath}`);
      }

      const transcript = fs.readFileSync(txtPath, 'utf-8').trim();
      
      // Find the recording path from CDR
      let recordingPath = '';
      if (cdrId) {
        const cdr = await CDR.findById(cdrId);
        if (cdr && cdr.recordingPath) {
          recordingPath = cdr.recordingPath;
        }
      }

      // Update existing transcript or create new
      const existing = await CallTranscript.findOne({ callId });
      if (existing) {
        existing.transcript = transcript;
        await existing.save();
        logger.info(`WHISPER: Updated transcript for ${callId}`);
        return existing;
      } else {
        const callTranscript = await CallTranscript.create({
          callId,
          cdrId,
          recordingPath,
          transcript,
          language: this.language,
          model: this.modelSize,
          duration: await this._getAudioDuration(recordingPath),
          confidence: 0.95,
          processingTime: 0
        });
        logger.info(`WHISPER: Created transcript for ${callId}`);
        return callTranscript;
      }

    } catch (err) {
      logger.error(`WHISPER: Failed to process transcript file: ${err.message}`);
      throw err;
    }
  }

  // ============================================================
  // Queue transcription job
  // ============================================================
  async queueTranscription(recordingPath, callId, cdrId = null) {
    this.processingQueue.push({
      recordingPath,
      callId,
      cdrId,
      timestamp: Date.now()
    });

    if (!this.isProcessing) {
      this._processQueue();
    }
  }

  // ============================================================
  // Process transcription queue
  // ============================================================
  async _processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const job = this.processingQueue.shift();
      
      try {
        await this.transcribe(job.recordingPath, job.callId, job.cdrId);
      } catch (err) {
        logger.error(`WHISPER: Queue job failed for ${job.callId}: ${err.message}`);
      }

      // Small delay between jobs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessing = false;
  }

  // ============================================================
  // Get transcript by call ID
  // ============================================================
  async getTranscript(callId) {
    return await CallTranscript.findOne({ callId });
  }

  // ============================================================
  // Get transcript by CDR ID
  // ============================================================
  async getTranscriptByCdr(cdrId) {
    return await CallTranscript.findOne({ cdrId });
  }

  // ============================================================
  // Check if Whisper is installed
  // ============================================================
  async checkInstallation() {
    try {
      await execAsync('whisper --help');
      return true;
    } catch (err) {
      logger.warn('WHISPER: Not installed. Install with: pip install openai-whisper');
      return false;
    }
  }
}

module.exports = WhisperTranscriber;
