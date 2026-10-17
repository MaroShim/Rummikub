import { Peer, DataConnection } from 'peerjs';

export interface NetworkMessage {
  type:
    | 'JOIN_REQUEST'
    | 'ROOM_STATE'
    | 'START_GAME'
    | 'SYNC_BOARD'
    | 'ACTION_DRAW'
    | 'ACTION_END_TURN'
    | 'ACTION_RESET'
    | 'TURN_ERROR'
    | 'LEAVE_ROOM'
    | 'ROOM_CLOSED'
    | 'CHAT';
  senderId: string;
  senderName: string;
  payload?: any;
}

export interface RoomParticipant {
  id: string;
  name: string;
  isHost: boolean;
}

export type MessageHandler = (msg: NetworkMessage) => void;

export class MultiplayerManager {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map(); // host: guests connections
  hostConnection: DataConnection | null = null; // guest: connection to host

  isHost: boolean = false;
  roomCode: string = '';
  myPeerId: string = '';
  myName: string = '플레이어';

  participants: RoomParticipant[] = [];
  onMessageReceived: MessageHandler | null = null;
  onParticipantsChanged: ((participants: RoomParticipant[]) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onConnected: (() => void) | null = null;

  constructor() {
    this.myName = localStorage.getItem('rummikub_player_name') || `플레이어_${Math.floor(Math.random() * 900 + 100)}`;
  }

  setPlayerName(name: string): void {
    this.myName = name.trim() || '플레이어';
    localStorage.setItem('rummikub_player_name', this.myName);
    if (this.isHost) {
      this.updateHostParticipant();
    } else if (this.hostConnection && this.hostConnection.open) {
      this.sendMessageToHost({
        type: 'JOIN_REQUEST',
        senderId: this.myPeerId,
        senderName: this.myName,
      });
    }
  }

  /**
   * 6자리 랜덤 방 코드 생성
   */
  generateRoomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 호스트로 방 생성
   */
  async createRoom(): Promise<string> {
    this.disconnect();
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    const fullPeerId = `rummikub-room-${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new Peer(fullPeerId, {
        debug: 1,
      });

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.participants = [
          {
            id: this.myPeerId,
            name: this.myName,
            isHost: true,
          },
        ];
        this.notifyParticipants();
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingGuest(conn);
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // 이미 방 번호가 사용 중인 경우 재시도
          this.createRoom().then(resolve).catch(reject);
        } else {
          this.onError?.(`방 생성 실패: ${err.message}`);
          reject(err);
        }
      });
    });
  }

  /**
   * 게스트로 방 참가
   */
  async joinRoom(roomCode: string): Promise<void> {
    this.disconnect();
    this.isHost = false;
    this.roomCode = roomCode.trim();
    const targetPeerId = `rummikub-room-${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        debug: 1,
      });

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        const conn = this.peer!.connect(targetPeerId, {
          reliable: true,
        });

        conn.on('open', () => {
          this.hostConnection = conn;
          // 호스트에게 참가 요청 전송
          this.sendMessageToHost({
            type: 'JOIN_REQUEST',
            senderId: this.myPeerId,
            senderName: this.myName,
          });
          this.onConnected?.();
          resolve();
        });

        conn.on('data', (data) => {
          this.handleMessage(data as NetworkMessage);
        });

        conn.on('close', () => {
          this.onError?.('호스트와의 연결이 끊어졌습니다.');
          this.disconnect();
        });

        conn.on('error', (err) => {
          this.onError?.(`연결 에러: ${err.message}`);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          this.onError?.('방을 찾을 수 없습니다. 방 번호를 확인해 주세요.');
        } else {
          this.onError?.(`참가 실패: ${err.message}`);
        }
        reject(err);
      });
    });
  }

  /**
   * 호스트: 게스트 접속 처리
   */
  private handleIncomingGuest(conn: DataConnection): void {
    if (this.participants.length >= 4) {
      // 4인 초과 방 참가 불가
      conn.on('open', () => {
        conn.send({
          type: 'TURN_ERROR',
          senderId: 'host',
          senderName: '시스템',
          payload: { error: '방 인원이 가득 찼습니다 (최대 4인).' },
        });
        setTimeout(() => conn.close(), 500);
      });
      return;
    }

    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
      const msg = data as NetworkMessage;
      if (msg.type === 'JOIN_REQUEST') {
        const guestId = conn.peer;
        const existingIdx = this.participants.findIndex((p) => p.id === guestId);
        if (existingIdx >= 0) {
          this.participants[existingIdx].name = msg.senderName;
        } else {
          this.participants.push({
            id: guestId,
            name: msg.senderName,
            isHost: false,
          });
        }
        this.notifyParticipants();
        this.broadcastRoomState();
      } else {
        this.handleMessage(msg);
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.participants = this.participants.filter((p) => p.id !== conn.peer);
      this.notifyParticipants();
      this.broadcastRoomState();
    });
  }

  private handleMessage(msg: NetworkMessage): void {
    if (msg.type === 'ROOM_STATE' && !this.isHost) {
      this.participants = msg.payload.participants;
      this.notifyParticipants();
    }
    this.onMessageReceived?.(msg);
  }

  private updateHostParticipant(): void {
    if (this.participants.length > 0 && this.participants[0].isHost) {
      this.participants[0].name = this.myName;
      this.notifyParticipants();
      this.broadcastRoomState();
    }
  }

  private notifyParticipants(): void {
    this.onParticipantsChanged?.([...this.participants]);
  }

  /**
   * 모든 참가자에게 방 상태 브로드캐스트
   */
  broadcastRoomState(): void {
    if (!this.isHost) return;
    this.broadcast({
      type: 'ROOM_STATE',
      senderId: this.myPeerId,
      senderName: this.myName,
      payload: {
        roomCode: this.roomCode,
        participants: this.participants,
      },
    });
  }

  /**
   * 모든 피어에게 메시지 전송 (호스트가 주로 사용)
   */
  broadcast(msg: NetworkMessage): void {
    if (this.isHost) {
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.send(msg);
        }
      });
    } else {
      this.sendMessageToHost(msg);
    }
  }

  /**
   * 특정 피어에게 메시지 전송
   */
  sendTo(peerId: string, msg: NetworkMessage): void {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  /**
   * 게스트 -> 호스트로 메시지 전송
   */
  sendMessageToHost(msg: NetworkMessage): void {
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(msg);
    }
  }

  /**
   * 방 나가기 처리
   */
  leaveRoom(): void {
    if (this.isHost) {
      this.broadcast({
        type: 'ROOM_CLOSED',
        senderId: this.myPeerId,
        senderName: this.myName,
        payload: { reason: '방장이 방을 종료했습니다.' },
      });
    } else {
      this.sendMessageToHost({
        type: 'LEAVE_ROOM',
        senderId: this.myPeerId,
        senderName: this.myName,
      });
    }
    this.disconnect();
  }

  disconnect(): void {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.hostConnection?.close();
    this.hostConnection = null;
    this.peer?.destroy();
    this.peer = null;
    this.isHost = false;
    this.roomCode = '';
    this.participants = [];
  }
}
