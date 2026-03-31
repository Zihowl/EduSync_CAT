import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

@InputType()
export class CreateAdminInput 
{
    @Field()
    @IsNotEmpty()
        fullName: string;

    @Field()
    @IsEmail()
    @Matches(/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/,
        {
            message: 'Email inválido',
        })
        email: string;
}
