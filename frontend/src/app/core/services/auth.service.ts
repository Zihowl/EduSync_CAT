import { Injectable, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { map, Observable, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

const LOGIN_MUTATION = gql`
    mutation Login($email: String!, $password: String!)
    {
        Login(
            loginInput:
            {
                email: $email,
                password: $password
            })
            {
                accessToken
                user
                {
                    id
                    email
                    role
                    isActive
                }
            }
    }
`;

const CHANGE_CREDENTIALS_MUTATION = gql`
    mutation ChangeCredentials($currentEmail: String!, $currentPassword: String!, $newEmail: String!, $newPassword: String!) {
        ChangeCredentials(
            input: {
                currentEmail: $currentEmail,
                currentPassword: $currentPassword,
                newEmail: $newEmail,
                newPassword: $newPassword
            }
        ) {
            id
            email
            role
            isActive
        }
    }
`;

@Injectable
({
    providedIn: 'root'
})

export class AuthService 
{
    private readonly TOKEN_KEY = 'auth_token';
    private readonly USER_KEY = 'user_data';

    private apollo = inject(Apollo);
    private router = inject(Router);

    private userSubject = new BehaviorSubject<any>
    (
        JSON.parse(localStorage.getItem(this.USER_KEY) || 'null')
    );
    user$ = this.userSubject.asObservable();

    Login(email: string, password: string): Observable<boolean> 
    {
        // Ensure stale tokens do not interfere with a fresh login attempt.
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        this.userSubject.next(null);

        return this.apollo.mutate<any>({
            mutation: LOGIN_MUTATION,
            variables: { email, password }
        }).pipe(
            map(result => {
                console.log('[AuthService] Full response from backend:', result);

                const data = result.data?.Login || result.data?.login; 
                
                if (data && data.accessToken) 
                {
                    console.log('[AuthService] Guardando Usuario:', data.user);
                    this.SaveSession(data.accessToken, data.user);
                    return true;
                }
                return false;
            })
        );
    }

    Logout() 
    {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        this.userSubject.next(null);
        this.router.navigate(['/auth/login']);
    }

    private SaveSession(token: string, user: any) 
    {
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        this.userSubject.next(user);
    }
    
    GetUserRole(): string | null
    {
        const userStr = localStorage.getItem(this.USER_KEY);
        if (!userStr) return null;
        try {
            return JSON.parse(userStr).role;
        } catch {
            return null;
        }
    }

    IsAuthenticated(): boolean 
    {
        return !!localStorage.getItem(this.TOKEN_KEY);
    }

    changeCredentials(currentEmail: string, currentPassword: string, newEmail: string, newPassword: string): Observable<boolean> {
        return this.apollo.mutate<any>({
            mutation: CHANGE_CREDENTIALS_MUTATION,
            variables: { currentEmail, currentPassword, newEmail, newPassword }
        }).pipe(
            map(result => {
                const data = result.data?.ChangeCredentials || result.data?.changeCredentials;
                if (data) {
                    // after successful change re-route to login page and keep session cleared
                    this.Logout();
                    return true;
                }
                return false;
            })
        );
    }
}