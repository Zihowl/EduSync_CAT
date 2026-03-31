import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, Min, Max, IsString, Matches, IsOptional, IsBoolean } from 'class-validator';

@InputType()
export class CreateScheduleSlotInput
{
    @Field(() => Int)
    @IsInt()
        teacherId: number;

    @Field(() => Int)
    @IsInt()
        subjectId: number;

    @Field(() => Int)
    @IsInt()
        classroomId: number;

    @Field(() => Int)
    @IsInt()
        groupId: number;

    /** Día de la semana: 1=Lunes, 2=Martes, ..., 7=Domingo */
    @Field(() => Int)
    @IsInt()
    @Min(1, { message: 'dayOfWeek debe ser al menos 1 (Lunes)' })
    @Max(7, { message: 'dayOfWeek debe ser máximo 7 (Domingo)' })
        dayOfWeek: number;

    /** Hora de inicio en formato HH:mm o HH:mm:ss */
    @Field()
    @IsString()
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, { message: 'startTime debe tener formato HH:mm o HH:mm:ss' })
        startTime: string;

    /** Hora de fin en formato HH:mm o HH:mm:ss */
    @Field()
    @IsString()
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, { message: 'endTime debe tener formato HH:mm o HH:mm:ss' })
        endTime: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
        subgroup?: string;

    @Field({ nullable: true, defaultValue: false })
    @IsOptional()
    @IsBoolean()
        isPublished?: boolean;
}
