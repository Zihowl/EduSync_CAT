import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { CreateAdminInput } from './dto/create-user.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { UserRole } from './entities/user.entity';

@Resolver(() => User)
export class UsersResolver 
{
    constructor(private readonly usersService: UsersService) 
    {}

    @Query(() => [User], { name: 'GetUsers' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async GetUsers(): Promise<User[]> 
    {
        return await this.usersService.FindAll();
    }

    @Mutation(() => User)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async CreateAdmin(@Args('input') input: CreateAdminInput): Promise<User> 
    {
        return await this.usersService.CreateAdmin(input);
    }
}
