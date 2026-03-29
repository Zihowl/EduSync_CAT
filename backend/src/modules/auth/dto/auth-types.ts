import { Field, InputType, ObjectType } from '@nestjs/graphql';

import { User } from '../../users/entities/user.entity';

@InputType()
export class LoginInput 
{
    @Field()
    email: string;

    @Field()
    password: string;
}

@ObjectType()
export class LoginResponse 
{
    @Field()
    accessToken: string;

    @Field(() => User)
    user: User;
}
