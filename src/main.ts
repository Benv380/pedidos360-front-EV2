import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { crearAppConfig } from './app/app.config';
import { cargarConfig } from './app/core/config';

cargarConfig()
  .then((config) => bootstrapApplication(App, crearAppConfig(config)))
  .catch((err) => {
    console.error(err);
    document.body.innerHTML = `<p style="font-family:sans-serif;padding:2rem">No se pudo iniciar la aplicación: ${err.message}</p>`;
  });
