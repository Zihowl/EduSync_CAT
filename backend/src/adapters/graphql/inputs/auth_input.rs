use async_graphql::{Enum, InputObject};

/// Cliente desde el que se origina el login. Permite restringir el acceso
/// por rol: la web (CAT) es solo para administradores y la app móvil (DOG)
/// solo para alumnos/docentes.
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
pub enum LoginPlatform {
    Web,
    Mobile,
}

#[derive(InputObject, Clone)]
pub struct LoginInput {
    pub email: String,
    pub password: String,
    pub platform: LoginPlatform,
}

#[derive(InputObject, Clone)]
pub struct RegisterInput {
    pub email: String,
    /// Nombre completo. Obsoleto: los alumnos no registran nombre y el de los
    /// docentes lo define el catálogo CAT. El servidor ignora este valor; el
    /// cliente envía cadena vacía.
    pub full_name: String,
    /// Nombre de usuario único (3-30 caracteres: letras, números, `.`, `_`).
    pub username: String,
    pub password: String,
    pub password_confirmation: String,
}

#[derive(InputObject, Clone)]
pub struct VerifyEmailInput {
    pub verification_token: String,
    pub code: String,
}

#[derive(InputObject, Clone)]
pub struct RequestPasswordResetInput {
    pub email: String,
}

#[derive(InputObject, Clone)]
pub struct VerifyResetCodeInput {
    pub verification_token: String,
    pub code: String,
}

#[derive(InputObject, Clone)]
pub struct CompletePasswordResetInput {
    pub verification_token: String,
    pub new_password: String,
    pub new_password_confirmation: String,
}

#[derive(InputObject, Clone)]
pub struct ChangeCredentialsInput {
    pub new_email: String,
    pub new_password: String,
}
