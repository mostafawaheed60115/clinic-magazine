import { cloudConfigured, getSupabase, invokeAdmin } from "./cloud.js";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const demoEnabled =
  String(import.meta.env?.VITE_DEMO_MODE || "").toLowerCase() === "true";
// An explicit local demo flag always wins, even when the production project
// defaults are available in the browser bundle.
const mode = demoEnabled
  ? "demo"
  : cloudConfigured
    ? "supabase"
    : "unconfigured";
const configured = mode !== "unconfigured";
const demoSessionKey = "clinic-demo-session";
const demoUsersKey = "clinic-demo-users";
const demoPasswords = {
  demo: "bbfeb74a4b4216dfd0f7b10edf5743e6781e9f8ac7888a3392878a52c821a3b1",
  admin: "bbfeb74a4b4216dfd0f7b10edf5743e6781e9f8ac7888a3392878a52c821a3b1",
};

let state = {
  configured,
  mode,
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  ready: false,
  error: null,
};
let initPromise;
let authSubscription;
let authEpoch = 0;
const listeners = new Set();

const snapshot = () => ({ ...state });
const emit = () => {
  const value = snapshot();
  // Supabase warns against awaiting work from inside onAuthStateChange. All
  // listeners run on a later task, after that callback has returned.
  setTimeout(() => {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch {
        // A view callback must not break auth state delivery to other views.
      }
    }
  }, 0);
};

function normalizeUsername(value) {
  const username = String(value || "")
    .trim()
    .toLowerCase();
  return username.endsWith("@users.clinic.invalid")
    ? username.slice(0, -"@users.clinic.invalid".length)
    : username;
}

function emailFor(username) {
  return `${normalizeUsername(username)}@users.clinic.invalid`;
}

function authError(message, code = "auth") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function adminResponse(data, key) {
  if (data?.ok === false) {
    throw authError(
      data.error?.message || "The administrator request failed",
      data.error?.code || "admin_error",
    );
  }
  return key ? data?.[key] : data;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function demoUserRecords() {
  const raw = localStorage.getItem(demoUsersKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      localStorage.removeItem(demoUsersKey);
    }
  }
  const initial = [
    {
      id: "demo-user",
      name: "Demo viewer",
      username: "demo",
      phone: "",
      active: true,
      passwordHash: demoPasswords.demo,
      create_date: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "demo-admin",
      name: "Demo admin",
      username: "admin",
      phone: "",
      active: true,
      passwordHash: demoPasswords.admin,
      create_date: "2026-01-01T00:00:00.000Z",
    },
  ];
  localStorage.setItem(demoUsersKey, JSON.stringify(initial));
  return initial;
}

function publicUser(record) {
  const { passwordHash, ...user } = record;
  return user;
}

function setDemoState(record) {
  const user = publicUser(record);
  state = {
    ...state,
    session: { user },
    user,
    profile: user,
    isAdmin: user.username === "admin",
    error: null,
  };
  localStorage.setItem(demoSessionKey, JSON.stringify({ id: user.id }));
}

function clearState(error = null) {
  state = {
    ...state,
    session: null,
    user: null,
    profile: null,
    isAdmin: false,
    error,
  };
}

async function loadSupabaseProfile(user) {
  const client = getSupabase();
  if (!client || !user)
    throw authError("A signed-in user is required", "profile_missing");
  const [profileResult, adminResult] = await Promise.all([
    client.from("users").select("*").eq("id", user.id).maybeSingle(),
    client.from("admin").select("id").eq("id", user.id).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (adminResult.error) throw adminResult.error;
  const profile = profileResult.data;
  if (!profile)
    throw authError("The account profile is missing", "profile_missing");
  if (profile.active !== true) {
    await client.auth.signOut();
    throw authError("This account is inactive", "inactive");
  }
  state = {
    ...state,
    user,
    profile,
    isAdmin: Boolean(adminResult.data),
    error: null,
  };
}

async function initialize() {
  if (mode === "unconfigured") {
    state = { ...state, ready: true };
    emit();
    return snapshot();
  }
  if (mode === "demo") {
    const saved = localStorage.getItem(demoSessionKey);
    if (saved) {
      try {
        const { id } = JSON.parse(saved);
        const record = demoUserRecords().find(
          (item) => item.id === id && item.active,
        );
        if (record) setDemoState(record);
      } catch {
        localStorage.removeItem(demoSessionKey);
      }
    }
    state = { ...state, ready: true };
    emit();
    return snapshot();
  }
  const client = getSupabase();
  ++authEpoch;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    state = {
      ...state,
      session: data.session,
      user: data.session?.user || null,
    };
    if (data.session?.user) await loadSupabaseProfile(data.session.user);
  } catch (error) {
    await client.auth.signOut().catch(() => {});
    clearState(error);
  }
  state = { ...state, ready: true };
  emit();
  if (!authSubscription) {
    const result = client.auth.onAuthStateChange((_, session) => {
      // Do not await profile queries from Supabase's auth callback.
      const callbackEpoch = ++authEpoch;
      setTimeout(async () => {
        try {
          state = {
            ...state,
            session,
            user: session?.user || null,
            error: null,
          };
          if (session?.user) await loadSupabaseProfile(session.user);
          else clearState();
          if (callbackEpoch !== authEpoch) return;
        } catch (error) {
          if (callbackEpoch !== authEpoch) return;
          await client.auth.signOut().catch(() => {});
          clearState(error);
        }
        emit();
      }, 0);
    });
    authSubscription = result.data.subscription;
  }
  return snapshot();
}

export function initAuth() {
  initPromise ||= initialize();
  return initPromise;
}

export function getAuthState() {
  return snapshot();
}

export function isDemoMode() {
  return mode === "demo";
}

export function onAuthChange(callback) {
  if (typeof callback !== "function")
    throw new TypeError("callback must be a function");
  listeners.add(callback);
  void initAuth().then(() => setTimeout(() => callback(snapshot()), 0));
  return () => listeners.delete(callback);
}

export async function signIn(usernameInput, password) {
  await initAuth();
  const username = normalizeUsername(usernameInput);
  if (!USERNAME_PATTERN.test(username))
    throw authError("Invalid username", "invalid_username");
  if (!password) throw authError("Password is required", "missing_password");
  if (mode === "unconfigured")
    throw authError("Authentication is not configured", "unconfigured");
  if (mode === "demo") {
    const record = demoUserRecords().find((item) => item.username === username);
    const passwordHash = await digest(password);
    if (!record || !record.active || record.passwordHash !== passwordHash)
      throw authError("Invalid username or password", "invalid_credentials");
    setDemoState(record);
    emit();
    return snapshot();
  }
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: emailFor(username),
    password,
  });
  if (error) throw error;
  state = { ...state, session: data.session, user: data.user };
  try {
    if (data.user) await loadSupabaseProfile(data.user);
  } catch (profileError) {
    await getSupabase()
      .auth.signOut()
      .catch(() => {});
    clearState(profileError);
    throw profileError;
  }
  state = { ...state, ready: true };
  emit();
  return snapshot();
}

export async function signOut() {
  await initAuth();
  if (mode === "demo") {
    localStorage.removeItem(demoSessionKey);
    clearState();
    emit();
    return;
  }
  if (mode === "supabase") {
    authEpoch += 1;
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  }
  clearState();
  emit();
}

export async function loadUsers() {
  await initAuth();
  if (!state.isAdmin)
    throw authError("Administrator access required", "forbidden");
  if (mode === "demo") return demoUserRecords().map(publicUser);
  const users = [];
  for (let page = 0; page < 1000; page += 1) {
    const data = await invokeAdmin("list", { page, pageSize: 100 });
    const batch = adminResponse(data, "users");
    if (!Array.isArray(batch)) return users;
    users.push(...batch);
    if (!data.hasMore || batch.length === 0) return users;
  }
  throw authError(
    "The user list exceeds the configured limit",
    "too_many_users",
  );
}

export async function createUser({ name, user, password, phone = "" }) {
  await initAuth();
  if (!state.isAdmin)
    throw authError("Administrator access required", "forbidden");
  const username = normalizeUsername(user);
  if (!USERNAME_PATTERN.test(username))
    throw authError("Invalid username", "invalid_username");
  if (!password) throw authError("Password is required", "missing_password");
  if (mode === "demo") {
    const users = demoUserRecords();
    if (users.some((item) => item.username === username))
      throw authError("Username already exists", "duplicate");
    users.push({
      id: crypto.randomUUID(),
      name: String(name || "").trim(),
      username,
      phone: String(phone || "").trim(),
      active: true,
      passwordHash: await digest(password),
      create_date: new Date().toISOString(),
    });
    localStorage.setItem(demoUsersKey, JSON.stringify(users));
    return publicUser(users.at(-1));
  }
  const response = await invokeAdmin("create", {
    name: String(name || "").trim(),
    username,
    password,
    phone: String(phone || "").trim(),
  });
  return adminResponse(response, "user");
}

export async function updateUser(id, updates = {}) {
  await initAuth();
  if (!state.isAdmin)
    throw authError("Administrator access required", "forbidden");
  if (mode === "demo") {
    const users = demoUserRecords();
    const index = users.findIndex((item) => item.id === id);
    if (index < 0) throw authError("User not found", "not_found");
    const next = { ...users[index] };
    if (
      updates.expectedRevision !== undefined &&
      Number(updates.expectedRevision) !== Number(next.revision || 1)
    )
      throw authError(
        "The user changed elsewhere. Reload and try again.",
        "revision_conflict",
      );
    if (updates.name !== undefined) next.name = String(updates.name).trim();
    if (updates.phone !== undefined) next.phone = String(updates.phone).trim();
    if (updates.active !== undefined) next.active = Boolean(updates.active);
    if (updates.password) next.passwordHash = await digest(updates.password);
    next.revision = Number(next.revision || 1) + 1;
    users[index] = next;
    localStorage.setItem(demoUsersKey, JSON.stringify(users));
    if (state.user?.id === id && !next.active) await signOut();
    return publicUser(next);
  }
  const profileKeys = ["name", "phone", "active"];
  const hasProfileChanges = profileKeys.some(
    (key) => updates[key] !== undefined,
  );
  let updated;
  if (hasProfileChanges) {
    const expectedRevision = Number(updates.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1)
      throw authError("A current revision is required", "invalid_revision");
    const payload = { userId: id, expectedRevision };
    for (const key of profileKeys)
      if (updates[key] !== undefined) payload[key] = updates[key];
    updated = adminResponse(await invokeAdmin("edit", payload), "user");
  }
  if (updates.password !== undefined) {
    await adminResponse(
      await invokeAdmin("reset_password", {
        userId: id,
        password: updates.password,
      }),
      "userId",
    );
  }
  return updated || { id };
}

export { emailFor, normalizeUsername };
