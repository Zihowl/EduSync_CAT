import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AllowedDomain } from './entities/allowed-domain.entity';
import { SchoolYear } from './entities/school-year.entity';
import { ConfigService } from './config.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Resolver(() => AllowedDomain)
export class ConfigResolver 
{
    constructor(private readonly configService: ConfigService) 
    {}

    @Query(() => [AllowedDomain], { name: 'GetAllowedDomains' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async GetAllowedDomains(): Promise<AllowedDomain[]> 
    {
        return await this.configService.getAllowedDomains();
    }

    @Mutation(() => AllowedDomain)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async CreateAllowedDomain(@Args('domain') domain: string): Promise<AllowedDomain> 
    {
        return await this.configService.createDomain(domain);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async RemoveAllowedDomain(@Args('id', { type: () => Int }) id: number): Promise<boolean> 
    {
        return await this.configService.removeDomain(id);
    }

    @Query(() => SchoolYear, { name: 'GetCurrentSchoolYear', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async GetCurrentSchoolYear(): Promise<SchoolYear | null> 
    {
        return await this.configService.getCurrentSchoolYear();
    }

    @Mutation(() => SchoolYear, { name: 'SetCurrentSchoolYear' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async SetCurrentSchoolYear(
        @Args('startDate') startDate: string,
        @Args('endDate') endDate: string,
    ): Promise<SchoolYear> 
    {
        return await this.configService.setCurrentSchoolYear(startDate, endDate);
    }
}
