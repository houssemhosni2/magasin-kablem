import { Routes } from '@angular/router';
import { Produits } from './pages/produits/produits';

export const routes: Routes = [
  { path: '', redirectTo: 'produits', pathMatch: 'full' },
  { path: 'produits', component: Produits },
];
