import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsBoolean, Min, Max } from 'class-validator';

@InputType()
export class ScheduleFilterInput
{
    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    groupId?: number;

    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    teacherId?: number;

    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    classroomId?: number;

    /** Día de la semana: 1=Lunes ... 7=Domingo */
    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(7)
    dayOfWeek?: number;

    /** Filtrar solo horarios publicados (para consulta pública) */
    @Field({ nullable: true })
    @IsOptional()
    @IsBoolean()
    isPublished?: boolean;

    /** Página para paginación (1-indexed) */
    @Field(() => Int, { nullable: true, defaultValue: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number;

    /** Límite de resultados por página */
    @Field(() => Int, { nullable: true, defaultValue: 50 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}
