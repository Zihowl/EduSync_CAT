import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class UpdateSubjectInput 
{
    @Field(() => Int)
        id: number;

    @Field({ nullable: true })
        code?: string;

    @Field({ nullable: true })
        name?: string;
}
