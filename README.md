Rev Voice Assistant 🎙️⚡

Rev Voice Assistant is a hands-free conversational AI built with React (frontend), Node.js/Express (backend), and Google Gemini AI (native audio).
It acts as a friendly guide for Revolt Motors EV bikes, answering queries about specs, pricing, and updates — all through voice input & output.

🚀 Features

🎤 Hands-free voice conversation with Google Gemini

🔊 Audio responses (Gemini-generated speech)

⚡ Real-time communication with WebSockets

📡 Backend powered by Express.js + Google GenAI SDK

🎨 Frontend built with React + Vite + Tailwind CSS

📂 Project Structure
Rev-voice-assistant/
│── client/          # React frontend (Vite + Tailwind)
│── server/          # Express backend (WebSocket + Gemini AI)
│── README.md        # Project documentation

🛠️ Installation & Setup
1. Clone the repository
git clone https://github.com/Heroamit007/Rev-voice-assistant.git
cd Rev-voice-assistant

2. Setup Backend (Node.js)
cd server
npm install


Create a .env file inside server/ with your Google API Key:

GOOGLE_API_KEY=your_api_key_here
PORT=8080


Run the backend:

node server.js

3. Setup Frontend (React)
cd ../client
npm install
npm run dev


By default, the frontend runs at:
👉 http://localhost:5173
and connects to the backend at http://localhost:8080

🎮 How It Works

User presses Start Recording 🎤

The app records voice, sends it to the backend.

Backend converts audio → text → Gemini response → speech.

Gemini sends AI-generated audio 🔊 back to frontend.

The frontend plays the audio response.

Loop continues for hands-free conversation.

📋 Requirements

Node.js (>=18)

npm or yarn

Google API Key for Gemini

🖥️ Tech Stack

Frontend: React, Vite, Tailwind CSS

Backend: Express.js, WebSockets, Multer, Wavefile

AI: Google Gemini (native audio dialog model)

📌 Future Improvements

Add text + voice hybrid responses

Deploy to cloud (Render, Vercel, or Railway)

Support multiple EV brands

🤝 Contributing

Pull requests are welcome! For major changes, open an issue first to discuss.
