import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
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

  it('should return true when user is authenticated', () => {
    authService.isAuthenticated.and.returnValue(true);

    const can = guard.canActivate({} as any, { url: '/admin/dashboard' } as any);

    expect(can).toBeTrue();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should return false and redirect to login when not authenticated', () => {
    authService.isAuthenticated.and.returnValue(false);

    const can = guard.canActivate({} as any, { url: '/admin/dashboard' } as any);

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
