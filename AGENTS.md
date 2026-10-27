# AGENTS.md --- Office Game Hub (Phase 1)

## Project goal

Build a working browser-based multiplayer game called **Office Game
Hub**. Phase 1 includes the home screen, room/lobby screen, and two
playable games: **Mini Car Race** for 2--7 players and **Tic-Tac-Toe**
for 2 players.

The owner runs the app on a Windows laptop. Colleagues on the same
office Wi-Fi/LAN join from their browsers using the host laptop's IPv4
address. Do not require public internet hosting or a database for this
phase.

## Instructions for the coding agent

Act as a senior full-stack engineer. Inspect the workspace first, then
implement the application in small, testable steps. Do not stop after
generating a plan or mock UI: create working source files, install
dependencies when terminal access is available, run checks, and fix
errors. Ask questions only when a decision is genuinely blocking;
otherwise make sensible choices and document them.

### Technology choices

-   **Frontend:** React + Vite + JavaScript
-   **Styling:** CSS (use clean, reusable styles; Tailwind is optional,
    not required)
-   **Backend:** Node.js + Express
-   **Real-time multiplayer:** Socket.IO
-   **Testing:** Node's built-in test runner or another lightweight test
    setup
-   **Persistence:** In-memory only for Phase 1; no database
-   **Package manager:** npm

Use supported, mutually compatible stable package versions. Keep the
dependency list small. Do not introduce TypeScript, a database, Docker,
a login system, or cloud hosting unless requested later.

## Required project structure

Create a simple maintainable structure similar to:

``` text
office-game-hub/
  AGENTS.md
  README.md
  .gitignore
  package.json
  client/
    package.json
    index.html
    src/
      main.jsx
      App.jsx
      styles/
      components/
      pages/
      games/
  server/
    package.json
    src/
      index.js
      rooms/
      games/
      tests/
```

You may adjust the structure if there is a clear benefit, but keep
frontend and backend code separated.

## Product requirements

### 1. Home screen

Create a polished, responsive landing page titled **Office Game Hub**.

-   Show a clear title and short tagline for quick office-break games.
-   Provide **Create Room** and **Join Room** actions.
-   Show Mini Car Race and Tic-Tac-Toe as playable game cards.
-   Other game categories may be shown as disabled "Coming later" cards,
    but do not build other games in this phase.
-   Show the number of connected players if this can be calculated
    accurately.
-   Use a modern, playful arcade visual style with readable contrast and
    responsive layouts.
-   Use CSS shapes, gradients, or simple SVG for decoration; do not
    depend on remote images for core UI.

### 2. Player identity

-   Ask for a nickname before creating or joining a room.
-   Trim whitespace, reject empty names, and enforce a sensible maximum
    length (for example, 16 characters).
-   Prevent duplicate nicknames within the same room,
    case-insensitively.
-   Do not require registration or passwords.

### 3. Rooms and lobby

-   Room codes must be unique, easy to read, and five characters long.
-   Mini Car Race rooms support **2--7 players**; Tic-Tac-Toe rooms
    support exactly **2 players**.
-   A player can create a room and becomes its host.
-   Other players can join with the room code.
-   Show the room code with a copy button, player list, host indicator,
    and connection state.
-   The host can start a race only when at least two players are
    connected and the room is in the lobby state.
-   Non-host players must not be able to start the race.
-   Show useful messages for invalid codes, full rooms, duplicate names,
    and rooms that have already started.
-   If the host disconnects, assign a connected player as the new host.
-   If the room becomes empty, clean it up.
-   Provide a return-to-lobby action after the race ends.
-   Prevent a player from joining a room twice through reconnects or
    multiple tabs where practical.

### 4. Mini Car Race gameplay

Build a **2D top-down arcade racing game**, not a 3D game.

-   Draw a clear closed circuit with a road, track boundaries,
    start/finish line, and checkpoints.
-   Each player gets a distinct car color and visible nickname.
-   Use a shared race countdown: 3, 2, 1, GO!
-   Keyboard controls: arrow keys or WASD for steering and
    acceleration/braking. Prevent the browser from scrolling while
    racing.
-   Show lap count, elapsed time, current position, and a live
    leaderboard.
-   Start with a manageable default such as 3 laps; keep lap count easy
    to change in one configuration constant.
-   Require players to pass checkpoints in the correct order before a
    lap counts.
-   Finish when a player completes all laps. Preserve finishing order
    and show a results screen.
-   Players who disconnect during a race should be marked disconnected
    and must not block the race from ending.
-   Add a clear instruction panel and a short countdown so first-time
    players can understand the controls.
-   Make the game usable at typical laptop screen sizes and adapt the
    layout for smaller browser windows.

### 5. Tic-Tac-Toe gameplay

-   Support exactly two players per room.
-   The host plays X and starts; the other player plays O.
-   Keep the board, current turn, winner, draw state, and winning line
    authoritative on the server.
-   Accept only a move by the current player into a valid empty square.
-   Detect wins and draws server-side. A disconnect during a game awards
    the connected opponent a win.
-   Show each player's mark, the active turn, the outcome, and a host
    rematch action after the game ends.

### 6. Multiplayer networking and game integrity

The server is authoritative for room membership, host permissions, race
lifecycle, checkpoint/lap progression, finish order, and result state.

-   Use Socket.IO rooms to isolate each game room.
-   Validate every client action on the server: socket membership, room
    status, allowed event, and input bounds.
-   Clients may send control inputs, but should not be trusted to submit
    scores, lap counts, finish positions, or final times.
-   The server should simulate or validate vehicle movement and
    checkpoint progression. Keep the simulation simple and deterministic
    enough for a small local multiplayer game.
-   Broadcast state updates at a reasonable fixed rate; avoid sending
    unnecessary data.
-   Keep room state separate so multiple rooms can race independently.
-   Use server-side timers for countdown and race lifecycle, and clear
    all timers when a room is deleted.
-   Handle disconnects and reconnects without crashing the server.
-   Never reveal or accept authoritative state solely from
    client-submitted values.
-   Display connection status and recover gracefully from temporary
    disconnections.

### 7. Local network access on Windows

The app must work from other laptops on the same local network.

-   Configure Vite to bind to `0.0.0.0` during development.
-   Configure Express to listen on `0.0.0.0`.
-   Do not hardcode `localhost` as the socket server address for clients
    on other computers.
-   Use a development proxy or a configurable server URL so HTTP and
    Socket.IO requests reach the correct backend.
-   Read ports from environment variables with documented defaults.
-   The README must explain how to find the host IPv4 address using
    `ipconfig`.
-   Explain that colleagues must visit
    `http://HOST-LAN-IP:FRONTEND-PORT`, not `http://localhost:...`.
-   Explain that Windows Firewall may need an inbound rule for the
    selected app ports and that corporate Wi-Fi may block
    device-to-device connections.
-   Keep the app local-network-only for now. Do not configure router
    port forwarding or expose the server publicly.

### 8. User interface states

Include proper loading, empty, error, waiting, countdown, racing,
finished, and disconnected states. Show useful messages rather than
silently failing. Buttons must perform real actions; do not leave core
controls as placeholders.

### 9. Quality and security

-   Keep code readable and split logic into small modules.
-   Validate all room codes and player inputs on the server.
-   Avoid unsafe HTML rendering and do not use `eval`.
-   Do not store secrets in source control.
-   Add tests for room creation/joining, capacity, duplicate names,
    host-only start, checkpoint/lap progression, and race completion
    where practical.
-   Include a root-level command to start frontend and backend together,
    such as `npm run dev`.
-   Ensure all scripts work in Windows PowerShell or Command Prompt.
-   Run tests and a production build when possible; fix issues rather
    than merely reporting them.
-   Update README with installation, running, testing, controls, and LAN
    access instructions.

## Suggested implementation order

1.  Inspect the workspace and summarize the plan briefly.
2.  Set up the root npm scripts and client/server packages.
3.  Implement and test server-side room management.
4.  Build the home screen, create/join flow, and lobby.
5.  Implement the race track and local single-player movement.
6.  Add server-authoritative multiplayer movement, checkpoints, laps,
    and finishing order.
7.  Add countdown, leaderboard, results, disconnect handling, and return
    to lobby.
8.  Verify local browser play with multiple tabs and document testing
    with other computers.
9.  Run tests and builds; fix all errors found.

## Definition of done

Phase 1 is complete only when:

-   The app starts with one documented command from the project root.
-   A host can create a room and share its code.
-   2--7 players can join from separate browsers.
-   The host can start a race with at least two players.
-   Players can steer cars and see other players move in real time.
-   Checkpoints and laps work, and race results are consistent for
    everyone.
-   Invalid actions are rejected by the server.
-   Players can return to the lobby and start another race.
-   The application can be reached from another laptop using the host
    laptop's LAN IP.
-   Tests/build checks pass, or any environment-related blocker is
    clearly documented.

## Final response from the agent

When finished, report: 1. What was implemented. 2. Exact commands to
install and run on Windows. 3. The local URL and how to find the LAN
URL. 4. How to test with multiple tabs and with colleagues. 5.
Tests/build results and any remaining limitations.

Do not implement any additional games beyond Mini Car Race and
Tic-Tac-Toe unless the user asks to continue.
