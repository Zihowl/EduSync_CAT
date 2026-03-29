import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class UpdateTeacherInput {
    @Field(() => Int)
    id: number;

    @Field({ nullable: true })
    employeeNumber?: string;

    @Field({ nullable: true })
    name?: string;

    @Field({ nullable: true })
    email?: string;
}
