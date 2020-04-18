import { Component, OnInit, ChangeDetectorRef } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { filter } from 'rxjs/operators'
import Peer, { DataConnection } from 'peerjs'

function guid() {
  return Math.floor(Math.random() * 10000).toString()
}

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.scss'],
})
export class P2pComponent implements OnInit {
  id: string = guid()
  peerId: string
  peer = new Peer(this.id, { debug: 3 })
  state: Record<string, string> = {}

  constructor(
    private route: ActivatedRoute, //
    private ref: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.peer.on('open', () => {
      this.route.queryParams
        .pipe(
          filter((params) => params.peerId) //
        )
        .subscribe(({ peerId }) => {
          this.peerId = peerId

          const conn = this.peer.connect(peerId, { serialization: 'json' })
          conn.on('open', () => {})
          conn.on('data', (data) => {
            this.readFromConnection(conn.label, data)
          })
        })
    })

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        console.log('open')
      })
      conn.on('data', (data) => {
        this.readFromConnection(conn.label, data)
      })
    })
  }

  get connections(): DataConnection[] {
    return Object.values<DataConnection[]>(this.peer.connections).reduce((result, connections) => {
      return [...result, ...connections]
    }, [])
  }

  writeToConnection(connectionId: string, content: string) {
    const connection = this.connections.find((conn) => conn.label === connectionId)
    if (connection) {
      connection.send(content)
    }
  }

  readFromConnection(connectionId: string, content: string) {
    this.state[connectionId] = content
    this.ref.detectChanges()
  }
}
