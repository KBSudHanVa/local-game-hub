# Office Game Hub — Phase 1

A local-network multiplayer hub with four server-authoritative games: Mini Car Race for 2–7 players, Tic-Tac-Toe for 2 players, Bomb Tag for 2–7 players, and Arena Blaster for up to 8 players. Rooms and game state are kept in memory; no database, login, or public hosting is required.

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
- Choose Mini Car Race, Tic-Tac-Toe, Bomb Tag, or Arena Blaster when creating a room. Players join using the room code; the room's game and match mode are selected by its host.
- Mini Car Race supports 2–7 connected players. The host can choose Grand Oval, Corner Cut, Coffee Run, Switchback, Chicane, or Skyline Loop before starting.
- Drive with **WASD** or the **arrow keys**: up accelerates, down brakes/reverses, left/right steer.
- On a phone or tablet, open the collapsed **Touch driving controls** accordion during the race and hold its arrow buttons to accelerate, reverse, and steer.
- Complete three laps and pass all four checkpoints in order. The server simulates car movement and determines lap progress, standings, finish order, and results.
- After the first driver finishes, the host can reset the race to the lobby immediately, or wait for everyone to finish. The host can remove players from the lobby and remove disconnected players during a race.
- Tic-Tac-Toe rooms support exactly two players. Players alternate X and O after each completed game; X starts. Players take turns selecting empty squares. Three in a row wins, and a full board is a draw. Turns and outcomes are checked by the server, and the host can start a rematch after the game ends.
- Bomb Tag supports 2–7 players in a real-time arena. Move with **WASD** or the **arrow keys**; on a phone or tablet, open the collapsed **Touch movement controls** accordion and hold the direction buttons. Touch another player to pass the bomb; the holder when its randomized fuse runs out is eliminated. The last player standing wins, and the host can start another round.
- Arena Blaster supports up to 8 players in three modes: Solo Practice against three medium bots, Free-for-all, or balanced Team Battle from 1v1 through 4v4. Odd team lobbies keep teams even and rotate extra players from spectator into the next round. Move with **WASD** or **arrow keys**, aim with the mouse, and hold click or **Space** to fire. On a phone or tablet, open the collapsed touch controls, hold the direction buttons to move, drag on the arena to aim, or hold **FIRE** to shoot. Three hits temporarily knock a player out; respawn and score tags. Team matches disable friendly fire. Matches are server-authoritative and end at eight tags or after 90 seconds.
- Use separate browser tabs with different nicknames to test locally. A room is scoped to its room code; disconnected drivers are marked in the race state.

## Checks

```powershell
npm test
npm run build
```

## Configuration

Defaults are `FRONTEND_PORT=5173` and `API_PORT=3001`. Set `FRONTEND_PORT` before `npm run dev` to change the development frontend port. Set `API_PORT` before `npm run dev` or `npm start` to change the backend port (and the production app URL). Vite proxies API and Socket.IO traffic to the configured backend port during development.

Rooms, player sessions, and scores exist only in server memory. Restarting the server clears them.

## Optional public deployment on Render

GitHub stores the source code, but GitHub Pages cannot run the Node.js server required for multiplayer. To deploy the complete app, connect this repository to Render and create a Blueprint from the root `render.yaml` file. Render builds the Vite client and starts Express, which serves both the app and Socket.IO from the same web service. After deployment, open the service's `onrender.com` URL and share it with players.

The included Blueprint uses Render's free web-service plan. Free services may sleep while idle, and restarting or redeploying the service clears all rooms because game state is stored in memory. Keep the service running during a game; no database or persistent storage is configured.
