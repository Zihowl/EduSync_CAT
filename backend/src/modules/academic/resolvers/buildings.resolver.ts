import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Building } from '../entities/building.entity';
import { BuildingsService } from '../services/buildings.service';
import { CreateBuildingInput } from '../dto/create-building.input';
import { UpdateBuildingInput } from '../dto/update-building.input';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/guards/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Resolver(() => Building)
export class BuildingsResolver
{
    constructor(private readonly buildingsService: BuildingsService) {}

    @Query(() => [Building], { name: 'GetBuildings' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetBuildings(): Promise<Building[]> {
        return await this.buildingsService.FindAll();
    }

    @Query(() => Building, { name: 'GetBuilding', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetBuilding(@Args('id', { type: () => Int }) id: number): Promise<Building | null> {
        return await this.buildingsService.FindOne(id);
    }

    @Mutation(() => Building)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async CreateBuilding(@Args('input') input: CreateBuildingInput): Promise<Building> {
        return await this.buildingsService.Create(input);
    }

    @Mutation(() => Building)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async UpdateBuilding(@Args('input') input: UpdateBuildingInput): Promise<Building> {
        return await this.buildingsService.Update(input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async RemoveBuilding(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
        return await this.buildingsService.Remove(id);
    }
}
