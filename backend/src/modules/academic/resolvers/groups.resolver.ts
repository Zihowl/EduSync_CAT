import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Group } from '../entities/group.entity';
import { GroupsService } from '../services/groups.service';
import { CreateGroupInput } from '../dto/create-group.input';
import { UpdateGroupInput } from '../dto/update-group.input';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/guards/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Resolver(() => Group)
export class GroupsResolver
{
    constructor(private readonly groupsService: GroupsService) {}

    @Query(() => [Group], { name: 'GetGroups' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetGroups(): Promise<Group[]> {
        return await this.groupsService.FindAll();
    }

    @Query(() => Group, { name: 'GetGroup', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetGroup(@Args('id', { type: () => Int }) id: number): Promise<Group | null> {
        return await this.groupsService.FindOne(id);
    }

    @Mutation(() => Group)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async CreateGroup(@Args('input') input: CreateGroupInput): Promise<Group> {
        return await this.groupsService.Create(input);
    }

    @Mutation(() => Group)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async UpdateGroup(@Args('input') input: UpdateGroupInput): Promise<Group> {
        return await this.groupsService.Update(input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async RemoveGroup(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
        return await this.groupsService.Remove(id);
    }
}
