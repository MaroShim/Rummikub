import { Tile, TileColor } from './types.ts';

export const COLORS: TileColor[] = ['black', 'blue', 'red', 'yellow'];

/**
 * 106장의 표준 루미큐브 타일 덱을 생성합니다.
 * 4개 색상 x 1~13 x 2세트 = 104장
 * 조커 2장 (블랙 조커, 레드 조커)
 */
export function createDeck(): Tile[] {
  const deck: Tile[] = [];

  // 숫자 타일 104장
  for (let copy = 1; copy <= 2; copy++) {
    for (const color of COLORS) {
      for (let value = 1; value <= 13; value++) {
        deck.push({
          id: `${color}-${value}-${copy}`,
          color,
          value,
          isJoker: false,
        });
      }
    }
  }

  // 조커 타일 2장
  deck.push({
    id: 'joker-1',
    color: 'joker',
    value: 0,
    isJoker: true,
  });
  deck.push({
    id: 'joker-2',
    color: 'joker',
    value: 0,
    isJoker: true,
  });

  return deck;
}

/**
 * Fisher-Yates 셔플 알고리즘
 */
export function shuffleDeck(deck: Tile[]): Tile[] {
  const array = [...deck];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
