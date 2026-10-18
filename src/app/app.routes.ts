import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'Inicio · Pedidos 360',
    loadComponent: () => import('./pages/inicio/inicio').then((m) => m.Inicio),
  },
  {
    path: 'pedidos',
    title: 'Pedidos · Pedidos 360',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pedidos/pedidos').then((m) => m.Pedidos),
  },
  {
    path: 'documentos',
    title: 'Documentos · Pedidos 360',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/documentos/documentos').then((m) => m.Documentos),
  },
  {
    path: 'actividad',
    title: 'Actividad · Pedidos 360',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/actividad/actividad').then((m) => m.Actividad),
  },
  {
    path: 'rabbit',
    title: 'RabbitMQ · Pedidos 360',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rabbit/rabbit').then((m) => m.Rabbit),
  },
  { path: '**', redirectTo: '' },
];
