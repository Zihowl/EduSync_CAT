import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';

import { GuestGuard } from './guest.guard';
import { AuthService } from '../services/auth.service';

describe('GuestGuard', () => {
  let guard: GuestGuard;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['verifySession']);
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);

    TestBed.configureTestingModule({
      providers: [
        GuestGuard,
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });

    guard = TestBed.inject(GuestGuard);
  });

  it('should redirect super admin users to the config panel', async () => {
    authService.verifySession.and.returnValue(of({
      id: '1',
      email: 'admin@example.com',
      role: 'SUPER_ADMIN',
      isActive: true,
      isTempPassword: false,
    } as any));

    const can = await firstValueFrom(guard.canActivate({} as any, {} as any));

    expect(can).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('should redirect horario admins to the admin panel', async () => {
    authService.verifySession.and.returnValue(of({
      id: '1',
      email: 'admin@example.com',
      role: 'ADMIN_HORARIOS',
      isActive: true,
      isTempPassword: false,
    } as any));

    const can = await firstValueFrom(guard.canActivate({} as any, {} as any));

    expect(can).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('should allow the login page when the session cannot be verified', async () => {
    authService.verifySession.and.returnValue(throwError(() => new Error('network')));

    const can = await firstValueFrom(guard.canActivate({} as any, {} as any));

    expect(can).toBeTrue();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});