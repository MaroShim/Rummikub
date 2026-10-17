import { Tile, TileSet, Player } from './types.ts';
import { RummikubGame } from './game.ts';
import { validateGroup, validateRun } from './validator.ts';

/**
 * 봇(AI) 플레이어의 턴을 처리합니다.
 */
export class RummikubAI {
  static async playTurn(game: RummikubGame, player: Player): Promise<void> {
    if (!player.isAi) return;

    // 인간적인 느낌을 주기 위한 가벼운 딜레이 (600ms)
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (!player.hasInitialMeld) {
      // 1. 첫 등록 시도
      const success = this.tryInitialMeld(game, player);
      if (success) {
        game.endTurn();
        return;
      }
    } else {
      // 2. 이미 등록 완료된 경우: 패에서 세트 내기 or 기존 보드에 타일 덧붙이기
      let playedAny = false;

      // 2-1. 패에서 새로운 런/그룹 세트 내기
      const newSets = this.findIndependentSets(player.hand);
      if (newSets.length > 0) {
        for (const set of newSets) {
          game.board.push(set);
          // 패에서 해당 타일들 제거
          const setIds = new Set(set.map((t) => t.id));
          player.hand = player.hand.filter((t) => !setIds.has(t.id));
          playedAny = true;
        }
      }

      // 2-2. 기존 보드 세트에 패의 타일 1장씩 덧붙이기
      if (this.tryAppendToExistingSets(game, player)) {
        playedAny = true;
      }

      if (playedAny) {
        const endResult = game.endTurn();
        if (endResult.success) {
          return;
        } else {
          // 혹시 규칙 위반 오류 발생 시 원상복구 후 드로우
          game.resetTurn();
        }
      }
    }

    // 낼 수 있는 게 없으면 드로우
    game.drawTile();
  }

  /**
   * 첫 등록(30점 이상) 시도
   */
  private static tryInitialMeld(game: RummikubGame, player: Player): boolean {
    const independentSets = this.findIndependentSets(player.hand);
    if (independentSets.length === 0) return false;

    // 세트들의 점수 합산 조합 중 30점 이상인 최소/최적 조합 탐색
    // 가능한 부분집합 탐색 (세트 수가 보통 1~4개이므로 비트마스크 또는 재귀)
    const subsets = this.getSubsets(independentSets);
    for (const subset of subsets) {
      // 타일 ID 중복 여부 확인
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

      if (!hasConflict && totalScore >= 30) {
        // 성공! 보드에 추가하고 패에서 제거
        for (const set of subset) {
          game.board.push(set);
        }
        player.hand = player.hand.filter((t) => !usedIds.has(t.id));
        return true;
      }
    }

    return false;
  }

  /**
   * 주어진 타일들로 만들 수 있는 독립적인 유효 세트(런/그룹) 탐색
   */
  private static findIndependentSets(tiles: Tile[]): TileSet[] {
    const validSets: TileSet[] = [];
    const usedIds = new Set<string>();

    // 1. 그룹 탐색 (숫자별 모으기)
    const byValue = new Map<number, Tile[]>();
    for (const t of tiles) {
      if (!t.isJoker) {
        if (!byValue.has(t.value)) byValue.set(t.value, []);
        byValue.get(t.value)!.push(t);
      }
    }

    byValue.forEach((groupTiles) => {
      // 색상별 유니크 타일
      const uniqueByColor = new Map<string, Tile>();
      for (const t of groupTiles) {
        if (!usedIds.has(t.id) && !uniqueByColor.has(t.color)) {
          uniqueByColor.set(t.color, t);
        }
      }

      if (uniqueByColor.size >= 3) {
        const set = Array.from(uniqueByColor.values());
        validSets.push(set);
        set.forEach((t) => usedIds.add(t.id));
      }
    });

    // 2. 런 탐색 (색상별 모으기)
    const byColor = new Map<string, Tile[]>();
    for (const t of tiles) {
      if (!t.isJoker && !usedIds.has(t.id)) {
        if (!byColor.has(t.color)) byColor.set(t.color, []);
        byColor.get(t.color)!.push(t);
      }
    }

    byColor.forEach((colorTiles) => {
      const sorted = [...colorTiles].sort((a, b) => a.value - b.value);
      // 연속된 수열 찾기
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
            // 같은 숫자는 건너뜀
            continue;
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

  /**
   * 보드에 있는 기존 세트들에 핸드 타일 추가 시도
   */
  private static tryAppendToExistingSets(game: RummikubGame, player: Player): boolean {
    let attached = false;

    // 핸드의 각 타일에 대해 보드 세트에 붙일 수 있는지 검사
    for (let i = player.hand.length - 1; i >= 0; i--) {
      const tile = player.hand[i];
      let tileAttached = false;

      for (const set of game.board) {
        // 세트 앞이나 뒤에 붙여보기
        // 1. 뒤에 추가
        set.push(tile);
        if (validateGroup(set).valid || validateRun(set).valid) {
          player.hand.splice(i, 1);
          tileAttached = true;
          attached = true;
          break;
        }
        set.pop(); // 원복

        // 2. 앞에 추가
        set.unshift(tile);
        if (validateGroup(set).valid || validateRun(set).valid) {
          player.hand.splice(i, 1);
          tileAttached = true;
          attached = true;
          break;
        }
        set.shift(); // 원복
      }

      if (tileAttached) {
        // 한 장 붙인 후 추가로 더 붙일 수 있는지 계속 탐색
      }
    }

    return attached;
  }

  /**
   * 부분집합 생성 도우미
   */
  private static getSubsets<T>(array: T[]): T[][] {
    const result: T[][] = [];
    const total = 1 << array.length;
    for (let i = 1; i < total; i++) {
      const subset: T[] = [];
      for (let j = 0; j < array.length; j++) {
        if ((i & (1 << j)) !== 0) {
          subset.push(array[j]);
        }
      }
      result.push(subset);
    }
    return result;
  }
}
