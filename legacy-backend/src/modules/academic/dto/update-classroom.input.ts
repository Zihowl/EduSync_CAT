import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class UpdateClassroomInput 
{
    @Field(() => Int)
        id: number;

    @Field({ nullable: true })
        name?: string;

    @Field(() => Int, { nullable: true })
        buildingId?: number;
}
