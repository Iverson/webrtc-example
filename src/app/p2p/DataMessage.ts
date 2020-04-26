interface DataMessageBase<T extends string, U extends {}> {
  type: T
  payload: U
}

export type RemoteMoveMessage = DataMessageBase<'remote_move', { x: number; y: number; z: number }>

export type DataMessage = RemoteMoveMessage
