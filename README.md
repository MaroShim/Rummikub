# 🎲 Rummikub Web App

<div align="center">

English | [한국어](README.ko.md)

An interactive, responsive HTML5 & TypeScript web application for the classic board game **Rummikub**, featuring solo play with tiered AI bots and real-time serverless P2P multiplayer.

[![Deploy to GitHub Pages](https://github.com/MaroShim/Rummikub/actions/workflows/deploy.yml/badge.svg)](https://github.com/MaroShim/Rummikub/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## 🌟 Key Features

- **🎮 Dual Game Modes**:
  - **Solo Mode**: Play against 1 to 3 AI bots with customizable intelligence.
  - **Online Multiplayer**: Real-time serverless P2P multiplayer powered by PeerJS (WebRTC) for 2–4 players. Create a room, share an invite code, and play without any central server or login required!
- **🤖 Tiered AI Bots with Click-to-Cycle Upgrade**:
  - 4 progressive difficulty levels: **Beginner (초급)**, **Intermediate (중급)**, **Expert (고급)**, and **Master (최고급)**.
  - Simply click any bot's player card to instantly cycle its difficulty level.
  - **30-Second Think Guard**: Non-blocking async thinking ticks (`requestAnimationFrame`/`setTimeout`) prevent UI freezing, backed by a real-time countdown timer.
- **🎨 Dynamic Board & Intuitive Tile Stacking**:
  - **Bottom-Left Upward Stacking**: Registered sets on the common table begin at the bottom-left corner and stack row by row upwards.
  - **Balanced & Consistent Tile Sizing**: Clean 54×76px starting tile dimensions with 1:1 matching rack sizing, eliminating any mid-game resize flickering.
  - **Optimized "New Set" Zone**: Slim, ergonomically positioned drop target at the bottom center of the table.
- **🌙 High-Contrast Colorful Dark Mode**:
  - Toggle between clean Light theme and vibrant Dark theme.
  - In Dark Mode, tiles feature colorful vivid backgrounds (Red, Lemon Yellow, Emerald Green, Sky Blue) with high-contrast text and custom dark joker styling.
- **📱 Fully Responsive Design**:
  - Optimized for desktop monitors (54×76px tiles) and laptops (48×68px).
  - Optimized for mobile landscape & portrait orientations (e.g., iPhone) with a one-click native **Fullscreen** toggle.
- **🏆 Non-Modal Persistent Victory Banner**:
  - Winner announcement appears prominently in the screen center without blocking the board or UI controls.
- **🔄 Auto Bot Takeover**:
  - If a player leaves an online room, an AI bot immediately takes over their hand, ensuring the game continues seamlessly.

---

## 📜 Rummikub Rules & Mechanics

The game uses a standard 106-tile deck:
- Numbers **1 to 13** in 4 colors (**Red**, **Yellow**, **Blue**, **Black**) repeated twice (104 tiles).
- **2 Jokers** that can represent any color and number.

### 1. Valid Sets (Melds)
Every set on the board must contain at least **3 tiles**:
- **Group (같은 숫자 세트)**: 3 or 4 tiles of the **same number** with **different colors** (e.g., `Red 7`, `Blue 7`, `Yellow 7`).
- **Run (연속 숫자 세트)**: 3 or more **consecutive numbers** of the **same color** (e.g., `Black 4`, `Black 5`, `Black 6`, `Black 7`).

### 2. Initial Meld (최초 등록)
- Before manipulating existing sets on the table, your first move must be formed **entirely from your hand** with a total point sum of **30 points or greater**.
- Once registered, you can freely split, extend, and rearrange sets on the common table on subsequent turns.

### 3. Manipulating the Board
- Add tiles to existing groups or runs.
- Split runs into smaller valid runs (minimum 3 tiles each).
- Substitute a tile from your hand for a Joker on the board and reuse that Joker immediately.

### 4. Turn End & Penalties
- If the board has any invalid sets when you press **End Turn**, all moves are reset, and you receive a penalty tile from the pool.
- Draw a tile from the pool if you cannot or choose not to make a valid move.

---

## 🤖 AI Bot Difficulty Levels

| Level | Name | Think Budget | Strategy & Behavior |
|:---:|:---|:---:|:---|
| 🟢 | **Beginner (초급)** | 3s | Makes straightforward 3-tile runs/groups from hand; does not use Jokers; conservative initial melds. |
| 🟡 | **Intermediate (중급)** | 6s | Proactively searches hand combinations and utilizes Jokers effectively. |
| 🟠 | **Expert (고급)** | 12s | Performs single tile splits, extends existing table runs, and recombines board tiles with hand tiles. |
| 🔴 | **Master (최고급)** | 20s | Executes multi-way set splitting, retrieves Jokers from table sets, and optimizes hand clearing. |

> **Tip**: Click on any bot's badge or player card during the game to promote it to the next tier!

---

## 🛠️ Tech Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Networking**: [PeerJS](https://peerjs.com/) (WebRTC P2P DataChannels)
- **Styling**: Vanilla CSS3 with CSS Custom Properties, Flexbox, and Media Queries
- **Deployment**: [GitHub Pages](https://pages.github.com/) via GitHub Actions

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (bundled with Node.js)

### Installation & Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/MaroShim/Rummikub.git
   cd Rummikub
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`.

### Production Build

To build the static production assets:
```bash
npm run build
```
The compiled output will be generated in the `dist/` directory.

To preview the production build locally:
```bash
npm run preview
```

---

## 📁 Project Structure

```text
Rummikub/
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions CI/CD for GitHub Pages
├── src/
│   ├── core/
│   │   ├── ai.ts             # 4-tier bot AI with async ticks & timeout guards
│   │   ├── deck.ts           # 106-tile deck creation & shuffling
│   │   ├── game.ts           # Game state machine, turn cycle, meld checks
│   │   ├── types.ts          # Tile, Set, Player, and Game state type definitions
│   │   └── validator.ts      # Rummikub group/run validation algorithms
│   ├── network/
│   │   └── multiplayer.ts    # WebRTC P2P mesh & host-client room protocol
│   ├── main.ts               # UI controller, drag & drop, event handlers
│   └── style.css             # Responsive styling, dark mode, animations
├── index.html                # App entry HTML & modal templates
├── CHANGELOG.md              # Detailed release history and updates
├── LICENSE                   # MIT License
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

Copyright (c) 2026 Maro Shim.
