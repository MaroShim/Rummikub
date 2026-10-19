import { Tile, TileColor, TileSet, Player, BotDifficulty } from './types.ts';
import { RummikubGame } from './game.ts';
import { validateGroup, validateRun, validateTileSet } from './validator.ts';

/**
 * 루미큐브 고급 전략 AI 플레이어 (Advanced Rummikub AI)
 * 
 * 루미큐브 챔피언십 및 게임 이론에 기반한 전략적 알고리즘:
 * 1. 완전 탐색 세트 생성기 (Complete Valid Set Generator with Jokers)
 * 2. 독립 세트 배출 및 배낭 최적화 (Knapsack Set Selection)
 * 3. 보드 국소 재조합 엔진 (Local Multi-Set Recombination Engine)
 *    - 런 쪼개기(Run Splitting), 피벗(The Pivot), 세트 병합 및 재분할
 * 4. 전방위 조커 치환 및 콤보 회수 (Universal Joker Substitution)
 * 5. 고수 전략 휴리스틱:
 *    - 고득점 타일(10~13) 우선 소진 (패배 시 감점 최소화)
 *    - 조커 보존 전략 (상대 패가 적을 때 상대에게 주는 판 깔아주기 방지)
 *    - 연쇄 조작 루프 (Chaining Loop)
 */
export class RummikubAI {
  static readonly DIFFICULTY_TIMEOUT_MS: Record<BotDifficulty, number> = {
    beginner: 3000,      // 초급: 최대 3초 (스피디한 진행, 단순 전략)
    intermediate: 6000,  // 중급: 최대 6초
    expert: 12000,       // 고급: 최대 12초
    master: 20000,       // 최고급: 최대 20초 (심층 보드 재조합 탐색)
  };

  static readonly MAX_HARD_TIMEOUT_MS = 25000;

  static getTimeoutForDifficulty(difficulty: BotDifficulty = 'intermediate'): number {
    return this.DIFFICULTY_TIMEOUT_MS[difficulty] || 10000;
  }

  private static async yieldTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  static async playTurn(game: RummikubGame, player: Player): Promise<void> {
    if (!player.isAi) return;

    const difficulty: BotDifficulty = player.difficulty || 'intermediate';
    const startTime = Date.now();
    const maxAllowedMs = Math.min(this.getTimeoutForDifficulty(difficulty), this.MAX_HARD_TIMEOUT_MS);

    // 봇 생각 딜레이 연출
    const thinkDelay =
      difficulty === 'beginner'
        ? 400
        : difficulty === 'intermediate'
        ? 600
        : difficulty === 'expert'
        ? 800
        : 1000;
    await new Promise((resolve) => setTimeout(resolve, thinkDelay));

    const thinkTask = (async () => {
      await this.yieldTick();

      if (!player.hasInitialMeld) {
        // 1. 첫 등록 (Initial Meld)
        const success = await this.tryInitialMeld(game, player, difficulty, startTime, maxAllowedMs);
        if (success) {
          const endResult = game.endTurn();
          if (endResult.success) return true;
          game.resetTurn();
        }
      } else {
        // 2. 이미 첫 등록을 마친 경우: 난이도별 보드 조작 수행
        let playedAny = false;

        if (difficulty === 'beginner') {
          playedAny = await this.playBeginnerTurn(game, player, startTime, maxAllowedMs);
        } else if (difficulty === 'intermediate') {
          playedAny = await this.playIntermediateTurn(game, player, startTime, maxAllowedMs);
        } else if (difficulty === 'expert') {
          playedAny = await this.playExpertTurn(game, player, startTime, maxAllowedMs);
        } else {
          playedAny = await this.playMasterTurn(game, player, startTime, maxAllowedMs);
        }

        if (playedAny) {
          const endResult = game.endTurn();
          if (endResult.success) return true;
          game.resetTurn();
        }
      }
      return false;
    })();

    const remainingBudget = Math.max(500, maxAllowedMs - (Date.now() - startTime));
    const timeoutTask = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), remainingBudget);
    });

    const isSuccess = await Promise.race([thinkTask, timeoutTask]);

    if (!isSuccess) {
      game.resetTurn();
      game.drawTile();
    }
  }

  // ==============================================================
  // 1. 첫 등록(Initial Meld) 고도화
  // ==============================================================
  private static async tryInitialMeld(
    game: RummikubGame,
    player: Player,
    difficulty: BotDifficulty,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    if (Date.now() - startTime > maxAllowedMs) return false;
    // 고수 전략: 조커는 첫 등록에 쓰지 않고 아끼는 것이 정석!
    // 초급/중급/고급/최고급 모두 첫 등록 시 조커 없이 달성 가능한지 먼저 확인
    const threshold = game.initialMeldThreshold;

    let candidateSets = this.findAllValidSetsInTiles(player.hand, false);
    let bestSelection = this.findBestMeldCombination(candidateSets, threshold, difficulty);

    if (Date.now() - startTime > maxAllowedMs) return false;

    // 조커 없이 달성 불가능할 때만 고급/최고급 봇은 조커 포함 재시도 (점수가 높다면)
    if (!bestSelection && (difficulty === 'expert' || difficulty === 'master')) {
      candidateSets = this.findAllValidSetsInTiles(player.hand, true);
      bestSelection = this.findBestMeldCombination(candidateSets, threshold, difficulty);
    }

    if (bestSelection && bestSelection.length > 0) {
      const usedIds = new Set<string>();
      for (const set of bestSelection) {
        game.board.push(set);
        set.forEach((t) => usedIds.add(t.id));
      }
      player.hand = player.hand.filter((t) => !usedIds.has(t.id));
      return true;
    }

    return false;
  }

  /**
   * 세트 후보들 중에서 타일 중복 없이 기준 점수를 넘는 최적의 조합 탐색
   */
  private static findBestMeldCombination(
    candidateSets: TileSet[],
    threshold: number,
    difficulty: BotDifficulty
  ): TileSet[] | null {
    if (candidateSets.length === 0) return null;

    // 점수 높은 세트 우선 정렬
    const scoredSets = candidateSets.map((set) => {
      const valG = validateGroup(set);
      const valR = validateRun(set);
      const score = (valG.valid ? valG.score : 0) || (valR.valid ? valR.score : 0) || 0;
      return { set, score };
    });
    scoredSets.sort((a, b) => b.score - a.score);

    let bestCombination: TileSet[] | null = null;
    let bestScore = 0;

    // DFS로 겹치지 않는 세트 조합 탐색 (최대 3개 세트)
    const backtrack = (startIdx: number, currentCombo: TileSet[], currentScore: number, usedIds: Set<string>) => {
      if (currentScore >= threshold) {
        if (difficulty === 'expert' || difficulty === 'master') {
          // 고득점 타일을 최대한 털어내는 조합 선택
          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestCombination = [...currentCombo];
          }
        } else {
          // 초급/중급은 기준 점수를 넘는 첫 조합 즉시 확정
          bestCombination = [...currentCombo];
          return true;
        }
      }

      if (currentCombo.length >= 3) return false;

      for (let i = startIdx; i < Math.min(scoredSets.length, 18); i++) {
        const { set, score } = scoredSets[i];
        let overlap = false;
        for (const t of set) {
          if (usedIds.has(t.id)) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        // 선택
        for (const t of set) usedIds.add(t.id);
        currentCombo.push(set);

        const foundEarly = backtrack(i + 1, currentCombo, currentScore + score, usedIds);
        if (foundEarly) return true;

        // 원복
        currentCombo.pop();
        for (const t of set) usedIds.delete(t.id);
      }
      return false;
    };

    backtrack(0, [], 0, new Set());
    return bestCombination;
  }

  // ==============================================================
  // 2. 난이도별 플레이 로직
  // ==============================================================

  /** [초급 - 루키봇]: 단순 독립 세트 1개 및 20% 확률로 덧붙이기 시도 */
  private static async playBeginnerTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;

    // 패에서 조커 없이 완성된 순수 세트 1개 내려놓기
    const sets = this.findAllValidSetsInTiles(player.hand, false);
    if (sets.length > 0) {
      const s = sets[0];
      game.board.push(s);
      const setIds = new Set(s.map((t) => t.id));
      player.hand = player.hand.filter((t) => !setIds.has(t.id));
      played = true;
    }

    await this.yieldTick();

    // 25% 확률로만 단순 덧붙이기 시도
    if (Math.random() < 0.25 && Date.now() - startTime < maxAllowedMs) {
      if (await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
        played = true;
      }
    }

    return played;
  }

  /** [중급 - 베테랑봇]: 모든 독립 세트 배출, 조커 치환, 4장 이상 세트에서 1장 떼어오기, 적극적 덧붙이기 */
  private static async playIntermediateTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;

    // 1. 조커 치환 (간단한 형태)
    if (Date.now() - startTime < maxAllowedMs && await this.trySwapJokerAnywhere(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 2. 패에서 가능한 독립 세트 최대 배출
    if (Date.now() - startTime < maxAllowedMs) {
      if (await this.playAllIndependentSetsFromHand(game, player, true)) {
        played = true;
      }
    }
    await this.yieldTick();

    // 3. 4장 이상 세트에서 타일 1장 빌려와서 새 세트 만들기
    if (Date.now() - startTime < maxAllowedMs && await this.tryBorrowFromLargeSets(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 4. 보드 세트에 타일 덧붙이기
    while (Date.now() - startTime < maxAllowedMs && await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
      played = true;
      await this.yieldTick();
    }

    return played;
  }

  /** [고급 - 마스터봇]: 정밀 조커 치환, 1개 세트 국소 재조합(피벗/분할), 고득점 타일 우선 배출 */
  private static async playExpertTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;

    // 1. 전방위 조커 치환 및 즉시 콤보 배출
    if (Date.now() - startTime < maxAllowedMs && await this.trySwapJokerAnywhere(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 2. 국소 보드 재조합 (단일 세트 + 내 패)
    if (Date.now() - startTime < maxAllowedMs && await this.tryLocalBoardRecombination(game, player, 1, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 3. 4장 이상 세트에서 빌려오기
    if (Date.now() - startTime < maxAllowedMs && await this.tryBorrowFromLargeSets(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 4. 패에서 독립 세트 최적 배출 (고득점 타일 우선)
    if (Date.now() - startTime < maxAllowedMs && await this.playAllIndependentSetsFromHand(game, player, true, true)) {
      played = true;
    }
    await this.yieldTick();

    // 5. 덧붙이기 (반복)
    while (Date.now() - startTime < maxAllowedMs && await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
      played = true;
      await this.yieldTick();
    }

    return played;
  }

  /**
   * [최고급 - 알파봇 (Grandmaster)]:
   * - 2개 세트 동시 융합 다중 재조합(Multi-Set Complex Recombination)
   * - 연쇄 조작 루프(Chaining Loop): 패를 털어낸 후 바뀐 보드를 바탕으로 또 다시 탐색
   * - 전략적 조커 보존 (상대 패가 적을 때 상대에게 주는 판 깔아주기 방지)
   * - 패배 시 감점을 줄이기 위한 고득점 타일(10~13) 최우선 소진
   */
  private static async playMasterTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;
    let roundProgress = true;
    let iterations = 0;

    // 상대방 중 타일 수가 3장 이하인 위험한 플레이어가 있는지 확인 (수비 전략)
    const opponentInDanger = game.players.some((p) => p.id !== player.id && p.hand.length <= 3);

    while (roundProgress && iterations < 4 && Date.now() - startTime < maxAllowedMs) {
      roundProgress = false;
      iterations++;
      await this.yieldTick();

      // Step 1: 조커 치환 및 즉시 활용
      if (Date.now() - startTime < maxAllowedMs) {
        if (await this.trySwapJokerAnywhere(game, player, startTime, maxAllowedMs)) {
          played = true;
          roundProgress = true;
        }
      }

      // Step 2: 2개 세트 동시 융합 다중 재조합 (고난도 피벗 & 런 재분할)
      if (Date.now() - startTime < maxAllowedMs) {
        if (await this.tryLocalBoardRecombination(game, player, 2, startTime, maxAllowedMs)) {
          played = true;
          roundProgress = true;
        }
      }

      // Step 3: 독립 세트 배출 (고득점 우선, 조커 방어)
      if (Date.now() - startTime < maxAllowedMs) {
        // 상대가 곧 끝날 위험이 있을 때는 내 손의 조커를 함부로 보드에 풀지 않고 킵
        const allowJoker = !opponentInDanger || player.hand.length <= 2;
        if (await this.playAllIndependentSetsFromHand(game, player, allowJoker, true)) {
          played = true;
          roundProgress = true;
        }
      }

      // Step 4: 덧붙이기 (모든 패 검사)
      while (Date.now() - startTime < maxAllowedMs && await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
        played = true;
        roundProgress = true;
        await this.yieldTick();
      }
    }

    return played;
  }

  // ==============================================================
  // 3. 고수 핵심 무기: 국소 보드 재조합 엔진 (Board Recombination)
  // ==============================================================

  /**
   * 보드의 세트 N개(1~2개)와 봇 손패의 관련 타일들을 모아서,
   * 보드 타일을 100% 소비하면서 봇의 타일을 1장 이상 추가로 털어내는 새 세트 구성을 탐색!
   */
  private static async tryLocalBoardRecombination(
    game: RummikubGame,
    player: Player,
    maxSetsToCombine: number = 1,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;
    if (game.board.length === 0 || player.hand.length === 0) return false;

    // 1세트 대상 재조합 먼저 탐색
    for (let sIdx = 0; sIdx < game.board.length; sIdx++) {
      if (startTime && Date.now() - startTime > limit) break;
      if (sIdx % 4 === 0) await this.yieldTick();

      const targetSet = game.board[sIdx];
      const solution = this.solvePartitionWithHand(targetSet, player.hand);

      if (solution && solution.usedHandTiles.length > 0) {
        // 보드에서 기존 세트 교체 및 새 세트 추가
        game.board.splice(sIdx, 1, ...solution.newSets);
        const usedHandIds = new Set(solution.usedHandTiles.map((t) => t.id));
        player.hand = player.hand.filter((t) => !usedHandIds.has(t.id));
        return true;
      }
    }

    // 2세트 대상 다중 재조합 (maxSetsToCombine >= 2)
    if (maxSetsToCombine >= 2 && game.board.length >= 2) {
      for (let i = 0; i < game.board.length - 1; i++) {
        if (startTime && Date.now() - startTime > limit) break;
        await this.yieldTick();

        for (let j = i + 1; j < game.board.length; j++) {
          if (startTime && Date.now() - startTime > limit) break;

          const combinedBoardTiles = [...game.board[i], ...game.board[j]];
          // 풀이 너무 크면 탐색 지연 방지를 위해 건너뜀 (최대 10장)
          if (combinedBoardTiles.length > 10) continue;

          const solution = this.solvePartitionWithHand(combinedBoardTiles, player.hand);
          if (solution && solution.usedHandTiles.length > 0) {
            // 두 세트 제거 후 새 세트들 삽입
            game.board.splice(j, 1);
            game.board.splice(i, 1, ...solution.newSets);
            const usedHandIds = new Set(solution.usedHandTiles.map((t) => t.id));
            player.hand = player.hand.filter((t) => !usedHandIds.has(t.id));
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 주어진 보드 타일들과 손패에서,
   * 보드 타일이 100% 소비되고 손패 타일이 1장 이상 소비되는 유효 세트 분할(Partition) 탐색
   */
  private static solvePartitionWithHand(
    boardTiles: Tile[],
    hand: Tile[]
  ): { newSets: TileSet[]; usedHandTiles: Tile[] } | null {
    const requiredBoardIds = new Set(boardTiles.map((t) => t.id));

    // 보드 타일과 연관성이 있는 핸드 타일만 필터링하여 풀 구성 (탐색 폭발 방지)
    const boardValues = new Set(boardTiles.map((t) => t.value));
    const boardColors = new Set(boardTiles.map((t) => t.color));

    const relevantHandTiles = hand.filter((h) => {
      if (h.isJoker) return true;
      // 같은 숫자이거나, 같은 색상에서 인접한(±2) 숫자
      if (boardValues.has(h.value)) return true;
      if (boardColors.has(h.color)) {
        return boardTiles.some((b) => b.color === h.color && Math.abs(b.value - h.value) <= 2);
      }
      return false;
    });

    if (relevantHandTiles.length === 0) return null;

    // 최대 7장까지만 핸드 타일 사용 제한
    const limitedHand = relevantHandTiles.slice(0, 7);
    const pool = [...boardTiles, ...limitedHand];

    // 풀에서 생성 가능한 모든 세트 후보 도출
    const candidates = this.findAllValidSetsInTiles(pool, true);
    if (candidates.length === 0) return null;

    let bestSolution: { newSets: TileSet[]; usedHandTiles: Tile[] } | null = null;
    let maxHandUsed = 0;

    // 백트래킹(DFS)으로 보드 타일 100% 커버 조합 탐색
    const search = (
      startIdx: number,
      chosenSets: TileSet[],
      coveredBoardIds: Set<string>,
      usedPoolIds: Set<string>
    ) => {
      // 모든 보드 타일이 포함되었는가?
      if (coveredBoardIds.size === requiredBoardIds.size) {
        // 손패 타일 몇 장 쓰였는지 계산
        const usedHand = limitedHand.filter((h) => usedPoolIds.has(h.id));
        if (usedHand.length > maxHandUsed) {
          maxHandUsed = usedHand.length;
          bestSolution = {
            newSets: chosenSets.map((s) => [...s]),
            usedHandTiles: usedHand,
          };
        }
        return;
      }

      if (chosenSets.length >= 4) return;

      for (let i = startIdx; i < candidates.length; i++) {
        const cand = candidates[i];
        let hasConflict = false;
        let coversAnyBoard = false;

        for (const t of cand) {
          if (usedPoolIds.has(t.id)) {
            hasConflict = true;
            break;
          }
          if (requiredBoardIds.has(t.id)) {
            coversAnyBoard = true;
          }
        }

        if (hasConflict || !coversAnyBoard) continue;

        // 선택
        const newlyCovered: string[] = [];
        for (const t of cand) {
          usedPoolIds.add(t.id);
          if (requiredBoardIds.has(t.id) && !coveredBoardIds.has(t.id)) {
            coveredBoardIds.add(t.id);
            newlyCovered.push(t.id);
          }
        }
        chosenSets.push(cand);

        search(i + 1, chosenSets, coveredBoardIds, usedPoolIds);

        // 원복
        chosenSets.pop();
        for (const id of newlyCovered) coveredBoardIds.delete(id);
        for (const t of cand) usedPoolIds.delete(t.id);
      }
    };

    search(0, [], new Set(), new Set());
    return bestSolution;
  }

  // ==============================================================
  // 4. 전방위 조커 치환 및 즉시 콤보 회수 (Joker Substitution)
  // ==============================================================
  private static async trySwapJokerAnywhere(
    game: RummikubGame,
    player: Player,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;

    for (let sIdx = 0; sIdx < game.board.length; sIdx++) {
      if (startTime && Date.now() - startTime > limit) break;
      if (sIdx % 4 === 0) await this.yieldTick();

      const set = game.board[sIdx];
      const jokerIdx = set.findIndex((t) => t.isJoker);
      if (jokerIdx === -1) continue;

      const jokerTile = set[jokerIdx];
      const normalTiles = set.filter((t) => !t.isJoker);
      if (normalTiles.length < 2) continue;

      // Case A: 그룹에서 조커 치환
      const isGroup = normalTiles.every((t) => t.value === normalTiles[0].value);
      if (isGroup) {
        const targetVal = normalTiles[0].value;
        const usedColors = new Set(normalTiles.map((t) => t.color));
        const allColors: TileColor[] = ['black', 'blue', 'red', 'yellow'];
        const missingColors = allColors.filter((c) => !usedColors.has(c));

        for (const mColor of missingColors) {
          const handIdx = player.hand.findIndex((t) => !t.isJoker && t.color === mColor && t.value === targetVal);
          if (handIdx !== -1) {
            const myTile = player.hand.splice(handIdx, 1)[0];
            set[jokerIdx] = myTile;
            player.hand.push(jokerTile);

            // 회수한 조커로 새 세트 형성 시도
            const newSets = this.findAllValidSetsInTiles(player.hand, true);
            const usingJoker = newSets.find((s) => s.some((t) => t.id === jokerTile.id));
            if (usingJoker) {
              game.board.push(usingJoker);
              const usedIds = new Set(usingJoker.map((t) => t.id));
              player.hand = player.hand.filter((t) => !usedIds.has(t.id));
              return true;
            } else {
              // 롤백
              set[jokerIdx] = jokerTile;
              player.hand.pop();
              player.hand.push(myTile);
            }
          }
        }
      }

      // Case B: 런에서 조커 치환
      const runRes = validateRun(set);
      if (runRes.valid) {
        // 조커가 대체하는 정확한 가상 숫자와 색상 계산
        const targetColor = normalTiles[0].color;
        let targetValue = -1;

        if (jokerIdx > 0) {
          const prev = set[jokerIdx - 1];
          if (!prev.isJoker) targetValue = prev.value + 1;
        } else if (jokerIdx < set.length - 1) {
          const next = set[jokerIdx + 1];
          if (!next.isJoker) targetValue = next.value - 1;
        }

        if (targetValue >= 1 && targetValue <= 13) {
          const handIdx = player.hand.findIndex((t) => !t.isJoker && t.color === targetColor && t.value === targetValue);
          if (handIdx !== -1) {
            const myTile = player.hand.splice(handIdx, 1)[0];
            set[jokerIdx] = myTile;
            player.hand.push(jokerTile);

            const newSets = this.findAllValidSetsInTiles(player.hand, true);
            const usingJoker = newSets.find((s) => s.some((t) => t.id === jokerTile.id));
            if (usingJoker) {
              game.board.push(usingJoker);
              const usedIds = new Set(usingJoker.map((t) => t.id));
              player.hand = player.hand.filter((t) => !usedIds.has(t.id));
              return true;
            } else {
              // 롤백
              set[jokerIdx] = jokerTile;
              player.hand.pop();
              player.hand.push(myTile);
            }
          }
        }
      }
    }

    return false;
  }

  // ==============================================================
  // 5. 4장 이상 세트에서 타일 떼어오기 (Borrowing)
  // ==============================================================
  private static async tryBorrowFromLargeSets(
    game: RummikubGame,
    player: Player,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;

    for (let sIdx = 0; sIdx < game.board.length; sIdx++) {
      if (startTime && Date.now() - startTime > limit) break;
      if (sIdx % 4 === 0) await this.yieldTick();

      const set = game.board[sIdx];
      if (set.length < 4) continue;

      // 1. 그룹인 경우 (어떤 타일이든 1장 떼어내도 남은 3장 유효)
      if (validateGroup(set).valid) {
        for (let i = 0; i < set.length; i++) {
          const borrowed = set.splice(i, 1)[0];
          const testHand = [borrowed, ...player.hand];
          const sets = this.findAllValidSetsInTiles(testHand, true);
          const usingBorrowed = sets.find((s) => s.some((t) => t.id === borrowed.id));

          if (usingBorrowed) {
            game.board.push(usingBorrowed);
            const usedInSet = new Set(usingBorrowed.map((t) => t.id));
            usedInSet.delete(borrowed.id);
            player.hand = player.hand.filter((t) => !usedInSet.has(t.id));
            return true;
          }
          set.splice(i, 0, borrowed); // 원복
        }
      }

      // 2. 런인 경우 (양 끝 타일 1장 떼어내기)
      if (validateRun(set).valid) {
        // 첫 번째 타일
        const first = set.shift()!;
        if (validateRun(set).valid) {
          const testHand = [first, ...player.hand];
          const sets = this.findAllValidSetsInTiles(testHand, true);
          const usingFirst = sets.find((s) => s.some((t) => t.id === first.id));
          if (usingFirst) {
            game.board.push(usingFirst);
            const used = new Set(usingFirst.map((t) => t.id));
            used.delete(first.id);
            player.hand = player.hand.filter((t) => !used.has(t.id));
            return true;
          }
        }
        set.unshift(first);

        // 마지막 타일
        const last = set.pop()!;
        if (validateRun(set).valid) {
          const testHand = [last, ...player.hand];
          const sets = this.findAllValidSetsInTiles(testHand, true);
          const usingLast = sets.find((s) => s.some((t) => t.id === last.id));
          if (usingLast) {
            game.board.push(usingLast);
            const used = new Set(usingLast.map((t) => t.id));
            used.delete(last.id);
            player.hand = player.hand.filter((t) => !used.has(t.id));
            return true;
          }
        }
        set.push(last);
      }
    }

    return false;
  }

  // ==============================================================
  // 6. 보드 세트에 1장 앞/뒤 덧붙이기 (Append)
  // ==============================================================
  private static async tryAppendToExistingSets(
    game: RummikubGame,
    player: Player,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;
    let attachedAny = false;

    // 패를 고득점 타일부터 검사하여 감점 줄이기
    const sortedHandIndices = player.hand
      .map((t, idx) => ({ t, idx }))
      .sort((a, b) => (b.t.isJoker ? 20 : b.t.value) - (a.t.isJoker ? 20 : a.t.value));

    for (const item of sortedHandIndices) {
      if (startTime && Date.now() - startTime > limit) break;
      const tile = item.t;
      const currentIdx = player.hand.findIndex((h) => h.id === tile.id);
      if (currentIdx === -1) continue;

      for (const set of game.board) {
        if (startTime && Date.now() - startTime > limit) break;

        // 1. 뒤에 덧붙이기
        set.push(tile);
        if (validateTileSet(set).valid) {
          player.hand.splice(currentIdx, 1);
          attachedAny = true;
          break;
        }
        set.pop();

        // 2. 앞에 덧붙이기
        set.unshift(tile);
        if (validateTileSet(set).valid) {
          player.hand.splice(currentIdx, 1);
          attachedAny = true;
          break;
        }
        set.shift();
      }
    }

    return attachedAny;
  }

  // ==============================================================
  // 7. 손패에서 가능한 모든 독립 세트 배출
  // ==============================================================
  private static async playAllIndependentSetsFromHand(
    game: RummikubGame,
    player: Player,
    allowJoker: boolean = true,
    prioritizeHighValues: boolean = false
  ): Promise<boolean> {
    const candidates = this.findAllValidSetsInTiles(player.hand, allowJoker);
    if (candidates.length === 0) return false;

    // 최대 겹치지 않는 세트 선택
    const scored = candidates.map((set) => {
      const sum = set.reduce((acc, t) => acc + (t.isJoker ? 10 : t.value), 0);
      return { set, score: sum };
    });

    if (prioritizeHighValues) {
      scored.sort((a, b) => b.score - a.score);
    } else {
      scored.sort((a, b) => b.set.length - a.set.length);
    }

    let played = false;
    const usedIds = new Set<string>();

    for (const item of scored) {
      const hasConflict = item.set.some((t) => usedIds.has(t.id));
      if (!hasConflict) {
        game.board.push(item.set);
        item.set.forEach((t) => usedIds.add(t.id));
        played = true;
      }
    }

    if (played) {
      player.hand = player.hand.filter((t) => !usedIds.has(t.id));
    }

    return played;
  }

  // ==============================================================
  // 8. 완전 세트 생성기 (Complete Set Generator with Jokers)
  // ==============================================================

  /**
   * 주어진 타일들로부터 형성 가능한 모든 유효한 세트(런, 그룹)를 전수 탐색하여 반환
   */
  public static findAllValidSetsInTiles(tiles: Tile[], allowJoker: boolean = true): TileSet[] {
    const results: TileSet[] = [];
    const jokers = allowJoker ? tiles.filter((t) => t.isJoker) : [];

    // --- 1. 그룹(Group) 생성 ---
    const byValue = new Map<number, Tile[]>();
    for (const t of tiles) {
      if (!t.isJoker) {
        if (!byValue.has(t.value)) byValue.set(t.value, []);
        byValue.get(t.value)!.push(t);
      }
    }

    byValue.forEach((valTiles) => {
      // 색상별 대표 타일 1장씩 (중복 색상 제외)
      const colorMap = new Map<TileColor, Tile>();
      for (const t of valTiles) {
        if (t.color !== 'joker' && !colorMap.has(t.color as TileColor)) {
          colorMap.set(t.color as TileColor, t);
        }
      }

      const uniqueColorTiles = Array.from(colorMap.values());
      const uCount = uniqueColorTiles.length;

      // 1-1. 순수 3색, 4색 그룹
      if (uCount >= 3) {
        // 3장 그룹 (조합 nC3)
        if (uCount === 3) {
          results.push([...uniqueColorTiles]);
        } else if (uCount === 4) {
          results.push([...uniqueColorTiles]); // 4장 전체
          // 4장 중 3장씩 4개 조합
          for (let skip = 0; skip < 4; skip++) {
            results.push(uniqueColorTiles.filter((_, idx) => idx !== skip));
          }
        }
      }

      // 1-2. 조커 1개 포함 그룹
      if (allowJoker && jokers.length >= 1) {
        const joker = jokers[0];
        // 2색 + 조커 1개 = 3장 그룹
        if (uCount >= 2) {
          for (let i = 0; i < uCount - 1; i++) {
            for (let j = i + 1; j < uCount; j++) {
              results.push([uniqueColorTiles[i], uniqueColorTiles[j], joker]);
            }
          }
        }
        // 3색 + 조커 1개 = 4장 그룹
        if (uCount >= 3) {
          results.push([...uniqueColorTiles.slice(0, 3), joker]);
        }
      }

      // 1-3. 조커 2개 포함 그룹 (2색 + 조커 2개 = 4장 그룹)
      if (allowJoker && jokers.length >= 2 && uCount >= 2) {
        results.push([uniqueColorTiles[0], uniqueColorTiles[1], jokers[0], jokers[1]]);
      }
    });

    // --- 2. 런(Run) 생성 ---
    const colors: TileColor[] = ['black', 'blue', 'red', 'yellow'];

    for (const c of colors) {
      const colorTiles = tiles.filter((t) => t.color === c);
      if (colorTiles.length === 0) continue;

      // 숫자별 타일 맵
      const tileByNum = new Map<number, Tile>();
      for (const t of colorTiles) {
        if (!tileByNum.has(t.value)) tileByNum.set(t.value, t);
      }

      // 가능한 모든 길이 L (3 ~ 8)의 런 탐색
      for (let L = 3; L <= 8; L++) {
        for (let start = 1; start <= 14 - L; start++) {
          const end = start + L - 1;
          const neededNormalTiles: Tile[] = [];
          let missingCount = 0;

          for (let v = start; v <= end; v++) {
            const found = tileByNum.get(v);
            if (found) {
              neededNormalTiles.push(found);
            } else {
              missingCount++;
            }
          }

          if (missingCount === 0) {
            // 순수 런 완성
            results.push([...neededNormalTiles]);
          } else if (allowJoker && missingCount <= jokers.length && neededNormalTiles.length >= 1) {
            // 조커로 메운 런 완성
            const runWithJokers: Tile[] = [];
            let jokerUsed = 0;
            for (let v = start; v <= end; v++) {
              const found = tileByNum.get(v);
              if (found) {
                runWithJokers.push(found);
              } else {
                runWithJokers.push(jokers[jokerUsed++]);
              }
            }
            results.push(runWithJokers);
          }
        }
      }
    }

    return results;
  }
}
