import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateBuildingInput {
    @Field()
    name: string;

    @Field({ nullable: true })
    description?: string;
}
