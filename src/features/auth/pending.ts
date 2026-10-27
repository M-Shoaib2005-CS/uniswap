// Credentials kept in memory only (never persisted) between sign-up and the first successful login,
// so "I've verified, continue" can sign the user in without asking for the password again.
let pending: { email: string; password: string } | null = null;

export const pendingCredentials = {
  set(email: string, password: string) {
    pending = { email, password };
  },
  get() {
    return pending;
  },
  clear() {
    pending = null;
  },
};
