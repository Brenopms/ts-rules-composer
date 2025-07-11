import {
  pipeRules,
  every,
  match,
  withMemoize,
  pass,
  fail,
  Rule,
  mapError,
} from "../src/lib";

// Types
type User = {
  username: string;
  password: string;
  email: string;
  role: "admin" | "user" | "unknown";
};

// Mocked rules
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

// Example usage
(async () => {
  const validUser: User = {
    username: "new_user",
    password: "password123",
    email: "user@example.com",
    role: "user",
  };

  const failingUser: User = {
    username: "new_user",
    password: "psw",
    email: "taken@example.com",
    role: "user",
  };

  const validResult = await validateUser(validUser);
  console.log("Validation Result:", validResult);

  const failingResult = await validateUser(failingUser);
  console.log("Validation Result 2:", failingResult);
})();
