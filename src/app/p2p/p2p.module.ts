import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { AngularFireModule } from '@angular/fire'
import { AngularFirestoreModule } from '@angular/fire/firestore'

import { P2pRoutingModule } from './p2p-routing.module'
import { P2pComponent } from './p2p.component'

const config = {
  apiKey: 'AIzaSyCTiTEcWViPHAIpiRAEyJgC5IbN4kUEjFo',
  authDomain: 'webrtc-9d9fc.firebaseapp.com',
  databaseURL: 'https://webrtc-9d9fc.firebaseio.com',
  projectId: 'webrtc-9d9fc',
  storageBucket: 'webrtc-9d9fc.appspot.com',
  messagingSenderId: '623028015904',
  appId: '1:623028015904:web:5c2aa4453fb4ae696e3d45',
}

@NgModule({
  declarations: [P2pComponent],
  imports: [
    CommonModule, //
    P2pRoutingModule,
    AngularFireModule.initializeApp(config),
    AngularFirestoreModule,
    FormsModule,
  ],
})
export class P2pModule {}
