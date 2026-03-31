import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Classroom } from '../entities/classroom.entity';
import { ClassroomsService } from '../services/classrooms.service';
import { CreateClassroomInput } from '../dto/create-classroom.input';
import { UpdateClassroomInput } from '../dto/update-classroom.input';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/guards/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Resolver(() => Classroom)
export class ClassroomsResolver
{
    constructor(private readonly classroomsService: ClassroomsService) 
    {}

    @Query(() => [Classroom], { name: 'GetClassrooms' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetClassrooms(): Promise<Classroom[]> 
    {
        return await this.classroomsService.FindAll();
    }

    @Query(() => Classroom, { name: 'GetClassroom', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetClassroom(@Args('id', { type: () => Int }) id: number): Promise<Classroom | null> 
    {
        return await this.classroomsService.FindOne(id);
    }

    @Mutation(() => Classroom)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async CreateClassroom(@Args('input') input: CreateClassroomInput): Promise<Classroom> 
    {
        return await this.classroomsService.Create(input);
    }

    @Mutation(() => Classroom)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async UpdateClassroom(@Args('input') input: UpdateClassroomInput): Promise<Classroom> 
    {
        return await this.classroomsService.Update(input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async RemoveClassroom(@Args('id', { type: () => Int }) id: number): Promise<boolean> 
    {
        return await this.classroomsService.Remove(id);
    }
}
