import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Subject } from '../entities/subject.entity';
import { SubjectsService } from '../services/subjects.service';
import { CreateSubjectInput } from '../dto/create-subject.input';
import { UpdateSubjectInput } from '../dto/update-subject.input';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/guards/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

@Resolver(() => Subject)
export class SubjectsResolver
{
    constructor(private readonly subjectsService: SubjectsService) {}

    @Query(() => [Subject], { name: 'GetSubjects' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetSubjects(): Promise<Subject[]> {
        return await this.subjectsService.FindAll();
    }

    @Query(() => Subject, { name: 'GetSubject', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async GetSubject(@Args('id', { type: () => Int }) id: number): Promise<Subject | null> {
        return await this.subjectsService.FindOne(id);
    }

    @Mutation(() => Subject)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async CreateSubject(@Args('input') input: CreateSubjectInput): Promise<Subject> {
        return await this.subjectsService.Create(input);
    }

    @Mutation(() => Subject)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async UpdateSubject(@Args('input') input: UpdateSubjectInput): Promise<Subject> {
        return await this.subjectsService.Update(input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS)
    async RemoveSubject(@Args('id', { type: () => Int }) id: number): Promise<boolean> {
        return await this.subjectsService.Remove(id);
    }
}
