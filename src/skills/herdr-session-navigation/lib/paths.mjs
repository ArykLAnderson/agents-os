import os from "node:os";
import path from "node:path";

function home(env) {
  const value = env.HOME || os.homedir();
  if (!path.isAbsolute(value)) throw new TypeError("HOME must be absolute");
  return path.normalize(value);
}

function absoluteOrDefault(value, fallback, field) {
  const selected = value || fallback;
  if (!path.isAbsolute(selected)) throw new TypeError(`${field} must be absolute`);
  return path.normalize(selected);
}

export function trialPaths(env = process.env) {
  const homePath = home(env);
  const configHome = absoluteOrDefault(env.XDG_CONFIG_HOME, path.join(homePath, ".config"), "XDG_CONFIG_HOME");
  const stateHome = absoluteOrDefault(env.XDG_STATE_HOME, path.join(homePath, ".local", "state"), "XDG_STATE_HOME");
  const stateRoot = path.join(stateHome, "agent-os", "herdr-trials", "casebook");
  return {
    configPath: path.join(configHome, "herdr", "trials", "casebook", "config.toml"),
    stateRoot,
    bindingsDir: path.join(stateRoot, "bindings"),
    favoritesPath: path.join(stateRoot, "favorites.json"),
    focusHistoryPath: path.join(stateRoot, "focus-history.json"),
  };
}
