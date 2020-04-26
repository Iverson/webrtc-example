import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { AngularFirestore, DocumentSnapshot } from '@angular/fire/firestore'
import { Subscription } from 'rxjs'

function guid() {
  return Math.floor(Math.random() * 10000).toString()
}

let numberIdCount = 0
function numberId() {
  numberIdCount++
  return numberIdCount
}

const rtcConfig: RTCConfiguration = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
}

interface Room {
  id?: string
  creatorId?: string
  dataChannelId?: number
  offer?: {}
  answer?: {}
}

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.scss'],
})
export class P2pComponent implements OnInit, OnDestroy {
  id: string = guid()
  room: DocumentSnapshot<Room> | undefined
  roomSubscription: Subscription
  state: Record<string, string> = {}
  rtcPeerConnection: RTCPeerConnection
  chatChannel: RTCDataChannel | undefined
  messages: string[] = []
  messageText = ''

  constructor(
    private route: ActivatedRoute, //
    private ref: ChangeDetectorRef,
    private firestore: AngularFirestore
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroyChat()
  }

  createNewConnection() {
    if (this.rtcPeerConnection) {
      this.rtcPeerConnection.close()
    }
    this.rtcPeerConnection = new RTCPeerConnection(rtcConfig)
    this.registerPeerConnectionListeners(this.rtcPeerConnection)
    return this.rtcPeerConnection
  }

  async createNewRoom() {
    this.messages = []
    this.createNewConnection()
    const dc = this.rtcPeerConnection.createDataChannel('chat-channel-host', { id: numberId(), negotiated: true, protocol: 'sctp' })
    console.log('dc', dc)
    this.handleChatChannel(dc)

    const roomsCollection = this.firestore.collection<Room>('rooms')
    const roomDoc = roomsCollection.doc<Room>(this.firestore.createId())
    const callerCandidatesCollection = roomDoc.collection('callerCandidates')
    this.rtcPeerConnection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) {
        return
      }
      console.log('Got candidate: ', event.candidate)
      callerCandidatesCollection.add(event.candidate.toJSON())
    })

    const offer = await this.rtcPeerConnection.createOffer()
    await this.rtcPeerConnection.setLocalDescription(offer)
    console.log('Created offer:', offer)

    const roomWithOffer: Room = {
      creatorId: this.id,
      dataChannelId: dc.id as any,
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    }
    await roomDoc.set(roomWithOffer)

    // Listening for remote session description below
    this.roomSubscription = roomDoc.snapshotChanges().subscribe(async (snapshot) => {
      this.room = snapshot.payload
      const data = snapshot.payload.data()
      if (!this.rtcPeerConnection.currentRemoteDescription && data?.answer) {
        console.log('Got remote description: ', data.answer)
        const rtcSessionDescription = new RTCSessionDescription(data.answer)
        await this.rtcPeerConnection.setRemoteDescription(rtcSessionDescription)
      }
    })
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomDoc
      .collection('calleeCandidates')
      .snapshotChanges()
      .subscribe((changes) => {
        changes.forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.payload.doc.data()
            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`)
            await this.rtcPeerConnection.addIceCandidate(new RTCIceCandidate(data))
          }
        })
      })
  }

  async joinRoom() {
    const roomId = prompt('Enter room ID')
    this.createNewConnection()
    this.messages = []

    const roomRef = this.firestore.collection('rooms').doc<Room>(`${roomId}`)
    roomRef.snapshotChanges().subscribe(({ payload }) => (this.room = payload.exists ? payload : undefined))
    const roomSnapshot = await roomRef.get().toPromise()

    if (roomSnapshot.exists) {
      const room = roomSnapshot.data() as Room
      const dc = this.rtcPeerConnection.createDataChannel('chat-channel-guest', {
        negotiated: true,
        id: room.dataChannelId,
        protocol: 'sctp',
      })
      this.handleChatChannel(dc)

      // Listening for remote ICE candidates below
      roomRef
        .collection('callerCandidates')
        .snapshotChanges()
        .subscribe((changes) => {
          changes.forEach(async (change) => {
            if (change.type === 'added') {
              const data = change.payload.doc.data()
              console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`)
              await this.rtcPeerConnection.addIceCandidate(new RTCIceCandidate(data))
            }
          })
        })
      // Code for collecting ICE candidates above

      // Code for collecting ICE candidates below
      const calleeCandidatesCollection = roomRef.collection('calleeCandidates')
      this.rtcPeerConnection.addEventListener('icecandidate', (event) => {
        if (!event.candidate) {
          return
        }
        calleeCandidatesCollection.add(event.candidate.toJSON())
      })

      // Code for creating SDP answer below
      await this.rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(room.offer))
      const answer = await this.rtcPeerConnection.createAnswer()
      await this.rtcPeerConnection.setLocalDescription(answer)

      const roomWithAnswer = {
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      }
      await roomRef.update(roomWithAnswer)
      // Code for creating SDP answer above
    } else {
      alert(`There is no Room with ID: ${roomId} :(`)
    }
  }

  handleChatChannel(channel: RTCDataChannel) {
    this.chatChannel = channel

    channel.onmessage = (event) => {
      console.log('received: ' + event.data)
      this.messages.push(event.data)
      this.ref.detectChanges()
    }

    channel.onopen = () => {
      console.log('datachannel open')
      if (this.isChatCreator) {
        channel.send(`Chat Created by User #${this.id}`)
      } else {
        channel.send(`User #${this.id} joined to the chat`)
      }
      this.ref.detectChanges()
    }

    channel.onclose = () => {
      console.log('datachannel close')
      this.destroyChat()
    }
  }

  sendMessage() {
    if (this.chatChannel && this.messageText) {
      this.chatChannel.send(this.messageText)
      this.messages.push(this.messageText)
      this.messageText = ''
    }
  }

  get isChatCreator() {
    return this.room?.data()?.creatorId === this.id
  }

  destroyChat() {
    if (this.rtcPeerConnection) {
      this.rtcPeerConnection.close()
    }
    this.roomSubscription?.unsubscribe()
    this.room?.ref.delete()
    this.room = undefined
    this.chatChannel = undefined
    this.messages = []
    this.ref.detectChanges()
  }

  leaveRoom() {
    this.destroyChat()
  }

  registerPeerConnectionListeners(connection: RTCPeerConnection) {
    connection.addEventListener('icegatheringstatechange', () => {
      console.log(`ICE gathering state changed: ${connection.iceGatheringState}`)
    })
    connection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${connection.connectionState}`)
    })
    connection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${connection.signalingState}`)
    })
    connection.addEventListener('iceconnectionstatechange ', () => {
      console.log(`ICE connection state change: ${connection.iceConnectionState}`)
    })
  }
}
