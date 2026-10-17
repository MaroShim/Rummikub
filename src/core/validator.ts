import { Tile, TileColor, TileSet, SetValidationResult, BoardValidationResult } from './types.ts';

/**
 * 주어진 타일 묶음이 유효한 '그룹(Group)'인지 검사합니다.
 * 조건:
 * - 타일 수: 3개 또는 4개
 * - 모든 일반 타일의 숫자가 동일
 * - 색상이 중복되지 않아야 함 (최대 4가지 색상)
 * - 조커는 남은 다른 색상의 해당 숫자를 대체
 */
export function validateGroup(tiles: TileSet): SetValidationResult {
  if (tiles.length < 3 || tiles.length > 4) {
    return { valid: false, reason: '그룹은 3개 또는 4개의 타일이어야 합니다.' };
  }

  const normalTiles = tiles.filter((t) => !t.isJoker);
  const jokerCount = tiles.length - normalTiles.length;

  if (normalTiles.length === 0) {
    return { valid: false, reason: '일반 타일이 최소 1개 이상 있어야 합니다.' };
  }

  const targetValue = normalTiles[0].value;
  // 모든 일반 타일 숫자가 일치하는지 확인
  for (const t of normalTiles) {
    if (t.value !== targetValue) {
      return { valid: false, reason: '그룹 내 숫자가 모두 일치해야 합니다.' };
    }
  }

  // 색상 중복 확인
  const colors = new Set<TileColor>();
  for (const t of normalTiles) {
    if (colors.has(t.color as TileColor)) {
      return { valid: false, reason: '그룹 내 중복된 색상이 있습니다.' };
    }
    colors.add(t.color as TileColor);
  }

  // 조커가 대체할 수 있는 남은 색상이 충분한지 확인
  // 4가지 색상 중 사용된 색상 수 + 조커 수 <= 4
  if (colors.size + jokerCount > 4) {
    return { valid: false, reason: '그룹의 색상 수가 4개를 초과할 수 없습니다.' };
  }

  const score = targetValue * tiles.length;
  return { valid: true, type: 'group', score };
}

/**
 * 주어진 타일 묶음이 유효한 '런(Run)'인지 검사합니다.
 * 조건:
 * - 타일 수: 3개 이상 13개 이하
 * - 모든 일반 타일의 색상이 동일
 * - 타일들이 1씩 증가하는 연속된 수열을 형성 (1 ~ 13 범위 내)
 * - 조커는 빠진 숫자를 대체
 */
export function validateRun(tiles: TileSet): SetValidationResult {
  if (tiles.length < 3 || tiles.length > 13) {
    return { valid: false, reason: '런은 3개 이상 13개 이하의 타일이어야 합니다.' };
  }

  const normalTiles = tiles.filter((t) => !t.isJoker);
  if (normalTiles.length === 0) {
    return { valid: false, reason: '일반 타일이 최소 1개 이상 있어야 합니다.' };
  }

  // 색상이 모두 동일한지 확인
  const targetColor = normalTiles[0].color;
  for (const t of normalTiles) {
    if (t.color !== targetColor) {
      return { valid: false, reason: '런 내 모든 타일의 색상이 같아야 합니다.' };
    }
  }

  // 현재 배치된 순서대로 연속적인지 확인
  const resultCurrent = checkRunSequence(tiles);
  if (resultCurrent.valid) {
    return resultCurrent;
  }

  // 사용자가 순서 없이 놓았을 수도 있으므로, 정렬 시 유효한 런이 될 수 있는지 확인
  const sortedResult = checkCanFormRunSorted(tiles);
  if (sortedResult.valid) {
    return sortedResult;
  }

  return { valid: false, reason: '타일이 연속된 숫자를 이루지 않습니다.' };
}

/**
 * 현재 배열 순서대로 조커를 고려하여 1씩 증가하는 런인지 검사
 */
function checkRunSequence(tiles: TileSet): SetValidationResult {
  const len = tiles.length;
  const normalIndices: number[] = [];

  for (let i = 0; i < len; i++) {
    if (!tiles[i].isJoker) normalIndices.push(i);
  }

  if (normalIndices.length === 0) {
    return { valid: false };
  }

  // 일반 타일 간의 간격과 값 차이가 일치하는지 확인
  for (let k = 0; k < normalIndices.length - 1; k++) {
    const idx1 = normalIndices[k];
    const idx2 = normalIndices[k + 1];
    const valDiff = tiles[idx2].value - tiles[idx1].value;
    const idxDiff = idx2 - idx1;
    if (valDiff !== idxDiff) {
      return { valid: false };
    }
  }

  // 시작 타일의 가상 값 계산
  const firstNormalIdx = normalIndices[0];
  const startVal = tiles[firstNormalIdx].value - firstNormalIdx;
  const endVal = startVal + len - 1;

  if (startVal < 1 || endVal > 13) {
    return { valid: false, reason: '런의 숫자 범위는 1~13 사이여야 합니다.' };
  }

  // 총 점수 계산: startVal부터 endVal까지의 합
  const score = ((startVal + endVal) * len) / 2;
  return { valid: true, type: 'run', score };
}

/**
 * 타일들을 오름차순으로 정렬했을 때 유효한 런이 가능한지 검사
 */
function checkCanFormRunSorted(tiles: TileSet): SetValidationResult {
  const normalTiles = tiles.filter((t) => !t.isJoker).sort((a, b) => a.value - b.value);
  const jokerCount = tiles.length - normalTiles.length;

  // 일반 타일에 중복 숫자가 있으면 런 불가능
  for (let i = 0; i < normalTiles.length - 1; i++) {
    if (normalTiles[i].value === normalTiles[i + 1].value) {
      return { valid: false, reason: '런에 동일한 숫자가 중복될 수 없습니다.' };
    }
  }

  const minVal = normalTiles[0].value;
  const maxVal = normalTiles[normalTiles.length - 1].value;
  const neededSpan = maxVal - minVal + 1; // minVal부터 maxVal까지 필요한 타일 수
  const missingTilesBetween = neededSpan - normalTiles.length;

  if (missingTilesBetween > jokerCount) {
    return { valid: false, reason: '숫자 사이의 간격을 메울 조커가 부족합니다.' };
  }

  // 남은 조커는 앞이나 뒤에 붙을 수 있음
  const remainingJokers = jokerCount - missingTilesBetween;
  const totalLength = neededSpan + remainingJokers;

  if (totalLength !== tiles.length) {
    return { valid: false };
  }

  // 1~13 범위 내에 들어갈 수 있는 시작 위치가 존재하는지 확인
  // 가능한 startVal: minVal - (앞에 붙일 조커 수)
  // 앞에 붙일 수 있는 조커 수 x: 0 <= x <= remainingJokers
  // minVal - x >= 1  => x <= minVal - 1
  // maxVal + (remainingJokers - x) <= 13 => x >= maxVal + remainingJokers - 13
  const minX = Math.max(0, maxVal + remainingJokers - 13);
  const maxX = Math.min(remainingJokers, minVal - 1);

  if (minX <= maxX) {
    // 가능한 startVal이 존재함 (점수 계산용으로 minX 기준 계산)
    const bestX = maxX; // 높은 숫자가 보통 유리하거나 기본 배치
    const startVal = minVal - bestX;
    const endVal = startVal + totalLength - 1;
    const score = ((startVal + endVal) * totalLength) / 2;
    return { valid: true, type: 'run', score };
  }

  return { valid: false, reason: '런의 범위가 1~13을 벗어납니다.' };
}

/**
 * 단일 세트가 런 또는 그룹인지 판별
 */
export function validateTileSet(tiles: TileSet): SetValidationResult {
  if (tiles.length === 0) {
    return { valid: false, reason: '빈 세트입니다.' };
  }

  const groupResult = validateGroup(tiles);
  if (groupResult.valid) {
    return groupResult;
  }

  const runResult = validateRun(tiles);
  if (runResult.valid) {
    return runResult;
  }

  return {
    valid: false,
    reason: groupResult.reason || runResult.reason || '유효하지 않은 조합입니다.',
  };
}

/**
 * 보드 전체가 유효한지 검사
 */
export function validateBoard(board: TileSet[]): BoardValidationResult {
  const invalidSetIndices: number[] = [];

  for (let i = 0; i < board.length; i++) {
    const set = board[i];
    if (set.length === 0) continue; // 빈 세트는 무시하거나 정리
    const res = validateTileSet(set);
    if (!res.valid) {
      invalidSetIndices.push(i);
    }
  }

  return {
    valid: invalidSetIndices.length === 0,
    invalidSetIndices,
  };
}

/**
 * 세트를 시각적으로 깔끔하게 정렬 (런인 경우 오름차순, 그룹인 경우 색상순)
 */
export function autoOrderSet(set: TileSet): TileSet {
  const normalTiles = set.filter((t) => !t.isJoker);
  if (normalTiles.length === 0) return set;

  const isGroup = normalTiles.every((t) => t.value === normalTiles[0].value);
  if (isGroup) {
    const colorOrder: Record<string, number> = { black: 1, blue: 2, red: 3, yellow: 4 };
    return [...set].sort((a, b) => {
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      return (colorOrder[a.color] || 0) - (colorOrder[b.color] || 0);
    });
  }

  // 런인 경우
  const isAllSameColor = normalTiles.every((t) => t.color === normalTiles[0].color);
  if (isAllSameColor) {
    // 런 정렬 시도
    const sortedNormal = [...normalTiles].sort((a, b) => a.value - b.value);
    const jokers = set.filter((t) => t.isJoker);
    const result: Tile[] = [];

    // 채워넣기
    if (sortedNormal.length > 0) {
      const minVal = sortedNormal[0].value;
      const maxVal = sortedNormal[sortedNormal.length - 1].value;
      const normalMap = new Map<number, Tile>();
      sortedNormal.forEach((t) => normalMap.set(t.value, t));

      for (let v = minVal; v <= maxVal; v++) {
        if (normalMap.has(v)) {
          result.push(normalMap.get(v)!);
        } else if (jokers.length > 0) {
          result.push(jokers.pop()!);
        }
      }
      // 앞/뒤 남은 조커 붙이기
      while (jokers.length > 0) {
        if (result.length > 0 && result[0].value > 1 && !result[0].isJoker) {
          result.unshift(jokers.pop()!);
        } else {
          result.push(jokers.pop()!);
        }
      }
      return result;
    }
  }

  return set;
}
