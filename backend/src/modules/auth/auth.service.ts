import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService 
{
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) 
    {}

    async ValidateUser(email: string, pass: string): Promise<User> 
    {
        const user = await this.usersService.FindOneByEmail(email);

        if (user && (await argon2.verify(user.password, pass))) 
        {
            return user;
        }

        throw new UnauthorizedException('Credenciales inválidas');
    }

    Login(user: User) 
    {
        const payload = { sub: user.id, email: user.email, role: user.role };

        return {
            accessToken: this.jwtService.sign(payload),
            user: user,
        };
    }
}
