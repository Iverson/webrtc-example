import { NgModule } from '@angular/core'
import { Routes, RouterModule } from '@angular/router'

import { P2pComponent } from './p2p.component'

const routes: Routes = [{ path: '', component: P2pComponent }]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class P2pRoutingModule {}
