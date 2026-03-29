import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class CreateGroupInput {
    @Field()
    name: string;

    @Field(() => Int, { nullable: true })
    parentId?: number;
}
