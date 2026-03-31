import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
    imports: [
        UsersModule,
        PassportModule,
        JwtModule.register({
            secret: 'SUPER_SECRET_KEY_DEV_ONLY',
            signOptions: { expiresIn: '12h' },
        }),
    ],
    providers: [AuthService, AuthResolver, JwtStrategy],
})
export class AuthModule
{}
