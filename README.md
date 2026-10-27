# Office Game Hub — Phase 1

A local-network multiplayer hub with a playable, server-authoritative Mini Car Race for 2–7 players. Rooms and race state are kept in memory; no database, login, public hosting, or other games are included.

## Requirements

- Node.js 20 or newer
- npm (included with Node.js)

## Install and run on Windows

From PowerShell or Command Prompt, open the project folder and run:

```powershell
npm install
npm run dev
```

The development server binds to all network interfaces. Open **http://localhost:5173** on the host laptop. The frontend and backend run together; by default the backend uses port `3001`.

To make a production build and serve it from Express:

```powershell
npm run build
npm start
```

The production server serves the app at **http://localhost:3001** by default.

## Join from another computer on your Wi-Fi/LAN

1. On the host laptop, run `ipconfig` in PowerShell or Command Prompt.
2. Find the active Wi-Fi adapter's **IPv4 Address**, for example `192.168.1.25`.
3. Give colleagues this address and frontend port: **http://192.168.1.25:5173** while using `npm run dev`. In production, use `http://192.168.1.25:3001`.
4. Create a room and share its five-character code. Colleagues choose **Join with a code** and enter that code.

If colleagues cannot connect, Windows Firewall may need an inbound rule for the frontend port (`5173`) and backend port (`3001`). Corporate Wi-Fi may block device-to-device connections; use an approved office network. Keep the app on the local network: do not configure router port forwarding or expose these ports publicly.

## Play

- Create a room, choose a nickname (up to 16 characters), and share the room code.
- The host can start once at least two connected players are in the lobby; rooms support up to seven.
- Before starting, the host can choose Grand Oval, Corner Cut, Coffee Run, Switchback, Chicane, or Skyline Loop. Everyone in the lobby sees the selected track.
- Drive with **WASD** or the **arrow keys**: up accelerates, down brakes/reverses, left/right steer.
- Complete three laps and pass all four checkpoints in order. The server simulates car movement and determines lap progress, standings, finish order, and results.
- After the first driver finishes, the host can reset the race to the lobby immediately, or wait for everyone to finish. The host can remove players from the lobby and remove disconnected players during a race.
- Use separate browser tabs with different nicknames to test locally. A room is scoped to its room code; disconnected drivers are marked in the race state.

## Checks

```powershell
npm test
npm run build
```

## Configuration

Defaults are `FRONTEND_PORT=5173` and `API_PORT=3001`. Set `FRONTEND_PORT` before `npm run dev` to change the development frontend port. Set `API_PORT` before `npm run dev` or `npm start` to change the backend port (and the production app URL). Vite proxies API and Socket.IO traffic to the configured backend port during development.

Rooms, player sessions, and scores exist only in server memory. Restarting the server clears them.
