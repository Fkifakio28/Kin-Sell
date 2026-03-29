import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const hashPassword = (value: string): Promise<string> => {
  return bcrypt.hash(value, SALT_ROUNDS);
};

export const verifyPassword = (value: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(value, hash);
};
