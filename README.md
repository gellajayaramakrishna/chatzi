# Chatzi — Anonymous Real-Time Chat Platform

A real-time anonymous stranger chat platform that connects random users instantly for one-on-one conversations — no account or identity required. Live at [chatzi.me](https://chatzi.me)

## Features

- Real-time one-on-one anonymous chat via WebSockets
- Interest-based matchmaking — pairs users with the most shared interests
- Live waiting queue with instant pairing
- Next stranger — skip and find a new match anytime
- Block and report system with auto-cooldown (10 min restriction after 3 reports)
- Online user count displayed in real time
- Rate limiting, security headers, and gzip compression
- Responsive UI for desktop and mobile

## Tech Stack

- **Backend:** Node.js, Express.js
- **Real-time:** Socket.io (WebSockets)
- **Frontend:** HTML, CSS, JavaScript
- **Security:** Helmet.js, express-rate-limit, compression

## Project Structure
```bash
chatzi/
├── server.js           # Backend — matchmaking, socket events, session logic
├── package.json
├── public/
│   ├── welcome.html    # Landing page
│   ├── gender.html     # Profile setup page
│   ├── chat.html       # Main chat UI
│   ├── chat.js         # Frontend socket logic
│   ├── app.js          # App entry
│   └── styles.css      # Styling
```
## How It Works

1. User visits the site and sets a name + interests
2. Backend adds them to a **waiting queue**
3. Matchmaking engine scores all waiting users by **shared interests** and pairs the best match
4. Both users are connected via a **Socket.io room** for real-time messaging
5. Either user can **skip** (next), **block**, or **report** at any time
6. On disconnect, the partner is notified and re-queued automatically

## Setup & Run Locally

### 1. Clone the repo
```bash
git clone https://github.com/gellajayaramakrishna/chatzi.git
cd chatzi
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the server
```bash
node server.js
```

Visit: `http://localhost:3000`

## Security

- Rate limited to 120 requests/minute per IP
- Helmet.js security headers on all responses
- Messages sanitized and capped at 800 characters
- Control characters stripped from all messages
- Abusive users auto-restricted via report cooldown system
