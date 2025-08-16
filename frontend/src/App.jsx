import React, { useEffect, useRef, useState } from "react";

function App() {
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const audioRef = useRef(null);

  const audioCtxRef = useRef(null);
  const workletPortRef = useRef(null);
  const pcmBuffersRef = useRef([]);
  const silenceTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      try { audioCtxRef.current?.close(); } catch {}
      clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const toggleRecording = async () => {
    if (isActive) {
      stopListening();
      setIsActive(false);
    } else {
      setMessages([]);
      await startListening();
      setIsActive(true);
    }
  };

  const startListening = async () => {
    setMessages((m) => [...m, "🎤 Listening..."]);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    audioCtxRef.current = ctx;

    const workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(workletUrl);

    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "recorder");
    workletPortRef.current = node.port;
    src.connect(node);

    pcmBuffersRef.current = [];
    node.port.onmessage = (e) => {
      if (e.data?.type === "chunk") {
        const chunk = e.data.payload;
        pcmBuffersRef.current.push(chunk);
        detectSilence(chunk);
      }
    };
  };

  const stopListening = () => {
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    clearTimeout(silenceTimerRef.current);
  };

  const detectSilence = (chunk) => {
    const maxAmp = Math.max(...chunk.map((v) => Math.abs(v)));
    if (maxAmp > 0.01) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        handleQuestion();
      }, 1000);
    }
  };

  const handleQuestion = async () => {
    stopListening();
    setMessages((m) => [...m, "🤔 Processing..."]);

    const samples = mergeFloat32(pcmBuffersRef.current);
    const wavBuffer = floatTo16BitWav(samples, 16000);

    const form = new FormData();
    form.append("audio", new Blob([wavBuffer], { type: "audio/wav" }), "input.wav");

    try {
      const resp = await fetch("http://localhost:8080/api/voice", {
        method: "POST",
        body: form
      });

      if (!resp.ok) {
        const t = await resp.text();
        setMessages((m) => [...m, `❌ Server error: ${t}`]);
        if (isActive) await startListening(); // keep loop alive on error
        return;
      }

      const replyBlob = await resp.blob();
      const url = URL.createObjectURL(replyBlob);
      audioRef.current.src = url;

      audioRef.current.onended = async () => {
        if (isActive) {
          pcmBuffersRef.current = []; // reset for next question
          await startListening();
        }
      };

      await audioRef.current.play();
      setMessages((m) => [...m, "✅ Reply received & playing"]);
    } catch (err) {
      setMessages((m) => [...m, `❌ Error: ${err.message}`]);
      if (isActive) await startListening();
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 720 }}>
      <h1>🎙 Rev Voice Assistant</h1>
      <button onClick={toggleRecording}>
        {isActive ? "⏹ Stop" : "🎤 Start"}
      </button>

      <div style={{ marginTop: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ fontFamily: "monospace" }}>{m}</div>
        ))}
      </div>

      <audio ref={audioRef} controls style={{ marginTop: 16 }} />
    </div>
  );
}

/* Helpers */
function mergeFloat32(chunks) {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function floatTo16BitWav(float32, sampleRate) {
  const numSamples = float32.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample * 1;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

const WORKLET_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      const channel = input[0];
      this.port.postMessage({ type: 'chunk', payload: channel.slice(0) });
    }
    return true;
  }
}
registerProcessor('recorder', RecorderProcessor);
`;

export default App;
