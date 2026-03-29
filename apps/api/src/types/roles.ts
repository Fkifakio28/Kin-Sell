export enum Role {
  VISITOR = "VISITOR",
  USER = "USER",
  BUSINESS = "BUSINESS",
  ADMIN = "ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN"
}

export const canTrade = (role: Role): boolean => {
  return role === Role.USER || role === Role.BUSINESS;
};
