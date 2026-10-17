export type TileColor = 'black' | 'blue' | 'red' | 'yellow';

export interface Tile {
  id: string;
  color: TileColor | 'joker';
  value: number; // 1 ~ 13, 0 for Joker
  isJoker: boolean;
}

export type TileSet = Tile[];

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  hand: Tile[];
  hasInitialMeld: boolean;
}

export interface TurnSnapshot {
  board: TileSet[];
  hand: Tile[];
}

export interface SetValidationResult {
  valid: boolean;
  type?: 'group' | 'run';
  score?: number;
  reason?: string;
}

export interface BoardValidationResult {
  valid: boolean;
  invalidSetIndices: number[];
}
