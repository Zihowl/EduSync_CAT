import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { LoginResponse, LoginInput } from './dto/auth-types';

@Resolver()
export class AuthResolver 
{
    constructor(private readonly authService: AuthService) 
    {}
    @Mutation(() => LoginResponse)
    async Login(@Args('loginInput') loginInput: LoginInput): Promise<LoginResponse> 
    {
        const user = await this.authService.ValidateUser(loginInput.email, loginInput.password);
        return this.authService.Login(user);
    }
}
