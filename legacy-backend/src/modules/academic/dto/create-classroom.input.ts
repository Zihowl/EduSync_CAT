import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class CreateClassroomInput 
{
    @Field()
        name: string;

    @Field(() => Int, { nullable: true })
        buildingId?: number;
}
