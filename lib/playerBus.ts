// lib/playerBus.ts
type Cmd = "toggle";
type Listener = (cmd: Cmd) => void;
const listeners = new Set<Listener>();
export function onPlayerCommand(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); }
export function emitPlayerCommand(cmd: Cmd) { for (const l of listeners) l(cmd); }
