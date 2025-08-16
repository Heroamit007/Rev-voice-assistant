import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenAI, Modality } from '@google/genai';
import pkg from 'wavefile';
const { WaveFile } = pkg;

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ✅ In-memory uploads (no /uploads folder)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('Missing GOOGLE_API_KEY in .env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Native audio output model
const MODEL = 'gemini-2.5-flash-preview-native-audio-dialog';

// Keep answers short and Revolt-specific (tweak as you like)
const CONFIG = {
  responseModalities: [Modality.AUDIO],
  systemInstruction:
    "You are Rev, a friendly guide to Revolt Motors EV bikes. Only talk about Revolt bikes, specs, pricing and news. Keep answers concise.",
};

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * POST /api/voice
 * Body: multipart/form-data { audio: <wav/pcm> }
 * Returns: audio/wav (Gemini's spoken reply)
 */
app.post('/api/voice', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No audio file uploaded as "audio".' });
    }

    // 1) Normalize to 16kHz, mono, 16-bit PCM
    const wavIn = new WaveFile(req.file.buffer);
    wavIn.toSampleRate(16000);
    wavIn.toBitDepth('16');
    if (wavIn.fmt.numChannels !== 1) wavIn.toMono();

    // Raw PCM16LE (no WAV header) for Gemini live input
    const pcm16 = wavIn.getSamples(true, Int16Array); // interleaved mono
    const base64Pcm = Buffer.from(pcm16.buffer).toString('base64');

    // 2) Open a Live session for this single turn
    const queue = [];
    const session = await ai.live.connect({
      model: MODEL,
      config: CONFIG,
      callbacks: {
        onopen: () => console.log('Gemini live session opened'),
        onmessage: (msg) => queue.push(msg),
        onerror: (e) => console.error('Gemini error:', e?.message || e),
        onclose: (e) =>
          console.log('Gemini session closed:', (e && e.reason) || 'normal'),
      },
    });

    // 3) Send user's audio to Gemini
    session.sendRealtimeInput({
      audio: {
        data: base64Pcm,
        mimeType: 'audio/pcm;rate=16000',
      },
    });

    // (Optional in some SDK versions) Signal end of input audio
    // session.sendRealtimeInput({ type: 'input_audio_done' });

    // 4) Wait for the full turn to complete + collect audio chunks
    const b64Chunks = [];
    let turnDone = false;

    const nextMsg = () =>
      new Promise((resolve) => {
        const tick = () => {
          const m = queue.shift();
          if (m) resolve(m);
          else setTimeout(tick, 25);
        };
        tick();
      });

    while (!turnDone) {
      const msg = await nextMsg();

      // Different SDK versions surface data differently; cover both:
      if (msg?.data) {
        // Older shape: raw base64 chunk in msg.data
        b64Chunks.push(msg.data);
      } else if (Array.isArray(msg?.serverContent)) {
        for (const part of msg.serverContent) {
          if (part?.audio?.data) {
            b64Chunks.push(part.audio.data);
          }
        }
      }

      if (msg?.serverContent?.turnComplete) {
        turnDone = true;
      }
    }

    // 5) Close the live session for this turn
    session.close();

    // 6) Merge PCM16LE chunks and wrap into a proper WAV @ 24kHz (model output rate)
    const merged = [];
    for (const b64 of b64Chunks) {
      const buf = Buffer.from(b64, 'base64');
      const view = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
      merged.push(...view);
    }
    const outPcm = new Int16Array(merged);

    const wavOut = new WaveFile();
    wavOut.fromScratch(1, 24000, '16', outPcm); // Gemini returns 24kHz
    const outBuffer = wavOut.toBuffer();

    // 7) Return audio/wav directly (frontend will play it)
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', outBuffer.length);
    return res.send(outBuffer);
  } catch (err) {
    console.error('Voice endpoint error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Voice server listening on http://localhost:${PORT}`);
});
