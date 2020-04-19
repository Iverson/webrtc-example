import { Component, OnInit, ChangeDetectorRef } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { AngularFirestore, DocumentSnapshot } from '@angular/fire/firestore'

function guid() {
  return Math.floor(Math.random() * 10000).toString()
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
  offer?: {}
  answer?: {}
}

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.scss'],
})
export class P2pComponent implements OnInit {
  id: string = guid()
  room: DocumentSnapshot<Room> | undefined
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
    const dc = this.rtcPeerConnection.createDataChannel('chat-channel')
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

    const roomWithOffer = {
      creatorId: this.id,
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    }
    await roomDoc.set(roomWithOffer)

    // Listening for remote session description below
    roomDoc.snapshotChanges().subscribe(async (snapshot) => {
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

    this.rtcPeerConnection.ondatachannel = (event) => {
      this.handleChatChannel(event.channel)
    }
    const roomRef = this.firestore.collection('rooms').doc<Room>(`${roomId}`)
    roomRef.snapshotChanges().subscribe(({ payload }) => (this.room = payload.exists ? payload : undefined))
    const roomSnapshot = await roomRef.get().toPromise()

    if (roomSnapshot.exists) {
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
      const room = roomSnapshot.data() as Room
      const offer = room.offer
      await this.rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
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
