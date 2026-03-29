export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const normalizePhone = (value: string): string => {
  // Keep a minimal E.164-compatible format for now (+ and digits only).
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!compact.startsWith("+")) {
    throw new Error("Le numero doit etre au format international (ex: +243...).");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    throw new Error("Numero de telephone invalide.");
  }
  return compact;
};

export const slugifyUsername = (value: string): string => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
};
