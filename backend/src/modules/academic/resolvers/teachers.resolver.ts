import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Teacher } from '../entities/teacher.entity';
import { TeachersService } from '../services/teachers.service';
import { CreateTeacherInput } from '../dto/create-teacher.input';
import { UpdateTeacherInput } from '../dto/update-teacher.input';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/guards/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Resolver(() => Teacher)
export class TeachersResolver 
{
    constructor(private readonly teachersService: TeachersService) 
    {}

    @Query(() => [Teacher], { name: 'GetTeachers' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetTeachers(): Promise<Teacher[]> 
    {
        return await this.teachersService.FindAll();
    }

    @Query(() => Teacher, { name: 'GetTeacher', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetTeacher(@Args('id', { type: () => Int }) id: number): Promise<Teacher | null>
    {
        return await this.teachersService.FindOne(id);
    }

    @Mutation(() => Teacher)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async CreateTeacher(@Args('input') input: CreateTeacherInput): Promise<Teacher>
    {
        return await this.teachersService.Create(input);
    }

    @Mutation(() => Teacher)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async UpdateTeacher(@Args('input') input: UpdateTeacherInput): Promise<Teacher>
    {
        return await this.teachersService.Update(input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async RemoveTeacher(@Args('id', { type: () => Int }) id: number): Promise<boolean>
    {
        return await this.teachersService.Remove(id);
    }
}
