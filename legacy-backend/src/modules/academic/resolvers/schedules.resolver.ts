import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ScheduleSlot } from '../entities/schedule-slot.entity';
import { SchedulesService } from '../services/schedules.service';
import { CreateScheduleSlotInput } from '../dto/create-schedule-slot.input';
import { UpdateScheduleSlotInput } from '../dto/update-schedule-slot.input';
import { ScheduleFilterInput } from '../dto/schedule-filter.input';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/guards/roles.decorator';
import { UserRole, User } from '../../users/entities/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Resolver(() => ScheduleSlot)
export class SchedulesResolver
{
    constructor(private readonly schedulesService: SchedulesService)
    {}

    /**
     * Obtiene todos los horarios con filtros opcionales.
     * Acceso: Solo administradores de horarios (pueden ver publicados y no publicados).
     */
    @Query(() => [ScheduleSlot], { name: 'GetSchedules' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS, UserRole.SUPER_ADMIN)
    async GetSchedules(
        @Args('filter', { nullable: true }) filter?: ScheduleFilterInput,
    ): Promise<ScheduleSlot[]>
    {
        return await this.schedulesService.FindAll(filter);
    }

    /**
     * Obtiene un horario específico por ID.
     */
    @Query(() => ScheduleSlot, { name: 'GetSchedule', nullable: true })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS, UserRole.SUPER_ADMIN)
    async GetSchedule(
        @Args('id', { type: () => Int }) id: number,
    ): Promise<ScheduleSlot | null>
    {
        return await this.schedulesService.FindOne(id);
    }

    /**
     * Crea un nuevo slot de horario.
     */
    @Mutation(() => ScheduleSlot)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS, UserRole.SUPER_ADMIN)
    async CreateScheduleSlot(
        @Args('input') input: CreateScheduleSlotInput,
        @CurrentUser() user: User,
    ): Promise<ScheduleSlot>
    {
        return await this.schedulesService.Create(input, user);
    }

    /**
     * Actualiza un slot de horario existente.
     */
    @Mutation(() => ScheduleSlot)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS, UserRole.SUPER_ADMIN)
    async UpdateScheduleSlot(
        @Args('input') input: UpdateScheduleSlotInput,
    ): Promise<ScheduleSlot>
    {
        return await this.schedulesService.Update(input);
    }

    /**
     * Elimina un slot de horario.
     */
    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS, UserRole.SUPER_ADMIN)
    async RemoveScheduleSlot(
        @Args('id', { type: () => Int }) id: number,
    ): Promise<boolean>
    {
        return await this.schedulesService.Remove(id);
    }

    /**
     * Publica o despublica múltiples horarios.
     */
    @Mutation(() => Int, { description: 'Retorna la cantidad de horarios actualizados' })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN_HORARIOS, UserRole.SUPER_ADMIN)
    async SetSchedulesPublished(
        @Args('ids', { type: () => [Int] }) ids: number[],
        @Args('isPublished') isPublished: boolean,
    ): Promise<number>
    {
        return await this.schedulesService.SetPublished(ids, isPublished);
    }
}
