import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            habilitada: true,
            proveedores: [
              { id: 'azure', nube: 'Azure' },
              { id: 'aws', nube: 'AWS' },
            ],
            autenticado: () => false,
            usuario: () => null,
            proveedor: () => null,
            login: () => undefined,
            logout: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('ofrece iniciar sesión con Azure y con AWS', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.marca')?.textContent).toContain('Pedidos');
    const botones = Array.from(html.querySelectorAll('.sesion button')).map((b) => b.textContent?.trim());
    expect(botones).toEqual(['Entrar con Azure', 'Entrar con AWS']);
  });
});
