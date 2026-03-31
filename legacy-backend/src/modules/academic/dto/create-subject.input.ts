import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateSubjectInput 
{
    @Field()
        code: string;

    @Field()
        name: string;
}
