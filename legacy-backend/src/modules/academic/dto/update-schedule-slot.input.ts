import { InputType, Field, Int, PartialType } from '@nestjs/graphql';
import { IsInt, Min, Max, IsString, Matches, IsOptional, IsBoolean } from 'class-validator';
import { CreateScheduleSlotInput } from './create-schedule-slot.input';

@InputType()
export class UpdateScheduleSlotInput extends PartialType(CreateScheduleSlotInput)
{
    @Field(() => Int)
    @IsInt()
        id: number;
}
