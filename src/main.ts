import { RummikubGame } from './core/game.ts';
import { RummikubAI } from './core/ai.ts';
import { Tile, TileSet, Player } from './core/types.ts';
import { validateTileSet, validateBoard } from './core/validator.ts';
import { MultiplayerManager, NetworkMessage, RoomParticipant } from './network/multiplayer.ts';

// 게임 및 네트워크 인스턴스
const game = new RummikubGame();
const net = new MultiplayerManager();

let isOnlineMode = false;
let myPlayerId = 'player-1';
let isProcessingTurn = false;

// DOM 참조: 기본 헤더 및 게임 UI
const deckCountEl = document.getElementById('deck-count') as HTMLElement;
const turnPlayerNameEl = document.getElementById('turn-player-name') as HTMLElement;
const currentTurnBadgeEl = document.getElementById('current-turn-badge') as HTMLElement;
const playersPanelEl = document.getElementById('players-panel') as HTMLElement;
const boardContainerEl = document.getElementById('board-container') as HTMLElement;
const newSetZoneEl = document.getElementById('new-set-zone') as HTMLElement;
const rackContainerEl = document.getElementById('rack-container') as HTMLElement;
const handCountEl = document.getElementById('hand-count') as HTMLElement;
const meldStatusEl = document.getElementById('meld-status') as HTMLElement;
const notificationBarEl = document.getElementById('notification-bar') as HTMLElement;
const botCountSelectEl = document.getElementById('bot-count-select') as HTMLSelectElement;
const botSelectWrapEl = document.getElementById('bot-select-wrap') as HTMLElement;

// DOM 참조: 액션 버튼들
const btnNewGame = document.getElementById('btn-new-game') as HTMLButtonElement;
const btnFullscreen = document.getElementById('btn-fullscreen') as HTMLButtonElement;
const btnThemeToggle = document.getElementById('btn-theme-toggle') as HTMLButtonElement;
const btnSortNum = document.getElementById('btn-sort-num') as HTMLButtonElement;
const btnSortColor = document.getElementById('btn-sort-color') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnDraw = document.getElementById('btn-draw') as HTMLButtonElement;
const btnEndTurn = document.getElementById('btn-end-turn') as HTMLButtonElement;
const btnRules = document.getElementById('btn-rules') as HTMLButtonElement;

// DOM 참조: 온라인 & 닉네임 관련
const playerNameDisplayEl = document.getElementById('player-name-display') as HTMLElement;
const btnPlayerName = document.getElementById('btn-player-name') as HTMLButtonElement;
const btnOnlineCreate = document.getElementById('btn-online-create') as HTMLButtonElement;
const btnOnlineJoin = document.getElementById('btn-online-join') as HTMLButtonElement;
const btnLeaveRoom = document.getElementById('btn-leave-room') as HTMLButtonElement;
const onlineRoomBadgeEl = document.getElementById('online-room-badge') as HTMLElement;
const onlineRoomTextEl = document.getElementById('online-room-text') as HTMLElement;

// 모달들
const rulesModal = document.getElementById('rules-modal') as HTMLElement;
const btnCloseModal = document.getElementById('btn-close-modal') as HTMLButtonElement;
const btnModalOk = document.getElementById('btn-modal-ok') as HTMLButtonElement;

const modalName = document.getElementById('modal-name') as HTMLElement;
const inputPlayerName = document.getElementById('input-player-name') as HTMLInputElement;
const btnCloseNameModal = document.getElementById('btn-close-name-modal') as HTMLButtonElement;
const btnSaveName = document.getElementById('btn-save-name') as HTMLButtonElement;

const modalCreateRoom = document.getElementById('modal-create-room') as HTMLElement;
const btnCloseCreateModal = document.getElementById('btn-close-create-modal') as HTMLButtonElement;
const createdRoomCodeEl = document.getElementById('created-room-code') as HTMLElement;
const btnCopyCode = document.getElementById('btn-copy-code') as HTMLButtonElement;
const btnCopyLink = document.getElementById('btn-copy-link') as HTMLButtonElement;
const participantCountEl = document.getElementById('participant-count') as HTMLElement;
const participantListEl = document.getElementById('participant-list') as HTMLElement;
const chkFillBots = document.getElementById('chk-fill-bots') as HTMLInputElement;
const btnStartOnlineGame = document.getElementById('btn-start-online-game') as HTMLButtonElement;

const modalJoinRoom = document.getElementById('modal-join-room') as HTMLElement;
const btnCloseJoinModal = document.getElementById('btn-close-join-modal') as HTMLButtonElement;
const inputJoinCode = document.getElementById('input-join-code') as HTMLInputElement;
const btnSubmitJoin = document.getElementById('btn-submit-join') as HTMLButtonElement;
const joinStatusMsg = document.getElementById('join-status-msg') as HTMLElement;

// Non-modal 대형 중앙 승리 배너 참조
const victoryBannerEl = document.getElementById('victory-banner') as HTMLElement;
const victoryTitleEl = document.getElementById('victory-title') as HTMLElement;
const victorySubtitleEl = document.getElementById('victory-subtitle') as HTMLElement;
const btnCloseVictory = document.getElementById('btn-close-victory') as HTMLButtonElement;
const btnVictoryNewGame = document.getElementById('btn-victory-new-game') as HTMLButtonElement;

// 드래그 중인 타일의 정보
interface DragSource {
  location: 'rack' | 'board';
  setIndex?: number;
  tileIndex: number;
  tileId: string;
}
let currentDragSource: DragSource | null = null;

function setOnlineUIState(isOnline: boolean, roomCode?: string): void {
  isOnlineMode = isOnline;
  if (isOnline) {
    btnLeaveRoom.classList.remove('hidden');
    btnOnlineCreate.classList.add('hidden');
    btnOnlineJoin.classList.add('hidden');
    btnNewGame.classList.add('hidden');
    botSelectWrapEl.style.display = 'none';
    onlineRoomBadgeEl.classList.remove('hidden');
    onlineRoomTextEl.textContent = `방 #${roomCode || net.roomCode} (${net.isHost ? '방장' : '참가자'})`;
  } else {
    btnLeaveRoom.classList.add('hidden');
    btnOnlineCreate.classList.remove('hidden');
    btnOnlineJoin.classList.remove('hidden');
    btnNewGame.classList.remove('hidden');
    botSelectWrapEl.style.display = 'flex';
    onlineRoomBadgeEl.classList.add('hidden');
  }
}

// ================== Non-modal 승리 배너 관리 ==================
function showVictoryBanner(winner: Player): void {
  const isMe = winner.id === myPlayerId;
  if (isMe) {
    victoryTitleEl.textContent = '🎉 축하합니다! 승리하셨습니다! 🎉';
    victorySubtitleEl.textContent = `${net.myName}님이 모든 타일을 가장 먼저 내려놓아 최종 1등을 달성했습니다!`;
  } else {
    victoryTitleEl.textContent = `🏆 ${winner.name}님이 승리했습니다!`;
    victorySubtitleEl.textContent = '게임이 종료되었습니다. 멋진 승부였습니다!';
  }
  victoryBannerEl.classList.remove('hidden');
}

function hideVictoryBanner(): void {
  victoryBannerEl.classList.add('hidden');
}

// ================== 게임 초기화 (오프라인 1인용) ==================
function initOfflineGame(): void {
  myPlayerId = 'player-1';
  setOnlineUIState(false);
  hideVictoryBanner();

  const botCount = parseInt(botCountSelectEl.value, 10) || 3;
  game.start(botCount);
  // 내 이름 반영
  if (game.players.length > 0) {
    game.players[0].name = net.myName;
  }
  renderAll();
  showNotification(`🎮 1인용 게임이 시작되었습니다! (봇 ${botCount}명)`, 'info');
}

// ================== 렌더링 함수들 ==================
function getMyPlayer(): Player {
  const found = game.players.find((p) => p.id === myPlayerId);
  return found || game.players[0];
}

function isMyTurn(): boolean {
  if (game.isGameOver) return false;
  return game.getCurrentPlayer().id === myPlayerId;
}

function renderAll(): void {
  renderHeader();
  renderPlayers();
  renderBoard();
  renderRack();
  updateActionControls();
}

function renderHeader(): void {
  deckCountEl.textContent = game.deck.length.toString();
  const current = game.getCurrentPlayer();

  if (isOnlineMode) {
    if (current.id === myPlayerId) {
      turnPlayerNameEl.textContent = `⭐ 내 턴 (${net.myName})! 타일을 내세요`;
      currentTurnBadgeEl.className = 'current-turn-badge';
    } else {
      turnPlayerNameEl.textContent = `⏳ ${current.name} 차례 진행 중...`;
      currentTurnBadgeEl.className = 'current-turn-badge ai-turn';
    }
  } else {
    if (current.isAi) {
      turnPlayerNameEl.textContent = `🤖 ${current.name} 생각 중...`;
      currentTurnBadgeEl.className = 'current-turn-badge ai-turn';
    } else {
      turnPlayerNameEl.textContent = `👤 내 턴 (${net.myName})`;
      currentTurnBadgeEl.className = 'current-turn-badge';
    }
  }
}

function renderPlayers(): void {
  playersPanelEl.innerHTML = '';
  const current = game.getCurrentPlayer();

  game.players.forEach((player) => {
    const card = document.createElement('div');
    const isCurrent = player.id === current.id;
    const isMe = player.id === myPlayerId;
    card.className = `player-card ${isCurrent ? 'active' : ''} ${player.isAi ? 'is-bot' : ''}`;

    let avatar = '👤';
    if (player.isAi) avatar = '🤖';
    else if (isMe) avatar = '⭐';

    const meldBadge = player.hasInitialMeld ? '✓ 등록완료' : '미등록';

    let diffBadge = '';
    if (player.isAi && player.difficulty) {
      const diffLabelMap: Record<string, string> = {
        beginner: '초급',
        intermediate: '중급',
        expert: '고급',
        master: '최고급',
      };
      const label = diffLabelMap[player.difficulty] || player.difficulty;
      diffBadge = `<span class="diff-tag ${player.difficulty}" title="클릭하여 난이도 변경">${label} 🔄</span>`;
    }

    card.innerHTML = `
      <div class="player-avatar">${avatar}</div>
      <div class="player-meta">
        <span class="p-name">${player.name}${isMe && !player.name.includes('(나)') ? ' (나)' : ''} ${diffBadge}</span>
        <span class="p-info">${player.hand.length}장 | ${meldBadge}</span>
      </div>
    `;

    // 봇 카드 클릭 시 난이도 한 단계 상승 (초급 -> 중급 -> 고급 -> 최고급 -> 초급)
    if (player.isAi) {
      card.title = '클릭하여 봇 난이도 변경 (초급 ➔ 중급 ➔ 고급 ➔ 최고급 ➔ 초급)';
      card.addEventListener('click', () => {
        if (isOnlineMode && !net.isHost) {
          showNotification('온라인 대전에서는 방장만 봇 난이도를 변경할 수 있습니다.', 'error');
          return;
        }

        const res = game.cycleBotDifficulty(player.id);
        if (res) {
          showNotification(`⚡ ${res.newName}으로 난이도가 변경되었습니다!`, 'info');
          if (isOnlineMode) {
            broadcastGameState();
          } else {
            renderAll();
          }
        }
      });
    }

    playersPanelEl.appendChild(card);
  });
}

function renderBoard(): void {
  boardContainerEl.innerHTML = '';

  const activeSets = game.board.filter((s) => s.length > 0);

  if (activeSets.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-board-msg';
    emptyMsg.innerHTML = `보드에 등록된 세트가 없습니다.<br />첫 등록(자신의 타일 합계 30점 이상)을 완성해 테이블로 드래그하세요!`;
    boardContainerEl.appendChild(emptyMsg);
    return;
  }

  game.board.forEach((set, sIdx) => {
    if (set.length === 0) return;

    const setEl = document.createElement('div');
    setEl.className = 'board-set';
    setEl.dataset.setIndex = sIdx.toString();

    const validation = validateTileSet(set);
    if (!validation.valid) {
      setEl.classList.add('invalid');
      setEl.title = validation.reason || '규칙에 맞지 않는 세트입니다.';
    } else {
      setEl.title = `${validation.type === 'group' ? '그룹' : '런'} (합: ${validation.score}점)`;
    }

    set.forEach((tile, tIdx) => {
      const tileEl = createTileElement(tile, {
        location: 'board',
        setIndex: sIdx,
        tileIndex: tIdx,
        tileId: tile.id,
      });
      setEl.appendChild(tileEl);
    });

    bindSetDropEvents(setEl, sIdx);
    boardContainerEl.appendChild(setEl);
  });
}

function renderRack(): void {
  rackContainerEl.innerHTML = '';
  const me = getMyPlayer();

  handCountEl.textContent = me.hand.length.toString();
  if (me.hasInitialMeld) {
    meldStatusEl.className = 'badge badge-melded';
    meldStatusEl.textContent = '첫 등록 완료 (자유 조합 가능)';
  } else {
    meldStatusEl.className = 'badge badge-unmelded';
    meldStatusEl.textContent = '첫 등록 필요 (30점 이상)';
  }

  me.hand.forEach((tile, tIdx) => {
    const tileEl = createTileElement(tile, {
      location: 'rack',
      tileIndex: tIdx,
      tileId: tile.id,
    });
    rackContainerEl.appendChild(tileEl);
  });
}

function updateActionControls(): void {
  const canPlay = isMyTurn() && !isProcessingTurn;

  btnSortNum.disabled = !canPlay;
  btnSortColor.disabled = !canPlay;
  btnReset.disabled = !canPlay;
  btnDraw.disabled = !canPlay;
  btnEndTurn.disabled = !canPlay;
}

// ================== 타일 DOM 생성 ==================
function createTileElement(tile: Tile, sourceInfo: DragSource): HTMLElement {
  const el = document.createElement('div');
  el.className = `tile ${tile.isJoker ? 'is-joker' : `color-${tile.color}`}`;
  el.draggable = isMyTurn() && !isProcessingTurn;
  el.dataset.tileId = tile.id;

  const valueDisplay = tile.isJoker ? '☺' : tile.value.toString();
  const iconDisplay = tile.isJoker ? '★' : getSymbolForColor(tile.color);

  el.innerHTML = `
    <div class="tile-value">${valueDisplay}</div>
    <div class="tile-icon">${iconDisplay}</div>
  `;

  el.addEventListener('dragstart', (e) => {
    if (!isMyTurn() || isProcessingTurn) {
      e.preventDefault();
      return;
    }
    currentDragSource = sourceInfo;
    el.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', JSON.stringify(sourceInfo));
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    currentDragSource = null;
    clearDragHoverStyles();
  });

  return el;
}

function getSymbolForColor(color: string): string {
  switch (color) {
    case 'black': return '♠';
    case 'blue': return '◆';
    case 'red': return '♥';
    case 'yellow': return '●';
    default: return '★';
  }
}

function clearDragHoverStyles(): void {
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
}

// ================== 드래그 & 드롭 이벤트 바인딩 ==================
function bindSetDropEvents(setEl: HTMLElement, targetSetIndex: number): void {
  setEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    setEl.classList.add('drag-over');
  });
  setEl.addEventListener('dragleave', () => setEl.classList.remove('drag-over'));
  setEl.addEventListener('drop', (e) => {
    e.preventDefault();
    setEl.classList.remove('drag-over');
    if (!currentDragSource) return;
    handleDropOnSet(currentDragSource, targetSetIndex);
  });
}

function bindNewSetDropEvents(newZoneEl: HTMLElement): void {
  newZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    newZoneEl.classList.add('drag-over');
  });
  newZoneEl.addEventListener('dragleave', () => newZoneEl.classList.remove('drag-over'));
  newZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    newZoneEl.classList.remove('drag-over');
    if (!currentDragSource) return;
    handleDropOnNewSet(currentDragSource);
  });
}

// 하단 고정 새 세트 드롭존 이벤트 등록
bindNewSetDropEvents(newSetZoneEl);

rackContainerEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  rackContainerEl.classList.add('drag-over');
});
rackContainerEl.addEventListener('dragleave', () => rackContainerEl.classList.remove('drag-over'));
rackContainerEl.addEventListener('drop', (e) => {
  e.preventDefault();
  rackContainerEl.classList.remove('drag-over');
  if (!currentDragSource) return;
  handleDropOnRack(currentDragSource);
});

function handleDropOnSet(source: DragSource, targetSetIndex: number): void {
  const me = getMyPlayer();
  let tileToMove: Tile | null = null;

  if (source.location === 'rack') {
    tileToMove = me.hand.splice(source.tileIndex, 1)[0];
  } else if (source.location === 'board' && source.setIndex !== undefined) {
    const sourceSet = game.board[source.setIndex];
    tileToMove = sourceSet.splice(source.tileIndex, 1)[0];
  }

  if (tileToMove) {
    game.board[targetSetIndex].push(tileToMove);
    game.cleanupEmptySets();
    renderAll();
  }
}

function handleDropOnNewSet(source: DragSource): void {
  const me = getMyPlayer();
  let tileToMove: Tile | null = null;

  if (source.location === 'rack') {
    tileToMove = me.hand.splice(source.tileIndex, 1)[0];
  } else if (source.location === 'board' && source.setIndex !== undefined) {
    const sourceSet = game.board[source.setIndex];
    tileToMove = sourceSet.splice(source.tileIndex, 1)[0];
  }

  if (tileToMove) {
    const newSet: TileSet = [tileToMove];
    game.board.push(newSet);
    game.cleanupEmptySets();
    renderAll();
  }
}

function handleDropOnRack(source: DragSource): void {
  const me = getMyPlayer();
  if (source.location === 'board' && source.setIndex !== undefined) {
    const sourceSet = game.board[source.setIndex];
    const tileToMove = sourceSet.splice(source.tileIndex, 1)[0];
    if (tileToMove) {
      me.hand.push(tileToMove);
      game.cleanupEmptySets();
      renderAll();
    }
  }
}

// ================== 정렬 및 조작 버튼 핸들러 ==================
btnSortNum.addEventListener('click', () => {
  game.sortHand(getMyPlayer(), 'number');
  renderRack();
});

btnSortColor.addEventListener('click', () => {
  game.sortHand(getMyPlayer(), 'color');
  renderRack();
});

btnReset.addEventListener('click', () => {
  game.resetTurn();
  renderAll();
  showNotification('이번 턴에 놓은 타일이 모두 원상복구되었습니다.', 'info');
});

// 타일 1장 뽑기 (Pass)
btnDraw.addEventListener('click', () => {
  if (isProcessingTurn || !isMyTurn()) return;

  if (isOnlineMode) {
    if (net.isHost) {
      const res = game.drawTile();
      handleDrawOutcome(res);
      broadcastGameState();
      checkAndRunOnlineAiTurns();
    } else {
      // 게스트: 호스트에게 드로우 요청
      net.sendMessageToHost({
        type: 'ACTION_DRAW',
        senderId: myPlayerId,
        senderName: net.myName,
      });
      showNotification('타일 뽑기를 요청했습니다...', 'info');
    }
  } else {
    // 오프라인
    const res = game.drawTile();
    handleDrawOutcome(res);
    renderAll();
    processAiTurns();
  }
});

function handleDrawOutcome(res: { success: boolean; tile?: Tile; error?: string }): void {
  if (res.success && res.tile) {
    showNotification(`타일 1장을 뽑았습니다. [${res.tile.isJoker ? '조커' : `${res.tile.color} ${res.tile.value}`}]`, 'info');
  } else if (res.error) {
    showNotification(res.error, 'error');
  }
}

// 턴 확정
btnEndTurn.addEventListener('click', () => {
  if (isProcessingTurn || !isMyTurn()) return;

  if (isOnlineMode) {
    if (net.isHost) {
      const res = game.endTurn();
      if (!res.success) {
        showNotification(`⚠️ ${res.error}`, 'error');
        renderBoard();
        return;
      }
      handleTurnSuccess();
      broadcastGameState();
      checkAndRunOnlineAiTurns();
    } else {
      // 게스트: 로컬 보드 검증 먼저 수행 후 호스트에게 전송
      const validation = validateBoard(game.board);
      if (!validation.valid) {
        showNotification('⚠️ 보드에 유효하지 않은 세트가 있습니다. 규칙을 확인하세요.', 'error');
        renderBoard();
        return;
      }

      net.sendMessageToHost({
        type: 'ACTION_END_TURN',
        senderId: myPlayerId,
        senderName: net.myName,
        payload: {
          board: game.board,
          hand: getMyPlayer().hand,
        },
      });
      showNotification('턴 완료 검증 요청 중...', 'info');
    }
  } else {
    // 오프라인
    const res = game.endTurn();
    if (!res.success) {
      showNotification(`⚠️ ${res.error}`, 'error');
      renderBoard();
      return;
    }
    handleTurnSuccess();
    renderAll();
    processAiTurns();
  }
});

function handleTurnSuccess(): void {
  if (game.isGameOver && game.winner) {
    showVictoryBanner(game.winner);
  } else {
    showNotification('턴을 확정했습니다! 다음 플레이어로 넘어갑니다.', 'success');
  }
}

// ================== 온라인 네트워크 동기화 ==================
function broadcastGameState(): void {
  if (!net.isHost) return;

  // 각 게스트에게 상태 전송 (각자의 패는 안전하게 본인 것만 full 전송)
  net.participants.forEach((p) => {
    const isMe = p.id === net.myPeerId;
    if (isMe) return;

    const payload = {
      board: game.board,
      deckCount: game.deck.length,
      currentPlayerIndex: game.currentPlayerIndex,
      isGameOver: game.isGameOver,
      winner: game.winner,
      players: game.players.map((pl) => ({
        id: pl.id,
        name: pl.name,
        isAi: pl.isAi,
        difficulty: pl.difficulty,
        handCount: pl.hand.length,
        hasInitialMeld: pl.hasInitialMeld,
      })),
      // 본인의 최신 핸드 전송
      myHand: game.players.find((pl) => pl.id === p.id)?.hand || [],
    };

    net.sendTo(p.id, {
      type: 'SYNC_BOARD',
      senderId: net.myPeerId,
      senderName: net.myName,
      payload,
    });
  });

  renderAll();
}

// 게스트 메시지 수신 처리
net.onMessageReceived = (msg: NetworkMessage) => {
  if (msg.type === 'START_GAME') {
    myPlayerId = net.myPeerId;
    setOnlineUIState(true, net.roomCode);
    hideVictoryBanner();

    // 호스트가 보내준 게임 상태로 초기화
    game.board = msg.payload.board;
    game.currentPlayerIndex = msg.payload.currentPlayerIndex;
    game.deck = new Array(msg.payload.deckCount).fill({} as Tile);
    game.isGameOver = false;
    game.winner = null;

    game.players = msg.payload.players.map((pl: any) => ({
      id: pl.id,
      name: pl.name,
      isAi: pl.isAi,
      difficulty: pl.difficulty,
      hand: pl.id === myPlayerId ? msg.payload.myHand : new Array(pl.handCount).fill({} as Tile),
      hasInitialMeld: pl.hasInitialMeld,
    }));

    game.startTurn();
    modalJoinRoom.classList.add('hidden');
    modalCreateRoom.classList.add('hidden');
    renderAll();
    showNotification('🎮 온라인 멀티플레이어 게임이 시작되었습니다!', 'success');
  } else if (msg.type === 'SYNC_BOARD') {
    // 실시간 보드 및 턴 동기화
    game.board = msg.payload.board;
    game.deck = new Array(msg.payload.deckCount).fill({} as Tile);
    game.currentPlayerIndex = msg.payload.currentPlayerIndex;
    game.isGameOver = msg.payload.isGameOver;
    game.winner = msg.payload.winner;

    game.players = msg.payload.players.map((pl: any) => ({
      id: pl.id,
      name: pl.name,
      isAi: pl.isAi,
      difficulty: pl.difficulty,
      hand: pl.id === myPlayerId ? msg.payload.myHand : new Array(pl.handCount).fill({} as Tile),
      hasInitialMeld: pl.hasInitialMeld,
    }));

    game.startTurn();
    renderAll();

    if (game.isGameOver && game.winner) {
      showVictoryBanner(game.winner);
    }
  } else if (msg.type === 'ACTION_DRAW' && net.isHost) {
    // 호스트: 게스트의 드로우 처리
    const guestPlayer = game.players.find((p) => p.id === msg.senderId);
    if (guestPlayer && game.getCurrentPlayer().id === guestPlayer.id) {
      game.drawTile();
      broadcastGameState();
      checkAndRunOnlineAiTurns();
    }
  } else if (msg.type === 'ACTION_END_TURN' && net.isHost) {
    // 호스트: 게스트의 턴 확정 검증
    const guestPlayer = game.players.find((p) => p.id === msg.senderId);
    if (guestPlayer && game.getCurrentPlayer().id === guestPlayer.id) {
      game.board = msg.payload.board;
      guestPlayer.hand = msg.payload.hand;

      const res = game.endTurn();
      if (!res.success) {
        // 검증 실패 시 호스트가 롤백 명령 전송
        net.sendTo(guestPlayer.id, {
          type: 'TURN_ERROR',
          senderId: 'host',
          senderName: '호스트',
          payload: { error: res.error },
        });
        game.resetTurn();
      } else {
        handleTurnSuccess();
      }
      broadcastGameState();
      checkAndRunOnlineAiTurns();
    }
  } else if (msg.type === 'ROOM_CLOSED') {
    showNotification(`⚠️ ${msg.payload?.reason || '방장이 방을 종료했습니다.'}`, 'error');
    initOfflineGame();
  } else if (msg.type === 'LEAVE_ROOM' && net.isHost) {
    const leavingPlayer = game.players.find((p) => p.id === msg.senderId);
    if (leavingPlayer) {
      leavingPlayer.name = `${leavingPlayer.name} (봇 전환)`;
      leavingPlayer.isAi = true;
      showNotification(`👤 ${msg.senderName}님이 퇴장하여 AI 봇으로 전환되었습니다.`, 'info');
      broadcastGameState();
      checkAndRunOnlineAiTurns();
    }
  } else if (msg.type === 'TURN_ERROR') {
    showNotification(`⚠️ ${msg.payload.error}`, 'error');
    game.resetTurn();
    renderAll();
  }
};

async function checkAndRunOnlineAiTurns(): Promise<void> {
  if (!net.isHost || !isOnlineMode || game.isGameOver) return;

  while (game.getCurrentPlayer().isAi && !game.isGameOver) {
    const bot = game.getCurrentPlayer();
    const botStartTime = Date.now();
    const budgetMs = RummikubAI.getTimeoutForDifficulty(bot.difficulty);
    const budgetSec = Math.ceil(budgetMs / 1000);

    renderHeader();
    renderPlayers();

    // 봇 생각 시간(난이도별 맞춤 제한) 실시간 카운트다운 타이머
    const timerInterval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - botStartTime) / 1000);
      const remaining = Math.max(0, budgetSec - elapsed);
      turnPlayerNameEl.textContent = `🤖 ${bot.name} 생각 중... (${remaining}초 남음)`;
    }, 250);

    try {
      await RummikubAI.playTurn(game, bot);
    } finally {
      clearInterval(timerInterval);
    }

    broadcastGameState();

    if (game.isGameOver) {
      if (game.winner) showVictoryBanner(game.winner);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ================== 모달 및 이벤트 연결 ==================
// 닉네임 관리
function updatePlayerNameDisplay(): void {
  playerNameDisplayEl.textContent = net.myName;
}
updatePlayerNameDisplay();

btnPlayerName.addEventListener('click', () => {
  inputPlayerName.value = net.myName;
  modalName.classList.remove('hidden');
});
btnCloseNameModal.addEventListener('click', () => modalName.classList.add('hidden'));

btnSaveName.addEventListener('click', () => {
  const newName = inputPlayerName.value.trim();
  if (newName) {
    net.setPlayerName(newName);
    updatePlayerNameDisplay();
    if (!isOnlineMode && game.players.length > 0) {
      game.players[0].name = newName;
      renderPlayers();
    }
    showNotification(`이름이 '${newName}'(으)로 저장되었습니다.`, 'success');
  }
  modalName.classList.add('hidden');
});

// 방 만들기 (호스트)
btnOnlineCreate.addEventListener('click', async () => {
  try {
    showNotification('온라인 방 생성 중...', 'info');
    const roomCode = await net.createRoom();
    createdRoomCodeEl.textContent = roomCode;
    renderParticipantList(net.participants);
    modalCreateRoom.classList.remove('hidden');
  } catch (err: any) {
    showNotification(`방 생성 오류: ${err.message || err}`, 'error');
  }
});
btnCloseCreateModal.addEventListener('click', () => {
  if (confirm('대기실을 닫고 방 생성을 취소하시겠습니까?')) {
    net.leaveRoom();
    setOnlineUIState(false);
    modalCreateRoom.classList.add('hidden');
    showNotification('방 생성이 취소되었습니다.', 'info');
  }
});

// 방 코드 복사
btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(net.roomCode);
  showNotification(`방 번호 [${net.roomCode}]가 클립보드에 복사되었습니다!`, 'success');
});

// 초대 링크 복사
btnCopyLink.addEventListener('click', () => {
  const url = `${window.location.origin}${window.location.pathname}?room=${net.roomCode}`;
  navigator.clipboard.writeText(url);
  showNotification('초대 링크가 복사되었습니다! 친구에게 공유하세요.', 'success');
});

// 호스트: 대기실 참가자 변경 감지
net.onParticipantsChanged = (participants) => {
  renderParticipantList(participants);
};

function renderParticipantList(participants: RoomParticipant[]): void {
  participantCountEl.textContent = participants.length.toString();
  participantListEl.innerHTML = '';

  participants.forEach((p) => {
    const li = document.createElement('li');
    li.className = `participant-item ${p.id === net.myPeerId ? 'me' : ''}`;
    li.innerHTML = `
      <span>👤 ${p.name} ${p.id === net.myPeerId ? '(나)' : ''}</span>
      ${p.isHost ? '<span class="host-tag">방장</span>' : '<span style="color:#94a3b8;font-size:12px;">참가자</span>'}
    `;
    participantListEl.appendChild(li);
  });
}

// 호스트: 온라인 게임 시작 버튼
btnStartOnlineGame.addEventListener('click', () => {
  if (!net.isHost) return;

  isOnlineMode = true;
  myPlayerId = net.myPeerId;
  botSelectWrapEl.style.display = 'none';
  hideVictoryBanner();

  // 1. 호스트의 게임 인스턴스 초기화
  game.board = [];
  game.isGameOver = false;
  game.winner = null;
  game.start(0); // 덱 생성 및 셔플

  // 2. 플레이어 목록 구성 (실제 참가자들)
  game.players = net.participants.map((p) => ({
    id: p.id,
    name: p.name,
    isAi: false,
    hand: game.deck.splice(0, 14),
    hasInitialMeld: false,
  }));

  // 3. 봇 추가 옵션이 켜져 있고 4인 미만이면 봇 채우기
  if (chkFillBots.checked && game.players.length < 4) {
    const needed = 4 - game.players.length;
    const botConfigs: { name: string; difficulty: 'beginner' | 'intermediate' | 'expert' }[] = [
      { name: '루키봇(초급)', difficulty: 'beginner' },
      { name: '베테랑봇(중급)', difficulty: 'intermediate' },
      { name: '마스터봇(고급)', difficulty: 'expert' },
    ];
    for (let b = 0; b < needed; b++) {
      const config = botConfigs[b] || { name: `봇 ${b + 1}`, difficulty: 'beginner' };
      game.players.push({
        id: `bot-${b + 1}`,
        name: config.name,
        isAi: true,
        difficulty: config.difficulty,
        hand: game.deck.splice(0, 14),
        hasInitialMeld: false,
      });
    }
  }

  game.currentPlayerIndex = 0;
  game.startTurn();

  // 4. 모든 참가자에게 START_GAME 메시지 전송
  net.participants.forEach((p) => {
    if (p.id === net.myPeerId) return;
    net.sendTo(p.id, {
      type: 'START_GAME',
      senderId: net.myPeerId,
      senderName: net.myName,
      payload: {
        board: game.board,
        deckCount: game.deck.length,
        currentPlayerIndex: game.currentPlayerIndex,
        players: game.players.map((pl) => ({
          id: pl.id,
          name: pl.name,
          isAi: pl.isAi,
          difficulty: pl.difficulty,
          handCount: pl.hand.length,
          hasInitialMeld: pl.hasInitialMeld,
        })),
        myHand: game.players.find((pl) => pl.id === p.id)?.hand || [],
      },
    });
  });

  modalCreateRoom.classList.add('hidden');
  setOnlineUIState(true, net.roomCode);
  renderAll();
  showNotification('🚀 온라인 멀티플레이어 게임이 시작되었습니다!', 'success');
});

// 방 참가하기 (게스트)
btnOnlineJoin.addEventListener('click', () => {
  inputJoinCode.value = '';
  joinStatusMsg.textContent = '';
  modalJoinRoom.classList.remove('hidden');
});
btnCloseJoinModal.addEventListener('click', () => {
  if (isOnlineMode) {
    net.leaveRoom();
    setOnlineUIState(false);
  }
  modalJoinRoom.classList.add('hidden');
});

btnSubmitJoin.addEventListener('click', async () => {
  const code = inputJoinCode.value.trim();
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    joinStatusMsg.className = 'join-status error';
    joinStatusMsg.textContent = '6자리 숫자를 입력해 주세요.';
    return;
  }

  try {
    joinStatusMsg.className = 'join-status loading';
    joinStatusMsg.textContent = '방에 접속 중입니다...';
    await net.joinRoom(code);
    setOnlineUIState(true, code);
    joinStatusMsg.className = 'join-status success';
    joinStatusMsg.textContent = '연결 성공! 방장이 게임을 시작하기를 기다리는 중...';
  } catch (err: any) {
    joinStatusMsg.className = 'join-status error';
    joinStatusMsg.textContent = '방 연결 실패. 방 번호를 확인해 주세요.';
  }
});

// 온라인 방 나가기 버튼
btnLeaveRoom.addEventListener('click', () => {
  if (confirm('정말 방에서 나가시겠습니까? 진행 중인 온라인 게임이 종료됩니다.')) {
    net.leaveRoom();
    setOnlineUIState(false);
    initOfflineGame();
    showNotification('온라인 방에서 퇴장했습니다. 1인용 모드로 전환되었습니다.', 'info');
  }
});

// 규칙 모달 열기/닫기
btnRules.addEventListener('click', () => rulesModal.classList.remove('hidden'));
btnCloseModal.addEventListener('click', () => rulesModal.classList.add('hidden'));
btnModalOk.addEventListener('click', () => rulesModal.classList.add('hidden'));

// 새 게임 버튼 (오프라인 1인용)
btnNewGame.addEventListener('click', () => {
  if (confirm('새 1인용 게임을 시작하시겠습니까? (진행 중인 게임은 종료됩니다)')) {
    net.disconnect();
    initOfflineGame();
  }
});

// Non-modal 승리 배너 이벤트 (닫기 및 새 게임)
btnCloseVictory.addEventListener('click', () => {
  hideVictoryBanner();
});

btnVictoryNewGame.addEventListener('click', () => {
  hideVictoryBanner();
  if (isOnlineMode) {
    if (net.isHost) {
      modalCreateRoom.classList.remove('hidden');
    } else {
      showNotification('방장이 새 게임을 시작하기를 기다리는 중입니다.', 'info');
    }
  } else {
    initOfflineGame();
  }
});

botCountSelectEl.addEventListener('change', () => {
  if (!isOnlineMode) {
    initOfflineGame();
  }
});

// 전체화면 토글
btnFullscreen.addEventListener('click', toggleFullscreen);

function toggleFullscreen(): void {
  const doc = document as any;
  const docEl = document.documentElement as any;

  const isFullscreen =
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement;

  if (!isFullscreen) {
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(() => handleFullscreenFallback());
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    } else {
      handleFullscreenFallback();
    }
  } else {
    if (doc.exitFullscreen) {
      doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
  }
}

function handleFullscreenFallback(): void {
  showNotification(
    '💡 아이폰 Safari는 [공유] ➡️ [홈 화면에 추가]를 하시면 브라우저 바 없는 100% 전체화면 앱으로 실행됩니다!',
    'info'
  );
}

['fullscreenchange', 'webkitfullscreenchange'].forEach((event) => {
  document.addEventListener(event, () => {
    const doc = document as any;
    const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    btnFullscreen.textContent = isFs ? '✖' : '⛶';
    btnFullscreen.title = isFs ? '전체화면 종료' : '전체화면 전환';
  });
});

// 알림 배너
let notificationTimeout: number | null = null;
function showNotification(msg: string, type: 'info' | 'error' | 'success' = 'info'): void {
  notificationBarEl.textContent = msg;
  notificationBarEl.className = `notification-bar active ${type}`;

  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationTimeout = window.setTimeout(() => {
    notificationBarEl.classList.remove('active');
  }, 4500);
}

// 오프라인 AI 순차 진행
async function processAiTurns(): Promise<void> {
  if (isOnlineMode) return;
  isProcessingTurn = true;
  updateActionControls();

  while (game.getCurrentPlayer().isAi && !game.isGameOver) {
    const bot = game.getCurrentPlayer();
    const botStartTime = Date.now();
    const budgetMs = RummikubAI.getTimeoutForDifficulty(bot.difficulty);
    const budgetSec = Math.ceil(budgetMs / 1000);

    renderHeader();
    renderPlayers();

    // 봇 생각 시간(난이도별 맞춤 제한) 실시간 카운트다운 타이머
    const timerInterval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - botStartTime) / 1000);
      const remaining = Math.max(0, budgetSec - elapsed);
      turnPlayerNameEl.textContent = `🤖 ${bot.name} 생각 중... (${remaining}초 남음)`;
    }, 250);

    try {
      await RummikubAI.playTurn(game, bot);
    } finally {
      clearInterval(timerInterval);
    }

    renderAll();

    if (game.isGameOver) {
      if (game.winner) showVictoryBanner(game.winner);
      break;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  isProcessingTurn = false;
  renderAll();
}

// ================== URL 파라미터 자동 참가 체크 ==================
function checkUrlRoomParam(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && roomParam.length === 6) {
    inputJoinCode.value = roomParam;
    modalJoinRoom.classList.remove('hidden');
    showNotification(`초대받은 방 번호 [${roomParam}]가 자동 입력되었습니다. '입장하기'를 누르세요!`, 'info');
  }
}

// ================== 다크 모드 / 컬러 타일 테마 ==================
function initTheme(): void {
  const saved = localStorage.getItem('rummikub_dark_mode');
  // 기본적으로 저장된 값이 없거나 'true'이면 다크 모드를 활성화
  const isDark = saved === null ? true : saved === 'true';
  applyTheme(isDark);
}

function applyTheme(isDark: boolean): void {
  if (isDark) {
    document.body.classList.add('dark-mode');
    btnThemeToggle.textContent = '☀️ 라이트 모드';
    btnThemeToggle.title = '일반 아이보리 타일 모드로 전환';
  } else {
    document.body.classList.remove('dark-mode');
    btnThemeToggle.textContent = '🌙 다크 모드';
    btnThemeToggle.title = '컬러풀 다크 타일 모드로 전환 (빨강/노랑/초록/파랑)';
  }
  localStorage.setItem('rummikub_dark_mode', isDark ? 'true' : 'false');
}

btnThemeToggle.addEventListener('click', () => {
  const willBeDark = !document.body.classList.contains('dark-mode');
  applyTheme(willBeDark);
  showNotification(
    willBeDark
      ? '🌙 다크 모드가 적용되었습니다! (타일 바탕색: 빨강, 노랑, 초록, 파랑)'
      : '☀️ 라이트 모드가 적용되었습니다! (기본 아이보리 타일)',
    'info'
  );
});

// 최초 실행
initTheme();
initOfflineGame();
checkUrlRoomParam();

