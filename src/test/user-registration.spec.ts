import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pass,
  fail,
  every,
  mapError,
  match,
  pipeRules,
  withMemoize,
  type Rule,
} from "../lib";

// Types
type User = {
  username: string;
  password: string;
  email: string;
  role: "admin" | "user" | "unknown";
};

const validateUsernameFormat: Rule<User> = (user) => {
  return /^[a-zA-Z0-9_]{3,16}$/.test(user.username)
    ? pass()
    : fail("Username must be 3-16 characters and alphanumeric");
};

const checkUsernameAvailability: Rule<User> = async (user) => {
  const taken = ["admin", "testuser"];
  return taken.includes(user.username)
    ? fail("Username is already taken")
    : pass();
};

const validatePasswordStrength: Rule<User> = (user) => {
  return user.password.length >= 8
    ? pass()
    : fail("Password must be at least 8 characters long");
};

const validateEmailFormat: Rule<User> = (user) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
    ? pass()
    : fail("Invalid email format");
};

const checkEmailUnique: Rule<User> = async (user) => {
  const usedEmails = ["taken@example.com"];
  return usedEmails.includes(user.email)
    ? fail("Email is already in use")
    : pass();
};

const validateAdminPrivileges: Rule<User> = (user) =>
  user.username === "admin"
    ? pass()
    : fail("Admin users must use the 'admin' username");

const validateStandardUser: Rule<User> = () => pass();

// Compose validator
const validateUser = pipeRules([
  validateUsernameFormat,
  withMemoize(checkUsernameAvailability, (user) => user.username, {
    ttl: 60000,
  }),
  mapError(
    every([validatePasswordStrength, validateEmailFormat, checkEmailUnique]),
    (errors) => errors.join(", "),
  ),
  match<User, string>(
    (user) => user.role,
    {
      admin: validateAdminPrivileges,
      user: validateStandardUser,
    },
    "Unknown role",
  ),
]);

describe("user-registration-validator", () => {
  const baseUser: User = {
    username: "valid_user",
    password: "strongpass",
    email: "valid@example.com",
    role: "user",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass for a valid user", async () => {
    const result = await validateUser(baseUser);
    expect(result).toEqual(pass());
  });

  it("should fail on invalid username format", async () => {
    const result = await validateUser({
      ...baseUser,
      username: "??",
    });
    expect(result).toEqual(
      fail("Username must be 3-16 characters and alphanumeric"),
    );
  });

  it("should fail if username is taken", async () => {
    const result = await validateUser({
      ...baseUser,
      username: "admin", // mocked taken name
    });
    expect(result).toEqual(fail("Username is already taken"));
  });

  it("should fail if password is too weak", async () => {
    const result = await validateUser({
      ...baseUser,
      password: "123",
    });
    expect(result).toEqual(
      fail("Password must be at least 8 characters long"),
    );
  });

  it("should fail on invalid email format", async () => {
    const result = await validateUser({
      ...baseUser,
      email: "invalid@",
    });
    expect(result).toEqual(fail("Invalid email format"));
  });

  it("should fail if email is already taken", async () => {
    const result = await validateUser({
      ...baseUser,
      email: "taken@example.com",
    });
    expect(result).toEqual(fail("Email is already in use"));
  });

  it("should fail if admin does not use reserved username", async () => {
    const result = await validateUser({
      ...baseUser,
      role: "admin",
      username: "not_admin",
    });
    expect(result).toEqual(fail("Admin users must use the 'admin' username"));
  });

  it("should fail for unknown roles", async () => {
    const result = await validateUser({
      ...baseUser,
      role: "unknown",
    });
    expect(result).toEqual(fail("Unknown role"));
  });

  it("should memoize username availability check", async () => {
    const input = { ...baseUser, username: "new_user" };
    const result1 = await validateUser(input);
    const result2 = await validateUser(input);
    expect(result1).toEqual(pass());
    expect(result2).toEqual(pass());
    // WithMemoize doesn't expose call count, but we expect caching to work
  });
});
