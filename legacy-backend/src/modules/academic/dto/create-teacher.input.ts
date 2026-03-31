import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateTeacherInput 
{
    @Field()
        employeeNumber: string;

    @Field()
        name: string;

    @Field({ nullable: true })
        email?: string;
}
