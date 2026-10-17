import { Tile, TileSet, Player, TurnSnapshot, BotDifficulty } from './types.ts';
import { createDeck, shuffleDeck } from './deck.ts';
import { validateBoard, validateTileSet, autoOrderSet } from './validator.ts';

export class RummikubGame {
  deck: Tile[] = [];
  players: Player[] = [];
  currentPlayerIndex: number = 0;
  board: TileSet[] = [];

  // 턴 시작 시점의 스냅샷 (되돌리기 / 롤백용)
  snapshot: TurnSnapshot | null = null;

  isGameOver: boolean = false;
  winner: Player | null = null;
  logs: string[] = [];

  constructor() {}

  /**
   * 새 게임을 시작합니다.
   * @param botCount 봇 플레이어 수 (1, 2, 3) - 기본값 3
   */
  start(botCount: number = 3): void {
    const rawDeck = createDeck();
    this.deck = shuffleDeck(rawDeck);
    this.board = [];
    this.isGameOver = false;
    this.winner = null;
    this.logs = [];

    // 플레이어 목록 구성 (플레이어 1명 + 봇 N명)
    this.players = [
      {
        id: 'player-1',
        name: '나 (Player)',
        isAi: false,
        hand: [],
        hasInitialMeld: false,
      },
    ];

    // 난이도 정의: 봇 1명(초급), 2명(초급, 중급), 3명(초급, 중급, 고급)
    const botConfigs: { name: string; difficulty: 'beginner' | 'intermediate' | 'expert' }[] = [
      { name: '루키봇 (초급)', difficulty: 'beginner' },
      { name: '베테랑봇 (중급)', difficulty: 'intermediate' },
      { name: '마스터봇 (고급)', difficulty: 'expert' },
    ];

    for (let i = 0; i < botCount; i++) {
      const cfg = botConfigs[i] || { name: `봇 ${i + 1}`, difficulty: 'intermediate' };
      this.players.push({
        id: `bot-${i + 1}`,
        name: cfg.name,
        isAi: true,
        difficulty: cfg.difficulty,
        hand: [],
        hasInitialMeld: false,
      });
    }

    // 각 플레이어에게 타일 14장 배분
    for (const player of this.players) {
      player.hand = this.deck.splice(0, 14);
    }

    this.currentPlayerIndex = 0;
    this.startTurn();
    this.addLog(`게임이 시작되었습니다! (플레이어 1명 + 봇 ${botCount}명)`);
  }

  getCurrentPlayer(): Player {
    return this.players[this.currentPlayerIndex];
  }

  /**
   * 턴 시작 시 현재 상태 스냅샷 저장
   */
  startTurn(): void {
    const current = this.getCurrentPlayer();
    this.snapshot = {
      board: JSON.parse(JSON.stringify(this.board)),
      hand: JSON.parse(JSON.stringify(current.hand)),
    };
  }

  /**
   * 현재 턴 변경사항 되돌리기 (Undo / Reset)
   */
  resetTurn(): void {
    if (!this.snapshot) return;
    this.board = JSON.parse(JSON.stringify(this.snapshot.board));
    this.getCurrentPlayer().hand = JSON.parse(JSON.stringify(this.snapshot.hand));
    this.cleanupEmptySets();
    this.addLog(`${this.getCurrentPlayer().name}님이 패를 원상복구했습니다.`);
  }

  /**
   * 턴 동안 핸드에서 낸 타일 수 확인
   */
  getTilesPlayedInTurn(): Tile[] {
    if (!this.snapshot) return [];
    const currentHandIds = new Set(this.getCurrentPlayer().hand.map((t) => t.id));
    return this.snapshot.hand.filter((t) => !currentHandIds.has(t.id));
  }

  /**
   * 보드의 빈 세트 정리
   */
  cleanupEmptySets(): void {
    this.board = this.board.filter((s) => s.length > 0);
  }

  /**
   * 타일 뽑기 (풀에서 1장 획득 후 턴 종료)
   */
  drawTile(): { success: boolean; tile?: Tile; error?: string } {
    // 만약 이미 보드를 건드렸거나 타일을 냈다면 원상복구 후 뽑아야 함
    const playedTiles = this.getTilesPlayedInTurn();
    if (playedTiles.length > 0) {
      this.resetTurn();
    }

    if (this.deck.length === 0) {
      this.nextTurn();
      return { success: false, error: '남은 타일이 없습니다. 턴을 넘깁니다.' };
    }

    const drawn = this.deck.shift()!;
    const player = this.getCurrentPlayer();
    player.hand.push(drawn);
    this.addLog(`${player.name}님이 타일 1장을 뽑았습니다.`);

    this.nextTurn();
    return { success: true, tile: drawn };
  }

  /**
   * 턴 종료 및 유효성 검사
   */
  endTurn(): { success: boolean; error?: string } {
    const player = this.getCurrentPlayer();
    const playedTiles = this.getTilesPlayedInTurn();

    if (playedTiles.length === 0) {
      return {
        success: false,
        error: '타일을 최소 1장 이상 내거나, 타일 뽑기(Pass)를 해야 합니다.',
      };
    }

    this.cleanupEmptySets();

    // 1. 보드 유효성 검사
    const boardValidation = validateBoard(this.board);
    if (!boardValidation.valid) {
      return {
        success: false,
        error: `보드에 유효하지 않은 세트(${boardValidation.invalidSetIndices.length}개)가 있습니다. 모든 세트는 3장 이상의 런 또는 그룹이어야 합니다.`,
      };
    }

    // 2. 첫 등록(Initial Meld) 30점 규칙 검증
    if (!player.hasInitialMeld) {
      const meldResult = this.checkInitialMeld(playedTiles);
      if (!meldResult.valid) {
        return {
          success: false,
          error: meldResult.error || '첫 등록은 자신의 패로만 만든 세트의 합이 30점 이상이어야 합니다.',
        };
      }
      player.hasInitialMeld = true;
      this.addLog(`🎉 ${player.name}님이 첫 등록(30점 이상)에 성공했습니다!`);
    }

    // 세트들 깔끔하게 자동 정렬
    this.board = this.board.map((set) => autoOrderSet(set));

    // 3. 승리 조건 검사
    if (player.hand.length === 0) {
      this.isGameOver = true;
      this.winner = player;
      this.addLog(`🏆 ${player.name}님이 모든 타일을 내려놓고 승리했습니다!`);
      return { success: true };
    }

    this.addLog(`${player.name}님이 턴을 마쳤습니다. (${playedTiles.length}장 냄)`);
    this.nextTurn();
    return { success: true };
  }

  /**
   * 첫 등록 검증:
   * 턴 동안 낸 타일들만으로 30점 이상의 완전한 세트들이 구성되었는지 확인
   * (첫 등록 턴에는 기존 보드의 타일과 합칠 수 없음)
   */
  private checkInitialMeld(playedTiles: Tile[]): { valid: boolean; error?: string } {
    const playedIds = new Set(playedTiles.map((t) => t.id));

    // 보드의 세트 중 이번 턴에 낸 타일로만 구성된 완전히 새로운 세트들만 찾아야 함
    // 만약 기존 세트에 타일을 덧붙였다면 첫 등록 위반!
    const snapshotBoardTiles = new Set(
      (this.snapshot?.board || []).flatMap((s) => s.map((t) => t.id))
    );

    let totalScore = 0;
    const newSets: TileSet[] = [];

    for (const set of this.board) {
      const hasPlayedTile = set.some((t) => playedIds.has(t.id));
      const hasOldTile = set.some((t) => snapshotBoardTiles.has(t.id));

      if (hasPlayedTile && hasOldTile) {
        return {
          valid: false,
          error: '첫 등록 전에는 기존 보드의 타일과 조합할 수 없습니다.',
        };
      }

      if (hasPlayedTile && !hasOldTile) {
        // 순수하게 이번 턴에 낸 타일로만 구성된 세트
        const validation = validateTileSet(set);
        if (!validation.valid || !validation.score) {
          return { valid: false, error: '등록할 세트가 규칙에 맞지 않습니다.' };
        }
        totalScore += validation.score;
        newSets.push(set);
      }
    }

    if (totalScore < 30) {
      return {
        valid: false,
        error: `첫 등록 점수 합계가 30점 이상이어야 합니다. (현재: ${totalScore}점)`,
      };
    }

    return { valid: true };
  }

  /**
   * 다음 플레이어로 턴 넘기기
   */
  nextTurn(): void {
    if (this.isGameOver) return;
    this.cleanupEmptySets();
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.startTurn();
  }

  /**
   * 핸드 정렬: 숫자별 (7 7 7) 또는 색상별 (7 8 9)
   */
  sortHand(player: Player, by: 'color' | 'number'): void {
    const colorOrder: Record<string, number> = { black: 1, blue: 2, red: 3, yellow: 4, joker: 5 };

    if (by === 'number') {
      // 숫자 우선 정렬 (1 1 1 2 2 ...)
      player.hand.sort((a, b) => {
        if (a.isJoker) return 1;
        if (b.isJoker) return -1;
        if (a.value !== b.value) return a.value - b.value;
        return (colorOrder[a.color] || 0) - (colorOrder[b.color] || 0);
      });
    } else {
      // 색상 우선 정렬 (검1 2 3, 파1 2 3 ...)
      player.hand.sort((a, b) => {
        if (a.isJoker) return 1;
        if (b.isJoker) return -1;
        const colorDiff = (colorOrder[a.color] || 0) - (colorOrder[b.color] || 0);
        if (colorDiff !== 0) return colorDiff;
        return a.value - b.value;
      });
    }
  }

  /**
   * 보드에 새 빈 세트 생성
   */
  createEmptySetOnBoard(): number {
    this.board.push([]);
    return this.board.length - 1;
  }

  /**
   * 봇의 난이도를 다음 등급으로 올림 (초급 -> 중급 -> 고급 -> 최고급 -> 초급)
   */
  cycleBotDifficulty(playerId: string): { oldDiff: BotDifficulty; newDiff: BotDifficulty; newName: string; label: string } | null {
    const player = this.players.find((p) => p.id === playerId && p.isAi);
    if (!player) return null;

    const currentDiff = player.difficulty || 'beginner';
    const nextCfg = DIFFICULTY_CONFIG[currentDiff];
    const newDiff = nextCfg.next;
    const newInfo = DIFFICULTY_CONFIG[newDiff];

    player.difficulty = newDiff;
    player.name = `${newInfo.name} (${newInfo.label})`;
    this.addLog(`${player.name}의 난이도가 [${newInfo.label}]으로 변경되었습니다.`);

    return { oldDiff: currentDiff, newDiff, newName: player.name, label: newInfo.label };
  }

  addLog(msg: string): void {
    this.logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (this.logs.length > 50) this.logs.pop();
  }
}

export const DIFFICULTY_CONFIG: Record<
  BotDifficulty,
  { next: BotDifficulty; label: string; name: string }
> = {
  beginner: { next: 'intermediate', label: '초급', name: '루키봇' },
  intermediate: { next: 'expert', label: '중급', name: '베테랑봇' },
  expert: { next: 'master', label: '고급', name: '마스터봇' },
  master: { next: 'beginner', label: '최고급', name: '알파봇' },
};
