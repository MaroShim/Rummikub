import { RummikubGame } from './core/game.ts';
import { RummikubAI } from './core/ai.ts';
import { Tile, TileSet } from './core/types.ts';
import { validateTileSet } from './core/validator.ts';

// 게임 인스턴스
const game = new RummikubGame();

// DOM 참조
const deckCountEl = document.getElementById('deck-count') as HTMLElement;
const turnPlayerNameEl = document.getElementById('turn-player-name') as HTMLElement;
const currentTurnBadgeEl = document.getElementById('current-turn-badge') as HTMLElement;
const playersPanelEl = document.getElementById('players-panel') as HTMLElement;
const boardContainerEl = document.getElementById('board-container') as HTMLElement;
const rackContainerEl = document.getElementById('rack-container') as HTMLElement;
const handCountEl = document.getElementById('hand-count') as HTMLElement;
const meldStatusEl = document.getElementById('meld-status') as HTMLElement;
const notificationBarEl = document.getElementById('notification-bar') as HTMLElement;
const botCountSelectEl = document.getElementById('bot-count-select') as HTMLSelectElement;

const btnNewGame = document.getElementById('btn-new-game') as HTMLButtonElement;
const btnFullscreen = document.getElementById('btn-fullscreen') as HTMLButtonElement;
const btnSortNum = document.getElementById('btn-sort-num') as HTMLButtonElement;
const btnSortColor = document.getElementById('btn-sort-color') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnDraw = document.getElementById('btn-draw') as HTMLButtonElement;
const btnEndTurn = document.getElementById('btn-end-turn') as HTMLButtonElement;
const btnRules = document.getElementById('btn-rules') as HTMLButtonElement;
const rulesModal = document.getElementById('rules-modal') as HTMLElement;
const btnCloseModal = document.getElementById('btn-close-modal') as HTMLButtonElement;
const btnModalOk = document.getElementById('btn-modal-ok') as HTMLButtonElement;

// 드래그 중인 타일의 정보
interface DragSource {
  location: 'rack' | 'board';
  setIndex?: number;
  tileIndex: number;
  tileId: string;
}
let currentDragSource: DragSource | null = null;
let isProcessingTurn = false;

// ================== 게임 초기화 ==================
function initGame(): void {
  const botCount = parseInt(botCountSelectEl.value, 10) || 3;
  game.start(botCount);
  renderAll();
  showNotification(`🎮 새 게임이 시작되었습니다! (봇 ${botCount}명)`, 'info');
}

// ================== 렌더링 함수들 ==================
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

  if (current.isAi) {
    turnPlayerNameEl.textContent = `🤖 ${current.name} 생각 중...`;
    currentTurnBadgeEl.classList.add('ai-turn');
  } else {
    turnPlayerNameEl.textContent = `👤 내 턴 (플레이어)`;
    currentTurnBadgeEl.classList.remove('ai-turn');
  }
}

function renderPlayers(): void {
  playersPanelEl.innerHTML = '';
  const current = game.getCurrentPlayer();

  game.players.forEach((player) => {
    const card = document.createElement('div');
    card.className = `player-card ${player.id === current.id ? 'active' : ''}`;

    const avatar = player.isAi ? '🤖' : '👤';
    const meldBadge = player.hasInitialMeld ? '✓ 등록완료' : '미등록';

    card.innerHTML = `
      <div class="player-avatar">${avatar}</div>
      <div class="player-meta">
        <span class="p-name">${player.name}</span>
        <span class="p-info">${player.hand.length}장 | ${meldBadge}</span>
      </div>
    `;
    playersPanelEl.appendChild(card);
  });
}

function renderBoard(): void {
  boardContainerEl.innerHTML = '';

  if (game.board.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-board-msg';
    emptyMsg.innerHTML = `보드에 등록된 세트가 없습니다.<br />첫 등록(자신의 타일 합계 30점 이상)을 완성해 테이블로 드래그하세요!`;
    boardContainerEl.appendChild(emptyMsg);
  } else {
    game.board.forEach((set, sIdx) => {
      if (set.length === 0) return;

      const setEl = document.createElement('div');
      setEl.className = 'board-set';
      setEl.dataset.setIndex = sIdx.toString();

      // 세트 유효성 검사 및 시각 피드백
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

      // 기존 세트에 드롭 이벤트 바인딩
      bindSetDropEvents(setEl, sIdx);
      boardContainerEl.appendChild(setEl);
    });
  }

  // '새 세트 만들기' 드롭 존 항상 표시
  const newSetZone = document.createElement('div');
  newSetZone.className = 'new-set-zone';
  newSetZone.textContent = '+ 새 세트 만들기';
  bindNewSetDropEvents(newSetZone);
  boardContainerEl.appendChild(newSetZone);
}

function renderRack(): void {
  rackContainerEl.innerHTML = '';
  const humanPlayer = game.players[0]; // 나

  handCountEl.textContent = humanPlayer.hand.length.toString();
  if (humanPlayer.hasInitialMeld) {
    meldStatusEl.className = 'badge badge-melded';
    meldStatusEl.textContent = '첫 등록 완료 (자유 조합 가능)';
  } else {
    meldStatusEl.className = 'badge badge-unmelded';
    meldStatusEl.textContent = '첫 등록 필요 (30점 이상)';
  }

  humanPlayer.hand.forEach((tile, tIdx) => {
    const tileEl = createTileElement(tile, {
      location: 'rack',
      tileIndex: tIdx,
      tileId: tile.id,
    });
    rackContainerEl.appendChild(tileEl);
  });
}

function updateActionControls(): void {
  const isMyTurn = game.getCurrentPlayer().id === game.players[0].id && !isProcessingTurn;

  btnSortNum.disabled = !isMyTurn;
  btnSortColor.disabled = !isMyTurn;
  btnReset.disabled = !isMyTurn;
  btnDraw.disabled = !isMyTurn;
  btnEndTurn.disabled = !isMyTurn;
}

// ================== 타일 DOM 생성 ==================
function createTileElement(tile: Tile, sourceInfo: DragSource): HTMLElement {
  const el = document.createElement('div');
  el.className = `tile ${tile.isJoker ? 'is-joker' : `color-${tile.color}`}`;
  el.draggable = !isProcessingTurn && game.getCurrentPlayer().id === game.players[0].id;
  el.dataset.tileId = tile.id;

  const valueDisplay = tile.isJoker ? '☺' : tile.value.toString();
  const iconDisplay = tile.isJoker ? '★' : getSymbolForColor(tile.color);

  el.innerHTML = `
    <div class="tile-value">${valueDisplay}</div>
    <div class="tile-icon">${iconDisplay}</div>
  `;

  // 드래그 시작 이벤트
  el.addEventListener('dragstart', (e) => {
    if (isProcessingTurn || game.getCurrentPlayer().id !== game.players[0].id) {
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

// ================== 드래그 & 드롭 이벤트 바인딩 ==================
function clearDragHoverStyles(): void {
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
}

// 1. 기존 세트에 드롭
function bindSetDropEvents(setEl: HTMLElement, targetSetIndex: number): void {
  setEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    setEl.classList.add('drag-over');
  });

  setEl.addEventListener('dragleave', () => {
    setEl.classList.remove('drag-over');
  });

  setEl.addEventListener('drop', (e) => {
    e.preventDefault();
    setEl.classList.remove('drag-over');
    if (!currentDragSource) return;

    handleDropOnSet(currentDragSource, targetSetIndex);
  });
}

// 2. 새 세트 영역에 드롭
function bindNewSetDropEvents(newZoneEl: HTMLElement): void {
  newZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    newZoneEl.classList.add('drag-over');
  });

  newZoneEl.addEventListener('dragleave', () => {
    newZoneEl.classList.remove('drag-over');
  });

  newZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    newZoneEl.classList.remove('drag-over');
    if (!currentDragSource) return;

    handleDropOnNewSet(currentDragSource);
  });
}

// 3. 타일 랙에 드롭 (보드에서 다시 가져오기)
rackContainerEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  rackContainerEl.classList.add('drag-over');
});

rackContainerEl.addEventListener('dragleave', () => {
  rackContainerEl.classList.remove('drag-over');
});

rackContainerEl.addEventListener('drop', (e) => {
  e.preventDefault();
  rackContainerEl.classList.remove('drag-over');
  if (!currentDragSource) return;

  handleDropOnRack(currentDragSource);
});

// ================== 타일 이동 비즈니스 로직 ==================
function handleDropOnSet(source: DragSource, targetSetIndex: number): void {
  const player = game.players[0];
  let tileToMove: Tile | null = null;

  if (source.location === 'rack') {
    // 랙에서 보드 세트로 이동
    tileToMove = player.hand.splice(source.tileIndex, 1)[0];
  } else if (source.location === 'board' && source.setIndex !== undefined) {
    // 보드 세트 간 이동
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
  const player = game.players[0];
  let tileToMove: Tile | null = null;

  if (source.location === 'rack') {
    tileToMove = player.hand.splice(source.tileIndex, 1)[0];
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
  const player = game.players[0];

  if (source.location === 'board' && source.setIndex !== undefined) {
    const sourceSet = game.board[source.setIndex];
    const tileToMove = sourceSet.splice(source.tileIndex, 1)[0];
    if (tileToMove) {
      player.hand.push(tileToMove);
      game.cleanupEmptySets();
      renderAll();
    }
  }
}

// ================== 액션 버튼 핸들러 ==================
// 정렬: 숫자별
btnSortNum.addEventListener('click', () => {
  game.sortHand(game.players[0], 'number');
  renderRack();
});

// 정렬: 색상별
btnSortColor.addEventListener('click', () => {
  game.sortHand(game.players[0], 'color');
  renderRack();
});

// 턴 원상복구
btnReset.addEventListener('click', () => {
  game.resetTurn();
  renderAll();
  showNotification('턴 시작 상태로 원상복구되었습니다.', 'info');
});

// 타일 1장 뽑기 (Pass)
btnDraw.addEventListener('click', () => {
  if (isProcessingTurn) return;
  const res = game.drawTile();
  if (res.success && res.tile) {
    showNotification(`타일 1장을 뽑았습니다. [${res.tile.isJoker ? '조커' : `${res.tile.color} ${res.tile.value}`}]`, 'info');
  } else if (res.error) {
    showNotification(res.error, 'error');
  }
  renderAll();
  processAiTurns();
});

// 턴 확정 (유효성 검사 후 종료)
btnEndTurn.addEventListener('click', () => {
  if (isProcessingTurn) return;
  const res = game.endTurn();
  if (!res.success) {
    showNotification(`⚠️ ${res.error}`, 'error');
    renderBoard(); // invalid 세트 하이라이트 갱신
    return;
  }

  if (game.isGameOver) {
    showNotification(`🏆 축하합니다! ${game.winner?.name}님이 승리하셨습니다!`, 'success');
    renderAll();
    return;
  }

  showNotification('턴을 확정했습니다! 봇 차례로 넘어갑니다.', 'success');
  renderAll();
  processAiTurns();
});

// 새 게임 버튼
btnNewGame.addEventListener('click', () => {
  if (confirm('새 게임을 시작하시겠습니까?')) {
    initGame();
  }
});

// 전체화면 토글
btnFullscreen.addEventListener('click', toggleFullscreen);

function toggleFullscreen(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = document as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// 전체화면 상태 변화 감지하여 아이콘 변경
['fullscreenchange', 'webkitfullscreenchange'].forEach((event) => {
  document.addEventListener(event, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = document as any;
    const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    btnFullscreen.textContent = isFs ? '✖' : '⛶';
    btnFullscreen.title = isFs ? '전체화면 종료' : '전체화면 전환';
  });
});

botCountSelectEl.addEventListener('change', () => {
  initGame();
});

// 규칙 모달 열기/닫기
btnRules.addEventListener('click', () => rulesModal.classList.remove('hidden'));
btnCloseModal.addEventListener('click', () => rulesModal.classList.add('hidden'));
btnModalOk.addEventListener('click', () => rulesModal.classList.add('hidden'));

// 알림 배너
let notificationTimeout: number | null = null;
function showNotification(msg: string, type: 'info' | 'error' | 'success' = 'info'): void {
  notificationBarEl.textContent = msg;
  notificationBarEl.className = `notification-bar active ${type}`;

  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationTimeout = window.setTimeout(() => {
    notificationBarEl.classList.remove('active');
  }, 4000);
}

// ================== AI 턴 순차 진행 루프 ==================
async function processAiTurns(): Promise<void> {
  isProcessingTurn = true;
  updateActionControls();

  while (game.getCurrentPlayer().isAi && !game.isGameOver) {
    const bot = game.getCurrentPlayer();
    renderHeader();
    renderPlayers();

    await RummikubAI.playTurn(game, bot);

    renderAll();

    if (game.isGameOver) {
      showNotification(`🎮 게임 종료! ${game.winner?.name}님이 승리했습니다!`, 'success');
      break;
    }
  }

  isProcessingTurn = false;
  renderAll();
}

// 초기 실행
initGame();
