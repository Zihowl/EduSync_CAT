import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver';
import { BootstrapService } from '../auth/services/bootstrap.service';
import { ConfigModule } from '../config/config.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
    imports: [TypeOrmModule.forFeature([User]), ConfigModule],
    providers: [UsersService, UsersResolver, BootstrapService, RolesGuard],
    exports: [UsersService],
})
export class UsersModule
{}
