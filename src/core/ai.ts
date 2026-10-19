import { Tile, TileSet, Player, BotDifficulty } from './types.ts';
import { RummikubGame } from './game.ts';
import { validateGroup, validateRun, validateTileSet } from './validator.ts';

/**
 * 루미큐브 봇(AI) 플레이어: 초급, 중급, 고급 난이도별 지능형 알고리즘
 */
export class RummikubAI {
  /** 난이도별 최적 제한 시간 (모든 등급이 30초 이내에 완료되도록 보장) */
  static readonly DIFFICULTY_TIMEOUT_MS: Record<BotDifficulty, number> = {
    beginner: 3000,      // 초급: 최대 3초 (스피디한 진행)
    intermediate: 6000,  // 중급: 최대 6초
    expert: 12000,       // 고급: 최대 12초
    master: 20000,       // 최고급: 최대 20초 (30초 절대 초과 방지)
  };

  /** 절대 하드 리밋: 25초 */
  static readonly MAX_HARD_TIMEOUT_MS = 25000;

  static getTimeoutForDifficulty(difficulty: BotDifficulty = 'intermediate'): number {
    return this.DIFFICULTY_TIMEOUT_MS[difficulty] || 10000;
  }

  /** 메인 스레드 블로킹 방지를 위한 비동기 틱 양보 (UI 및 타이머 반응성 보장) */
  private static async yieldTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  static async playTurn(game: RummikubGame, player: Player): Promise<void> {
    if (!player.isAi) return;

    const difficulty: BotDifficulty = player.difficulty || 'intermediate';
    const startTime = Date.now();
    const maxAllowedMs = Math.min(this.getTimeoutForDifficulty(difficulty), this.MAX_HARD_TIMEOUT_MS);

    // 난이도별 자연스러운 생각 연출 딜레이
    const thinkDelay =
      difficulty === 'beginner'
        ? 500
        : difficulty === 'intermediate'
        ? 800
        : difficulty === 'expert'
        ? 1000
        : 1200;
    await new Promise((resolve) => setTimeout(resolve, thinkDelay));

    // 비동기 태스크와 엄격한 타임아웃 레이스 실행
    const thinkTask = (async () => {
      await this.yieldTick();

      if (!player.hasInitialMeld) {
        // 1. 첫 등록(Initial Meld) 30점 이상 시도
        const success = await this.tryInitialMeld(game, player, difficulty, startTime, maxAllowedMs);
        if (success) {
          const endResult = game.endTurn();
          if (endResult.success) return true;
          game.resetTurn();
        }
      } else {
        // 2. 이미 등록 완료된 경우: 난이도별 보드 조작 및 타일 배출 수행
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
      // 제한 시간 초과 또는 낼 수가 없는 경우: 안전하게 롤백 후 1장 드로우(Pass)
      game.resetTurn();
      game.drawTile();
    }
  }

  // ==============================================================
  // 1. 첫 등록(30점 이상) 시도
  // ==============================================================
  private static async tryInitialMeld(
    game: RummikubGame,
    player: Player,
    difficulty: BotDifficulty,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    const allowJoker = difficulty !== 'beginner'; // 초급은 조커를 첫 등록에 쓰지 않음
    const candidates = this.findIndependentSets(player.hand, allowJoker);
    if (candidates.length === 0) return false;

    // 세트들의 부분집합 중 타일 중복 없이 합계 30점 이상인 조합 탐색
    const subsets = this.getSubsets(candidates);

    let bestSubset: TileSet[] | null = null;
    let bestScore = 0;

    for (let idx = 0; idx < subsets.length; idx++) {
      if (Date.now() - startTime > maxAllowedMs) break;
      if (idx % 20 === 0) await this.yieldTick();

      const subset = subsets[idx];
      const usedIds = new Set<string>();
      let hasConflict = false;
      let totalScore = 0;

      for (const set of subset) {
        const resG = validateGroup(set);
        const resR = validateRun(set);
        const score = (resG.valid ? resG.score : 0) || (resR.valid ? resR.score : 0) || 0;
        totalScore += score;

        for (const t of set) {
          if (usedIds.has(t.id)) hasConflict = true;
          usedIds.add(t.id);
        }
      }

      if (!hasConflict && totalScore >= game.initialMeldThreshold) {
        if (difficulty === 'expert' || difficulty === 'master') {
          // 고급/최고급: 높은 점수의 타일을 우선적으로 털어내는 조합 선택
          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestSubset = subset;
          }
        } else {
          // 초급/중급: 기준 점수를 넘는 첫 번째 조합 즉시 선택
          bestSubset = subset;
          break;
        }
      }
    }

    if (bestSubset) {
      const usedIds = new Set<string>();
      for (const set of bestSubset) {
        game.board.push(set);
        set.forEach((t) => usedIds.add(t.id));
      }
      player.hand = player.hand.filter((t) => !usedIds.has(t.id));
      return true;
    }

    return false;
  }

  // ==============================================================
  // 2. 난이도별 플레이 로직
  // ==============================================================

  /**
   * [초급 - 루키봇]:
   * - 패에서 완성된 순수 세트(3장 이상) 내려놓기
   * - 기존 보드 세트에 1장 붙이기는 40% 확률로만 시도 (초보적 실수)
   */
  private static async playBeginnerTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;

    // 패에서 독립 세트 내려놓기
    const sets = this.findIndependentSets(player.hand, false);
    if (sets.length > 0) {
      for (const s of sets) {
        if (Date.now() - startTime > maxAllowedMs) break;
        game.board.push(s);
        const setIds = new Set(s.map((t) => t.id));
        player.hand = player.hand.filter((t) => !setIds.has(t.id));
        played = true;
      }
    }

    await this.yieldTick();

    // 기존 세트에 1장 붙이기 (40% 확률)
    if (Math.random() < 0.4 && Date.now() - startTime < maxAllowedMs) {
      if (await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
        played = true;
      }
    }

    return played;
  }

  /**
   * [중급 - 베테랑봇]:
   * - 패에서 가능한 모든 독립 세트 100% 내려놓기
   * - 보드 세트에 타일 적극적 덧붙이기 (1~2장 연속)
   * - 4장 이상 세트에서 1장 떼어내어 내 패와 결합해 새 세트 만들기 (Borrowing)
   */
  private static async playIntermediateTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;

    // 1. 패에서 독립 세트 모두 내기
    const sets = this.findIndependentSets(player.hand, true);
    for (const s of sets) {
      if (Date.now() - startTime > maxAllowedMs) break;
      game.board.push(s);
      const setIds = new Set(s.map((t) => t.id));
      player.hand = player.hand.filter((t) => !setIds.has(t.id));
      played = true;
    }

    await this.yieldTick();

    // 2. 보드 세트에 타일 덧붙이기
    if (Date.now() - startTime < maxAllowedMs && await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
      played = true;
    }

    await this.yieldTick();

    // 3. 4장 이상인 세트에서 타일 1장 빌려와서 새 세트 만들기
    if (Date.now() - startTime < maxAllowedMs && await this.tryBorrowFromLargeSets(game, player, startTime, maxAllowedMs)) {
      played = true;
    }

    return played;
  }

  /**
   * [고급 - 마스터봇]:
   * - 중급의 모든 전략 완벽 수행
   * - 보드의 조커를 내 패의 타일로 교체(치환)하여 조커 회수 후 새 세트 배출
   * - 5장 이상 런 분할(Run Splitting)로 내 패의 타일 끼워넣기
   * - 턴당 최대한 많은 타일을 소진할 수 있는 최적 수 탐색
   */
  private static async playExpertTurn(
    game: RummikubGame,
    player: Player,
    startTime: number,
    maxAllowedMs: number
  ): Promise<boolean> {
    let played = false;

    // 1. 조커 치환 및 회수 시도
    if (Date.now() - startTime < maxAllowedMs && await this.trySwapJoker(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 2. 5장 이상 런 쪼개기(Run Splitting) 시도
    if (Date.now() - startTime < maxAllowedMs && await this.trySplitRuns(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 3. 4장 이상 세트에서 빌려와 새 세트 만들기
    if (Date.now() - startTime < maxAllowedMs && await this.tryBorrowFromLargeSets(game, player, startTime, maxAllowedMs)) {
      played = true;
    }
    await this.yieldTick();

    // 4. 패에서 독립 세트 모두 내기
    const sets = this.findIndependentSets(player.hand, true);
    for (const s of sets) {
      if (Date.now() - startTime > maxAllowedMs) break;
      game.board.push(s);
      const setIds = new Set(s.map((t) => t.id));
      player.hand = player.hand.filter((t) => !setIds.has(t.id));
      played = true;
    }

    // 5. 보드 세트에 타일 덧붙이기 (반복 수행하여 붙일 수 있는 만큼 최대한 붙임)
    while (Date.now() - startTime < maxAllowedMs && await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
      played = true;
      await this.yieldTick();
    }

    return played;
  }

  /**
   * [최고급 - 알파봇]:
   * - 고급의 모든 전략(조커 치환/회수, 5장 이상 런 분할, 세트 떼어내기, 독립 세트, 덧붙이기) 총동원
   * - 연쇄 루프 탐색(Chained Manipulation Loop): 한 번의 수로 보드가 변경되면 다음 기회가 열리므로 반복 재탐색
   * - 고득점 타일 우선 배출 (점수 최적화 및 패배 시 페널티 최소화)
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

    // 최대 4회 반복 루프로 연쇄 수 탐색 (타임아웃 한도 이내 유지)
    while (roundProgress && iterations < 4 && Date.now() - startTime < maxAllowedMs) {
      roundProgress = false;
      iterations++;
      await this.yieldTick();

      // 1. 조커 치환 및 회수 시도
      if (Date.now() - startTime < maxAllowedMs && await this.trySwapJoker(game, player, startTime, maxAllowedMs)) {
        played = true;
        roundProgress = true;
      }

      // 2. 5장 이상 런 분할(Run Splitting)
      if (Date.now() - startTime < maxAllowedMs && await this.trySplitRuns(game, player, startTime, maxAllowedMs)) {
        played = true;
        roundProgress = true;
      }

      // 3. 4장 이상 세트에서 빌려와 새 세트 만들기
      if (Date.now() - startTime < maxAllowedMs && await this.tryBorrowFromLargeSets(game, player, startTime, maxAllowedMs)) {
        played = true;
        roundProgress = true;
      }

      // 4. 고득점 독립 세트 모두 배출
      if (Date.now() - startTime < maxAllowedMs) {
        const sets = this.findIndependentSets(player.hand, true);
        sets.sort((a, b) => {
          const sumA = a.reduce((sum, t) => sum + (t.isJoker ? 10 : t.value), 0);
          const sumB = b.reduce((sum, t) => sum + (t.isJoker ? 10 : t.value), 0);
          return sumB - sumA;
        });
        for (const s of sets) {
          if (Date.now() - startTime > maxAllowedMs) break;
          game.board.push(s);
          const setIds = new Set(s.map((t) => t.id));
          player.hand = player.hand.filter((t) => !setIds.has(t.id));
          played = true;
          roundProgress = true;
        }
      }

      // 5. 보드 세트에 타일 덧붙이기 (가능한 모든 타일 끝까지 소진)
      while (Date.now() - startTime < maxAllowedMs && await this.tryAppendToExistingSets(game, player, startTime, maxAllowedMs)) {
        played = true;
        roundProgress = true;
        await this.yieldTick();
      }
    }

    return played;
  }

  // ==============================================================
  // 3. 고급 루미큐브 전략 알고리즘 상세 구현
  // ==============================================================

  /**
   * [보드 조커 치환 및 회수 (Joker Substitution)]
   * 보드 세트에 조커가 있을 때, 그 조커가 대체하고 있는 실제 타일을 내 패에서 내고
   * 조커를 회수하여, 내 패의 남은 타일과 함께 새로운 세트를 구성해 내려놓음.
   */
  private static async trySwapJoker(
    game: RummikubGame,
    player: Player,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;

    for (let sIdx = 0; sIdx < game.board.length; sIdx++) {
      if (startTime && Date.now() - startTime > limit) break;
      if (sIdx % 5 === 0) await this.yieldTick();

      const set = game.board[sIdx];
      const jokerIdx = set.findIndex((t) => t.isJoker);
      if (jokerIdx === -1) continue;

      // 그룹에서 조커가 대체하는 색상 확인
      const normalTiles = set.filter((t) => !t.isJoker);
      if (normalTiles.length < 2) continue;

      const isGroup = normalTiles.every((t) => t.value === normalTiles[0].value);
      if (isGroup) {
        const targetVal = normalTiles[0].value;
        const usedColors = new Set(normalTiles.map((t) => t.color));
        const allColors: Array<'black' | 'blue' | 'red' | 'yellow'> = ['black', 'blue', 'red', 'yellow'];
        const missingColors = allColors.filter((c) => !usedColors.has(c));

        // 내 패에 빠진 색상의 해당 숫자 타일이 있는지 확인
        for (const missingColor of missingColors) {
          if (startTime && Date.now() - startTime > limit) break;
          const handTileIdx = player.hand.findIndex((t) => !t.isJoker && t.color === missingColor && t.value === targetVal);
          if (handTileIdx !== -1) {
            const myTile = player.hand.splice(handTileIdx, 1)[0];
            const jokerTile = set[jokerIdx];

            // 조커와 교체
            set[jokerIdx] = myTile;

            // 회수한 조커를 내 패에 넣고 새로운 세트를 만들 수 있는지 확인
            player.hand.push(jokerTile);
            const newSets = this.findIndependentSets(player.hand, true);
            if (newSets.length > 0) {
              for (const ns of newSets) {
                game.board.push(ns);
                const nsIds = new Set(ns.map((t) => t.id));
                player.hand = player.hand.filter((t) => !nsIds.has(t.id));
              }
              return true;
            } else {
              // 조커를 이용해 새 세트를 못 만들면 롤백
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

  /**
   * [5장 이상 런 분할 (Run Splitting)]
   * 예: [빨3, 빨4, 빨5, 빨6, 빨7] (5장)에 내 패의 [빨5]를 결합하여
   * [빨3, 빨4, 빨5] (3장) + [빨5, 빨6, 빨7] (3장) 두 개의 유효한 런으로 분할!
   */
  private static async trySplitRuns(
    game: RummikubGame,
    player: Player,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;

    for (let sIdx = 0; sIdx < game.board.length; sIdx++) {
      if (startTime && Date.now() - startTime > limit) break;
      if (sIdx % 5 === 0) await this.yieldTick();

      const set = game.board[sIdx];
      const runRes = validateRun(set);
      if (!runRes.valid || set.length < 5) continue;

      // 일반 타일 색상
      const normal = set.filter((t) => !t.isJoker);
      if (normal.length === 0) continue;
      const color = normal[0].color;

      // 런 내에서 분할점 i (최소 3장, 남은 것도 최소 3장)
      for (let splitAfter = 2; splitAfter < set.length - 2; splitAfter++) {
        if (startTime && Date.now() - startTime > limit) break;
        const rightVal = set[splitAfter + 1].value; // 오른쪽 런의 시작 값

        // 만약 내 패에 rightVal - 1이 있다면 런 분할 가능!
        const neededVal = rightVal - 1;
        const handIdx = player.hand.findIndex((t) => !t.isJoker && t.color === color && t.value === neededVal);

        if (handIdx !== -1) {
          const myTile = player.hand.splice(handIdx, 1)[0];
          const leftRun = set.slice(0, splitAfter + 1);
          const rightRun = [myTile, ...set.slice(splitAfter + 1)];

          if (validateRun(leftRun).valid && validateRun(rightRun).valid) {
            game.board.splice(sIdx, 1, leftRun, rightRun);
            return true;
          } else {
            player.hand.push(myTile); // 롤백
          }
        }
      }
    }
    return false;
  }

  /**
   * [4장 이상 세트에서 1장 떼어와서 내 패와 결합 (Borrowing)]
   * - 4장 그룹에서 1장 떼어가도 남은 3장은 유효
   * - 4장 이상 런의 양끝 타일 1장 떼어가도 남은 세트는 유효
   */
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

      // 1. 그룹인 경우 (어떤 색상이든 1장 떼어가도 됨)
      const groupRes = validateGroup(set);
      if (groupRes.valid) {
        for (let i = 0; i < set.length; i++) {
          if (startTime && Date.now() - startTime > limit) break;
          const borrowedTile = set.splice(i, 1)[0];

          // 떼어낸 타일 + 내 패 타일들로 새 세트가 만들어지는지 확인
          const testHand = [borrowedTile, ...player.hand];
          const newSets = this.findIndependentSets(testHand, true);
          const setUsingBorrowed = newSets.find((s) => s.some((t) => t.id === borrowedTile.id));

          if (setUsingBorrowed) {
            // 성공! 보드에 새 세트 추가하고 패에서 낸 타일들 제거
            game.board.push(setUsingBorrowed);
            const usedInNewSet = new Set(setUsingBorrowed.map((t) => t.id));
            usedInNewSet.delete(borrowedTile.id);
            player.hand = player.hand.filter((t) => !usedInNewSet.has(t.id));
            return true;
          }

          // 실패 시 원상복구
          set.splice(i, 0, borrowedTile);
        }
      }

      // 2. 런인 경우 (양 끝 타일 1장 떼어가기)
      const runRes = validateRun(set);
      if (runRes.valid) {
        // 첫 번째 타일 떼어가기
        const firstTile = set.shift()!;
        if (validateRun(set).valid) {
          const testHand = [firstTile, ...player.hand];
          const newSets = this.findIndependentSets(testHand, true);
          const setUsingFirst = newSets.find((s) => s.some((t) => t.id === firstTile.id));
          if (setUsingFirst) {
            game.board.push(setUsingFirst);
            const used = new Set(setUsingFirst.map((t) => t.id));
            used.delete(firstTile.id);
            player.hand = player.hand.filter((t) => !used.has(t.id));
            return true;
          }
        }
        set.unshift(firstTile); // 원상복구

        // 마지막 타일 떼어가기
        const lastTile = set.pop()!;
        if (validateRun(set).valid) {
          const testHand = [lastTile, ...player.hand];
          const newSets = this.findIndependentSets(testHand, true);
          const setUsingLast = newSets.find((s) => s.some((t) => t.id === lastTile.id));
          if (setUsingLast) {
            game.board.push(setUsingLast);
            const used = new Set(setUsingLast.map((t) => t.id));
            used.delete(lastTile.id);
            player.hand = player.hand.filter((t) => !used.has(t.id));
            return true;
          }
        }
        set.push(lastTile); // 원상복구
      }
    }

    return false;
  }

  /**
   * 보드 세트에 내 패의 타일을 앞/뒤에 붙이기
   */
  private static async tryAppendToExistingSets(
    game: RummikubGame,
    player: Player,
    startTime?: number,
    maxAllowedMs?: number
  ): Promise<boolean> {
    const limit = maxAllowedMs || this.MAX_HARD_TIMEOUT_MS;
    let attached = false;

    for (let i = player.hand.length - 1; i >= 0; i--) {
      if (startTime && Date.now() - startTime > limit) break;

      const tile = player.hand[i];
      let tileAttached = false;

      for (const set of game.board) {
        if (startTime && Date.now() - startTime > limit) break;

        // 1. 뒤에 추가
        set.push(tile);
        if (validateTileSet(set).valid) {
          player.hand.splice(i, 1);
          tileAttached = true;
          attached = true;
          break;
        }
        set.pop();

        // 2. 앞에 추가
        set.unshift(tile);
        if (validateTileSet(set).valid) {
          player.hand.splice(i, 1);
          tileAttached = true;
          attached = true;
          break;
        }
        set.shift();
      }

      if (tileAttached) {
        // 추가로 더 붙일 수 있는지 계속 탐색
      }
    }

    return attached;
  }

  /**
   * 주어진 타일들로 만들 수 있는 독립적인 유효 세트(런/그룹) 탐색
   */
  private static findIndependentSets(tiles: Tile[], allowJoker: boolean = true): TileSet[] {
    const validSets: TileSet[] = [];
    const usedIds = new Set<string>();

    const jokers = allowJoker ? tiles.filter((t) => t.isJoker) : [];
    const availableJokerIds = new Set(jokers.map((j) => j.id));

    // 1. 그룹 탐색 (같은 숫자, 서로 다른 색상)
    const byValue = new Map<number, Tile[]>();
    for (const t of tiles) {
      if (!t.isJoker) {
        if (!byValue.has(t.value)) byValue.set(t.value, []);
        byValue.get(t.value)!.push(t);
      }
    }

    byValue.forEach((groupTiles) => {
      const uniqueByColor = new Map<string, Tile>();
      for (const t of groupTiles) {
        if (!usedIds.has(t.id) && !uniqueByColor.has(t.color)) {
          uniqueByColor.set(t.color, t);
        }
      }

      // 조커 없이 3~4개 색상 완성
      if (uniqueByColor.size >= 3) {
        const set = Array.from(uniqueByColor.values());
        validSets.push(set);
        set.forEach((t) => usedIds.add(t.id));
      } else if (allowJoker && uniqueByColor.size === 2 && availableJokerIds.size > 0) {
        // 조커 1개로 그룹 완성
        const jokerId = Array.from(availableJokerIds)[0];
        const jokerTile = tiles.find((t) => t.id === jokerId)!;
        const set = [...Array.from(uniqueByColor.values()), jokerTile];
        validSets.push(set);
        set.forEach((t) => usedIds.add(t.id));
        availableJokerIds.delete(jokerId);
      }
    });

    // 2. 런 탐색 (같은 색상, 연속된 숫자)
    const byColor = new Map<string, Tile[]>();
    for (const t of tiles) {
      if (!t.isJoker && !usedIds.has(t.id)) {
        if (!byColor.has(t.color)) byColor.set(t.color, []);
        byColor.get(t.color)!.push(t);
      }
    }

    byColor.forEach((colorTiles) => {
      const sorted = [...colorTiles].sort((a, b) => a.value - b.value);
      let currentRun: Tile[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        if (currentRun.length === 0) {
          currentRun.push(cur);
        } else {
          const last = currentRun[currentRun.length - 1];
          if (cur.value === last.value + 1) {
            currentRun.push(cur);
          } else if (cur.value === last.value) {
            continue; // 동일 숫자는 통과
          } else if (allowJoker && cur.value === last.value + 2 && availableJokerIds.size > 0) {
            // 숫자 1개가 빠진 경우 조커로 메우기
            const jokerId = Array.from(availableJokerIds)[0];
            const jokerTile = tiles.find((t) => t.id === jokerId)!;
            currentRun.push(jokerTile);
            currentRun.push(cur);
            availableJokerIds.delete(jokerId);
          } else {
            if (currentRun.length >= 3) {
              validSets.push([...currentRun]);
              currentRun.forEach((t) => usedIds.add(t.id));
            }
            currentRun = [cur];
          }
        }
      }

      if (currentRun.length >= 3) {
        validSets.push([...currentRun]);
        currentRun.forEach((t) => usedIds.add(t.id));
      }
    });

    return validSets;
  }

  private static getSubsets<T>(array: T[]): T[][] {
    const result: T[][] = [];
    const limit = Math.min(array.length, 10); // 최대 10개(1024개) 제한으로 수 초 이상 지연 방지
    const total = 1 << limit;
    for (let i = 1; i < total; i++) {
      const subset: T[] = [];
      for (let j = 0; j < limit; j++) {
        if ((i & (1 << j)) !== 0) {
          subset.push(array[j]);
        }
      }
      result.push(subset);
    }
    return result;
  }
}
