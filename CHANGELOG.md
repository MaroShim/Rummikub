# 📝 Changelog

All notable changes to the **Rummikub Web App** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-18

### 🚀 Major Highlights
- **Full Rummikub Rules Engine**: Complete implementation of standard official Rummikub rules, including groups, runs, jokers, and the 30-point initial meld rule.
- **Real-Time P2P Online Multiplayer**: Serverless P2P multiplayer powered by PeerJS (WebRTC) supporting 2 to 4 players with room codes and nicknames.
- **Tiered AI Bot Difficulty**: 4 progressive bot intelligence levels (*Beginner*, *Intermediate*, *Expert*, *Master*) with 1-click cycle upgrade.
- **30-Second Performance Guard**: Async non-blocking bot thinking with dedicated per-tier timeout budgets and real-time countdown timer.
- **Vibrant Dark Mode**: Full dark theme with vivid colored tiles (Red, Yellow, Green, Blue) and high-contrast typography.
- **Dynamic Board & Bottom-Left Upward Stacking**: Intuitive table layout that stacks registered sets from the bottom-left upward, featuring automatic tile size scaling for crowded boards.
- **Non-Modal Victory Banner**: Center-screen large persistent victory celebration banner.

---

### 🎨 User Interface & Board UX
- **Bottom-Left Upward Board Stacking**:
  - Reconfigured the shared table (`.board-container`) flex layout (`flex-wrap: wrap-reverse; align-content: flex-start;`) so sets begin at the bottom-left corner and stack upwards row by row.
- **Crowded Board Tile Scaling**:
  - Dynamically scales down board tile dimensions based on active set count:
    - Default (1–6 sets): Full size
    - Compact (7–10 sets): ~85% scale
    - Dense (11–15 sets): ~70% scale
    - Ultra-Dense (16+ sets): ~55% scale with ultra-compact padding and fonts.
- **"New Set" Drop Zone Optimization**:
  - Relocated the "Create New Set" drop area to the bottom center of the table for natural drag-and-drop ergonomics.
  - Balanced drop target height to a sleek 52px for optimal table view space.
- **Persistent Non-Modal Victory Banner**:
  - Replaced blocking modal alerts with an eye-catching, celebratory non-modal victory banner (`🏆 축하합니다! [플레이어] 승리하셨습니다!`) positioned prominently at the screen center.
- **High-Contrast Dark Mode**:
  - Added full dark mode toggle with persistent state.
  - Tiles feature colorful background fills (Red, Yellow/Amber, Green, Blue/Cyan) with tailored readable text colors and unique dark-theme joker styling.
- **Floating Toast Notification Popups**:
  - Replaced inline document-flow banner with an overlay floating pill toast (`position: fixed; z-index: 2500;`).
  - Completely prevents the table and board tiles from jumping or shifting vertically when messages appear and disappear.
- **Responsive Layout & Fullscreen Support**:
  - Implemented one-click native Fullscreen API integration.
  - Optimized layout for mobile devices (iPhone landscape & portrait) and high-resolution desktop monitors (1.5x scaled tiles: 64x90px).

---

### 🤖 AI Bot Intelligence & Safety Guards
- **4-Tier Bot Difficulty System**:
  - **초급 (Beginner)**: Simple runs/groups from hand without jokers; conservative initial melds (3-second budget).
  - **중급 (Intermediate)**: Standard run/group combinations with active joker usage (6-second budget).
  - **고급 (Expert)**: Advanced board tile splitting, run/group extensions, and tile recombination (12-second budget).
  - **최고급 (Master)**: Complex multi-way tile splits, joker retrieval from board, and optimal tile dumping (20-second budget).
- **Click-to-Cycle Difficulty**:
  - Clicking on any AI bot's player card seamlessly cycles through: `초급 ➔ 중급 ➔ 고급 ➔ 최고급 ➔ 초급`.
- **30-Second Hard Timeout Guard & Async Ticks**:
  - Enforced an absolute 30-second execution cutoff for AI turns.
  - Implemented asynchronous execution slicing (`yieldTick` with `requestAnimationFrame` / `setTimeout`) to prevent browser event loop freezing.
  - Added a live visual countdown timer next to the bot's status badge.

---

### 🌐 Networking & Online Multiplayer
- **Serverless WebRTC P2P Multiplayer**:
  - Implemented via PeerJS without requiring dedicated backend game servers.
  - Host creates a room code with one-click copyable invite codes.
  - Real-time full state synchronization (shared board, player hands, deck counts, turn order).
- **Room Management & Bot Takeover**:
  - Custom player nickname entry modal upon host/join.
  - "Leave Room" (방 나가기) button allowing clean disconnection.
  - Automatic AI bot takeover when a player disconnects, preserving game continuity.

---

### ⚙️ Core Engine & Rules
- Standard 106-tile Rummikub deck (numbers 1–13 in 4 colors twice + 2 jokers).
- Strict set validation for:
  - **Groups**: 3 or 4 tiles of the same number with different colors.
  - **Runs**: 3 or more consecutive numbers of the identical color.
  - **Joker**: Acts as any required color and number.
- 30-point Initial Meld rule enforcement before players can manipulate table sets.
- Drag-and-drop tile placement across racks and table sets, plus click-to-move support.
- Turn rollback / Undo and automatic board reset with tile penalty on invalid turn endings.
- Hand sorting by number (Group) and by color (Run).

---

### 🛠️ DevOps & Tooling
- Modern frontend build stack with **Vite 5** and **TypeScript 5**.
- Automated GitHub Actions CI/CD workflow deploying directly to GitHub Pages.
- MIT License.
