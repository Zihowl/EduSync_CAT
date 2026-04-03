import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';

import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['verifySession']);
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);

    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });

    guard = TestBed.inject(AuthGuard);
  });

  afterEach(() => {
    sessionStorage.removeItem('returnUrl');
  });

  it('should return true when session is verified', async () => {
    authService.verifySession.and.returnValue(of({
      id: '1',
      email: 'admin@example.com',
      role: 'SUPER_ADMIN',
      isActive: true,
    } as any));

    const can = await firstValueFrom(guard.canActivate({} as any, { url: '/admin/dashboard' } as any));

    expect(can).toBeTrue();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should return false and redirect to login when session is invalid', async () => {
    authService.verifySession.and.returnValue(of(null));

    const can = await firstValueFrom(guard.canActivate({} as any, { url: '/admin/dashboard' } as any));

    expect(can).toBeFalse();
    expect(sessionStorage.getItem('returnUrl')).toBe('/admin/dashboard');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login', jasmine.objectContaining({
      state: jasmine.objectContaining({
        message: 'Inicia sesión para ver esta página',
        showOnce: true,
        returnUrl: '/admin/dashboard',
      }),
    }));
  });
});
