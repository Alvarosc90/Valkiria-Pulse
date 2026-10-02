import { z } from "zod";

export const passwordSchema = z.string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(128, "La contraseña es demasiado larga")
  .regex(/[a-z]/, "La contraseña debe incluir una minúscula")
  .regex(/[A-Z]/, "La contraseña debe incluir una mayúscula")
  .regex(/[0-9]/, "La contraseña debe incluir un número")
  .regex(/[^A-Za-z0-9]/, "La contraseña debe incluir un símbolo");

const blocked = [
  "password",
  "contraseña",
  "contrasena",
  "123456",
  "qwerty",
  "valkiria",
  "pulse"
];

export function assertPasswordSafe(password: string, email?: string | null) {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    throw parsed.error;
  }

  const lowered = password.toLowerCase();
  if (blocked.some((part) => lowered.includes(part))) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: [],
      message: "La contraseña contiene una palabra demasiado predecible"
    }]);
  }

  const local = String(email ?? "").split("@")[0]?.trim().toLowerCase();
  if (local && local.length >= 4 && lowered.includes(local)) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: [],
      message: "La contraseña no debe contener tu email"
    }]);
  }

  return password;
}
