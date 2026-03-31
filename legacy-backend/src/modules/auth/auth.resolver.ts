 
import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { LoginResponse, LoginInput } from './dto/auth-types';

@Resolver()
export class AuthResolver 
{
    constructor(private readonly authService: AuthService) 
    {}
    @Mutation(() => LoginResponse, { name: 'login' })
    async login(@Args('loginInput') loginInput: LoginInput): Promise<LoginResponse> 
    {
        const user = await this.authService.validateUser(loginInput.email, loginInput.password);
        return this.authService.login(user);
    }
}
 