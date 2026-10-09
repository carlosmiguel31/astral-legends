import { z } from 'zod';

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const usernameSchema = z
  .string({ error: 'Informe o nome de usuário' })
  .trim()
  .regex(USERNAME_PATTERN, 'Use de 3 a 16 caracteres: letras, números ou _');

export const emailSchema = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo')
  .pipe(z.email('E-mail inválido'));

export const passwordSchema = z
  .string({ error: 'Informe a senha' })
  .min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres`)
  .max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres`);

export const registerRequestSchema = z
  .strictObject({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string({ error: 'Confirme a senha' }),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirm) {
      ctx.addIssue({
        code: 'custom',
        path: ['passwordConfirm'],
        message: 'As senhas não coincidem',
      });
    }
    const lower = data.password.toLowerCase();
    if (lower.includes(data.username.toLowerCase()) || lower === data.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'A senha não pode conter o nome de usuário ou o e-mail',
      });
    }
  });
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  // No login não revelamos regras de senha: qualquer texto até o limite é aceito.
  password: z.string({ error: 'Informe a senha' }).min(1, 'Informe a senha').max(PASSWORD_MAX),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const accountSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  hasCharacter: z.boolean(),
});
export type AccountView = z.infer<typeof accountSchema>;

export const authResponseSchema = z.object({ account: accountSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;
