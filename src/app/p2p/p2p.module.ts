import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { P2pRoutingModule } from './p2p-routing.module';
import { P2pComponent } from './p2p.component';


@NgModule({
  declarations: [P2pComponent],
  imports: [
    CommonModule,
    P2pRoutingModule
  ]
})
export class P2pModule { }
